import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { DashboardPanel } from "./components/DashboardPanel";
import { CodeGraphPanel } from "./components/CodeGraphPanel";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { defaultSettings, type Settings } from "./mockData";

export type Panel = "dashboard" | "graph" | "projects" | "settings" | "terminal";

function App() {
  const [activePanel, setActivePanel] = useState<Panel>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  return (
    <div className="app-container">
      {mobileOpen && (
        <button
          className="mobile-menu-btn"
          style={{ position: "fixed", top: "8px", left: "8px", zIndex: 200 }}
          onClick={() => setMobileOpen(false)}
        >
          {"\u2715"}
        </button>
      )}
      {!mobileOpen && (
        <button
          className="mobile-menu-btn"
          style={{ position: "fixed", top: "8px", left: "8px", zIndex: 200 }}
          onClick={() => setMobileOpen(true)}
        >
          {"\u2630"}
        </button>
      )}

      <Sidebar
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <main className="main-content">
        {activePanel === "dashboard" && <DashboardPanel />}
        {activePanel === "graph" && <CodeGraphPanel />}
        {activePanel === "projects" && <ProjectsPanel onGraphView={() => setActivePanel("graph")} />}
        {activePanel === "settings" && (
          <SettingsPanel settings={settings} onChange={setSettings} />
        )}
        {activePanel === "terminal" && <TerminalPanel />}
      </main>
    </div>
  );
}

export default App;