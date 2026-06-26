import { generateArchitectureMD, generateModulesMD, generateHotspotsMD } from './markdown.js';

export { generateArchitectureMD, generateModulesMD, generateHotspotsMD };
export { ImpactAnalyzer, detectCycles } from './impact.js';
export type { ImpactResult, ImpactReport } from './impact.js';
export { getGitHash, getChangedFiles, isGitRepo } from './git.js';
export { LLMPlugin } from './llm.js';

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  FeaturePlugin, Project, CodeGraph, Symbol, Relationship,
  StorageAdapter, LanguagePlugin, GraphStats, Hotspot,
} from '@pcm/core';
import { TypeScriptLanguagePlugin } from '@pcm/plugin-typescript';

interface ScannerConfig {
  includeNodeModules: boolean;
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '__pycache__', '.venv', 'venv',
  '.pcm', '.agents',
]);

/**
 * Scanner 功能插件
 * 掃描專案目錄，解析原始碼，建立代碼圖譜
 */
export class ScannerPlugin implements FeaturePlugin {
  name = 'scanner';
  version = '0.1.0';
  description = '掃描專案原始碼，建立符號圖譜與依賴關係';

  private languagePlugins: Map<string, LanguagePlugin> = new Map();
  private includeNodeModules: boolean = false;

  constructor(opts?: { includeNodeModules?: boolean }) {
    if (opts?.includeNodeModules) this.includeNodeModules = true;
  }

  async onLoad(): Promise<void> {
    const tsPlugin = new TypeScriptLanguagePlugin();
    for (const ext of tsPlugin.extensions) {
      this.languagePlugins.set(ext, tsPlugin);
    }
    try {
      const { PythonLanguagePlugin } = await import('@pcm/plugin-python');
      const pyPlugin = new PythonLanguagePlugin();
      for (const ext of pyPlugin.extensions) {
        this.languagePlugins.set(ext, pyPlugin);
      }
    } catch {
      // Python plugin not installed; silently continue
    }
  }

  private getExtensions(): string[] {
    const exts = new Set<string>();
    for (const plugin of this.languagePlugins.values()) {
      for (const ext of plugin.extensions) exts.add(ext);
    }
    return Array.from(exts);
  }

  async query(project: Project, params: Record<string, unknown>): Promise<CodeGraph> {
    const force = params.force === true;
    return this.scan(project, force);
  }

