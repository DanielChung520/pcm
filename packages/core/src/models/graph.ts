import type { Symbol } from './symbol.js';
import type { Relationship } from './relationship.js';

/**
 * 代碼圖譜：專案完整的靜態分析結果
 */
export interface CodeGraph {
  /** 專案 ID */
  projectId: string;
  /** 掃描時間 */
  scannedAt: Date;
  /** 對應的 Git commit hash */
  commitHash: string | null;
  /** 所有節點 */
  symbols: Symbol[];
  /** 所有邊 */
  relationships: Relationship[];
  /** 統計 */
  stats: GraphStats;
}

export interface GraphStats {
  fileCount: number;
  symbolCount: number;
  relationshipCount: number;
  totalLines: number;
  hotspots: Hotspot[];
}

export interface Hotspot {
  symbolId: string;
  name: string;
  filePath: string;
  complexity: number;
  /** 因高複雜度 + 高變動頻率的風險分數 */
  riskScore: number;
}

/**
 * 圖譜差異（用於增量更新）
 */
export interface GraphDiff {
  added: Symbol[];
  removed: Symbol[];
  modified: Symbol[];
  addedRelationships: Relationship[];
  removedRelationships: Relationship[];
}
