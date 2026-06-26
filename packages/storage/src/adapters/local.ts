import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  Project, Symbol, Relationship, CodeGraph,
  SymbolFilter, RelationshipFilter, StorageAdapter,
} from '@pcm/core';

/**
 * SQLite LocalStorageAdapter — PCM 預設儲存後端
 *
 * Schema:
 *   projects       — 專案列表
 *   symbols        — 所有符號（函數、類別、介面、檔案）
 *   relationships  — 有向邊（import、call、extend…）
 *   graph_cache    — 圖譜快取（JSON blob）
 *
 * 檔案路徑：~/.pcm/cache/pcm.db
 */
export class LocalStorageAdapter implements StorageAdapter {
  name = 'local-sqlite';
  private db!: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(
      process.env.HOME || '/tmp',
      '.pcm/cache/pcm.db',
    );
  }

  async initialize(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        source_type TEXT NOT NULL DEFAULT 'local',
        source_location TEXT NOT NULL DEFAULT '',
        credential_ref TEXT,
        type TEXT NOT NULL DEFAULT 'node',
        enabled_plugins TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_scanned_at TEXT,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        fully_qualified_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL DEFAULT 0,
        start_column INTEGER NOT NULL DEFAULT 0,
        end_line INTEGER NOT NULL DEFAULT 0,
        end_column INTEGER NOT NULL DEFAULT 0,
        language TEXT NOT NULL DEFAULT 'unknown',
        complexity REAL NOT NULL DEFAULT 0,
        line_count INTEGER NOT NULL DEFAULT 0,
        doc_string TEXT,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_sym_project ON symbols(project_id);
      CREATE INDEX IF NOT EXISTS idx_sym_type ON symbols(type);
      CREATE INDEX IF NOT EXISTS idx_sym_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_sym_file ON symbols(file_path);

      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        strength REAL NOT NULL DEFAULT 1.0,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id);
      CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id);
      CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(type);

      CREATE TABLE IF NOT EXISTS graph_cache (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        scanned_at TEXT NOT NULL,
        commit_hash TEXT,
        data TEXT NOT NULL
      );
    `);
  }

  async close(): Promise<void> {
    this.db?.close();
  }

  async saveProject(project: Project): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO projects
        (id, name, source_type, source_location, credential_ref, type,
         enabled_plugins, status, created_at, updated_at, last_scanned_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project.id, project.name,
      project.source.type, project.source.location,
      project.source.credentialRef ?? null,
      project.type,
      JSON.stringify(project.enabledPlugins),
      project.status,
      project.createdAt.toISOString(),
      project.updatedAt.toISOString(),
      project.lastScannedAt?.toISOString() ?? null,
      JSON.stringify(project.metadata),
    );
  }

  async getProject(id: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as RowType | undefined;
    return row ? rowToProject(row) : null;
  }

  async listProjects(): Promise<Project[]> {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY name').all() as RowType[];
    return rows.map(rowToProject);
  }

  async deleteProject(id: string): Promise<void> {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  async saveSymbol(symbol: Symbol): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO symbols
        (id, project_id, type, name, fully_qualified_name, file_path,
         start_line, start_column, end_line, end_column,
         language, complexity, line_count, doc_string, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      symbol.id, symbol.projectId, symbol.type, symbol.name,
      symbol.fullyQualifiedName, symbol.filePath,
      symbol.location.startLine, symbol.location.startColumn,
      symbol.location.endLine, symbol.location.endColumn,
      symbol.language, symbol.complexity, symbol.lineCount,
      symbol.docString, JSON.stringify(symbol.metadata),
    );
  }

  async saveSymbols(symbols: Symbol[]): Promise<void> {
    const tx = this.db.transaction((items: Symbol[]) => {
      for (const s of items) this.saveSymbol(s);
    });
    tx(symbols);
  }

  async getSymbol(id: string): Promise<Symbol | null> {
    const row = this.db.prepare('SELECT * FROM symbols WHERE id = ?').get(id) as RowType | undefined;
    return row ? rowToSymbol(row) : null;
  }

  async querySymbols(filter: SymbolFilter): Promise<Symbol[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.projectId) { clauses.push('project_id = ?'); params.push(filter.projectId); }
    if (filter.type) { clauses.push('type = ?'); params.push(filter.type); }
    if (filter.name) { clauses.push('name LIKE ?'); params.push(`%${filter.name}%`); }
    if (filter.filePath) { clauses.push('file_path = ?'); params.push(filter.filePath); }
    if (filter.language) { clauses.push('language = ?'); params.push(filter.language); }

    const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;

    const rows = this.db.prepare(
      `SELECT * FROM symbols ${where} ORDER BY name LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as RowType[];
    return rows.map(rowToSymbol);
  }

  async saveRelationship(rel: Relationship): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO relationships
        (id, source_id, target_id, type, strength, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(rel.id, rel.sourceId, rel.targetId, rel.type, rel.strength, JSON.stringify(rel.metadata));
  }

  async saveRelationships(rels: Relationship[]): Promise<void> {
    const tx = this.db.transaction((items: Relationship[]) => {
      for (const r of items) this.saveRelationship(r);
    });
    tx(rels);
  }

  async queryRelationships(filter: RelationshipFilter): Promise<Relationship[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.sourceId) { clauses.push('source_id = ?'); params.push(filter.sourceId); }
    if (filter.targetId) { clauses.push('target_id = ?'); params.push(filter.targetId); }
    if (filter.type) { clauses.push('type = ?'); params.push(filter.type); }

    const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
    const limit = filter.limit ?? 500;
    const offset = filter.offset ?? 0;

    const rows = this.db.prepare(
      `SELECT * FROM relationships ${where} ORDER BY strength DESC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as RowType[];
    return rows.map(rowToRelationship);
  }

  async getGraph(projectId: string): Promise<CodeGraph | null> {
    const row = this.db.prepare('SELECT * FROM graph_cache WHERE project_id = ?').get(projectId) as RowType | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as CodeGraph;
  }

  async saveGraph(projectId: string, graph: CodeGraph): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO graph_cache (project_id, scanned_at, commit_hash, data)
      VALUES (?, ?, ?, ?)
    `).run(projectId, graph.scannedAt.toISOString(), graph.commitHash, JSON.stringify(graph));
  }

  async findPaths(sourceId: string, targetId: string, maxDepth: number): Promise<Relationship[][]> {
    const results: Relationship[][] = [];
    const visited = new Set<string>();
    const queue: { nodeId: string; path: Relationship[] }[] = [
      { nodeId: sourceId, path: [] },
    ];

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      if (nodeId === targetId) { results.push(path); continue; }
      if (path.length >= maxDepth) continue;
      if (visited.has(nodeId) && path.length > 0) continue;
      visited.add(nodeId);

      const rels = this.db.prepare(
        'SELECT * FROM relationships WHERE source_id = ?',
      ).all(nodeId) as RowType[];
      for (const rel of rels) {
        queue.push({ nodeId: rel.target_id, path: [...path, rowToRelationship(rel)] });
      }
    }
    return results;
  }

  async findDependents(symbolId: string): Promise<Symbol[]> {
    const rows = this.db.prepare(`
      SELECT DISTINCT s.* FROM symbols s
      JOIN relationships r ON r.source_id = s.id
      WHERE r.target_id = ?
    `).all(symbolId) as RowType[];
    return rows.map(rowToSymbol);
  }

  async findDependencies(symbolId: string): Promise<Symbol[]> {
    const rows = this.db.prepare(`
      SELECT DISTINCT s.* FROM symbols s
      JOIN relationships r ON r.target_id = s.id
      WHERE r.source_id = ?
    `).all(symbolId) as RowType[];
    return rows.map(rowToSymbol);
  }
}

