import { aql } from 'arangojs';
import type { Project, Symbol, Relationship, CodeGraph, SymbolFilter, RelationshipFilter, StorageAdapter } from '@pcm/core';

export class ArangoDBAdapter implements StorageAdapter {
  name = 'arangodb';
  private url: string;
  private dbName: string;
  private username: string;
  private password: string;
  private db: any = null;

  constructor(config: {
    url?: string;
    dbName?: string;
    username?: string;
    password?: string;
  }) {
    this.url = config.url || 'http://localhost:8529';
    this.dbName = config.dbName || 'pcm';
    this.username = config.username || 'root';
    this.password = config.password || '';
  }

  async initialize(): Promise<void> {
    const { Database } = await import('arangojs');
    this.db = new Database({ url: this.url });
    this.db.useBasicAuth(this.username, this.password);
    this.db = this.db.database(this.dbName);

    const exists = await this.db.exists();
    if (!exists) {
      await this.db.createDatabase(this.dbName);
    }

    const collections = ['projects', 'symbols', 'graph_cache'];
    for (const name of collections) {
      const col = this.db.collection(name);
      const colExists = await col.exists();
      if (!colExists) await col.create();
    }
    // 關係用 edge collection（_from / _to 才能做圖遍歷）
    const relCol = this.db.collection('relationships');
    if (!(await relCol.exists())) {
      await this.db.createEdgeCollection('relationships');
    }
  }

  async close(): Promise<void> {
    this.db = null;
  }

  async saveProject(project: Project): Promise<void> {
    const col = this.db.collection('projects');
    await col.save({ _key: project.id, ...project, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(), lastScannedAt: project.lastScannedAt?.toISOString() }, { overwrite: true });
  }

  async getProject(id: string): Promise<Project | null> {
    try {
      const doc = await this.db.collection('projects').document(id);
      return doc as unknown as Project;
    } catch { return null; }
  }

  async listProjects(): Promise<Project[]> {
    const cursor = await this.db.query(aql`FOR p IN projects RETURN p`);
    return cursor.all();
  }

  async deleteProject(id: string): Promise<void> {
    try { await this.db.collection('projects').remove(id); } catch {}
  }

  async saveSymbol(symbol: Symbol): Promise<void> {
    await this.db.collection('symbols').save({ _key: symbol.id, ...symbol }, { overwrite: true });
  }

  async saveSymbols(symbols: Symbol[]): Promise<void> {
    const col = this.db.collection('symbols');
    for (const s of symbols) {
      await col.save({ _key: s.id, ...s }, { overwrite: true });
    }
  }

  async getSymbol(id: string): Promise<Symbol | null> {
    try { return await this.db.collection('symbols').document(id) as unknown as Symbol; } catch { return null; }
  }

  async querySymbols(filter: SymbolFilter): Promise<Symbol[]> {
    let query = 'FOR s IN symbols FILTER 1==1';
    const bindVars: any = {};
    if (filter.projectId) { query += ' AND s.projectId == @projectId'; bindVars.projectId = filter.projectId; }
    if (filter.type) { query += ' AND s.type == @type'; bindVars.type = filter.type; }
    if (filter.name) { query += ' AND CONTAINS(s.name, @name)'; bindVars.name = filter.name; }
    query += ' LIMIT @offset, @limit';
    bindVars.limit = filter.limit ?? 100;
    bindVars.offset = filter.offset ?? 0;
    const cursor = await this.db.query(query, bindVars);
    return cursor.all();
  }

  async saveRelationship(rel: Relationship): Promise<void> {
    await this.db.collection('relationships').save({
      _key: rel.id,
      _from: `symbols/${rel.sourceId}`,
      _to: `symbols/${rel.targetId}`,
      ...rel,
    }, { overwrite: true });
  }

  async saveRelationships(rels: Relationship[]): Promise<void> {
    for (const r of rels) await this.saveRelationship(r);
  }

  async queryRelationships(filter: RelationshipFilter): Promise<Relationship[]> {
    let query = 'FOR r IN relationships FILTER 1==1';
    const bindVars: any = {};
    if (filter.sourceId) { query += ' AND r.sourceId == @sourceId'; bindVars.sourceId = filter.sourceId; }
    if (filter.targetId) { query += ' AND r.targetId == @targetId'; bindVars.targetId = filter.targetId; }
    if (filter.type) { query += ' AND r.type == @type'; bindVars.type = filter.type; }
    query += ' LIMIT @offset, @limit';
    bindVars.limit = filter.limit ?? 500;
    bindVars.offset = filter.offset ?? 0;
    const cursor = await this.db.query(query, bindVars);
    return cursor.all();
  }

  async getGraph(projectId: string): Promise<CodeGraph | null> {
    try { return await this.db.collection('graph_cache').document(projectId) as unknown as CodeGraph; } catch { return null; }
  }

  async saveGraph(projectId: string, graph: CodeGraph): Promise<void> {
    await this.db.collection('graph_cache').save({ _key: projectId, ...graph }, { overwrite: true });
  }

  async findPaths(sourceId: string, targetId: string, maxDepth: number): Promise<Relationship[][]> {
    const query = `
      FOR v, e, p IN 1..@maxDepth OUTBOUND @sourceId relationships
        FILTER v._id == @targetId
        RETURN p.edges
    `;
    const cursor = await this.db.query(query, { sourceId: `symbols/${sourceId}`, targetId: `symbols/${targetId}`, maxDepth });
    return cursor.all();
  }

  async findDependents(symbolId: string): Promise<Symbol[]> {
    const query = `
      FOR v IN 1..10 INBOUND @symbolId relationships
        RETURN v
    `;
    const cursor = await this.db.query(query, { symbolId: `symbols/${symbolId}` });
    return cursor.all();
  }

  async findDependencies(symbolId: string): Promise<Symbol[]> {
    const query = `
      FOR v IN 1..10 OUTBOUND @symbolId relationships
        RETURN v
    `;
    const cursor = await this.db.query(query, { symbolId: `symbols/${symbolId}` });
    return cursor.all();
  }
}
