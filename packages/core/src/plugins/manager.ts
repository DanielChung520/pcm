import type { FeaturePlugin, LanguagePlugin, StorageAdapter } from './types.js';

/**
 * PCM 插件管理器
 * 負責載入、卸載、調度所有插件
 */
export class PluginManager {
  private features: Map<string, FeaturePlugin> = new Map();
  private languages: Map<string, LanguagePlugin> = new Map();
  private storage: StorageAdapter | null = null;

  // ── 功能插件管理 ──

  registerFeature(plugin: FeaturePlugin): void {
    if (this.features.has(plugin.name)) {
      throw new Error(`Feature plugin "${plugin.name}" is already registered`);
    }
    this.features.set(plugin.name, plugin);
  }

  getFeature(name: string): FeaturePlugin | undefined {
    return this.features.get(name);
  }

  listFeatures(): FeaturePlugin[] {
    return Array.from(this.features.values());
  }

  unregisterFeature(name: string): void {
    const plugin = this.features.get(name);
    if (plugin?.onUnload) {
      plugin.onUnload().catch(console.error);
    }
    this.features.delete(name);
  }

  // ── 語言插件管理 ──

  registerLanguage(plugin: LanguagePlugin): void {
    if (this.languages.has(plugin.name)) {
      throw new Error(`Language plugin "${plugin.name}" is already registered`);
    }
    this.languages.set(plugin.name, plugin);
  }

  getLanguage(name: string): LanguagePlugin | undefined {
    return this.languages.get(name);
  }

  /** 根據副檔名找到對應的語言插件 */
  findLanguageByExtension(ext: string): LanguagePlugin | undefined {
    for (const plugin of this.languages.values()) {
      if (plugin.extensions.includes(ext)) return plugin;
    }
    return undefined;
  }

  listLanguages(): LanguagePlugin[] {
    return Array.from(this.languages.values());
  }

  unregisterLanguage(name: string): void {
    this.languages.delete(name);
  }

  // ── 儲存適配器管理 ──

  setStorage(adapter: StorageAdapter): void {
    this.storage = adapter;
  }

  getStorage(): StorageAdapter {
    if (!this.storage) {
      throw new Error('No storage adapter configured');
    }
    return this.storage;
  }

  // ── 生命週期 ──

  async loadAll(): Promise<void> {
    for (const plugin of this.features.values()) {
      if (plugin.onLoad) await plugin.onLoad();
    }
  }

  async unloadAll(): Promise<void> {
    for (const plugin of this.features.values()) {
      if (plugin.onUnload) await plugin.onUnload();
    }
    this.features.clear();
    this.languages.clear();
    this.storage = null;
  }
}
