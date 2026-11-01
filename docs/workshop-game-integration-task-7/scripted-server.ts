// Reproducible verification fixture. No provider keys, file saving or deployment.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createApi } from '../../server/src/routes/api';
import type { ChatClient } from '../../server/src/models';

let outage = false;
let modelCalls = 0;
const requests: string[] = [];
const app = new Hono();
app.get('/__evidence', (c) => c.json({ modelCalls, requests }));
app.post('/__outage/:mode', (c) => { outage = c.req.param('mode') === 'on'; return c.json({ outage }); });
app.use('/api/*', async (c, next) => { requests.push(`${c.req.method} ${c.req.path}`); await next(); });
app.route('/', createApi({
  makeModel: () => {
    const client: ChatClient = { provider: 'mock', async chat() {
      modelCalls++;
      if (outage) throw new Error('Scripted provider outage');
      return { model: 'scripted-verification-only', content: JSON.stringify({ action: 'SAY', say: 'A scripted hello. My original character settings still apply.' }), reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 };
    } };
    return { model: 'scripted-verification-only', client };
  },
  canSaveNpcs: false,
}));
const port = Number(process.env.PORT ?? 8796);
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => console.log(`SCRIPTED verification API: http://127.0.0.1:${port} (no live provider, no file saving)`));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
