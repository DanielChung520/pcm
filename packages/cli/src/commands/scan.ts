import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { CommanderOptions } from './types.js';
import { ScannerPlugin } from '@pcm/scanner';
import { withStorage } from './shared.js';

interface ScanOptions extends CommanderOptions {
  output?: string;
  force?: boolean;
}

export async function scanCommand(projectArg: string, options: ScanOptions): Promise<void> {
  try {
    await withStorage(async (kernel) => {
    const storage = kernel.plugins.getStorage();
    const scanner = new ScannerPlugin();
    await scanner.onLoad();
    kernel.plugins.registerFeature(scanner);

    const projectPath = path.resolve(projectArg);
    if (!fs.existsSync(projectPath)) {
      console.error(`✗ 路徑不存在: ${projectPath}`);
      process.exit(1);
    }

    const projectName = path.basename(projectPath);
    // 檢查是否已存在同名專案（避免重複）
    const existing = (await kernel.listProjects()).find(p => p.name === projectName);
    const project = existing ?? {
      id: randomUUID(),
      name: projectName,
      source: { type: 'local', location: projectPath },
      type: 'node' as const,
      enabledPlugins: ['scanner'],
      status: 'active' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastScannedAt: null,
      metadata: {},
    };

    if (options.force) console.error('  (強制重新掃描)');
    console.error(`🔍 正在掃描 ${projectName} ...`);
    const startTime = Date.now();

    await storage.saveProject(project);
    const graph = await scanner.scan(project, !!options.force);

    const artifacts = await scanner.generateArtifacts(project, graph);
    for (const artifact of artifacts) {
      const dir = path.dirname(artifact.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(artifact.path, artifact.content, 'utf-8');
    }

    const duration = Date.now() - startTime;

    if (options.json) {
      console.log(JSON.stringify({
        project: projectName,
        path: projectPath,
        duration: `${duration}ms`,
        stats: graph.stats,
        artifacts: artifacts.map(a => a.path),
      }));
    } else {
      console.error(`✓ ${projectName} 掃描完成 (${duration}ms)`);
      console.error(`  ${graph.stats.fileCount} 個檔案`);
      console.error(`  ${graph.stats.symbolCount} 個符號`);
      console.error(`  ${graph.stats.relationshipCount} 個關係`);
      console.error(`  ${graph.stats.hotspots.length} 個熱點`);
      console.error(`  → ${artifacts.map(a => a.path).join(', ')}`);
    }
    });
  } catch (err) {
    console.error('✗ 掃描失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
