/**
 * CLI 命令通用選項介面
 */
export interface CommanderOptions {
  json?: boolean;
  verbose?: boolean;
  [key: string]: unknown;
}
