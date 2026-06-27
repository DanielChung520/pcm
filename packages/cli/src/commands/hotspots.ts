import type { CommanderOptions } from './types.js';
import { withStorage } from './shared.js';

interface HotspotsOptions extends CommanderOptions {
  limit: number;
}

export async function hotspotsCommand(project: string, options: HotspotsOptions): Promise<void> {
  try {
    await withStorage(async (kernel) => {
      const storage = kernel.plugins.getStorage();
      const projects = await storage.listProjects();
      const proj = projects.find(p => p.name === project || p.id === project);
      if (!proj) { console.error(`✗ 找不到專案 "${project}"`); process.exit(1); }

      const graph = await storage.getGraph(proj.id);
      if (!graph) { console.error(`✗ ${project} 尚無圖譜資料`); process.exit(1); }

      const hotspots = graph.stats.hotspots.slice(0, options.limit);
      if (options.json) {
        console.log(JSON.stringify(hotspots, null, 2));
      } else {
        console.log(`\n🔥 ${project} 複雜度熱點 (Top ${options.limit})\n`);
        for (let i = 0; i < hotspots.length; i++) {
          const h = hotspots[i];
          const icon = h.riskScore > 15 ? '🔴' : h.riskScore > 8 ? '🟡' : '🟢';
          console.log(`  ${i + 1}. ${icon} ${h.filePath} (${h.name})`);
          console.log(`     complexity: ${h.complexity}, risk: ${h.riskScore}`);
        }
        console.log();
      }
    });
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
