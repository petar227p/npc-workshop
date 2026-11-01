// Isolated UI verification only. No keys, provider calls or file saving.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createApi } from '../../server/src/routes/api';
import { mockClient } from '../../server/src/models';

let modelCalls = 0;
const requests: string[] = [];
const app = new Hono();
app.get('/__evidence', (c) => c.json({ modelCalls, requests }));
app.use('/api/*', async (c, next) => { requests.push(`${c.req.method} ${c.req.path}`); await next(); });
app.route('/', createApi({
  makeModel: () => {
    const client = mockClient([
      new Error('Scripted provider outage'),
      JSON.stringify({ action: 'NOT_ALLOWED', say: 'Invalid proposal.' }),
      JSON.stringify({ action: 'NOT_ALLOWED', say: 'Still invalid.' }),
      ...Array.from({ length: 10 }, () => JSON.stringify({ action: 'SAY', say: 'A scripted hello from Portable Ada.' })),
    ]);
    return { model: 'scripted-ui-verification', client: { provider: 'mock', chat: (request) => { modelCalls += 1; return client.chat(request); } } };
  },
  canSaveNpcs: false,
}));
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 8795 }, () => console.log('SCRIPTED UI verification API on http://127.0.0.1:8795 (no live provider, no file saving)'));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
