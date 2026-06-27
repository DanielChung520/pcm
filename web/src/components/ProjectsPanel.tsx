import { useState, useEffect } from "react";
import { fetchProjects, type Project, type ProjectType, type ProjectStatus } from "../mockData";

interface ProjectsPanelProps {
  onGraphView: () => void;
}

const typeIcons: Record<ProjectType, string> = {
  TypeScript: "TS",
  Python: "Py",
  Rust: "Rs",
};

const statusClass: Record<ProjectStatus, string> = {
  active: "active",
  idle: "idle",
  scanning: "scanning",
  error: "error",
};

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHr = Math.floor(diffMs / 3600000);
  if (diffHr < 1) return "just now";
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function ProjectsPanel({ onGraphView }: ProjectsPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetchProjects().then(setProjects);
  }, []);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    const newProject: Project = {
      id: `p${Date.now()}`,
      name: newName.trim(),
      type: "TypeScript" as ProjectType,
      status: "active" as ProjectStatus,
      files: 0,
      symbols: 0,
      relationships: 0,
      hotspots: [],
      lastScanned: null,
    };
    setProjects([...projects, newProject]);
    setNewName("");
  };

  const handleScan = (id: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: "scanning", lastScanned: new Date().toISOString() } : p,
      ),
    );
    // Simulate scan completion
    setTimeout(() => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "active",
                files: p.files + Math.floor(Math.random() * 10) + 1,
                symbols: p.symbols + Math.floor(Math.random() * 30) + 5,
              }
            : p,
        ),
      );
    }, 2000);
  };

  const handleDelete = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="panel-fade">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Projects</h2>
          <p className="panel-subtitle">Manage scanned codebases</p>
        </div>
      </div>

      <div className="projects-toolbar">
        <div className="add-project-form">
          <input
            className="text-input"
            type="text"
            placeholder="Add project path or name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button className="btn-primary" onClick={handleAdd}>
            Add
          </button>
        </div>
      </div>

      <div className="project-list">
        {projects.map((p) => (
          <div key={p.id} className="project-card">
            <div className={`project-icon ${p.type.toLowerCase()}`}>{typeIcons[p.type]}</div>
            <div className="project-info">
              <span className="project-name">{p.name}</span>
              <div className="project-meta">
                <span>{p.type}</span>
                <span>{p.files} files</span>
                <span>{p.symbols} symbols</span>
                <span>scanned {formatTime(p.lastScanned)}</span>
              </div>
            </div>
            <span className={`project-status ${statusClass[p.status]}`}>{p.status}</span>
            <div className="project-actions">
              <button className="btn-small" onClick={() => handleScan(p.id)}>
                Scan
              </button>
              <button className="btn-small" onClick={onGraphView}>
                Graph
              </button>
              <button className="btn-small danger" onClick={() => handleDelete(p.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}