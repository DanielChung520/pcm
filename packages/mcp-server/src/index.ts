import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { getKernel } from '@pcm/core';
import { LocalStorageAdapter } from '@pcm/storage';
import { ScannerPlugin } from '@pcm/scanner';

async function initBackend() {
  const kernel = getKernel();
  await kernel.initialize();
  const storage = new LocalStorageAdapter();
  await storage.initialize();
  kernel.plugins.setStorage(storage);
  const scanner = new ScannerPlugin();
  await scanner.onLoad();
  kernel.plugins.registerFeature(scanner);
  return { kernel, storage, scanner };
}

let backend: Awaited<ReturnType<typeof initBackend>> | null = null;

const server = new Server(
  { name: 'pcm-server', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'pcm_project_list',
      description: '列出所有已註冊專案',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'pcm_project_status',
      description: '查看專案掃描狀態與統計',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '專案名稱' },
        },
        required: ['project'],
      },
    },
    {
      name: 'pcm_scan',
      description: '掃描專案目錄，生成代碼圖譜與 Markdown 報告',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '專案目錄路徑' },
        },
        required: ['path'],
      },
    },
    {
      name: 'pcm_graph',
      description: '獲取專案依賴圖（Mermaid 格式）',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '專案名稱' },
        },
        required: ['project'],
      },
    },
    {
      name: 'pcm_lookup',
      description: '查找程式碼中的符號（函數、類別、介面）',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '專案名稱' },
          name: { type: 'string', description: '符號名稱（模糊搜尋）' },
          type: { type: 'string', enum: ['function', 'class', 'interface', 'all'], default: 'all' },
        },
        required: ['project', 'name'],
      },
    },
    {
      name: 'pcm_hotspots',
      description: '列出專案複雜度熱點',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '專案名稱' },
          limit: { type: 'number', default: 10 },
        },
        required: ['project'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (!backend) {
      backend = await initBackend();
    }
    const { storage, scanner } = backend;

    switch (name) {
      case 'pcm_project_list': {
        const projects = await storage.listProjects();
        return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
      }

      case 'pcm_project_status': {
        const { project } = args as { project: string };
        const projects = await storage.listProjects();
        const proj = projects.find(p => p.name === project || p.id === project);
        if (!proj) {
          return { content: [{ type: 'text', text: `專案 "${project}" 不存在` }], isError: true };
        }
        const graph = await storage.getGraph(proj.id);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ project: proj, graph: graph?.stats ?? null }, null, 2),
          }],
        };
      }

      case 'pcm_scan': {
        const { path: scanPath } = args as { path: string };
        const resolvedPath = path.resolve(scanPath);
        if (!fs.existsSync(resolvedPath)) {
          return { content: [{ type: 'text', text: `路徑不存在: ${resolvedPath}` }], isError: true };
        }

        const projectName = path.basename(resolvedPath);
        const project = {
          id: randomUUID(),
          name: projectName,
          source: { type: 'local', location: resolvedPath },
          type: 'node' as const,
          enabledPlugins: ['scanner'],
          status: 'active' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastScannedAt: null,
          metadata: {},
        };

        console.error(`[MCP] 掃描 ${projectName}...`);
        await storage.saveProject(project);
        const graph = await scanner.scan(project);

        const artifacts = await scanner.generateArtifacts(project, graph);
        for (const artifact of artifacts) {
          const dir = path.dirname(artifact.path);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(artifact.path, artifact.content, 'utf-8');
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              project: projectName,
              stats: graph.stats,
              artifacts: artifacts.map(a => a.path),
            }, null, 2),
          }],
        };
      }

      case 'pcm_graph': {
        const { project: projectArg } = args as { project: string };
        const projects = await storage.listProjects();
        const proj = projects.find(p => p.name === projectArg || p.id === projectArg);
        if (!proj) {
          return { content: [{ type: 'text', text: `找不到專案 "${projectArg}"` }], isError: true };
        }
        const graph = await storage.getGraph(proj.id);
        if (!graph) {
          return { content: [{ type: 'text', text: `${projectArg} 尚無圖譜` }], isError: true };
        }

        const mermaidLines: string[] = ['graph LR'];
        for (const rel of graph.relationships) {
          if (rel.type === 'imports') {
            const source = graph.symbols.find(s => s.id === rel.sourceId);
            const target = (rel.metadata.importSource as string) || '';
            if (source && target) {
              const src = source.filePath.replace(/[^a-zA-Z0-9]/g, '_');
              const tgt = target.replace(/[^a-zA-Z0-9]/g, '_');
              if (src !== tgt) mermaidLines.push(`  ${src} --> ${tgt}`);
            }
          }
        }

        return { content: [{ type: 'text', text: mermaidLines.join('\n') }] };
      }

      case 'pcm_lookup': {
        const { project: projectArg, name: lookupName, type: lookupType } = args as {
          project: string; name: string; type: string;
        };
        const projects = await storage.listProjects();
        const proj = projects.find(p => p.name === projectArg || p.id === projectArg);
        if (!proj) {
          return { content: [{ type: 'text', text: `找不到專案 "${projectArg}"` }], isError: true };
        }
        const syms = await storage.querySymbols({ projectId: proj.id, name: lookupName });
        const filtered = lookupType !== 'all'
          ? syms.filter(s => s.type === lookupType)
          : syms;
        return { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] };
      }

      case 'pcm_hotspots': {
        const { project: projectArg, limit } = args as { project: string; limit: number };
        const projects = await storage.listProjects();
        const proj = projects.find(p => p.name === projectArg || p.id === projectArg);
        if (!proj) {
          return { content: [{ type: 'text', text: `找不到專案 "${projectArg}"` }], isError: true };
        }
        const graph = await storage.getGraph(proj.id);
        if (!graph) {
          return { content: [{ type: 'text', text: `${projectArg} 尚無圖譜` }], isError: true };
        }
        const hotspots = graph.stats.hotspots.slice(0, limit);
        return { content: [{ type: 'text', text: JSON.stringify(hotspots, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[PCM MCP Server] 已啟動 (stdio)');
}

main().catch(console.error);
