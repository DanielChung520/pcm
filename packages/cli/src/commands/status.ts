import type { CommanderOptions } from './types.js';
import { withStorage } from './shared.js';

export async function statusCommand(project: string | undefined, options: CommanderOptions): Promise<void> {
  try {
    await withStorage(async (kernel) => {
      const storage = kernel.plugins.getStorage();

      if (project) {
        const projects = await storage.listProjects();
        const p = projects.find(x => x.name === project || x.id === project);
        if (!p) {
          console.error(`✗ 專案 "${project}" 不存在`);
          process.exit(1);
        }
        if (options.json) {
          console.log(JSON.stringify(p, null, 2));
        } else {
          console.log(`\n  ${p.name}`);
          console.log(`    類型: ${p.type}`);
          console.log(`    狀態: ${p.status}`);
          console.log(`    來源: ${p.source.type}://${p.source.location}`);
          console.log(`    最後掃描: ${p.lastScannedAt ?? '從未'}`);
          console.log();
        }
      } else {
        const projects = await storage.listProjects();
        if (options.json) {
          console.log(JSON.stringify(projects, null, 2));
        } else {
          for (const p of projects) {
            const icon = p.status === 'active' ? '✓' : p.status === 'error' ? '✗' : '◷';
            console.log(`  ${icon} ${p.name} [${p.type}] — ${p.lastScannedAt ?? '從未掃描'}`);
          }
        }
      }
    });
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
