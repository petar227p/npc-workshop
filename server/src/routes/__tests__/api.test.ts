import type { ActionResponse, ArtResponse, StateView } from '@blacksmith/shared';
import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import { mockClient, mockImageClient, type ChatClient } from '../../models';
import { clientIpReader, createApi, type ApiDeps } from '../api';

const offer = JSON.stringify({
  action: 'OFFER',
  say: 'Here is what I can do.',
  offer: {
    kind: 'made_to_order',
    item_name: 'Hammerhead Blade',
    item_type: 'sword',
    description: 'A broad blade shaped like a hammerhead shark',
    stats: { damage: 14, weight: 6, durability: 70 },
    materials: [
      { material: 'iron', qty: 3 },
      { material: 'sharkskin_leather', qty: 1 },
    ],
    price: 120,
    delivery_ticks: 8,
    remarks: 'Heavy at the head.',
  },
  contract_id: null,
});

// A tiny stand-in for a Muse Image render: a dark square on an off-white background.
function picture(): Buffer {
  const png = new PNG({ width: 64, height: 64 });
  for (let p = 0; p < 64 * 64; p++) {
    const inside = p % 64 >= 20 && p % 64 < 44 && p >= 20 * 64 && p < 44 * 64;
    png.data.set(inside ? [90, 100, 120, 255] : [237, 236, 231, 255], p * 4);
  }
  return PNG.sync.write(png);
}
const settle = () => new Promise((r) => setTimeout(r, 0));

// A browser: keeps the session cookie between requests.
function browser(app: ReturnType<typeof createApi>, headers: Record<string, string> = {}) {
  let cookie = '';
  const send = async (path: string, body?: unknown) => {
    const res = await app.request(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(cookie && { cookie }), ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: (await res.json()) as unknown, setCookie: set };
  };
  return { send, cookie: () => cookie };
}

function setup(clientFor: () => ChatClient = () => mockClient([offer]), deps: Partial<ApiDeps> = {}) {
  const made: string[] = [];
  const app = createApi({
    makeModel: (id) => {
      made.push(id);
      return { client: clientFor(), model: 'test' };
    },
    ...deps,
  });
  return { app, made };
}

