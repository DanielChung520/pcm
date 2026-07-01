import { aql } from 'arangojs';
import type { Project, Symbol, Relationship, CodeGraph, SymbolFilter, RelationshipFilter, StorageAdapter } from '@pcm/core';

export class ArangoDBAdapter implements StorageAdapter {
  name = 'arangodb';
  private url: string;
  private dbName: string;
  private db: any = null;

  constructor(config: { url?: string; dbName?: string; username?: string; password?: string }) {
    this.url = config.url || 'http://localhost:8529';
    this.dbName = config.dbName || 'pcm';
  }

  async initialize(): Promise<void> {
    const { Database } = await import('arangojs');
    this.db = new Database({ url: this.url });
    this.db.useBasicAuth('root', '');
    this.db = this.db.database(this.dbName);
    const exists = await this.db.exists();
    if (!exists) await this.db.createDatabase(this.dbName);
    const collections = ['projects', 'symbols', 'graph_cache'];
    for (const name of collections) {
      const col = this.db.collection(name);
      if (!(await col.exists())) await col.create();
    }
    const relCol = this.db.collection('relationships');
    if (!(await relCol.exists())) await this.db.createEdgeCollection('relationships');
    const msgCol = this.db.collection('conv_messages');
    if (!(await msgCol.exists())) await msgCol.create();
  }

  async close(): Promise<void> { this.db = null; }

  async saveProject(project: Project): Promise<void> {
    await this.db.collection('projects').save({ _key: project.id, ...project,
      createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(),
      lastScannedAt: project.lastScannedAt?.toISOString() }, { overwrite: true });
  }
  async getProject(id: string): Promise<Project | null> {
    try { return await this.db.collection('projects').document(id) as Project; } catch { return null; }
  }
  async listProjects(): Promise<Project[]> {
    return (await this.db.query(aql`FOR p IN projects RETURN p`)).all();
  }
  async deleteProject(id: string): Promise<void> {
    try { await this.db.collection('projects').remove(id); } catch {}
  }

  async saveSymbol(symbol: Symbol): Promise<void> {
    await this.db.collection('symbols').save({ _key: symbol.id, ...symbol }, { overwrite: true });
  }
  async saveSymbols(symbols: Symbol[]): Promise<void> {
    for (const s of symbols) await this.saveSymbol(s);
  }
  async getSymbol(id: string): Promise<Symbol | null> {
    try { return await this.db.collection('symbols').document(id) as Symbol; } catch { return null; }
  }
  async querySymbols(filter: SymbolFilter): Promise<Symbol[]> {
    const parts: string[] = [];
    const vals: any = {};
    if (filter.projectId) { parts.push('s.projectId == @pid'); vals.pid = filter.projectId; }
    if (filter.type) { parts.push('s.type == @type'); vals.type = filter.type; }
    if (filter.name) { parts.push('CONTAINS(s.name, @name)'); vals.name = filter.name; }
    const where = parts.length > 0 ? 'FILTER ' + parts.join(' AND ') : '';
    const limit = (filter.offset ?? 0) + ', ' + (filter.limit ?? 100);
    const cursor = await this.db.query(
      `FOR s IN symbols ${where} LIMIT ${limit} RETURN s`, vals,
    );
    return cursor.all();
  }

  async saveRelationship(rel: Relationship): Promise<void> {
    await this.db.collection('relationships').save({
      _key: rel.id, _from: `symbols/${rel.sourceId}`, _to: `symbols/${rel.targetId}`,
      ...rel,
    }, { overwrite: true });
  }
  async saveRelationships(rels: Relationship[]): Promise<void> {
    for (const r of rels) await this.saveRelationship(r);
  }
  async queryRelationships(filter: RelationshipFilter): Promise<Relationship[]> {
    const parts: string[] = [];
    const vals: any = {};
    if (filter.sourceId) { parts.push('r.sourceId == @sid'); vals.sid = filter.sourceId; }
    if (filter.targetId) { parts.push('r.targetId == @tid'); vals.tid = filter.targetId; }
    if (filter.type) { parts.push('r.type == @type'); vals.type = filter.type; }
    const where = parts.length > 0 ? 'FILTER ' + parts.join(' AND ') : '';
    const limit = (filter.offset ?? 0) + ', ' + (filter.limit ?? 500);
    const cursor = await this.db.query(
      `FOR r IN relationships ${where} LIMIT ${limit} RETURN r`, vals,
    );
    return cursor.all();
  }

  async getGraph(projectId: string): Promise<CodeGraph | null> {
    try { return await this.db.collection('graph_cache').document(projectId) as CodeGraph; } catch { return null; }
  }
  async saveGraph(projectId: string, graph: CodeGraph): Promise<void> {
    await this.db.collection('graph_cache').save({ _key: projectId, ...graph }, { overwrite: true });
  }

  async findPaths(sourceId: string, targetId: string, maxDepth: number): Promise<Relationship[][]> {
    const cursor = await this.db.query(aql`
      FOR v, e, p IN 1..${maxDepth} OUTBOUND ${`symbols/${sourceId}`} relationships
        FILTER v._id == ${`symbols/${targetId}`}
        RETURN p.edges
    `);
    return cursor.all();
  }
  async findDependents(symbolId: string): Promise<Symbol[]> {
    const cursor = await this.db.query(aql`
      FOR v IN 1..10 INBOUND ${`symbols/${symbolId}`} relationships
        RETURN DISTINCT v
    `);
    return cursor.all();
  }
  async findDependencies(symbolId: string): Promise<Symbol[]> {
    const cursor = await this.db.query(aql`
      FOR v IN 1..10 OUTBOUND ${`symbols/${symbolId}`} relationships
        RETURN DISTINCT v
    `);
    return cursor.all();
  }
}
