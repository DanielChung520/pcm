import { PluginManager } from './plugins/manager.js';
import { EventBus } from './events.js';
import type { Project } from './models/project.js';

/**
 * PCM 微內核
 * 核心排程器，協調插件、事件、專案生命週期
 */
export class PCMKernel {
  readonly plugins: PluginManager;
  readonly events: EventBus;
  private initialized = false;

  constructor() {
    this.plugins = new PluginManager();
    this.events = new EventBus();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.plugins.loadAll();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    await this.plugins.unloadAll();
    this.events.removeAll();
    this.initialized = false;
  }

  // ── 專案生命週期 ──

  async registerProject(project: Project): Promise<void> {
    const storage = this.plugins.getStorage();
    await storage.saveProject(project);

    // 通知所有相關插件
    for (const plugin of this.plugins.listFeatures()) {
      if (project.enabledPlugins.includes(plugin.name) && plugin.onProjectRegister) {
        await plugin.onProjectRegister(project);
      }
    }

    this.events.emit({ type: 'project:registered', project });
  }

  async listProjects(): Promise<Project[]> {
    return this.plugins.getStorage().listProjects();
  }

  async getProject(id: string): Promise<Project | null> {
    return this.plugins.getStorage().getProject(id);
  }

  async deleteProject(id: string): Promise<void> {
    await this.plugins.getStorage().deleteProject(id);
    this.events.emit({ type: 'project:deleted', projectId: id });
  }

  // ── 查詢轉發 ──

  async queryFeature(featureName: string, projectId: string, params: Record<string, unknown>): Promise<unknown> {
    const plugin = this.plugins.getFeature(featureName);
    if (!plugin?.query) {
      throw new Error(`Feature "${featureName}" does not support queries`);
    }
    const project = await this.getProject(projectId);
    if (!project) throw new Error(`Project "${projectId}" not found`);
    return plugin.query(project, params);
  }

  get initialized_(): boolean { return this.initialized; }
}
