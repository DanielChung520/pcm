/**
 * 符號類型：代碼中的基本元素
 */
export type SymbolType =
  | 'file'
  | 'function'
  | 'class'
  | 'interface'
  | 'method'
  | 'variable'
  | 'type'
  | 'enum'
  | 'module'
  | 'import';

/**
 * 原始碼位置
 */
export interface SourceLocation {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * PCM 核心實體：符號
 * 代碼圖譜中的節點
 */
export interface Symbol {
  /** UUID */
  id: string;
  /** 所屬專案 ID */
  projectId: string;
  /** 符號類型 */
  type: SymbolType;
  /** 簡短名稱 */
  name: string;
  /** 完整限定名稱，如 "src/auth/AuthService::authenticate" */
  fullyQualifiedName: string;
  /** 檔案路徑（相對於專案根目錄） */
  filePath: string;
  /** 原始碼位置 */
  location: SourceLocation;
  /** 語言 */
  language: string;
  /** 複雜度分數（Cyclomatic Complexity） */
  complexity: number;
  /** 行數 */
  lineCount: number;
  /** 文檔字串 */
  docString: string | null;
  /** 語言特定屬性 */
  metadata: Record<string, unknown>;
}
