export * from './models/index.js';
export * from './plugins/index.js';
export * from './events.js';
export * from './kernel.js';

import { PCMKernel } from './kernel.js';

/** 全域單例核心實例 */
let _kernel: PCMKernel | null = null;

export function getKernel(): PCMKernel {
  if (!_kernel) {
    _kernel = new PCMKernel();
  }
  return _kernel;
}

export function resetKernel(): void {
  _kernel = null;
}
