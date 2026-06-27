import { type Settings, type ScanInterval, type StorageBackend, type ThemeMode, type LayoutMode } from "../mockData";

interface SettingsPanelProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="panel-fade settings-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Settings</h2>
          <p className="panel-subtitle">Configure PCM engine preferences</p>
        </div>
      </div>

      {/* Appearance */}
      <div className="settings-group">
        <div className="settings-group-title">Appearance</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Theme</div>
            <div className="setting-desc">Dark, light, or follow system preference</div>
          </div>
          <div className="setting-control">
            <div className="theme-selector">
              {(["dark", "light", "system"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`theme-btn ${settings.theme === mode ? "active" : ""}`}
                  onClick={() => update("theme", mode as ThemeMode)}
                >
                  {mode === "dark" ? "\u25D0 Dark" : mode === "light" ? "\u2600 Light" : "\u2699 System"}
                </button>
              ))}
          </div>
        </div>
        </div>
      </div>

      {/* Terminal */}
      <div className="settings-group">
        <div className="settings-group-title">Terminal Layout</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Window Mode</div>
            <div className="setting-desc">Sidebar Terminal button toggles panel open/closed</div>
          </div>
          <div className="setting-control">
            <div className="theme-selector">
              {(["full", "split-right", "split-left"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`theme-btn ${settings.layout === mode ? "active" : ""}`}
                  onClick={() => update("layout", mode as any)}
                >
                  {mode === "full" ? "\u25A0 Full" : mode === "split-right" ? "\u25B6 Split R" : "\u25C0 Split L"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scanning */}
      <div className="settings-group">
        <div className="settings-group-title">Scanning</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Scan Interval</div>
            <div className="setting-desc">How often to re-scan projects automatically</div>
          </div>
          <div className="setting-control">
            <select
              className="select-input"
              value={settings.scanInterval}
              onChange={(e) => update("scanInterval", e.target.value as ScanInterval)}
            >
              <option value="manual">Manual</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        </div>
      </div>

      {/* AI / LLM */}
      <div className="settings-group">
        <div className="settings-group-title">AI Analysis</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">LLM Model</div>
            <div className="setting-desc">Model used for code analysis and embeddings</div>
          </div>
          <div className="setting-control">
            <input
              className="text-input"
              type="text"
              value={settings.llmModel}
              onChange={(e) => update("llmModel", e.target.value)}
              style={{ width: "180px" }}
            />
          </div>
        </div>
      </div>

      {/* Storage */}
      <div className="settings-group">
        <div className="settings-group-title">Storage</div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Storage Backend</div>
            <div className="setting-desc">Database for storing graph and scan data</div>
          </div>
          <div className="setting-control">
            <select
              className="select-input"
              value={settings.storageBackend}
              onChange={(e) => update("storageBackend", e.target.value as StorageBackend)}
            >
              <option value="sqlite">SQLite (local)</option>
              <option value="arangodb">ArangoDB (graph)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}