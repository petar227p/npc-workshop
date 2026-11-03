// Offline API for UI baselines: the real createApi with scripted NPC replies and a mock image client. No model calls.
import { serve } from '../../node_modules/@hono/node-server/dist/index.mjs';
import pngjs from '../../node_modules/pngjs/lib/png.js';
import { createApi } from '../../server/src/routes/api';
import { mockImageClient, type ChatClient } from '../../server/src/models';

const offer = {
  kind: 'made_to_order',
  item_name: 'Hammerhead Blade',
  item_type: 'sword',
  description: 'A broad blade shaped like a hammerhead shark',
  stats: { damage: 14, weight: 6, durability: 70 },
  materials: [{ material: 'iron', qty: 3 }],
  price: 40,
  delivery_ticks: 8,
  remarks: 'Heavy at the head.',
};

// Brann offers a blade when the customer's latest line asks for a sword or blade; each later offer is a new blade that
// takes longer (the ledger wants more time with more jobs in hand). Everyone else answers with a fixed line.
let offers = 0;
const scripted: ChatClient = {
  provider: 'mock',
  async chat(req) {
    await new Promise((r) => setTimeout(r, 600));
    const schema = req.json_schema?.schema as { properties?: Record<string, unknown> } | undefined;
    const last = req.messages.at(-1)?.content ?? '';
    const history = last.split('Conversation so far:\n')[1]?.split('\n\n')[0] ?? '';
    const latest = history.trim().split('\n').at(-1) ?? '';
    const smith = req.json_schema?.name === 'smith_action';
    const retry = /ledger rejected/i.test(last);
    const wantsSword = smith && !retry && /^Customer\b/.test(latest) && /sword|blade/i.test(latest);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(schema?.properties ?? { action: 1, say: 1 })) out[k] = null;
    out.action = wantsSword ? 'OFFER' : 'SAY';
    out.say = wantsSword ? 'Here is what I can do.' : 'Good day to you. (scripted offline reply)';
    if (wantsSword) {
      out.offer = { ...offer, item_name: offers === 0 ? offer.item_name : `Blade No. ${offers + 1}`, delivery_ticks: 8 + offers * 6 };
      offers++;
    }
    return { model: req.model, content: JSON.stringify(out), reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 };
  },
};

function picture(): Buffer {
  const png = new pngjs.PNG({ width: 64, height: 64 });
  for (let p = 0; p < 64 * 64; p++) {
    const inside = p % 64 >= 20 && p % 64 < 44 && p >= 20 * 64 && p < 44 * 64;
    png.data.set(inside ? [90, 100, 120, 255] : [237, 236, 231, 255], p * 4);
  }
  return pngjs.PNG.sync.write(png);
}

const app = createApi({
  makeModel: () => ({ client: scripted, model: 'offline' }),
  makeArtist: () => mockImageClient(Array.from({ length: 50 }, picture)),
});
serve({ fetch: app.fetch, port: 8790 }, () => console.log('offline api on http://localhost:8790'));
