import type { CommanderOptions } from './types.js';

interface HotspotsOptions extends CommanderOptions {
  limit: number;
}

export async function hotspotsCommand(project: string, options: HotspotsOptions): Promise<void> {
  const { getKernel } = await import('@pcm/core');
  const kernel = getKernel();

  try {
    await kernel.initialize();

    // TODO: 從儲存層查詢熱點
    const hotspots: unknown[] = [];

    if (options.json) {
      console.log(JSON.stringify(hotspots, null, 2));
    } else {
      console.log(`\n  ${project} 複雜度熱點 (Top ${options.limit})\n`);
      console.log('  (尚無資料，請先執行 pcm scan)');
      console.log();
    }
  } catch (err) {
    console.error('✗ 失敗:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
