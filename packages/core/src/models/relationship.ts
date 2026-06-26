/**
 * 關係類型：符號之間的邊
 */
export type RelationshipType =
  | 'imports'      // 檔案 A 匯入檔案 B
  | 'calls'        // 函數 A 呼叫函數 B
  | 'extends'      // 類別 A 繼承類別 B
  | 'implements'   // 類別 A 實作介面 B
  | 'contains'     // 模組 A 包含符號 B
  | 'depends_on'   // 廣義依賴
  | 'references'   // 符號 A 引用符號 B
  | 'exports';     // 檔案 A 匯出符號 B

/**
 * PCM 核心實體：關係（有向邊）
 */
export interface Relationship {
  /** UUID */
  id: string;
  /** 來源符號 ID */
  sourceId: string;
  /** 目標符號 ID */
  targetId: string;
  /** 關係類型 */
  type: RelationshipType;
  /** 權重（用於影響分析，0-1） */
  strength: number;
  /** 元數據 */
  metadata: Record<string, unknown>;
}
