export type ProjectType = "TypeScript" | "Python" | "Rust";
export type ProjectStatus = "active" | "idle" | "scanning" | "error";

export interface Project {
  id: string; name: string; type: ProjectType; status: ProjectStatus;
  lastScanned: string | null; files: number; symbols: number; relationships: number;
  hotspots: { name: string; filePath: string; complexity: number; riskScore: number }[];
}

export interface GraphNode {
  id: string; name: string; filePath: string; module: string;
  type: string; complexity: number;
}

export interface GraphLink {
  source: string; target: string; type: string;
}

const API_BASE = '';

export type ScanInterval = "manual" | "hourly" | "daily" | "weekly";
export type StorageBackend = "sqlite" | "arangodb";
export type ThemeMode = "dark" | "light";

export interface Settings {
  theme: ThemeMode;
  scanInterval: ScanInterval;
  llmModel: string;
  storageBackend: StorageBackend;
}

export const defaultSettings: Settings = {
  theme: "dark",
  scanInterval: "manual",
  llmModel: "qwen3-30b-a3b-4bit",
  storageBackend: "sqlite",
};

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchGraph(projectName: string): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
  const res = await fetch(`${API_BASE}/api/graph/${encodeURIComponent(projectName)}`);
  if (!res.ok) return { nodes: [], links: [] };
  return res.json();
}

export async function fetchStats(): Promise<{ projects: number; files: number; symbols: number; relationships: number }> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) return { projects: 0, files: 0, symbols: 0, relationships: 0 };
  return res.json();
}
