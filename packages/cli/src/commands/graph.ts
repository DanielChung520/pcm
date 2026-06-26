import type { CommanderOptions } from './types.js';
import { withStorage } from './shared.js';

interface GraphOptions extends CommanderOptions {
  format: string;
  output: string | undefined;
}

export async function graphCommand(project: string, options: GraphOptions): Promise<void> {
  try {
    await withStorage(async (kernel) => {
      const storage = kernel.plugins.getStorage();

    const projects = await storage.listProjects();
    const proj = projects.find(p => p.name === project || p.id === project);
    if (!proj) {
      console.error(`✗ 找不到專案 "${project}"，請先執行 pcm scan`);
      process.exit(1);
    }

    const graph = await storage.getGraph(proj.id);
    if (!graph) {
      console.error(`✗ ${project} 尚無圖譜資料，請先執行 pcm scan`);
      process.exit(1);
    }

    if (options.format === 'json') {
      console.log(JSON.stringify(graph, null, 2));
    } else {
      console.log(`\n# ${project} 依賴圖\n`);
      console.log('```mermaid');
      console.log('graph LR');
      for (const rel of graph.relationships) {
        if (rel.type === 'imports') {
          const source = graph.symbols.find(s => s.id === rel.sourceId);
          const target = (rel.metadata.importSource as string) || '';
          if (source && target) {
            const src = source.filePath.replace(/[^a-zA-Z0-9]/g, '_');
            const tgt = target.replace(/[^a-zA-Z0-9]/g, '_');
            if (src !== tgt) {
              console.log(`  ${src} --> ${tgt}`);
            }
          }
        }
      }
      console.log('```\n');
    }
    });
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