  async scan(project: Project, force = false): Promise<CodeGraph> {
    const storage = await this.getStorage();
    const projectRoot = project.source.location;

    if (!fs.existsSync(projectRoot)) {
      throw new Error(`Project path does not exist: ${projectRoot}`);
    }

    // 增量更新：檢查 Git commit hash
    if (!force) {
      const { getGitHash } = await import('./git.js');
      const currentHash = getGitHash(projectRoot);
      if (currentHash) {
        const cached = await storage.getGraph(project.id);
        if (cached?.commitHash === currentHash) {
          return cached;
        }
      }
    }

    const symbols: Symbol[] = [];
    const rels: Relationship[] = [];
    const fileList: string[] = [];

    // 1. 收集所有檔案
    this.collectFiles(projectRoot, projectRoot, fileList);

    // 2. 解析每個檔案
    for (const filePath of fileList) {
      const ext = path.extname(filePath);
      const langPlugin = this.languagePlugins.get(ext);
      if (!langPlugin) continue;

      const fullPath = path.join(projectRoot, filePath);
      let source: string;
      try {
        source = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      // Create file-level symbol
      const fileSymbol: Symbol = {
        id: randomUUID(),
        projectId: project.id,
        type: 'file',
        name: path.basename(filePath),
        fullyQualifiedName: filePath,
        filePath,
        location: {
          file: filePath,
          startLine: 1, startColumn: 1,
          endLine: source.split('\n').length, endColumn: 1,
        },
        language: 'typescript',
        complexity: 0,
        lineCount: source.split('\n').length,
        docString: null,
        metadata: {},
      };
      symbols.push(fileSymbol);

      // Parse AST
      let ast;
      try {
        ast = await langPlugin.parse(filePath, source);
      } catch (err) {
        console.error(`[Scanner] Failed to parse ${filePath}:`, err);
        continue;
      }

      // Extract imports
      const imports = await langPlugin.extractImports(ast);
      for (const imp of imports) {
        rels.push({
          id: randomUUID(),
          sourceId: fileSymbol.id,
          targetId: '',
          type: 'imports',
          strength: 1.0,
          metadata: {
            importSource: imp.source,
            imported: imp.imported,
            startLine: imp.startLine,
          },
        });
      }

      // Extract symbols
      const fileSymbols = await langPlugin.extractSymbols(ast);
      for (const sym of fileSymbols) {
        sym.projectId = project.id;
        symbols.push(sym);
        rels.push({
          id: randomUUID(),
          sourceId: fileSymbol.id,
          targetId: sym.id,
          type: 'contains',
          strength: 1.0,
          metadata: {},
        });
      }

      // Calculate complexity
      fileSymbol.complexity = await langPlugin.calculateComplexity(ast);
    }

    // 3. 解析跨檔案 import 關係（把 import 的 target 連到對應的 file symbol）
    const fileIndex = new Map<string, Symbol>();
    for (const sym of symbols) {
      if (sym.type === 'file') {
        fileIndex.set(sym.fullyQualifiedName, sym);
      }
    }

    for (const rel of rels) {
      if (rel.type === 'imports' && !rel.targetId) {
        const importSource = rel.metadata.importSource as string;
        // Try to resolve relative import
        const resolvedPath = this.resolveImportPath(
          importSource,
          rel.metadata._sourceFile as string || '',
           this.getExtensions(),
        );
        const targetFile = fileIndex.get(resolvedPath);
        if (targetFile) {
          rel.targetId = targetFile.id;
        }
      }
    }

    // 4. 計算統計
    const hotspots: Hotspot[] = symbols
      .filter(s => s.type === 'file' || s.type === 'function')
      .map(s => ({
        symbolId: s.id,
        name: s.name,
        filePath: s.filePath,
        complexity: s.complexity,
        riskScore: s.complexity,
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    const stats: GraphStats = {
      fileCount: symbols.filter(s => s.type === 'file').length,
      symbolCount: symbols.length,
      relationshipCount: rels.length,
      totalLines: symbols
        .filter(s => s.type === 'file')
        .reduce((sum, s) => sum + s.lineCount, 0),
      hotspots,
    };

    const { getGitHash: getHash } = await import('./git.js');
    const currentHash = getHash(projectRoot);

    const graph: CodeGraph = {
      projectId: project.id,
      scannedAt: new Date(),
      commitHash: currentHash,
      symbols,
      relationships: rels,
      stats,
    };

    await storage.saveGraph(project.id, graph);
    await storage.saveSymbols(symbols);
    // 只保存已解析的關係（有完整 sourceId + targetId）
    const resolvedRels = rels.filter(r => r.sourceId && r.targetId);
    await storage.saveRelationships(resolvedRels);

    return graph;
  }

  async generateArtifacts(project: Project, graph: CodeGraph): Promise<import('@pcm/core').Artifact[]> {
    const artifactsDir = path.join(
      process.env.HOME || '/tmp',
      '.agents', 'pcm',
    );

    const arch = generateArchitectureMD(project.name, graph);
    const modules = generateModulesMD(project.name, graph);
    const hotspots = generateHotspotsMD(project.name, graph);

    return [
      { type: 'architecture', path: path.join(artifactsDir, 'architecture.md'), content: arch, mimeType: 'text/markdown' },
      { type: 'modules', path: path.join(artifactsDir, 'modules.md'), content: modules, mimeType: 'text/markdown' },
      { type: 'hotspots', path: path.join(artifactsDir, 'hotspots.md'), content: hotspots, mimeType: 'text/markdown' },
    ];
  }

  private async getStorage(): Promise<StorageAdapter> {
    const { getKernel } = await import('@pcm/core');
    return getKernel().plugins.getStorage();
  }

  private collectFiles(rootDir: string, currentDir: string, files: string[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        this.collectFiles(rootDir, fullPath, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (this.getExtensions().includes(ext)) {
          files.push(relPath);
        }
      }
    }
  }

  private resolveImportPath(
    importSource: string,
    _currentFile: string,
    extensions: string[],
  ): string {
    // Remove relative prefix and try extensions
    if (importSource.startsWith('.')) {
      for (const ext of extensions) {
        const candidate = importSource + ext;
        if (fs.existsSync(candidate)) {
          return candidate;
        }
        const indexCandidate = path.join(importSource, `index${ext}`);
        if (fs.existsSync(indexCandidate)) {
          return indexCandidate;
        }
      }
    }
    return importSource;
  }
}
