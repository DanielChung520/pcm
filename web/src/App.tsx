import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { DashboardPanel } from "./components/DashboardPanel";
import { CodeGraphPanel } from "./components/CodeGraphPanel";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { defaultSettings, type Settings } from "./mockData";

export type Panel = "dashboard" | "graph" | "projects" | "settings" | "terminal";

// 讀取 localStorage 儲存的主題設定
function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem("pcm-settings");
    if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
  } catch {}
  return defaultSettings;
}

// 套用主題到 document
function applyTheme(mode: string) {
  const isDark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

// 設定變更時持久化 + 立即套用
function saveAndApply(s: Settings) {
  localStorage.setItem("pcm-settings", JSON.stringify(s));
  applyTheme(s.theme);
}

function App() {
  const [activePanel, setActivePanel] = useState<Panel>("dashboard");
  const [previousPanel, setPreviousPanel] = useState<Panel>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [graphProject, setGraphProject] = useState<string>("");
  const [terminalOpen, setTerminalOpen] = useState(() => {
    try { return localStorage.getItem("pcm-terminal-open") === "true"; } catch { return false; }
  });
  const [settings, setSettings] = useState<Settings>(() => {
    const s = loadSettings();
    // 初始套用（確保即使 React 非同步也不閃白）
    applyTheme(s.theme);
    return s;
  });

  // 監聽 OS 主題變化（僅 system 模式）
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (settings.theme === "system") saveAndApply(settings); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  // 設定變更時持久化 + 立即套用
  const handleSettingsChange = useCallback((s: Settings) => {
    setSettings(s);
    saveAndApply(s);
  }, []);

  // 統一側邊欄按鈕行為
  const handlePanelChange = useCallback((panel: Panel) => {
    if (panel === "terminal") {
      if (terminalOpen) {
        // Terminal 已開 → 關閉，回到上一個面板
        setTerminalOpen(false);
        localStorage.setItem("pcm-terminal-open", "false");
        const target = settings.layout === "full" ? previousPanel : activePanel;
        setActivePanel(target);
      } else {
        // Terminal 已關 → 開啟
        setPreviousPanel(activePanel);
        setTerminalOpen(true);
        localStorage.setItem("pcm-terminal-open", "true");
        if (settings.layout === "full") setActivePanel("terminal");
      }
    } else {
      setActivePanel(panel);
    }
  }, [terminalOpen, activePanel, previousPanel, settings.layout]);

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
        onPanelChange={handlePanelChange}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        terminalOpen={terminalOpen}
      />

      <main className={`main-content layout-${settings.layout}`}>
        <div className="panel-area">
          {activePanel === "dashboard" && <DashboardPanel />}
          {activePanel === "graph" && <CodeGraphPanel initialProject={graphProject} />}
          {activePanel === "projects" && <ProjectsPanel onGraphView={(name) => { setGraphProject(name); setActivePanel("graph"); }} />}
          {activePanel === "settings" && (
            <SettingsPanel settings={settings} onChange={handleSettingsChange} />
          )}
          {activePanel === "terminal" && settings.layout === "full" && <TerminalPanel />}
        </div>
        {terminalOpen && settings.layout !== "full" && (
          <div className={`terminal-split split-${settings.layout}`}>
            <TerminalPanel />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;