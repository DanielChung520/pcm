import type { CommanderOptions } from './types.js';

interface ModulesOptions extends CommanderOptions {
  filter: string | undefined;
}

export async function modulesCommand(project: string, options: ModulesOptions): Promise<void> {
  const { getKernel } = await import('@pcm/core');
  const kernel = getKernel();

  try {
    await kernel.initialize();

    // TODO: 從儲存層查詢符號
    const modules: unknown[] = [];

    if (options.json) {
      console.log(JSON.stringify(modules, null, 2));
    } else {
      console.log(`\n  ${project} 模組列表\n`);
      console.log('  (尚無資料，請先執行 pcm scan)');
      console.log();
    }
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
