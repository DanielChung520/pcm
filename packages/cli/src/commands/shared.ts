import type { PCMKernel } from '@pcm/core';
import { getKernel } from '@pcm/core';
import { LocalStorageAdapter } from '@pcm/storage';

/**
 * 初始化 kernel + 儲存層，執行後清理
 */
export async function withStorage<T>(fn: (kernel: PCMKernel) => Promise<T>): Promise<T> {
  const kernel = getKernel();
  await kernel.initialize();

  const storage = new LocalStorageAdapter();
  await storage.initialize();
  kernel.plugins.setStorage(storage);

  try {
    return await fn(kernel);
  } finally {
    await storage.close();
  }
}
