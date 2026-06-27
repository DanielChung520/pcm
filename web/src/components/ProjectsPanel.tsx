import { useState, useEffect } from "react";
import { fetchProjects, type Project, type ProjectType, type ProjectStatus } from "../mockData";

interface ProjectsPanelProps {
  onGraphView: (projectName: string) => void;
}

const typeIcons: Record<ProjectType, string> = { TypeScript: "TS", Python: "Py", Rust: "Rs" };
const statusClass: Record<ProjectStatus, string> = { active: "active", idle: "idle", scanning: "scanning", error: "error" };

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const now = new Date();
  const diffHr = Math.floor((now.getTime() - d.getTime()) / 3600000);
  if (diffHr < 1) return "just now";
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** Infer parent project by checking if one path is a prefix of another */
function buildTree(projects: Project[]): Project[] {
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

interface TreeNode {
  project: Project;
  depth: number;
}

function buildNodeList(projects: Project[]): TreeNode[] {
  const nodes: TreeNode[] = [];

  // Sort by source path length (shortest first = parents before children)
  const sorted = [...projects].sort((a, b) => {
    const aPath = a.source?.location || a.name;
    const bPath = b.source?.location || b.name;
    return aPath.length - bPath.length;
  });

  const assigned = new Set<string>();

  for (const p of sorted) {
    // Find if this project is inside another project's path
    let parent: Project | null = null;
    for (const other of sorted) {
      if (other.id === p.id) continue;
      if (other.name === p.name) continue;
      // Check if p's source location starts with other's source location
      if (other.source?.location && p.source?.location) {
        const parentPath = other.source.location.replace(/\/$/, '');
        const childPath = p.source.location;
        if (childPath.startsWith(parentPath + '/') && childPath !== parentPath) {
          parent = other;
          break;
        }
      }
    }

    if (parent && assigned.has(parent.id)) {
      const parentIdx = nodes.findIndex(n => n.project.id === parent.id);
      const depth = nodes[parentIdx].depth + 1;
      nodes.splice(parentIdx + 1, 0, { project: p, depth });
    } else {
      nodes.push({ project: p, depth: 0 });
    }
    assigned.add(p.id);
  }

  return nodes;
}

export function ProjectsPanel({ onGraphView }: ProjectsPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => { fetchProjects().then(setProjects); }, []);
  const [newName, setNewName] = useState("");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const path = newName.trim();
    setNewName("");
    // 加入臨時卡片顯示 scanning 狀態
    const tempId = `p${Date.now()}`;
    setProjects(prev => [...prev, {
      id: tempId, name: path.split('/').pop() || path,
      type: "TypeScript" as ProjectType, status: "scanning" as ProjectStatus,
      files: 0, symbols: 0, relationships: 0, hotspots: [], lastScanned: null,
    }]);
    // 呼叫真實 scan API
    try {
      const res = await fetch(`/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, force: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(prev => prev.map(p => p.id === tempId ? {
          ...p, status: "active" as ProjectStatus,
          files: data.stats?.fileCount ?? 0,
          symbols: data.stats?.symbolCount ?? 0,
          relationships: data.stats?.relationshipCount ?? 0,
          lastScanned: new Date().toISOString(),
        } : p));
      } else {
        setProjects(prev => prev.filter(p => p.id !== tempId));
      }
    } catch {
      setProjects(prev => prev.filter(p => p.id !== tempId));
    }
    // 重新從 API 載入完整列表
    fetchProjects().then(setProjects);
  };

  const handleDelete = (id: string) => setProjects(prev => prev.filter(p => p.id !== id));

  const handleScan = async (id: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status: "scanning" as ProjectStatus } : p));
    const project = projects.find(p => p.id === id);
    if (project?.source?.location) {
      try {
        const res = await fetch(`/api/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: project.source.location, force: true }),
        });
        if (res.ok) {
          const data = await res.json();
          setProjects(prev => prev.map(p => p.id === id ? {
            ...p, status: "active" as ProjectStatus,
            files: data.stats?.fileCount ?? p.files,
            symbols: data.stats?.symbolCount ?? p.symbols,
            relationships: data.stats?.relationshipCount ?? p.relationships,
            lastScanned: new Date().toISOString(),
          } : p));
          return;
        }
      } catch {}
    }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status: "active" as ProjectStatus } : p));
  };

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const treeNodes = buildNodeList(projects);

  // Determine which nodes have children (for collapse toggle)
  const hasChildren = new Set<string>();
  for (let i = 0; i < treeNodes.length; i++) {
    for (let j = i + 1; j < treeNodes.length; j++) {
      if (treeNodes[j].depth <= treeNodes[i].depth) break;
      hasChildren.add(treeNodes[i].project.id);
    }
  }

  return (
    <div className="panel-fade">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Projects</h2>
          <p className="panel-subtitle">Manage scanned codebases — nested view shows project hierarchy</p>
        </div>
      </div>

      <div className="projects-toolbar">
        <div className="add-project-form">
          <input className="text-input" type="text" placeholder="Add project path or name..."
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <button className="btn-primary" onClick={handleAdd}>Add</button>
        </div>
      </div>

      <div className="project-tree">
        {treeNodes
          .filter((tn, idx) => {
            for (let i = idx - 1; i >= 0; i--) {
              if (treeNodes[i].depth >= tn.depth) continue;
              if (collapsed.has(treeNodes[i].project.id)) return false;
              break;
            }
            return true;
          })
          .map((tn) => {
          const p = tn.project;
          const isCollapsed = collapsed.has(p.id);
          const isParent = hasChildren.has(p.id);

          return (
            <div key={p.id} className={`project-tree-row depth-${tn.depth}`}>
              {/* Indent line */}
              {tn.depth > 0 && <div className="tree-line" />}

              <div className="project-card" style={{ marginLeft: tn.depth * 28 }}>
                {/* Collapse toggle */}
                {isParent && (
                  <button className="tree-toggle" onClick={() => toggleCollapse(p.id)}>
                    {isCollapsed ? "▶" : "▼"}
                  </button>
                )}

                <div className={`project-icon ${p.type.toLowerCase()}`}>{typeIcons[p.type]}</div>
                <div className="project-info">
                  <span className="project-name">{p.name}</span>
                  <div className="project-meta">
                    <span>{p.type}</span>
                    <span>{p.files} files</span>
                    <span>{p.symbols} symbols</span>
                  </div>
                </div>
                <div className="project-status-group">
                  <span className={`project-status ${statusClass[p.status]}`}>{p.status}</span>
                  <span className="project-scan-time">{formatTime(p.lastScanned)}</span>
                </div>
                <div className="project-actions">
                  <button className="btn-small" onClick={() => onGraphView(p.name)}>Graph</button>
                  <button className="btn-small" onClick={() => handleScan(p.id)}>Scan</button>
                  <button className="btn-small danger" onClick={() => handleDelete(p.id)}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
