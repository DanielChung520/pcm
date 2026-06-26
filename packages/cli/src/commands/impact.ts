import type { CommanderOptions } from './types.js';
import { withStorage } from './shared.js';
import { ImpactAnalyzer, detectCycles } from '@pcm/scanner';

interface ImpactOptions extends CommanderOptions {
  output: string | undefined;
}

export async function impactCommand(project: string, target: string, options: ImpactOptions): Promise<void> {
  try {
    await withStorage(async (kernel) => {
      const storage = kernel.plugins.getStorage();
      const projects = await storage.listProjects();
      const proj = projects.find(p => p.name === project || p.id === project);
      if (!proj) { console.error(`✗ 找不到專案 "${project}"`); process.exit(1); }

      const analyzer = new ImpactAnalyzer(storage);
      const report = await analyzer.analyze(proj.id, target);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`\n🔍 影響分析: ${target}`);
        console.log(`   受影響檔案: ${report.totalAffectedFiles}`);
        console.log(`   受影響符號: ${report.totalAffectedSymbols}`);
        console.log(`   最大深度: ${report.maxDepth}`);
        if (report.cycles.length > 0) {
          console.log(`   ⚠️ 循環依賴: ${report.cycles.length} 處`);
        }
        console.log();
        for (const r of report.results) {
          const indent = '  '.repeat(r.distance);
          console.log(`${indent}📄 ${r.filePath} (${r.symbols.length} 符號, 風險: ${r.riskScore})`);
        }
        console.log();
      }
    });
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

export async function cyclesCommand(project: string, options: CommanderOptions): Promise<void> {
  try {
    await withStorage(async (kernel) => {
      const storage = kernel.plugins.getStorage();
      const projects = await storage.listProjects();
      const proj = projects.find(p => p.name === project || p.id === project);
      if (!proj) { console.error(`✗ 找不到專案 "${project}"`); process.exit(1); }

      const cycles = await detectCycles(storage, proj.id);

      if (options.json) {
        console.log(JSON.stringify({ project, cycles }, null, 2));
      } else {
        if (cycles.length === 0) {
          console.log(`\n✓ ${project} 無循環依賴\n`);
        } else {
          console.log(`\n⚠️ ${project} 發現 ${cycles.length} 處循環依賴:\n`);
          for (const cycle of cycles) {
            console.log(`  ${cycle.join(' → ')}`);
          }
          console.log();
        }
      }
    });
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
