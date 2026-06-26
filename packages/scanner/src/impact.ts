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
    // Also try with different extensions
    for (const e of EXTENSIONS) {
      if (e !== ext) candidates.push(normalized.slice(0, -ext.length) + e);
    }
  } else {
    // No extension: try each extension + index files
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
      if (matched) {
        adjList.get(source.filePath)!.push(matched);
      }
    }

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
          filePath: fp,
          distance,
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
    const totalAffectedSymbols = sorted.reduce((sum, r) => sum + r.symbols.length, 0);

    return {
      target, targetType,
      totalAffectedFiles: sorted.length,
      totalAffectedSymbols,
      maxDepth: Math.max(...sorted.map(r => r.distance), 0),
      results: sorted, cycles,
    };
  }
}

export async function detectCycles(storage: StorageAdapter, projectId: string): Promise<string[][]> {
  const graph = await storage.getGraph(projectId);
  if (!graph) return [];

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
    visited.add(node);
    recStack.add(node);
    for (const neighbor of adjList.get(node) || []) {
      if (!adjList.has(neighbor)) continue;
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, neighbor]);
      } else if (recStack.has(neighbor)) {
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
