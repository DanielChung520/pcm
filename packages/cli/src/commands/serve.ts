import * as http from 'node:http';
import { getKernel } from '@pcm/core';
import { LocalStorageAdapter } from '@pcm/storage';

export async function serveCommand(port: number): Promise<void> {
  const kernel = getKernel();
  await kernel.initialize();
  const storage = new LocalStorageAdapter();
  await storage.initialize();
  kernel.plugins.setStorage(storage);

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    res.setHeader('Content-Type', 'application/json');

    try {
      if (path === '/api/projects') {
        const projects = await storage.listProjects();
        const result = [];
        for (const p of projects) {
          const graph = await storage.getGraph(p.id);
          result.push({
            id: p.id, name: p.name, type: p.type, status: p.status,
            lastScanned: p.lastScannedAt,
            files: graph?.stats.fileCount ?? 0,
            symbols: graph?.stats.symbolCount ?? 0,
            relationships: graph?.stats.relationshipCount ?? 0,
            hotspots: graph?.stats.hotspots ?? [],
          });
        }
        res.end(JSON.stringify(result));
      }
      else if (path.startsWith('/api/graph/')) {
        const name = decodeURIComponent(path.slice(11));
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
        const links = graph.relationships.map(r => ({
          source: r.sourceId, target: r.targetId, type: r.type,
        }));
        res.end(JSON.stringify({ nodes, links }));
      }
      else if (path === '/api/stats') {
        const projects = await storage.listProjects();
        let totalFiles = 0, totalSymbols = 0, totalRels = 0;
        for (const p of projects) {
          const g = await storage.getGraph(p.id);
          if (g) { totalFiles += g.stats.fileCount; totalSymbols += g.stats.symbolCount; totalRels += g.stats.relationshipCount; }
        }
        res.end(JSON.stringify({ projects: projects.length, files: totalFiles, symbols: totalSymbols, relationships: totalRels }));
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
  });
}
