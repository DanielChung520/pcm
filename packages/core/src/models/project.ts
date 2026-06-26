export type ProjectStatus = 'active' | 'archived' | 'error';
export type ProjectType = 'node' | 'python' | 'go' | 'rust' | 'java' | 'mixed';

/**
 * PCM 核心實體：專案
 * 每個管理的軟體專案對應一個 Project 實體
 */
export interface Project {
  /** UUID */
  id: string;
  /** 目錄名稱，如 "aibox" */
  name: string;
  /** 在 SeaweedFS 中的 bucket 或本機路徑 */
  source: ProjectSource;
  /** 語言類型 */
  type: ProjectType;
  /** 插件啟用列表 */
  enabledPlugins: string[];
  /** 建立時間 */
  createdAt: Date;
  /** 更新時間 */
  updatedAt: Date;
  /** 最後掃描時間 */
  lastScannedAt: Date | null;
  /** 狀態 */
  status: ProjectStatus;
  /** 元數據（擴展用） */
  metadata: Record<string, string>;
}

export interface ProjectSource {
  /** "local" | "seaweedfs" | "s3" | "ssh" */
  type: string;
  /** 路徑或 bucket 名稱 */
  location: string;
  /** 可選的認證資訊 reference */
  credentialRef?: string;
}