interface RowType {
  [key: string]: unknown;
  id: string; name: string;
  source_type: string; source_location: string; credential_ref: string | null;
  type: string; enabled_plugins: string; status: string;
  created_at: string; updated_at: string; last_scanned_at: string | null;
  metadata: string;
  project_id: string; fully_qualified_name: string; file_path: string;
  start_line: number; start_column: number; end_line: number; end_column: number;
  language: string; complexity: number; line_count: number; doc_string: string | null;
  source_id: string; target_id: string; strength: number;
  scanned_at: string; commit_hash: string | null; data: string;
}

function rowToProject(r: RowType): Project {
  const plugins = JSON.parse(r.enabled_plugins || '[]');
  return {
    id: r.id, name: r.name,
    source: { type: r.source_type, location: r.source_location, credentialRef: r.credential_ref ?? undefined },
    type: r.type as Project['type'],
    enabledPlugins: Array.isArray(plugins) ? plugins : [],
    status: r.status as Project['status'],
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
    lastScannedAt: r.last_scanned_at ? new Date(r.last_scanned_at) : null,
    metadata: JSON.parse(r.metadata || '{}'),
  };
}

function rowToSymbol(r: RowType): Symbol {
  return {
    id: r.id, projectId: r.project_id,
    type: r.type as Symbol['type'], name: r.name,
    fullyQualifiedName: r.fully_qualified_name, filePath: r.file_path,
    location: {
      file: r.file_path,
      startLine: r.start_line, startColumn: r.start_column,
      endLine: r.end_line, endColumn: r.end_column,
    },
    language: r.language, complexity: r.complexity, lineCount: r.line_count,
    docString: r.doc_string ?? null,
    metadata: JSON.parse(r.metadata || '{}'),
  };
}

function rowToRelationship(r: RowType): Relationship {
  return {
    id: r.id, sourceId: r.source_id, targetId: r.target_id,
    type: r.type as Relationship['type'],
    strength: r.strength,
    metadata: JSON.parse(r.metadata || '{}'),
  };
}
