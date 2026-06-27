import type { PCMKernel } from '@pcm/core';
import { getKernel } from '@pcm/core';
import { ArangoDBAdapter } from '@pcm/storage';

export async function withStorage<T>(fn: (kernel: PCMKernel) => Promise<T>): Promise<T> {
  const kernel = getKernel();
  await kernel.initialize();

  const storage = new ArangoDBAdapter({
    url: 'http://localhost:8529',
    dbName: 'pcm',
  });
  await storage.initialize();
  kernel.plugins.setStorage(storage);

  try {
    return await fn(kernel);
  } finally {
    await storage.close();
  }
}
