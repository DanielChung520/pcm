import { type Settings, type ScanInterval, type StorageBackend, type ThemeMode } from "../mockData";

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
            <div className="setting-desc">Switch between dark and light interface</div>
          </div>
          <div className="setting-control">
            <div
              className={`toggle ${settings.theme === "dark" ? "on" : ""}`}
              onClick={() => update("theme", settings.theme === "dark" ? "light" : ("dark" as ThemeMode))}
              title="Toggle theme"
            >
              <div className="toggle-knob" />
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