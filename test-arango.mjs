import { Database } from 'arangojs';

const db = new Database({ url: 'http://localhost:8529' });
db.useBasicAuth('root', '');
const pcm = db.database('pcm');

// Find PluginManager
let cursor = await pcm.query(`
  FOR s IN symbols
    FILTER s.name == 'PluginManager'
    LIMIT 1
    RETURN s
`);
const sym = await cursor.next();
if (!sym) { console.log('PluginManager not found'); process.exit(1); }
console.log('PluginManager ID:', sym._id);

// Check incoming edges
cursor = await pcm.query(`
  FOR e IN relationships
    FILTER e._to == @to
    RETURN e
`, { to: sym._id });
const edges = await cursor.all();
console.log('Incoming edges:', edges.length);
for (const e of edges.slice(0,3)) console.log(' ', e._from, '->', e._to, 'type:', e.type || '(no type)');

// Test INBOUND traversal
cursor = await pcm.query(`
  FOR v IN 1..3 INBOUND @sid relationships
    RETURN DISTINCT { name: v.name, file: v.filePath, type: v.type }
`, { sid: sym._id });
const result = await cursor.all();
console.log('INBOUND results:', result.length);
result.forEach(r => console.log(' ', r.type, r.name, r.file));
