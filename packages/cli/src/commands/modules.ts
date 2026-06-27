import type { CommanderOptions } from './types.js';
import { withStorage } from './shared.js';

interface ModulesOptions extends CommanderOptions {
  filter: string | undefined;
}

export async function modulesCommand(project: string, options: ModulesOptions): Promise<void> {
  try {
    await withStorage(async (kernel) => {
      const storage = kernel.plugins.getStorage();
      const projects = await storage.listProjects();
      const proj = projects.find(p => p.name === project || p.id === project);
      if (!proj) { console.error(`✗ 找不到專案 "${project}"`); process.exit(1); }

      const symbols = await storage.querySymbols({ projectId: proj.id });
      const filtered = options.filter
        ? symbols.filter(s => s.type === options.filter)
        : symbols;

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
      } else {
        console.log(`\n📦 ${project} 模組列表 (${filtered.length} symbols)\n`);
        const byFile = new Map<string, typeof symbols>();
        for (const s of filtered) {
          if (!byFile.has(s.filePath)) byFile.set(s.filePath, []);
          byFile.get(s.filePath)!.push(s);
        }
        for (const [file, syms] of byFile) {
          console.log(`  ${file}`);
          for (const s of syms) {
            const icon = s.type === 'class' ? '🏛️' : s.type === 'function' ? '🔧' : s.type === 'method' ? '⚙️' : '📝';
            console.log(`    ${icon} ${s.name} (${s.type}, L${s.location.startLine})`);
          }
        }
        console.log();
      }
    });
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
