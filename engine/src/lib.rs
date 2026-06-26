use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct SymbolRow {
    pub id: String,
    pub project_id: String,
    pub file_path: String,
    pub name: String,
    pub symbol_type: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct RelationshipRow {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub rel_type: String,
    pub strength: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct GraphData {
    pub symbols: Vec<SymbolRow>,
    pub relationships: Vec<RelationshipRow>,
}

/// Transitive closure: find all symbols that depend on `seed_ids`
/// Uses reverse adjacency (target -> sources) to find "who imports me"
#[napi]
pub fn find_dependents(graph: GraphData, seed_ids: Vec<String>, max_depth: i32) -> String {
    let adj = build_reverse_adjacency(&graph.relationships);
    let mut result: HashMap<String, i32> = HashMap::new();
    let mut queue: VecDeque<(String, i32)> = VecDeque::new();
    let mut visited: HashSet<String> = HashSet::new();

    for sid in &seed_ids {
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

/// Find all paths between source and target (BFS, max_depth limit)
#[napi]
pub fn find_paths(
    graph: GraphData,
    source_id: String,
    target_id: String,
    max_depth: i32,
) -> String {
    let adj = build_adjacency(&graph.relationships);
    let mut results: Vec<Vec<String>> = Vec::new();
    let mut queue: VecDeque<(String, Vec<String>, HashSet<String>)> = VecDeque::new();

    let mut initial_visited = HashSet::new();
    initial_visited.insert(source_id.clone());
    queue.push_back((source_id.clone(), vec![source_id.clone()], initial_visited));

    while let Some((current, path, visited)) = queue.pop_front() {
        if current == target_id {
            results.push(path.clone());
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

/// Detect cycles in the dependency graph (DFS-based)
#[napi]
pub fn detect_cycles(graph: GraphData) -> String {
    let adj = build_adjacency(&graph.relationships);
    let mut cycles: Vec<Vec<String>> = Vec::new();

    let all_nodes: Vec<String> = graph
        .symbols
        .iter()
        .map(|s| s.id.clone())
        .collect();

    let mut visited: HashSet<String> = HashSet::new();
    let mut rec_stack: HashSet<String> = HashSet::new();
    let mut path: Vec<String> = Vec::new();

    for node in &all_nodes {
        if !visited.contains(node) {
            dfs_cycle(
                node,
                &adj,
                &mut visited,
                &mut rec_stack,
                &mut path,
                &mut cycles,
            );
        }
    }

    serde_json::to_string(&cycles).unwrap_or_else(|_| "[]".to_string())
}

/// Compute impact score for each file (how many dependents at each distance)
#[napi]
pub fn compute_impact_scores(graph: GraphData, seed_id: String) -> String {
    let mut scores: HashMap<String, f64> = HashMap::new();
    let dependents_json = find_dependents(graph, vec![seed_id], 10);
    let dependents: HashMap<String, i32> =
        serde_json::from_str(&dependents_json).unwrap_or_default();

    for (sym_id, distance) in &dependents {
        let risk = 1.0 / (*distance as f64 + 1.0);
        scores.insert(sym_id.clone(), (risk * 100.0).round() / 100.0);
    }

    serde_json::to_string(&scores).unwrap_or_else(|_| "{}".to_string())
}

// ── Private helpers ──

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
                    let cycle: Vec<String> = path[pos..].to_vec();
                    cycles.push(cycle);
                }
            }
        }
    }

    path.pop();
    rec_stack.remove(node);
}

/// Generate a UUID v4 string
#[napi]
pub fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
