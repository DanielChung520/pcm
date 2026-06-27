import { useState, useEffect } from "react";
import { fetchStats, fetchProjects } from "../mockData";

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function DashboardPanel() {
  const [stats, setStats] = useState({ projects: 0, files: 0, symbols: 0, relationships: 0 });
  const [scans, setScans] = useState<any[]>([]);

  useEffect(() => {
    fetchStats().then(setStats);
    fetchProjects().then(projects => setScans(projects));
  }, []);

  return (
    <div className="panel-fade">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Dashboard</h2>
          <p className="panel-subtitle">PCM engine overview and recent activity</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">{"\u25A3"}</span>
          <span className="stat-value">{stats.projects}</span>
          <span className="stat-label">Projects</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">{"\u25A0"}</span>
          <span className="stat-value">{stats.files}</span>
          <span className="stat-label">Files</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">{"\u25C6"}</span>
          <span className="stat-value">{stats.symbols}</span>
          <span className="stat-label">Symbols</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">{"\u2194"}</span>
          <span className="stat-value">{stats.relationships}</span>
          <span className="stat-label">Relations</span>
        </div>
      </div>

      {/* Recent scans */}
      <div className="dashboard-section">
        <h3 className="section-heading">Recent Scans</h3>
        <div className="scan-list">
          {scans.map((scan) => (
            <div key={scan.id} className="scan-item">
              <div className={`scan-status ${scan.status}`} />
              <span className="scan-project">{scan.name}</span>
              <span className="scan-meta">
                {scan.files} files / {scan.symbols} symbols
              </span>
              <span className="scan-time">{formatTime(scan.lastScanned)}</span>
              <span className={`project-status ${scan.status === "active" ? "active" : "error"}`}>
                {scan.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* System health */}
      <div className="dashboard-section">
        <h3 className="section-heading">System</h3>
        <div className="health-grid">
          <div className="health-card">
            <div className="health-label">Scanned Projects</div>
            <div className="health-value">{stats.projects}</div>
          </div>
        </div>
      </div>
    </div>
  );
}