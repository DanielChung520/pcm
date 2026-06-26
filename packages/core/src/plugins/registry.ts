import type { FeaturePlugin, LanguagePlugin, StorageAdapter } from './types.js';

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  type: 'feature' | 'language' | 'storage';
  entry: string;
  enabled: boolean;
}

export class PluginRegistry {
  private features: Map<string, FeaturePlugin> = new Map();
  private languages: Map<string, LanguagePlugin> = new Map();
  private storageAdapters: Map<string, StorageAdapter> = new Map();
  private manifests: Map<string, PluginManifest> = new Map();
  private initialized = false;

  async discover(pluginDir?: string): Promise<PluginManifest[]> {
    const discovered: PluginManifest[] = [];

    const builtinFeatures: PluginManifest[] = [
      { name: 'scanner', version: '0.1.0', description: 'Source code scanner and graph builder', type: 'feature', entry: '@pcm/scanner', enabled: true },
      { name: 'llm', version: '0.1.0', description: 'LLM-powered code analysis via dllm', type: 'feature', entry: '@pcm/scanner', enabled: true },
    ];

    const builtinLanguages: PluginManifest[] = [
      { name: 'typescript', version: '0.1.0', description: 'TypeScript/JavaScript parser', type: 'language', entry: '@pcm/plugin-typescript', enabled: true },
      { name: 'python', version: '0.1.0', description: 'Python parser', type: 'language', entry: '@pcm/plugin-python', enabled: true },
    ];

    const builtinStorage: PluginManifest[] = [
      { name: 'local-sqlite', version: '0.1.0', description: 'Local SQLite storage', type: 'storage', entry: '@pcm/storage', enabled: true },
      { name: 'seaweedfs', version: '0.1.0', description: 'SeaweedFS S3-compatible file store', type: 'storage', entry: '@pcm/storage', enabled: true },
      { name: 'arangodb', version: '0.1.0', description: 'ArangoDB graph storage', type: 'storage', entry: '@pcm/storage', enabled: true },
      { name: 'qdrant', version: '0.1.0', description: 'Qdrant vector database', type: 'storage', entry: '@pcm/storage', enabled: true },
    ];

    for (const m of [...builtinFeatures, ...builtinLanguages, ...builtinStorage]) {
      this.manifests.set(m.name, m);
      discovered.push(m);
    }

    this.initialized = true;
    return discovered;
  }

  registerFeature(plugin: FeaturePlugin): void {
    this.features.set(plugin.name, plugin);
  }

  registerLanguage(plugin: LanguagePlugin): void {
    this.languages.set(plugin.name, plugin);
  }

  registerStorage(name: string, adapter: StorageAdapter): void {
    this.storageAdapters.set(name, adapter);
  }

  getFeature(name: string): FeaturePlugin | undefined {
    return this.features.get(name);
  }

  getLanguage(name: string): LanguagePlugin | undefined {
    return this.languages.get(name);
  }

  getStorage(name: string): StorageAdapter | undefined {
    return this.storageAdapters.get(name);
  }

  getManifest(name: string): PluginManifest | undefined {
    return this.manifests.get(name);
  }

  listFeatures(): FeaturePlugin[] {
    return Array.from(this.features.values());
  }

  listLanguages(): LanguagePlugin[] {
    return Array.from(this.languages.values());
  }

  listStorageAdapters(): StorageAdapter[] {
    return Array.from(this.storageAdapters.values());
  }

  listManifests(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  async enablePlugin(name: string): Promise<void> {
    const manifest = this.manifests.get(name);
    if (!manifest) throw new Error(`Plugin "${name}" not found`);
    manifest.enabled = true;
  }

  async disablePlugin(name: string): Promise<void> {
    const manifest = this.manifests.get(name);
    if (!manifest) throw new Error(`Plugin "${name}" not found`);
    manifest.enabled = false;
  }

  isEnabled(name: string): boolean {
    return this.manifests.get(name)?.enabled ?? false;
  }

  reset(): void {
    this.features.clear();
    this.languages.clear();
    this.storageAdapters.clear();
    this.manifests.clear();
    this.initialized = false;
  }
}
