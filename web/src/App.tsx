import { useState, useRef, useEffect } from "react";

type Panel = "dashboard" | "graph" | "terminal" | "projects";

function App() {
  const [activePanel, setActivePanel] = useState<Panel>("dashboard");
  const [projects, setProjects] = useState<string[]>([]);

  useEffect(() => {
    // Load projects list via Tauri invoke or mock for now
    setProjects(["core", "scanner", "cli", "mcp-server"]);
  }, []);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>PCM</h1>
          <span className="version">v0.1.0</span>
        </div>
        <nav className="sidebar-nav">
          <button
            className={activePanel === "dashboard" ? "active" : ""}
            onClick={() => setActivePanel("dashboard")}
          >
            📊 Dashboard
          </button>
          <button
            className={activePanel === "graph" ? "active" : ""}
            onClick={() => setActivePanel("graph")}
          >
            🕸️ CodeGraph
          </button>
          <button
            className={activePanel === "projects" ? "active" : ""}
            onClick={() => setActivePanel("projects")}
          >
            📁 Projects
          </button>
          <button
            className={activePanel === "terminal" ? "active" : ""}
            onClick={() => setActivePanel("terminal")}
          >
            💻 Terminal
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="status-dot" />
          <span>Ready</span>
        </div>
      </aside>

      <main className="main-content">
        {activePanel === "dashboard" && <DashboardPanel />}
        {activePanel === "graph" && <GraphPanel />}
        {activePanel === "projects" && <ProjectsPanel projects={projects} />}
        {activePanel === "terminal" && <TerminalPanel />}
      </main>
    </div>
  );
}

function DashboardPanel() {
  return (
    <div className="panel">
      <h2>Dashboard</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">4</span>
          <span className="stat-label">Projects</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">38</span>
          <span className="stat-label">Files</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">187</span>
          <span className="stat-label">Symbols</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">198</span>
          <span className="stat-label">Relations</span>
        </div>
      </div>
      <div className="recent-scans">
        <h3>Recent Scans</h3>
        <p>Scan a project from the Projects panel to see results here.</p>
      </div>
    </div>
  );
}

function GraphPanel() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    // Placeholder: D3.js graph will be rendered here
    const svg = svgRef.current;
    svg.innerHTML = `
      <text x="400" y="200" text-anchor="middle" fill="#666">
        Run a scan to see the code graph
      </text>
    `;
  }, []);

  return (
    <div className="panel graph-panel">
      <h2>CodeGraph</h2>
      <div className="graph-container">
        <svg ref={svgRef} width="100%" height="600" />
      </div>
    </div>
  );
}

function ProjectsPanel({ projects }: { projects: string[] }) {
  return (
    <div className="panel">
      <h2>Projects</h2>
      <div className="project-list">
        {projects.map((p) => (
          <div key={p} className="project-card">
            <span className="project-name">{p}</span>
            <span className="project-status active">Active</span>
            <div className="project-actions">
              <button className="btn-small">Scan</button>
              <button className="btn-small">Graph</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TerminalPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terminalRef.current) return;
    // Placeholder: xterm.js terminal will be initialized here
    terminalRef.current.innerHTML = `
      <div class="terminal-placeholder">
        <p>Terminal ready (CWD: ~/.pcm/workspace/)</p>
        <p class="terminal-hint">OpenCode/Claude Code/Cursor can connect here</p>
      </div>
    `;
  }, []);

  return (
    <div className="panel terminal-panel">
      <h2>Terminal</h2>
      <div ref={terminalRef} className="terminal-container" />
    </div>
  );
}

export default App;
