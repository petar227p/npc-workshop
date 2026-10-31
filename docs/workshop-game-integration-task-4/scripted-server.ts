// Verification fixture only: scripted model proposals through the real HTTP API and ledger.
// This is not a live provider and is never selected by the normal backend example.
import { serve } from '@hono/node-server';
import { mockClient } from '../../server/src/models';
import { createApi } from '../../server/src/routes/api';

const pass = (qty: number) => JSON.stringify({ action: 'OFFER', say: 'Here is a pass.', offer: { kind: 'in_stock', good: 'gate pass', qty, price: 0, remarks: '' } });
const app = createApi({
  makeModel: () => ({
    model: 'scripted-verification-only',
    client: mockClient([
      pass(1), pass(5), pass(5),
      JSON.stringify({ action: 'SIGNAL', signal: 'open_gate', say: 'Come through.' }),
    ]),
  }),
});
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 8794) }, (info) => {
  console.log(`SCRIPTED verification server: http://127.0.0.1:${info.port} (no live provider, no file saving)`);
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
