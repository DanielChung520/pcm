use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Deserialize)]
struct SymbolRow {
    id: String,
    project_id: Option<String>,
    file_path: Option<String>,
    name: Option<String>,
    symbol_type: Option<String>,
}

#[derive(Deserialize)]
struct RelationshipRow {
    id: String,
    source_id: String,
    target_id: String,
    rel_type: Option<String>,
    strength: Option<f64>,
}

#[derive(Deserialize)]
struct GraphData {
    symbols: Vec<SymbolRow>,
    relationships: Vec<RelationshipRow>,
}

fn build_adjacency(rels: &[RelationshipRow]) -> HashMap<String, Vec<String>> {
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    for rel in rels {
        adj.entry(rel.source_id.clone())
            .or_default()
            .push(rel.target_id.clone());
    }
    adj
}

fn build_reverse_adjacency(rels: &[RelationshipRow]) -> HashMap<String, Vec<String>> {
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    for rel in rels {
        adj.entry(rel.target_id.clone())
            .or_default()
            .push(rel.source_id.clone());
    }
    adj
}

fn dfs_cycle(
    node: &str,
    adj: &HashMap<String, Vec<String>>,
    visited: &mut HashSet<String>,
    rec_stack: &mut HashSet<String>,
    path: &mut Vec<String>,
    cycles: &mut Vec<Vec<String>>,
) {
    visited.insert(node.to_string());
    rec_stack.insert(node.to_string());
    path.push(node.to_string());
    if let Some(neighbors) = adj.get(node) {
        for neighbor in neighbors {
            if !visited.contains(neighbor) {
                dfs_cycle(neighbor, adj, visited, rec_stack, path, cycles);
            } else if rec_stack.contains(neighbor) {
                if let Some(pos) = path.iter().position(|n| n == neighbor) {
                    cycles.push(path[pos..].to_vec());
                }
            }
        }
    }
    path.pop();
    rec_stack.remove(node);
}

pub fn find_dependents(graph_json: &str, seed_ids: &[String], max_depth: i32) -> String {
    let graph: GraphData = match serde_json::from_str(graph_json) {
        Ok(g) => g,
        Err(_) => return "{}".to_string(),
    };
    let adj = build_reverse_adjacency(&graph.relationships);
    let mut result: HashMap<String, i32> = HashMap::new();
    let mut queue: VecDeque<(String, i32)> = VecDeque::new();
    let mut visited: HashSet<String> = HashSet::new();

    for sid in seed_ids {
        visited.insert(sid.clone());
        queue.push_back((sid.clone(), 0));
    }

    while let Some((current, depth)) = queue.pop_front() {
        if depth >= max_depth {
            continue;
        }
        if let Some(dependents) = adj.get(&current) {
            for dep_id in dependents {
                if visited.insert(dep_id.clone()) {
                    let new_depth = depth + 1;
                    result.insert(dep_id.clone(), new_depth);
                    queue.push_back((dep_id.clone(), new_depth));
                }
            }
        }
    }

    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

pub fn find_paths(graph_json: &str, source_id: &str, target_id: &str, max_depth: i32) -> String {
    let graph: GraphData = match serde_json::from_str(graph_json) {
        Ok(g) => g,
        Err(_) => return "[]".to_string(),
    };
    let adj = build_adjacency(&graph.relationships);
    let mut results: Vec<Vec<String>> = Vec::new();
    let mut queue: VecDeque<(String, Vec<String>, HashSet<String>)> = VecDeque::new();
    let mut initial_visited = HashSet::new();
    initial_visited.insert(source_id.to_string());
    queue.push_back((source_id.to_string(), vec![source_id.to_string()], initial_visited));

    while let Some((current, path, visited)) = queue.pop_front() {
        if current == target_id {
            results.push(path);
            continue;
        }
        if path.len() as i32 >= max_depth {
            continue;
        }
        if let Some(neighbors) = adj.get(&current) {
            for neighbor in neighbors {
                if !visited.contains(neighbor) {
                    let mut new_path = path.clone();
                    new_path.push(neighbor.clone());
                    let mut new_visited = visited.clone();
                    new_visited.insert(neighbor.clone());
                    queue.push_back((neighbor.clone(), new_path, new_visited));
                }
            }
        }
    }

    serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
}

pub fn detect_cycles(graph_json: &str) -> String {
    let graph: GraphData = match serde_json::from_str(graph_json) {
        Ok(g) => g,
        Err(_) => return "[]".to_string(),
    };
    let adj = build_adjacency(&graph.relationships);
    let mut cycles: Vec<Vec<String>> = Vec::new();
    let all_nodes: Vec<String> = graph.symbols.iter().map(|s| s.id.clone()).collect();
    let mut visited: HashSet<String> = HashSet::new();
    let mut rec_stack: HashSet<String> = HashSet::new();
    let mut path: Vec<String> = Vec::new();

    for node in &all_nodes {
        if !visited.contains(node) {
            dfs_cycle(node, &adj, &mut visited, &mut rec_stack, &mut path, &mut cycles);
        }
    }

    serde_json::to_string(&cycles).unwrap_or_else(|_| "[]".to_string())
}

pub fn compute_impact_scores(graph_json: &str, seed_id: &str) -> String {
    let dependents_json = find_dependents(graph_json, &[seed_id.to_string()], 10);
    let dependents: HashMap<String, i32> =
        serde_json::from_str(&dependents_json).unwrap_or_default();
    let mut scores: HashMap<String, f64> = HashMap::new();

    for (sym_id, distance) in &dependents {
        let risk = 1.0 / (*distance as f64 + 1.0);
        scores.insert(sym_id.clone(), (risk * 100.0).round() / 100.0);
    }

    serde_json::to_string(&scores).unwrap_or_else(|_| "{}".to_string())
}
