import { type Panel } from "../App";

interface SidebarProps {
  activePanel: Panel;
  onPanelChange: (panel: Panel) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  terminalOpen?: boolean;
}

const navItems: { id: Panel; icon: string; label: string }[] = [
  { id: "dashboard", icon: "\u25A4", label: "Dashboard" },
  { id: "projects", icon: "\u25A3", label: "Projects" },
  { id: "settings", icon: "\u2699", label: "Settings" },
  { id: "terminal", icon: "\u25B8", label: "Terminal" },
];

export function Sidebar({
  activePanel,
  onPanelChange,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  terminalOpen,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={onCloseMobile}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
        />
      )}
      <aside
        className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}
      >
        <div className="sidebar-header">
          <div className="sidebar-logo">PC</div>
          <span className="sidebar-title">PCM</span>
          <span className="version">v0.1.0</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`${item.id === "terminal" && terminalOpen ? "active" : ""} ${activePanel === item.id ? "active" : ""}`}
              onClick={() => {
                onPanelChange(item.id);
                onCloseMobile();
              }}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot" />
          <span>Engine Ready</span>
        </div>

        <button
          className="sidebar-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "\u203A" : "\u2039"}
        </button>
      </aside>
    </>
  );
}