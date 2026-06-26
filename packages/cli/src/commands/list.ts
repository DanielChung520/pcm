import type { CommanderOptions } from './types.js';
import { withStorage } from './shared.js';

export async function listCommand(options: CommanderOptions): Promise<void> {
  try {
    await withStorage(async (kernel) => {
      const projects = await kernel.listProjects();

      if (options.json) {
        console.log(JSON.stringify(projects, null, 2));
        return;
      }

      if (projects.length === 0) {
        console.log('尚未註冊任何專案。使用 pcm scan <project> 新增。');
        return;
      }

      console.log('\n📋 已註冊專案:\n');
      for (const p of projects) {
        const statusIcon = p.status === 'active' ? '✓' : p.status === 'error' ? '✗' : '◷';
        const lastScan = p.lastScannedAt
          ? new Date(p.lastScannedAt).toLocaleDateString()
          : '從未掃描';
        console.log(`  ${statusIcon} ${p.name.padEnd(15)} ${p.type.padEnd(8)} ${lastScan}`);
      }
      console.log();
    });
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
