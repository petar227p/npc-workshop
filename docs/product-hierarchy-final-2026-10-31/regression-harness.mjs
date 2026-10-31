// Local UI regression fixture. Run from the repo root: node --import tsx docs/product-hierarchy-final-2026-10-31/regression-harness.mjs
// No provider clients or file-saving support. Static frontend assets come from the already running Vite on 5180.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const { serve } = await import(pathToFileURL(`${repo}/node_modules/@hono/node-server/dist/index.mjs`).href);
const { createApi } = await import(pathToFileURL(`${repo}/server/src/routes/api.ts`).href);
const trace = '/tmp/product-hierarchy-final-network.jsonl';
const modeFile = '/tmp/product-hierarchy-final-mode.json';
writeFileSync(trace, '');
writeFileSync(modeFile, '{}');
const mode = () => JSON.parse(readFileSync(modeFile, 'utf8'));
const offer = { action: 'OFFER', say: 'A plain dagger for 35 gold, ready in three hours.', offer: {
  kind: 'made_to_order', item_name: 'Plain Iron Dagger', item_type: 'dagger', description: 'An iron dagger with a leather grip.',
  stats: { damage: 6, weight: 2, durability: 40 }, materials: [{ material: 'iron', qty: 1 }, { material: 'leather', qty: 1 }],
  price: 35, delivery_ticks: 3, remarks: 'Ready in three hours.',
}, contract_id: null };
const app = createApi({ makeModel: (_session, choice) => ({ model: `scripted-${choice}`, client: {
  provider: 'mock',
  async chat(req) {
    const config = mode();
    if (config.unavailableModel) throw new Error('Scripted model service unavailable.');
    const content = JSON.stringify(config.rejectModel || req.json_schema?.name === 'smith_action'
      ? offer : { action: 'SAY', say: 'Scripted regression reply.' });
    return { model: req.model, content, reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 };
  },
} }) });

serve({ hostname: '127.0.0.1', port: 5188, fetch: async (request) => {
  const url = new URL(request.url);
  let response;
  if (url.pathname.startsWith('/api/')) {
    response = mode().failPath === url.pathname
      ? Response.json({ error: 'Scripted service unavailable for regression check.' }, { status: 503 })
      : await app.fetch(request);
  } else {
    const upstream = await fetch(`http://localhost:5180${url.pathname}${url.search}`);
    const headers = new Headers(upstream.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    response = new Response(upstream.body, { status: upstream.status, headers });
  }
  const row = { at: new Date().toISOString(), method: request.method, path: url.pathname, status: response.status };
  if (url.pathname === '/api/state' && response.ok) {
    const state = await response.clone().json();
    Object.assign(row, { world: state.world_id, tick: state.tick, gold: state.gold, items: state.items.map((i) => i.item_id), events: state.events.map((e) => e.id) });
  }
  appendFileSync(trace, `${JSON.stringify(row)}\n`);
  return response;
} }, () => console.log('Scripted regression at http://127.0.0.1:5188; live providers and file saving disabled.'));
