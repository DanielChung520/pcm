#!/usr/bin/env node

import { Command } from 'commander';
import { listCommand } from './commands/list.js';
import { scanCommand } from './commands/scan.js';
import { statusCommand } from './commands/status.js';
import { graphCommand } from './commands/graph.js';
import { modulesCommand } from './commands/modules.js';
import { hotspotsCommand } from './commands/hotspots.js';
import { impactCommand, cyclesCommand } from './commands/impact.js';
import { serveCommand } from './commands/serve.js';
const version = '0.1.0';

const program = new Command();

program
  .name('pcm')
  .description('Project Code Management — AI 時代開發者第二大腦')
  .version(version);

program
  .command('list')
  .description('列出所有已註冊專案')
  .option('--json', 'JSON 格式輸出')
  .action(listCommand);

program
  .command('scan')
  .description('掃描專案，生成代碼圖譜')
  .argument('<project>', '專案名稱或路徑')
  .option('--json', 'JSON 格式輸出')
  .option('--force', '強制重新掃描（忽略快取）')
  .action(scanCommand);

program
  .command('status')
  .description('查看專案掃描狀態')
  .argument('[project]', '專案名稱，不加則列出全部')
  .option('--json', 'JSON 格式輸出')
  .action(statusCommand);

program
  .command('graph')
  .description('輸出專案依賴圖')
  .argument('<project>', '專案名稱')
  .option('-f, --format <format>', '輸出格式: mermaid | json | dot', 'mermaid')
  .option('-o, --output <file>', '輸出到檔案')
  .action(graphCommand);

program
  .command('modules')
  .description('列出專案所有模組與符號')
  .argument('<project>', '專案名稱')
  .option('--json', 'JSON 格式輸出')
  .option('--filter <type>', '依類型過濾: function | class | interface')
  .action(modulesCommand);

program
  .command('hotspots')
  .description('列出專案複雜度熱點')
  .argument('<project>', '專案名稱')
  .option('--json', 'JSON 格式輸出')
  .option('-l, --limit <n>', '顯示筆數', '10')
  .action(hotspotsCommand);

program
  .command('impact')
  .description('影響分析：改了某符號會影響哪些檔案')
  .argument('<project>', '專案名稱')
  .argument('<target>', '目標符號名稱或檔案路徑')
  .option('--json', 'JSON 格式輸出')
  .option('-o, --output <file>', '輸出到檔案')
  .action(impactCommand);

program
  .command('cycles')
  .description('檢測專案循環依賴')
  .argument('<project>', '專案名稱')
  .option('--json', 'JSON 格式輸出')
  .action(cyclesCommand);

program
  .command('serve')
  .description('啟動 API server 供前端讀取資料')
  .argument('[port]', '埠號', '56520')
  .action(serveCommand);

program.parse(process.argv);
