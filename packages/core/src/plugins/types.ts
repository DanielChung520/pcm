import type { Project } from '../models/project.js';
import type { CodeGraph } from '../models/graph.js';
import type { Symbol } from '../models/symbol.js';
import type { Relationship } from '../models/relationship.js';

/**
 * PCM 插件系統 — 三大核心介面
 * ================================
 * 所有功能擴展通過實現這些介面來達成
 */

/**
 * 功能插件介面
 * 每項功能（掃描、RAG、影響分析、文檔生成）都是一個 FeaturePlugin
 */
export interface FeaturePlugin {
  /** 插件名稱 */
  name: string;
  /** 版本號（SemVer） */
  version: string;
  /** 插件描述 */
  description?: string;

  // ── 生命週期鉤子 ──

  /** 插件載入時呼叫 */
  onLoad?(): Promise<void>;

  /** 插件卸載時呼叫 */
  onUnload?(): Promise<void>;

  /** 專案註冊時呼叫 */
  onProjectRegister?(project: Project): Promise<void>;

  /** 檔案變更時呼叫 */
  onFileChange?(project: Project, filePath: string): Promise<void>;

  /** 圖譜建立完成時呼叫 */
  onGraphBuild?(project: Project, graph: CodeGraph): Promise<void>;

  // ── 查詢能力 ──

  /** 執行插件特有的查詢 */
  query?(project: Project, params: Record<string, unknown>): Promise<unknown>;

  // ── 產物輸出 ──

  /** 生成可讀的產物檔案（如 Markdown） */
  generateArtifacts?(project: Project, graph: CodeGraph): Promise<Artifact[]>;
}

/**
 * 產物檔案
 */
export interface Artifact {
  /** 產物類型 */
  type: string;
  /** 檔案路徑（相對於 .agents/pcm/） */
  path: string;
  /** 檔案內容 */
  content: string;
  /** MIME 類型 */
  mimeType: string;
}

/**
 * 語言插件介面
 * 每種語言（TypeScript、Python、Go）都是一個 LanguagePlugin
 */
export interface LanguagePlugin {
  /** 語言名稱 */
  name: string;
  /** 版本號 */
  version: string;
  /** 支援的副檔名，如 ['.ts', '.tsx'] */
  extensions: string[];

  /** 解析檔案，返回抽象語法樹 */
  parse(filePath: string, source: string): Promise<AST>;

  /** 從 AST 提取 import 關係 */
  extractImports(ast: AST): Promise<Import[]>;

  /** 從 AST 提取符號 */
  extractSymbols(ast: AST): Promise<Symbol[]>;

  /** 從 AST 提取依賴關係 */
  extractRelationships(ast: AST): Promise<Relationship[]>;

  /** 計算複雜度 */
  calculateComplexity(ast: AST): Promise<number>;
}

/**
 * 抽象語法樹（語言無關的通用表示）
 */
export interface AST {
  language: string;
  filePath: string;
  source: string;
  /** 原始 Tree-sitter 語法樹（語言特定） */
  raw: unknown;
}

export interface Import {
  source: string;
  imported: string[];
  isDefault: boolean;
  isTypeOnly: boolean;
  startLine: number;
}

/**
 * 儲存適配器介面
 * 支援多種後端儲存（SQLite、FalkorDB、ArangoDB）
 */
export interface StorageAdapter {
  name: string;

  // ── 初始化與連線 ──

  initialize(): Promise<void>;
  close(): Promise<void>;

  // ── 專案操作 ──

  saveProject(project: Project): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  deleteProject(id: string): Promise<void>;

  // ── 符號操作 ──

  saveSymbol(symbol: Symbol): Promise<void>;
  saveSymbols(symbols: Symbol[]): Promise<void>;
  getSymbol(id: string): Promise<Symbol | null>;
  querySymbols(filter: SymbolFilter): Promise<Symbol[]>;

  // ── 關係操作 ──

  saveRelationship(rel: Relationship): Promise<void>;
  saveRelationships(rels: Relationship[]): Promise<void>;
  queryRelationships(filter: RelationshipFilter): Promise<Relationship[]>;

  // ── 圖譜操作 ──

  getGraph(projectId: string): Promise<CodeGraph | null>;
  saveGraph(projectId: string, graph: CodeGraph): Promise<void>;

  // ── 圖查詢 ──

  /** 查詢從 source 到 target 的所有路徑 */
  findPaths(sourceId: string, targetId: string, maxDepth: number): Promise<Relationship[][]>;

  /** 查詢某符號的影響範圍（誰依賴它） */
  findDependents(symbolId: string): Promise<Symbol[]>;

  /** 查詢某符號依賴了誰 */
  findDependencies(symbolId: string): Promise<Symbol[]>;
}

export interface SymbolFilter {
  projectId?: string;
  type?: string;
  name?: string;
  filePath?: string;
  language?: string;
  limit?: number;
  offset?: number;
}

export interface RelationshipFilter {
  projectId?: string;
  sourceId?: string;
  targetId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}
