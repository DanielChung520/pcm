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
      else if (urlPath === '/api/query' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: string) => body += chunk);
        req.on('end', async () => {
          try {
            const { question, project: projName } = JSON.parse(body);
            if (!question) { res.end(JSON.stringify({ error: 'question required' })); return; }

            // 1. 從 ArangoDB 搜尋相關符號
            const projects = await storage.listProjects();
            const targetProject = projName
              ? projects.find(p => p.name === projName)
              : projects[0];
            if (!targetProject) { res.end(JSON.stringify({ error: 'no project' })); return; }

            // 取前 200 個符號，再用關鍵字過濾
            let symbols = await storage.querySymbols({ projectId: targetProject.id, limit: 200 });
            const keywords = question.split(/\s+/).filter((k: string) => k.length > 2);
            if (keywords.length > 0) {
              symbols = symbols.filter((s: any) =>
                keywords.some((k: string) =>
                  s.name.toLowerCase().includes(k.toLowerCase())
                )
              );
            }

            // 2. 取得符號所在的檔案內容和關係
            const graph = await storage.getGraph(targetProject.id);
            const contextLines: string[] = [`Project: ${targetProject.name}`];
            contextLines.push(`Question: ${question}`);
            contextLines.push('');

            const addedFiles = new Set<string>();
            for (const sym of symbols.slice(0, 10)) {
              const fpath = sym.filePath;
              if (!addedFiles.has(fpath)) {
                addedFiles.add(fpath);
                const rels = graph?.relationships.filter(r =>
                  (r.sourceId === sym.id || r.targetId === sym.id) && r.type === 'imports'
                ) || [];
                contextLines.push(`File: ${fpath}`);
                contextLines.push(`  Symbols: ${sym.name} (${sym.type})`);
                if (rels.length > 0) {
                  const targets = rels.map(r => {
                    const t = graph?.symbols.find(s => s.id === r.targetId);
                    return t?.filePath || r.targetId;
                  }).filter(Boolean);
                  contextLines.push(`  Imports: ${[...new Set(targets)].join(', ')}`);
                }
                contextLines.push('');
              }
            }

            // 3. 呼叫 vLLM（直接連 18001）
            const llmResponse = await fetch('http://localhost:18001/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: '/home/daniel/.dllm/models/Qwen3-8B-AWQ',
                messages: [
                  { role: 'system', content: 'You are a code analysis expert. Use the provided code context to answer the question.' },
                  { role: 'user', content: `Code Context:\n${contextLines.join('\n').slice(0, 8000)}\n\nQuestion: ${question}` },
                ],
                temperature: 0.3,
                max_tokens: 2048,
              }),
            });
            const llmData: { choices?: { message?: { content?: string } }[] } = await llmResponse.json();
            const answer = llmData?.choices?.[0]?.message?.content || 'No response';

            // 4. 記錄對話
            const sessionId = randomUUID();
            try {
              const { Database } = await import('arangojs');
              const convDb = new Database({ url: 'http://localhost:8529' });
              convDb.useBasicAuth('root', '');
              const pcmDb = convDb.database('pcm');
              await pcmDb.collection('conv_messages').save({
                _key: sessionId,
                project: targetProject.name,
                question,
                answer,
                symbols: symbols.map(s => s.name),
                createdAt: new Date().toISOString(),
              });
            } catch {}

            // 5. maGraphRAG: 非同步萃取知識補強圖譜
            setImmediate(async () => {
              try {
                const extractResp = await fetch('http://localhost:18001/v1/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: '/home/daniel/.dllm/models/Qwen3-8B-AWQ',
                    messages: [{
                      role: 'system',
                      content: `Extract key facts and relationships from this Q&A about a codebase.
Output ONLY JSON array of objects: [{"entity":"name","type":"function|class|file|concept","fact":"what was learned","relates_to":["other_entity"]}]`
                    }, {
                      role: 'user',
                      content: `Question: ${question}\n\nAnswer: ${answer.slice(0, 2000)}\n\nSymbols: ${symbols.map(s => s.name + ' (' + s.type + ')').join(', ')}`
                    }],
                    temperature: 0.1,
                    max_tokens: 1024,
                  }),
                });
                const extData = await extractResp.json();
                const raw = extData?.choices?.[0]?.message?.content || '';
                const jsonMatch = raw.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                  const facts = JSON.parse(jsonMatch[0]);
                  const { Database } = await import('arangojs');
                  const convDb = new Database({ url: 'http://localhost:8529' });
                  convDb.useBasicAuth('root', '');
                  const knowCol = convDb.database('pcm').collection('conv_knowledge');
                  for (const f of facts.slice(0, 10)) {
                    await knowCol.save({
                      _key: randomUUID(),
                      sessionId,
                      project: targetProject.name,
                      entity: f.entity,
                      type: f.type || 'concept',
                      fact: f.fact,
                      relatesTo: f.relates_to || [],
                      createdAt: new Date().toISOString(),
                    });
                  }
                }
              } catch {}
            });

            res.end(JSON.stringify({ question, answer, symbols: symbols.length, project: targetProject.name }));
          } catch (err) { res.end(JSON.stringify({ error: String(err) })); }
        });
      }
      else if (urlPath === '/mcp' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: string) => body += chunk);
        req.on('end', async () => {
          let rpc: any = null;
          try {
            try { rpc = JSON.parse(body); } catch { res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })); return; }
            if (rpc.method === 'tools/list') {
              res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools: [
                { name: 'pcm_project_list', description: '列出所有已註冊專案', inputSchema: { type: 'object', properties: {} } },
                { name: 'pcm_project_status', description: '查看專案掃描狀態與統計', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
                { name: 'pcm_scan', description: '掃描專案目錄，生成代碼圖譜', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
                { name: 'pcm_graph', description: '獲取專案依賴圖', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
                { name: 'pcm_lookup', description: '查找程式碼中的符號', inputSchema: { type: 'object', properties: { project: { type: 'string' }, name: { type: 'string' } }, required: ['project', 'name'] } },
                { name: 'pcm_hotspots', description: '列出複雜度熱點', inputSchema: { type: 'object', properties: { project: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['project'] } },
                { name: 'pcm_impact', description: '影響分析', inputSchema: { type: 'object', properties: { project: { type: 'string' }, target: { type: 'string' } }, required: ['project', 'target'] } },
                { name: 'pcm_cycles', description: '檢測循環依賴', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] } },
                { name: 'pcm_query', description: 'GraphRAG 問答：根據程式碼上下文回答問題', inputSchema: { type: 'object', properties: { question: { type: 'string' }, project: { type: 'string' } }, required: ['question'] } },
              ] } }));
            } else if (rpc.method === 'tools/call') {
              const { name, arguments: args } = rpc.params;
              let result = { content: [{ type: 'text', text: '' }] };
              const projects = await storage.listProjects();

              switch (name) {
                case 'pcm_project_list':
                  result.content[0].text = JSON.stringify(projects, null, 2);
                  break;
                case 'pcm_project_status': {
                  const p = projects.find(x => x.name === args.project || x.id === args.project);
                  result.content[0].text = JSON.stringify(p || { error: 'not found' }, null, 2);
                  break;
                }
                case 'pcm_graph': {
                  const p = projects.find(x => x.name === args.project || x.id === args.project);
                  if (p) {
                    const g = await storage.getGraph(p.id);
                    result.content[0].text = JSON.stringify(g ? { nodes: g.stats.fileCount, edges: g.stats.relationshipCount } : { error: 'no graph' }, null, 2);
                  } else result.content[0].text = JSON.stringify({ error: 'not found' });
                  break;
                }
                case 'pcm_lookup': {
                  const p = projects.find(x => x.name === args.project || x.id === args.project);
                  if (p) {
                    const syms = await storage.querySymbols({ projectId: p.id, name: args.name, limit: 20 });
                    result.content[0].text = JSON.stringify(syms, null, 2);
                  } else result.content[0].text = '[]';
                  break;
                }
                case 'pcm_hotspots': {
                  const p = projects.find(x => x.name === args.project || x.id === args.project);
                  if (p) {
                    const g = await storage.getGraph(p.id);
                    result.content[0].text = JSON.stringify(g?.stats.hotspots?.slice(0, args.limit || 10) || [], null, 2);
                  } else result.content[0].text = '[]';
                  break;
                }
                case 'pcm_impact': {
                  const { ImpactAnalyzer } = await import('@pcm/scanner');
                  const analyzer = new ImpactAnalyzer(storage);
                  const p = projects.find(x => x.name === args.project || x.id === args.project);
                  const report = await analyzer.analyze(p?.id || '', args.target);
                  result.content[0].text = JSON.stringify(report, null, 2);
                  break;
                }
                case 'pcm_cycles': {
                  const { detectCycles: dc } = await import('@pcm/scanner');
                  const p = projects.find(x => x.name === args.project || x.id === args.project);
                  const cycles = await dc(storage, p?.id || '');
                  result.content[0].text = JSON.stringify({ cycles }, null, 2);
                  break;
                }
                case 'pcm_query': {
                  // Reuse the GraphRAG query logic
                  const target = projects.find(x => x.name === args.project || x.id === args.project) || projects[0];
                  const syms = await storage.querySymbols({ projectId: target.id, limit: 200 });
                  const kw = (args.question as string).split(/\s+/).filter((k: string) => k.length > 2);
                  const matched = syms.filter((s: any) => kw.some((k: string) => s.name.toLowerCase().includes(k.toLowerCase())));
                  const graph = await storage.getGraph(target.id);
                  const ctx = matched.slice(0, 10).map((s: any) => `- ${s.name} (${s.type}) in ${s.filePath}`).join('\n');
                  const llmResp = await fetch('http://localhost:18001/v1/chat/completions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: '/home/daniel/.dllm/models/Qwen3-8B-AWQ', messages: [
                      { role: 'system', content: 'You are a code expert. Answer concisely based on the context.' },
                      { role: 'user', content: `Project symbols:\n${ctx}\n\nQuestion: ${args.question}` }
                    ], temperature: 0.3, max_tokens: 1024 }),
                  });
                  const ld = await llmResp.json() as any;
                  result.content[0].text = ld?.choices?.[0]?.message?.content || 'No response';
                  break;
                }
              }
              res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
            } else {
              res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: `Unknown method: ${rpc.method}` } }));
            }
          } catch (err) { res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: String(err) } })); }
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
