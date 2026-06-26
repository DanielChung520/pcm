import type { Project, Symbol, CodeGraph } from './models/index.js';

/**
 * PCM 事件種類
 */
export type PCMEvent =
  | { type: 'project:registered'; project: Project }
  | { type: 'project:updated'; project: Project }
  | { type: 'project:deleted'; projectId: string }
  | { type: 'project:scan:start'; projectId: string }
  | { type: 'project:scan:complete'; projectId: string; graph: CodeGraph }
  | { type: 'project:scan:error'; projectId: string; error: Error }
  | { type: 'symbol:added'; symbol: Symbol }
  | { type: 'file:changed'; projectId: string; filePath: string }
  | { type: 'plugin:loaded'; pluginName: string }
  | { type: 'plugin:error'; pluginName: string; error: Error };

/**
 * PCM 事件總線
 * 插件之間透過此總線通信，不直接耦合
 */
export class EventBus {
  private listeners: Map<string, Set<(event: PCMEvent) => void>> = new Map();

  on(type: PCMEvent['type'], handler: (event: PCMEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  off(type: PCMEvent['type'], handler: (event: PCMEvent) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  emit(event: PCMEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[EventBus] Error in handler for ${event.type}:`, err);
        }
      }
    }
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