describe('api', () => {
  it('health needs no session', async () => {
    const { app } = setup();
    const r = await browser(app).send('/api/health');
    expect(r).toMatchObject({ status: 200, json: { ok: true }, setCookie: null });
  });

  it('a new browser sees a fresh world, and gets an httpOnly session cookie on its first action', async () => {
    const { app } = setup();
    const b = browser(app);
    const look = await b.send('/api/state');
    expect(look.status).toBe(200);
    expect(look.json).toMatchObject({ tick: 0, gold: 200, contracts: [], items: [], busy: false });
    expect(look.setCookie).toBeNull(); // looking stores nothing

    const act = await b.send('/api/tick', { ticks: 1 });
    expect(act.setCookie).toMatch(/^bs_session=[0-9a-f-]{36}; Max-Age=604800; Path=\/; HttpOnly; SameSite=Lax/);
    // The same cookie keeps the same session.
    const again = await b.send('/api/state');
    expect(again.setCookie).toBeNull();
    expect((again.json as StateView).tick).toBe(1);
  });

  it("cookieless GETs (a crawler, a curl loop) can't evict a player's world", async () => {
    const { app } = setup(undefined, { sessions: { maxSessions: 2 } });
    const player = browser(app);
    await player.send('/api/say', { text: 'A hammerhead sword, please.' });
    for (let i = 0; i < 50; i++) expect((await app.request('/api/state')).headers.get('set-cookie')).toBeNull();
    expect(((await player.send('/api/state')).json as StateView).contracts).toHaveLength(1);
  });

  it('a full store evicts only long-idle sessions, never an active player', async () => {
    let t = 0;
    const { app } = setup(undefined, { sessions: { maxSessions: 2, minIdleMs: 30 * 60_000, now: () => t } });
    const a = browser(app);
    const b = browser(app);
    await a.send('/api/tick', { ticks: 1 });
    await b.send('/api/tick', { ticks: 1 });

    const late = await browser(app).send('/api/tick', { ticks: 1 });
    expect(late).toMatchObject({ status: 503, json: { error: expect.stringMatching(/forge is full/) }, setCookie: null });

    t = 31 * 60_000;
    await b.send('/api/tick', { ticks: 1 }); // b is active again; a has been idle 31 minutes
    expect((await browser(app).send('/api/tick', { ticks: 1 })).status).toBe(200);
    expect(((await b.send('/api/state')).json as StateView).tick).toBe(2);
    expect(((await a.send('/api/state')).json as StateView).tick).toBe(0); // a's world was the one evicted
  });

  it('caps new sessions per minute across all visitors', async () => {
    let t = 0;
    const { app } = setup(undefined, { sessions: { maxNewPerMinute: 3, now: () => t } });
    for (let i = 0; i < 3; i++) expect((await browser(app).send('/api/tick', { ticks: 1 })).status).toBe(200);
    expect((await browser(app).send('/api/tick', { ticks: 1 })).status).toBe(429);
    t = 61_000;
    expect((await browser(app).send('/api/tick', { ticks: 1 })).status).toBe(200);
  });

  it('caps new sessions per address, read from the trusted proxy header', async () => {
    let t = 0;
    const { app } = setup(undefined, { sessions: { maxNewPerIpPerMinute: 2, now: () => t }, clientIp: clientIpReader('X-Forwarded-For') });
    // The proxy appends the real address last; a forged first entry doesn't dodge the cap.
    const from = (forged: string) => browser(app, { 'x-forwarded-for': `${forged}, 203.0.113.7` });
    expect((await from('1.1.1.1').send('/api/tick', { ticks: 1 })).status).toBe(200);
    expect((await from('2.2.2.2').send('/api/tick', { ticks: 1 })).status).toBe(200);
    const third = await from('3.3.3.3').send('/api/tick', { ticks: 1 });
    expect(third).toMatchObject({ status: 429, json: { error: expect.stringMatching(/from your address/) }, setCookie: null });
    // Another address is unaffected, and the first one recovers after a minute.
    expect((await browser(app, { 'x-forwarded-for': '198.51.100.9' }).send('/api/tick', { ticks: 1 })).status).toBe(200);
    t = 61_000;
    expect((await from('4.4.4.4').send('/api/tick', { ticks: 1 })).status).toBe(200);
  });

  it('the session cookie is Secure only when asked (production, behind HTTPS)', async () => {
    const plain = await browser(setup().app).send('/api/tick', { ticks: 1 });
    expect(plain.setCookie).not.toMatch(/Secure/);
    const secure = await browser(setup(undefined, { secureCookie: true }).app).send('/api/tick', { ticks: 1 });
    expect(secure.setCookie).toMatch(/; Secure/);
  });

  it('a server without a model key answers 503 with a plain message and changes nothing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = setup(undefined, {
      makeModel: () => {
        throw new Error('MODEL_API_KEY is not set (see .env.example)');
      },
    });
    const b = browser(app);
    const r = await b.send('/api/say', { text: 'A hammerhead sword, please.' });
    expect(r).toMatchObject({ status: 503, json: { error: "Brann isn't at the forge right now. Try again later." } });
    expect(JSON.stringify(r.json)).not.toMatch(/MODEL_API_KEY/); // the cause goes to the server log, not the player
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/MODEL_API_KEY is not set/));
    const after = (await b.send('/api/state')).json as StateView;
    expect(after).toMatchObject({ busy: false, events: [] });
    // The message names whoever the player was talking to, at their own place.
    const mira = await b.send('/api/say', { text: 'Torches?', npc: 'merchant' });
    expect(mira).toMatchObject({ status: 503, json: { error: "Mira isn't at the market right now. Try again later." } });
    logged.mockRestore();
  });

  it('a line over 500 characters is a 400 and stores nothing; an oversized body is a 413', async () => {
    const { app, made } = setup();
    const b = browser(app);
    await b.send('/api/tick', { ticks: 1 });
    const long = await b.send('/api/say', { text: 'x'.repeat(501) });
    expect(long.status).toBe(400);
    expect(made).toHaveLength(0);
    expect(((await b.send('/api/state')).json as StateView).events.map((e) => e.type)).toEqual(['CLOCK_ADVANCED']);

    const huge = await browser(app).send('/api/say', { text: 'x'.repeat(5_000_000) });
    expect(huge).toMatchObject({ status: 413, json: { error: 'request too large' }, setCookie: null });
  });

  it('order → accept → skip delivers the item, through HTTP', async () => {
    const { app, made } = setup();
    const b = browser(app);
    const said = (await b.send('/api/say', { text: 'A hammerhead sword, please.' })).json as ActionResponse;
    expect(said.outcome).toBe('acted');
    expect(said.view.contracts).toHaveLength(1);
    expect(said.view.contracts[0]).toMatchObject({ contract_id: 'c_001', status: 'proposed' });
    expect(made).toHaveLength(1);

    const accepted = (await b.send('/api/accept', { contract_id: 'c_001' })).json as ActionResponse;
    expect(accepted.ok).toBe(true);
    expect(accepted.view.gold).toBe(80);
    expect(accepted.view.contracts[0].status).toBe('in_progress');

    const skipped = (await b.send('/api/tick', { ticks: 8 })).json as ActionResponse;
    expect(skipped.view.items[0]).toMatchObject({ item_name: 'Hammerhead Blade', stats: { damage: 14, weight: 6, durability: 70 } });
  });

  it('two sellers in one world: each sale pays its own seller, and the shops show their own stock', async () => {
    const torches = JSON.stringify({
      action: 'OFFER',
      say: 'Three torches, fresh pitch.',
      offer: { kind: 'in_stock', good: 'torch', qty: 3, price: 9, remarks: 'An hour each.' },
      contract_id: null,
    });
    const { app } = setup(() => mockClient([offer, torches]));
    const b = browser(app);
    await b.send('/api/say', { text: 'A hammerhead sword, please.' });
    const asked = (await b.send('/api/say', { npc: 'merchant', text: 'Three torches.' })).json as ActionResponse;
    expect(asked.view.contracts.map((c) => [c.contract_id, c.seller])).toEqual([
      ['c_001', 'smith'],
      ['c_002', 'merchant'],
    ]);
    const bought = (await b.send('/api/accept', { contract_id: 'c_002' })).json as ActionResponse;
    expect(bought.events.map((e) => [e.type, e.location])).toEqual([
      ['CONTRACT_ACCEPTED', 'market'],
      ['GOODS_DELIVERED', 'market'],
    ]);
    expect(bought.view.gold).toBe(191);
    expect(bought.view.goods).toEqual({ torch: 3 });
    const forged = (await b.send('/api/accept', { contract_id: 'c_001' })).json as ActionResponse;
    expect(forged.view.gold).toBe(71);
    const shops = Object.fromEntries(forged.view.shops.map((x) => [x.id, x]));
    expect(shops.merchant).toMatchObject({ name: 'Mira', stock: { torch: 7 } });
    expect(shops.smith).toMatchObject({ name: 'Brann', stock: { iron: 9, sharkskin_leather: 1 } });
    // Nobody else's gold moved: the ledger shows Brann +120 and Mira +9.
    const accepted = forged.view.events.filter((e) => e.type === 'CONTRACT_ACCEPTED').map((e) => [e.target, e.data]);
    expect(accepted).toEqual([
      ['merchant', { contract_id: 'c_002', price: 9 }],
      ['smith', { contract_id: 'c_001', price: 120 }],
    ]);
    expect((await b.send('/api/say', { npc: 'baron', text: 'Hello?' })).status).toBe(400);
  });

  it('sessions are isolated', async () => {
    const { app } = setup();
    const a = browser(app);
    const b = browser(app);
    await a.send('/api/say', { text: 'A hammerhead sword, please.' });
    expect(((await b.send('/api/state')).json as StateView).contracts).toEqual([]);
    expect(a.cookie()).not.toBe(b.cookie());
  });

  it('a bad accept is a logged rejection, not a server error', async () => {
    const { app } = setup();
    const r = (await browser(app).send('/api/accept', { contract_id: 'c_404' })).json as ActionResponse;
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no contract c_404/);
    expect(r.view.events.at(-1)?.type).toBe('ACTION_REJECTED');
  });

  it('rejects malformed bodies and out-of-range skips', async () => {
    const { app } = setup();
    const b = browser(app);
    expect((await b.send('/api/say', { message: 'hi' })).status).toBe(400);
    expect((await b.send('/api/tick', { ticks: 0 })).status).toBe(400);
    expect((await b.send('/api/tick', { ticks: 1000 })).status).toBe(400);
    expect((await b.send('/api/accept', {})).status).toBe(400);
  });

  it('locks the world while the smith is thinking', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: ChatClient = {
      provider: 'mock',
      async chat(req) {
        await gate;
        return { model: req.model, content: offer, reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 };
      },
    };
    const { app } = setup(() => slow);
    const b = browser(app);
    await b.send('/api/reset', {}); // an action, so the browser holds its session cookie before the slow turn
    const turn = b.send('/api/say', { text: 'A hammerhead sword, please.' });
    await new Promise((r) => setTimeout(r, 0));

    expect(((await b.send('/api/state')).json as StateView).busy).toBe(true);
    expect((await b.send('/api/tick', { ticks: 1 })).status).toBe(409);
    expect((await b.send('/api/say', { text: 'hello?' })).json).toEqual({ error: 'Brann is still answering.' });
    expect((await b.send('/api/reset', {})).status).toBe(409);

    release();
    expect(((await turn).json as ActionResponse).outcome).toBe('acted');
    expect(((await b.send('/api/state')).json as StateView).busy).toBe(false);
  });

  it('the lock names the NPC who is answering', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const reply = JSON.stringify({ action: 'SAY', say: 'Torches, yes.', offer: null, contract_id: null });
    const slow: ChatClient = {
      provider: 'mock',
      async chat(req) {
        await gate;
        return { model: req.model, content: reply, reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 };
      },
    };
    const { app } = setup(() => slow);
    const b = browser(app);
    await b.send('/api/reset', {});
    const turn = b.send('/api/say', { text: 'Torches?', npc: 'merchant' });
    await new Promise((r) => setTimeout(r, 0));
    expect(await b.send('/api/tick', { ticks: 1 })).toMatchObject({ status: 409, json: { error: 'Mira is still answering.' } });
    release();
    expect(((await turn).json as ActionResponse).outcome).toBe('acted');
  });

  it('reset starts a fresh world', async () => {
    const { app } = setup();
    const b = browser(app);
    await b.send('/api/say', { text: 'A hammerhead sword, please.' });
    const r = (await b.send('/api/reset', {})).json as ActionResponse;
    expect(r.view).toMatchObject({ tick: 0, gold: 200, contracts: [], events: [] });
  });

  describe('item pictures', () => {
    it('accepting starts a picture; the page polls /api/art and loads the sprite', async () => {
      const artist = mockImageClient([picture()]);
      const { app } = setup(undefined, { makeArtist: () => artist });
      const b = browser(app);
      await b.send('/api/say', { text: 'A hammerhead sword, please.' });
      const accepted = (await b.send('/api/accept', { contract_id: 'c_001' })).json as ActionResponse;
      expect(accepted.view.art).toEqual({ c_001: { status: 'rendering', url: null } });
      expect(artist.prompts[0].prompt).toContain('"Hammerhead Blade"');

      await settle();
      const { art } = (await b.send('/api/art')).json as ArtResponse;
      expect(art.c_001.status).toBe('ready');
      const res = await app.request(art.c_001.url!, { headers: { cookie: b.cookie() } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(PNG.sync.read(Buffer.from(await res.arrayBuffer())).width).toBe(32);

      // Only the owner's session can load it, and a new game starts with no pictures.
      expect((await app.request(art.c_001.url!)).status).toBe(404);
      const reset = (await b.send('/api/reset', {})).json as ActionResponse;
      expect(reset.view.art).toEqual({});
      expect((await app.request(art.c_001.url!, { headers: { cookie: b.cookie() } })).status).toBe(404);
    });

    it('without an image key the item keeps the placeholder and accepting still works', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { app } = setup(undefined, {
        makeArtist: () => {
          throw new Error('MODEL_API_KEY is not set');
        },
      });
      const b = browser(app);
      await b.send('/api/say', { text: 'A hammerhead sword, please.' });
      const accepted = (await b.send('/api/accept', { contract_id: 'c_001' })).json as ActionResponse;
      expect(accepted.ok).toBe(true);
      expect(accepted.view.art.c_001).toEqual({ status: 'unavailable', url: null });
      logged.mockRestore();
    });

    it('a failed render is logged and leaves the placeholder', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { app } = setup(undefined, { makeArtist: () => mockImageClient([new Error('image 400: content_policy_violation')]) });
      const b = browser(app);
      await b.send('/api/say', { text: 'A hammerhead sword, please.' });
      await b.send('/api/accept', { contract_id: 'c_001' });
      await settle();
      expect(((await b.send('/api/art')).json as ArtResponse).art.c_001.status).toBe('unavailable');
      expect(logged).toHaveBeenCalledWith(expect.stringMatching(/content_policy_violation/));
      logged.mockRestore();
    });
  });

  it('the player can give gold or goods to an NPC; the ledger refuses what the player does not have', async () => {
    const { app } = setup();
    const b = browser(app);
    const gave = (await b.send('/api/give', { to: 'merchant', gift: { kind: 'gold', amount: 15 } })).json as ActionResponse;
    expect(gave.ok).toBe(true);
    expect(gave.events[0]).toMatchObject({ type: 'GIVEN', actor: 'player', target: 'merchant' });
    expect(gave.view.gold).toBe(185);

    const broke = (await b.send('/api/give', { to: 'merchant', gift: { kind: 'gold', amount: 999 } })).json as ActionResponse;
    expect(broke).toMatchObject({ ok: false, reason: "player has 185 gold; it can't give 999" });
    const torch = (await b.send('/api/give', { to: 'smith', gift: { kind: 'good', good: 'torch', qty: 1 } })).json as ActionResponse;
    expect(torch.reason).toMatch(/player has 0 torch to spare/);
    expect((await b.send('/api/give', { gift: { kind: 'gold', amount: 1 } })).status).toBe(400);
    const empty = (await b.send('/api/give', { to: 'smith' })).json as ActionResponse; // the engine checks the gift: a logged rejection
    expect(empty.ok).toBe(false);
    expect(empty.events[0].type).toBe('ACTION_REJECTED');
  });

  it('the view says where each NPC is, from its schedule; the browser only walks them there', async () => {
    const { app } = setup();
    const b = browser(app);
    const start = (await b.send('/api/state')).json as StateView;
    expect(start.people).toEqual(
      expect.arrayContaining([
        { id: 'merchant', name: 'Mira', sprite: 99, place: 'market', model: 'muse_spark_open' },
        { id: 'smith', name: 'Brann', sprite: 86, place: 'forge', model: 'muse_spark' },
        { id: 'farmer', name: 'Tobin', sprite: 88, place: 'farm', model: 'muse_spark_open' },
      ]),
    );
    const evening = (await b.send('/api/tick', { ticks: 11 })).json as ActionResponse; // 19:00
    expect(evening.view.people.find((p) => p.id === 'merchant')?.place).toBe('tavern');
    expect(evening.view.people.find((p) => p.id === 'smith')?.place).toBe('forge');
    expect(evening.view.people.find((p) => p.id === 'farmer')?.place).toBe('tavern');
  });

  it('passing time calls no model while nobody in the village is on a timer', async () => {
    const { app, made } = setup();
    const r = (await browser(app).send('/api/tick', { ticks: 24 })).json as ActionResponse;
    expect(r.events.map((e) => e.type)).toEqual(['CLOCK_ADVANCED']);
    expect(made).toEqual([]);
  });

  describe('god mode', () => {
    const dragon = { text: 'A dragon flew low over the village and burned the old mill.', place: 'gate', involved: [], seen_by: { kind: 'everyone' } };

    it('logs what happened with who saw it, shows it in who-knows-what, and the crier at its board acts on it', async () => {
      const { app } = setup(() => mockClient([new Error('down')])); // the crier's turn falls back to its safe line
      const r = (await browser(app).send('/api/god', dragon)).json as ActionResponse;
      expect(r.ok).toBe(true);
      expect(r.events[0]).toMatchObject({ type: 'HAPPENED', actor: 'world', location: 'gate', data: { text: dragon.text, seen_by: 'everyone' } });
      const story = r.view.news[0];
      expect(story.text).toContain(dragon.text);
      expect(story.knowers.map((k) => k.id).sort()).toEqual(['bard', 'cottager', 'crier', 'farmer', 'keeper', 'merchant', 'smith']);
      expect(r.events.slice(1).map((e) => [e.type, e.actor])).toContainEqual(['TRIGGER_FIRED', 'crier']); // 08:00: it is at the notice board
      expect(r.view.gold).toBe(200);
    });

    it('a report the engine refuses changes nothing and says why', async () => {
      const { app, made } = setup();
      const r = (await browser(app).send('/api/god', { ...dragon, place: 'moon' })).json as ActionResponse;
      expect(r).toMatchObject({ ok: false, reason: "there's no place called 'moon' in the village", events: [] });
      expect(r.view.events).toEqual([]);
      expect(made).toEqual([]);
    });

    it('reads a note in plain words into a report to check, logging nothing', async () => {
      // 30 hours ago at 08:00 on the first day is before the village's story: read as just now.
      const reply = JSON.stringify({ text: 'The stranger slew the troll at the gate.', place: 'gate', involved: ['player'], seen_by: 'nearby', notable: true, hours_ago: 30 });
      const client = mockClient([reply]);
      const { app } = setup(() => client);
      const b = browser(app);
      const r = await b.send('/api/god/read', { note: 'I killed the troll outside the gate' });
      const read = { text: 'The stranger slew the troll at the gate.', place: 'gate', involved: ['player'], seen_by: { kind: 'nearby' }, notable: true, hours_ago: 0 };
      expect(r).toMatchObject({ status: 200, json: { report: read } });
      const schema = client.requests[0].json_schema!.schema as { properties: { place: { enum: string[] }; involved: { items: { enum: string[] } } } };
      expect(schema.properties.place.enum).toContain('notice_board');
      expect(schema.properties.involved.items.enum).toEqual(expect.arrayContaining(['player', 'smith', 'bard']));
      expect(client.requests[0].messages.at(-1)!.content).toContain('I killed the troll outside the gate');
      expect(((await b.send('/api/state')).json as StateView).events).toEqual([]);
    });

    it('a reading that will not do is a 502, an empty note a 400', async () => {
      const { app } = setup(() => mockClient([JSON.stringify({ text: 'Somewhere.', place: 'moon', involved: [], seen_by: 'nearby', notable: false, hours_ago: 0 })]));
      const b = browser(app);
      expect((await b.send('/api/god/read', { note: 'something happened on the moon' })).status).toBe(502);
      expect((await b.send('/api/god/read', { note: '  ' })).status).toBe(400);
    });
  });
});
