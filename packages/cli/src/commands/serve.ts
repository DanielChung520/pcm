import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getKernel } from '@pcm/core';
import { ArangoDBAdapter } from '@pcm/storage';
import { ScannerPlugin } from '@pcm/scanner';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';

export async function serveCommand(port: number): Promise<void> {
  const kernel = getKernel();
  await kernel.initialize();
  const storage = new ArangoDBAdapter({
    url: 'http://localhost:8529',
    dbName: 'pcm',
  });
  await storage.initialize();
  kernel.plugins.setStorage(storage);
  const scanner = new ScannerPlugin();
  await scanner.onLoad();
  kernel.plugins.registerFeature(scanner);

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const urlPath = url.pathname;
    res.setHeader('Content-Type', 'application/json');

    try {
      if (urlPath === '/api/projects') {
        const projects = await storage.listProjects();
        const result = [];
        for (const p of projects) {
          const graph = await storage.getGraph(p.id);
          result.push({
            id: p.id, name: p.name, type: p.type, status: p.status,
            lastScanned: p.lastScannedAt,
            source: p.source,
            files: graph?.stats.fileCount ?? 0,
            symbols: graph?.stats.symbolCount ?? 0,
            relationships: graph?.stats.relationshipCount ?? 0,
            hotspots: graph?.stats.hotspots ?? [],
          });
        }
        res.end(JSON.stringify(result));
      }
      else if (urlPath.startsWith('/api/graph/')) {
        const name = decodeURIComponent(urlPath.slice(11));
        const projects = await storage.listProjects();
        const proj = projects.find(p => p.name === name || p.id === name);
        if (!proj) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
        const graph = await storage.getGraph(proj.id);
        if (!graph) { res.writeHead(404); res.end(JSON.stringify({ error: 'no graph' })); return; }
        const nodes = graph.symbols.map(s => ({
          id: s.id, name: s.name, filePath: s.filePath,
          module: s.filePath.split('/')[0] || 'root',
          type: s.type, complexity: s.complexity,
        }));
        const nodeIds = new Set(graph.symbols.map(s => s.id));
        const links = graph.relationships
          .filter(r => r.sourceId && r.targetId && nodeIds.has(r.sourceId) && nodeIds.has(r.targetId))
          .map(r => ({
            source: r.sourceId, target: r.targetId, type: r.type,
          }));
        res.end(JSON.stringify({ nodes, links }));
      }
      else if (urlPath === '/api/stats') {
        const projects = await storage.listProjects();
        let totalFiles = 0, totalSymbols = 0, totalRels = 0;
        for (const p of projects) {
          const g = await storage.getGraph(p.id);
          if (g) { totalFiles += g.stats.fileCount; totalSymbols += g.stats.symbolCount; totalRels += g.stats.relationshipCount; }
        }
        res.end(JSON.stringify({ projects: projects.length, files: totalFiles, symbols: totalSymbols, relationships: totalRels }));
      }
      else if (urlPath === '/api/scan' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: string) => body += chunk);
        req.on('end', async () => {
          try {
            const { path: scanPath, force } = JSON.parse(body);
            const resolvedPath = path.resolve(scanPath);
            if (!fs.existsSync(resolvedPath)) { res.end(JSON.stringify({ error: 'path not found' })); return; }
            const projectName = path.basename(resolvedPath);
            // 檢查是否已存在同名專案
            const existing = (await storage.listProjects()).find(p => p.name === projectName);
            const project = existing ?? {
              id: randomUUID(), name: projectName,
              source: { type: 'local', location: resolvedPath },
              type: 'node' as const, enabledPlugins: ['scanner'], status: 'active' as const,
              createdAt: new Date(), updatedAt: new Date(), lastScannedAt: null, metadata: {},
            };
            await storage.saveProject(project);
            const graph = await scanner.scan(project, !!force);
            res.end(JSON.stringify({ project: projectName, stats: graph.stats }));
          } catch (err) { res.end(JSON.stringify({ error: String(err) })); }
        });
      }
      else { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); }
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: String(err) }));
    }
  });

  server.listen(port, () => {
    console.error(`[PCM API] http://localhost:${port}`);
    console.error(`  GET /api/projects  — 專案列表`);
    console.error(`  GET /api/graph/:name — 圖譜資料`);
    console.error(`  GET /api/stats    — 總體統計`);
    console.error(`  POST /api/scan    — 掃描專案`);
  });

  // WebSocket terminal server
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    const shell = spawn('/usr/bin/python3', ['-c', `
import pty, os, select, sys, signal, struct, fcntl, termios
signal.signal(signal.SIGCHLD, signal.SIG_IGN)

# Set initial terminal size (cols, rows)
def set_size(fd, cols, rows):
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

pid, fd = pty.fork()
if pid == 0:
    os.execve('/bin/bash', ['/bin/bash', '-i'], os.environ)
else:
    set_size(fd, 120, 40)
    try:
        while True:
            r, w, e = select.select([fd, sys.stdin], [], [])
            for s in r:
                if s == fd:
                    data = os.read(fd, 65536)
                    if not data: raise EOFError
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                elif s == sys.stdin:
                    data = os.read(sys.stdin.fileno(), 65536)
                    if not data: raise EOFError
                    # Resize command or regular input
                    if data.startswith(b'\\x00SIZE:'):
                        parts = data[6:].strip().split(b',')
                        if len(parts) == 2:
                            set_size(fd, int(parts[0]), int(parts[1]))
                    else:
                        os.write(fd, data)
    except:
        os.close(fd)
        os.waitpid(pid, 0)
    `], {
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        PATH: `${process.env.HOME}/.opencode/bin:${process.env.PATH || '/usr/bin:/bin'}`,
      },
      cwd: process.env.HOME || '/tmp',
    });
    ws.on('message', (data) => shell.stdin.write(data.toString()));
    const fixNL = (raw: string) => raw.replace(/\n/g, '\r\n');
    shell.stdout.on('data', (data) => { try { ws.send(data.toString()); } catch {} });
    ws.on('close', () => shell.kill());
    shell.on('exit', () => ws.close());
  });
  console.error(`[PCM Terminal] WebSocket ready`);
}
