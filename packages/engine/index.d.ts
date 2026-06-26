export interface SymbolRow {
  id: string;
  projectId: string;
  filePath: string;
  name: string;
  symbolType: string;
}

export interface RelationshipRow {
  id: string;
  sourceId: string;
  targetId: string;
  relType: string;
  strength: number;
}

export interface GraphData {
  symbols: SymbolRow[];
  relationships: RelationshipRow[];
}

export declare class GraphEngine {
  loaded: boolean;
  findDependents(
    symbols: SymbolRow[],
    relationships: RelationshipRow[],
    seedIds: string[],
    maxDepth?: number,
  ): Record<string, number>;

  findPaths(
    symbols: SymbolRow[],
    relationships: RelationshipRow[],
    sourceId: string,
    targetId: string,
    maxDepth?: number,
  ): string[][];

  detectCycles(
    symbols: SymbolRow[],
    relationships: RelationshipRow[],
  ): string[][];

  computeImpactScores(
    symbols: SymbolRow[],
    relationships: RelationshipRow[],
    seedId: string,
  ): Record<string, number>;

  generateUuid(): string;
}
