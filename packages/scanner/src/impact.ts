import type { StorageAdapter, CodeGraph } from '@pcm/core';
import * as path from 'node:path';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function normalizeImportPath(importSource: string): string[] {
  const candidates: string[] = [];
  let normalized = importSource;
  if (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (normalized.startsWith('../')) normalized = normalized.slice(3);
  const ext = path.extname(normalized);
  if (ext) {
    candidates.push(normalized);
    for (const e of EXTENSIONS) {
      if (e !== ext) candidates.push(normalized.slice(0, -ext.length) + e);
    }
  } else {
    for (const e of EXTENSIONS) {
      candidates.push(normalized + e);
      candidates.push(path.join(normalized, 'index' + e));
    }
  }
  return candidates;
}

export interface ImpactResult {
  filePath: string;
  distance: number;
  riskScore: number;
  symbols: string[];
  path: string[];
}

export interface ImpactReport {
  target: string;
  targetType: 'file' | 'symbol';
  totalAffectedFiles: number;
  totalAffectedSymbols: number;
  maxDepth: number;
  results: ImpactResult[];
  cycles: string[][];
}

let rustEngine: any = null;
try {
  rustEngine = require('@pcm/engine');
  // Verify it loads properly
  if (rustEngine.GraphEngine) new rustEngine.GraphEngine();
} catch {
  rustEngine = null;
}

export class ImpactAnalyzer {
  constructor(private storage: StorageAdapter) {}

  async analyze(projectId: string, target: string): Promise<ImpactReport> {
    const graph = await this.storage.getGraph(projectId);
    if (!graph) throw new Error(`No graph for project ${projectId}`);

    const targetSymbols = graph.symbols.filter(
      s => s.id === target || s.name === target || s.fullyQualifiedName === target
        || s.filePath === target || s.filePath.includes(target),
    );
    if (targetSymbols.length === 0) {
      throw new Error(`Cannot find "${target}" in project`);
    }

    const targetFile = targetSymbols.find(s => s.type === 'file')?.filePath ?? targetSymbols[0].filePath;
    const targetType: 'file' | 'symbol' = targetSymbols[0].type === 'file' ? 'file' : 'symbol';

    const fileSymbols = graph.symbols.filter(s => s.type === 'file');
    const filePaths = new Set(fileSymbols.map(f => f.filePath));
    const filePathIndex = new Map<string, string>();
    for (const f of fileSymbols) filePathIndex.set(f.filePath, f.filePath);

    const imports = graph.relationships.filter(r => r.type === 'imports');
    const symByFile = new Map<string, string[]>();
    for (const s of graph.symbols) {
      if (s.type === 'file') continue;
      if (!symByFile.has(s.filePath)) symByFile.set(s.filePath, []);
      symByFile.get(s.filePath)!.push(s.name);
    }

    const adjList = new Map<string, string[]>();
    for (const f of fileSymbols) adjList.set(f.filePath, []);
    for (const rel of imports) {
      const source = graph.symbols.find(s => s.id === rel.sourceId);
      const rawTarget = rel.metadata.importSource as string;
      if (!source || !rawTarget) continue;
      const candidates = normalizeImportPath(rawTarget);
      const matched = candidates.find(c => filePaths.has(c));
      if (matched) adjList.get(source.filePath)!.push(matched);
    }

    // Use Rust engine for BFS if available
    if (rustEngine) {
      return this.analyzeWithRust(graph, target, targetFile, targetType, adjList, symByFile, fileSymbols);
    }
    return this.analyzeWithTS(graph, target, targetFile, targetType, adjList, symByFile);
  }

  private analyzeWithRust(
    graph: CodeGraph, target: string, targetFile: string,
    targetType: 'file' | 'symbol', adjList: Map<string, string[]>,
    symByFile: Map<string, string[]>, fileSymbols: typeof graph.symbols,
  ): ImpactReport {
    const engine = new rustEngine.GraphEngine();

    // Build symbol and relationship arrays for Rust
    const rustSymbols = fileSymbols.map(s => ({
      id: s.id, projectId: s.projectId, filePath: s.filePath,
      name: s.name, symbolType: s.type,
    }));
    const rustRels = graph.relationships.filter(r => r.type === 'imports').map(r => ({
      id: r.id, sourceId: r.sourceId, targetId: r.targetId,
      relType: r.type, strength: r.strength,
    }));

    // Find the file symbol ID for the target
    const targetSym = fileSymbols.find(f => f.filePath === targetFile);
    if (!targetSym) {
      return this.analyzeWithTS(graph, target, targetFile, targetType, adjList, symByFile);
    }

    // Use Rust for dependents and cycles
    const deps: Record<string, number> = engine.findDependents(rustSymbols, rustRels, [targetSym.id], 10);
    const cycles: string[][] = engine.detectCycles(rustSymbols, rustRels);

    const results: ImpactResult[] = [];
    for (const [symId, distance] of Object.entries(deps)) {
      const sym = graph.symbols.find(s => s.id === symId);
      if (sym && sym.filePath !== targetFile) {
        results.push({
          filePath: sym.filePath,
          distance,
          riskScore: Math.round((1 / (distance + 1)) * 100) / 100,
          symbols: symByFile.get(sym.filePath) || [],
          path: [targetFile, sym.filePath],
        });
      }
    }

    results.sort((a, b) => a.distance - b.distance || b.riskScore - a.riskScore);
    const totalAffectedSymbols = results.reduce((sum, r) => sum + r.symbols.length, 0);

    return {
      target, targetType,
      totalAffectedFiles: results.length,
      totalAffectedSymbols,
      maxDepth: Math.max(...results.map(r => r.distance), 0),
      results, cycles,
    };
  }

  private analyzeWithTS(
    graph: CodeGraph, target: string, targetFile: string,
    targetType: 'file' | 'symbol', adjList: Map<string, string[]>,
    symByFile: Map<string, string[]>,
  ): ImpactReport {
    const visited = new Set<string>();
    const results: Map<string, ImpactResult> = new Map();
    const cycles: string[][] = [];
    const queue: { filePath: string; distance: number; path: string[] }[] = [
      { filePath: targetFile, distance: 0, path: [targetFile] },
    ];

    while (queue.length > 0) {
      const { filePath: fp, distance, path } = queue.shift()!;
      if (distance > 0) {
        results.set(fp, {
          filePath: fp, distance,
          riskScore: Math.round((1 / (distance + 1)) * 100) / 100,
          symbols: symByFile.get(fp) || [],
          path: [...path],
        });
      }
      for (const [sourceFile, targets] of adjList.entries()) {
        if (targets.includes(fp) && !visited.has(sourceFile)) {
          visited.add(sourceFile);
          if (path.includes(sourceFile)) {
            cycles.push([...path.slice(path.indexOf(sourceFile)), sourceFile]);
            continue;
          }
          queue.push({ filePath: sourceFile, distance: distance + 1, path: [...path, sourceFile] });
        }
      }
    }

    const sorted = Array.from(results.values()).sort((a, b) => a.distance - b.distance || b.riskScore - a.riskScore);
    return {
      target, targetType,
      totalAffectedFiles: sorted.length,
      totalAffectedSymbols: sorted.reduce((sum, r) => sum + r.symbols.length, 0),
      maxDepth: Math.max(...sorted.map(r => r.distance), 0),
      results: sorted, cycles,
    };
  }
}

export async function detectCycles(storage: StorageAdapter, projectId: string): Promise<string[][]> {
  const graph = await storage.getGraph(projectId);
  if (!graph) return [];

  // Try Rust engine first
  if (rustEngine) {
    const engine = new rustEngine.GraphEngine();
    const cycles = engine.detectCycles(
      graph.symbols.filter(s => s.type === 'file').map(s => ({
        id: s.id, projectId: s.projectId, filePath: s.filePath,
        name: s.name, symbolType: s.type,
      })),
      graph.relationships.filter(r => r.type === 'imports').map(r => ({
        id: r.id, sourceId: r.sourceId, targetId: r.targetId,
        relType: r.type, strength: r.strength,
      })),
    );
    return cycles;
  }

  const imports = graph.relationships.filter(r => r.type === 'imports');
  const fileSymbols = graph.symbols.filter(s => s.type === 'file');
  const fileMap = new Map(fileSymbols.map(s => [s.id, s.filePath]));
  const filePaths = new Set(fileSymbols.map(f => f.filePath));
  const adjList = new Map<string, string[]>();
  for (const f of fileSymbols) adjList.set(f.filePath, []);
  for (const rel of imports) {
    const source = fileMap.get(rel.sourceId);
    const rawTarget = rel.metadata.importSource as string;
    if (!source || !rawTarget) continue;
    const candidates = normalizeImportPath(rawTarget);
    const matched = candidates.find(c => filePaths.has(c));
    if (matched) adjList.get(source)!.push(matched);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  function dfs(node: string, path: string[]): void {
    visited.add(node); recStack.add(node);
    for (const neighbor of adjList.get(node) || []) {
      if (!adjList.has(neighbor)) continue;
      if (!visited.has(neighbor)) dfs(neighbor, [...path, neighbor]);
      else if (recStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart >= 0) cycles.push([...path.slice(cycleStart), neighbor]);
      }
    }
    recStack.delete(node);
  }
  for (const [filePath] of adjList) {
    if (!visited.has(filePath)) dfs(filePath, [filePath]);
  }
  return cycles;
}
