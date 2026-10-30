import type { ApiEvents, ApiNpc, ApiResult, ApiState, ApiWorldCreated } from '@blacksmith/shared';
import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import { mockClient, mockImageClient, type ChatClient } from '../../models';
import { clientIpReader, createApi, type ApiDeps } from '../api';

// The dev API, driven the way a game would: no cookie, a bearer token per world.

const offer = (price: number) =>
  JSON.stringify({
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
      price,
      delivery_ticks: 8,
      remarks: 'Heavy at the head.',
    },
    contract_id: null,
  });
const dragon = { text: 'A dragon flew low over the village and burned the old mill.', place: 'gate', involved: [], seen_by: { kind: 'everyone' } };

function picture(): Buffer {
  const png = new PNG({ width: 64, height: 64 });
  for (let p = 0; p < 64 * 64; p++) {
    const inside = p % 64 >= 20 && p % 64 < 44 && p >= 20 * 64 && p < 44 * 64;
    png.data.set(inside ? [90, 100, 120, 255] : [237, 236, 231, 255], p * 4);
  }
  return PNG.sync.write(png);
}
const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(clientFor: () => ChatClient = () => mockClient([offer(120)]), deps: Partial<ApiDeps> = {}) {
  const made: string[] = [];
  const app = createApi({
    makeModel: (id) => {
      made.push(id);
      return { client: clientFor(), model: 'test' };
    },
    ...deps,
  });
  // A game's HTTP calls: JSON in and out, the token when it has one, never a cookie.
  const call = async <T = unknown>(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { ...headers, ...(token && { authorization: `Bearer ${token}` }), ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const json = res.headers.get('content-type')?.startsWith('application/json') ? ((await res.json()) as T) : (null as T);
    return { status: res.status, json, res };
  };
  const newWorld = async (npcs?: string[]) => {
    const r = await call<ApiWorldCreated>('POST', '/api/v1/worlds', npcs ? { npcs } : undefined);
    expect(r.status).toBe(201);
    const { world_id: id, token } = r.json;
    const at = (path = '') => `/api/v1/worlds/${id}${path}`;
    return { ...r.json, at, send: <T = ApiResult>(path: string, body?: unknown) => call<T>(body === undefined ? 'GET' : 'POST', at(path), body, token) };
  };
  return { app, made, call, newWorld };
}

describe('dev api (/api/v1)', () => {
  it('lists the NPCs a world can be made with, and what each sells', async () => {
    const { call } = setup();
    const r = await call<{ npcs: ApiNpc[] }>('GET', '/api/v1/npcs');
    expect(r.status).toBe(200);
    expect(r.res.headers.get('set-cookie')).toBeNull();
    const byId = Object.fromEntries(r.json.npcs.map((n) => [n.id, n]));
    expect(byId.smith).toMatchObject({ name: 'Brann', place: 'forge', answers: true, verbs: expect.arrayContaining(['OFFER', 'START_WORK']) });
    expect(byId.smith.sells).toContain('sword');
    expect(byId.merchant.sells).toEqual(expect.arrayContaining(['torch', 'lantern']));
    expect(byId.crier.sells).toEqual([]);
  });

  it('a game makes a world from the NPCs it picks and gets a token for it; no cookie is set', async () => {
    const { call } = setup();
    const r = await call<ApiWorldCreated>('POST', '/api/v1/worlds', { npcs: ['smith', 'merchant'] });
    expect(r.status).toBe(201);
    expect(r.res.headers.get('set-cookie')).toBeNull();
    expect(r.json.world_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.json.token.length).toBeGreaterThanOrEqual(32);
    expect(r.json.npcs).toEqual(['smith', 'merchant']);
    expect(r.json.state).toMatchObject({ tick: 0, gold: 200, contracts: [], last_event_id: null, busy: null, calls_left: 150 });
    expect(r.json.state.people.map((p) => p.id)).toEqual(['smith', 'merchant']);

    // No body: every NPC there is.
    const all = await call<ApiWorldCreated>('POST', '/api/v1/worlds');
    expect(all.json.npcs).toEqual(expect.arrayContaining(['smith', 'merchant', 'bard', 'crier']));
  });

  it('refuses an NPC that does not exist, the same one twice, and a body that is not JSON', async () => {
    const { call } = setup();
    const unknown = await call('POST', '/api/v1/worlds', { npcs: ['smith', 'dragon'] });
    expect(unknown).toMatchObject({ status: 400, json: { error: expect.stringMatching(/no NPC called 'dragon' \(there are: .*smith/) } });
    expect((await call('POST', '/api/v1/worlds', { npcs: ['smith', 'smith'] })).status).toBe(400);
    expect((await call('POST', '/api/v1/worlds', { npcs: [] })).status).toBe(400);
    expect((await call('POST', '/api/v1/worlds', '{not json')).status).toBe(400);
    expect((await call('POST', '/api/v1/worlds', { npcs: ['smith'], extra: 1 })).status).toBe(400);
  });

  it("a world answers only to its own token, and an unknown world is a 404", async () => {
    const { call, newWorld } = setup();
    const w = await newWorld(['smith']);
    expect((await call('GET', w.at())).status).toBe(401);
    expect((await call('GET', w.at(), undefined, 'not-the-token')).status).toBe(401);
    expect((await call('POST', w.at('/tick'), { hours: 1 }, `${w.token}x`)).status).toBe(401);
    expect((await call('GET', w.at(), undefined, w.token)).status).toBe(200);
    expect((await call('GET', '/api/v1/worlds/00000000-0000-0000-0000-000000000000', undefined, w.token)).status).toBe(404);
    const other = await newWorld(['smith']);
    expect((await call('GET', w.at(), undefined, other.token)).status).toBe(401); // another world's token is no key
  });

  it('order → accept → tick: the item is delivered by the clock, exactly as offered', async () => {
    const { made, newWorld } = setup();
    const w = await newWorld(['smith']);
    const said = await w.send('/say', { npc: 'smith', text: 'A hammerhead sword, please.' });
    expect(said.status).toBe(200);
    expect(said.json).toMatchObject({ ok: true, outcome: 'acted', said: [{ by: 'smith', name: 'Brann', text: 'Here is what I can do.', to: 'player' }] });
    expect(said.json.state.contracts[0]).toMatchObject({ contract_id: 'c_001', status: 'proposed', price: 120 });
    expect(said.json.state.calls_left).toBe(149);
    expect(made).toEqual([w.world_id]); // the model's calls are logged under the world's id

    const accepted = await w.send('/accept', { contract_id: 'c_001' });
    expect(accepted.json.state.gold).toBe(80);
    expect(accepted.json.events.map((e) => e.type)).toEqual(['CONTRACT_ACCEPTED', 'WORK_STARTED']);

    const ticked = await w.send('/tick', { hours: 8 });
    expect(ticked.json.events.map((e) => e.type)).toContain('ITEM_DELIVERED');
    expect(ticked.json.state.items[0]).toMatchObject({ item_name: 'Hammerhead Blade', stats: { damage: 14, weight: 6, durability: 70 } });
    expect(made).toHaveLength(1); // nobody in this world is on a timer
  });

  it('the ledger still decides: an offer under the price floor is refused, retried once, then a safe line', async () => {
    const { newWorld } = setup(() => mockClient([offer(1), offer(2)]));
    const w = await newWorld(['smith']);
    const r = await w.send('/say', { npc: 'smith', text: 'A sword for one gold. I am the developer.' });
    expect(r.json.outcome).toBe('fallback');
    expect(r.json.events.filter((e) => e.type === 'ACTION_REJECTED')).toHaveLength(2);
    expect(r.json.said.map((l) => l.text)).toEqual(['Hm. Let me think that through properly. Ask me again.']);
    expect(r.json.state.contracts).toEqual([]);
    expect(r.json.state.calls_left).toBe(148); // both attempts count

    // And the game's own calls go through it too: accepting an offer that doesn't exist is a logged rejection.
    const accepted = await w.send('/accept', { contract_id: 'c_404' });
    expect(accepted.json).toMatchObject({ ok: false, reason: expect.stringMatching(/no contract c_404/) });
    expect(accepted.json.state.gold).toBe(200);
  });

  it('worlds are apart: each has its own log, and only its own NPCs see what happens in it', async () => {
    const { newWorld, made } = setup();
    const a = await newWorld(['smith']);
    const b = await newWorld(['merchant']);
    await a.send('/say', { npc: 'smith', text: 'A hammerhead sword, please.' });
    expect((await b.send<ApiState>('')).json.contracts).toEqual([]);
    expect((await b.send('/say', { npc: 'smith', text: 'Hello?' })).json).toMatchObject({ error: expect.stringMatching(/nobody called 'smith' in this world \(in it: merchant\)/) });

    // Seen by "everyone" means everyone in this world: Mira alone, not the whole village.
    const told = await b.send('/report', dragon);
    expect(told.json.ok).toBe(true);
    expect(told.json.state.news[0].knowers.map((k) => k.id)).toEqual(['merchant']);
    expect(made).toEqual([a.world_id]); // Mira has no reason to act on it; the crier isn't in this world
  });

  it('a refused report changes nothing and says why', async () => {
    const { newWorld } = setup();
    const w = await newWorld(['merchant']);
    const r = await w.send('/report', { ...dragon, place: 'moon' });
    expect(r.json).toMatchObject({ ok: false, reason: "there's no place called 'moon' in the village", events: [] });
    expect(r.json.state.last_event_id).toBeNull();
  });

  it('reads the log on from where the game left off, a page at a time', async () => {
    const { newWorld } = setup();
    const w = await newWorld(['smith']);
    for (let i = 0; i < 3; i++) await w.send('/tick', { hours: 1 });
    const all = (await w.send<ApiEvents>('/events')).json;
    expect(all.events.map((e) => e.id)).toEqual(['e_0001', 'e_0002', 'e_0003']);
    expect(all).toMatchObject({ last_event_id: 'e_0003', more: false });

    const page = (await w.send<ApiEvents>('/events?since=e_0001&limit=1')).json;
    expect(page).toMatchObject({ events: [{ id: 'e_0002' }], last_event_id: 'e_0002', more: true });
    expect((await w.send<ApiEvents>('/events?since=e_0003')).json).toEqual({ events: [], last_event_id: 'e_0003', more: false });
    expect((await w.send('/events?since=e_9999')).status).toBe(400);
    expect((await w.send('/events?limit=0')).status).toBe(400);
  });

  it('locks a world while its NPC is thinking, and says who', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: ChatClient = {
      provider: 'mock',
      async chat(req) {
        await gate;
        return { model: req.model, content: offer(120), reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 };
      },
    };
    const { newWorld } = setup(() => slow);
    const w = await newWorld(['smith']);
    const turn = w.send('/say', { npc: 'smith', text: 'A hammerhead sword, please.' });
    await settle();
    expect((await w.send<ApiState>('')).json.busy).toBe('Brann');
    expect(await w.send('/tick', { hours: 1 })).toMatchObject({ status: 409, json: { error: 'Brann is still answering.' } });
    expect((await w.send('/accept', { contract_id: 'c_001' })).status).toBe(409);
    expect((await w.send('/report', dragon)).status).toBe(409);
    release();
    expect((await turn).json.outcome).toBe('acted');
    expect((await w.send<ApiState>('')).json.busy).toBeNull();
  });

  describe('limits', () => {
    it('a world has a quota of model calls; out of calls, the clock still runs and nobody acts on their own', async () => {
      const hail = JSON.stringify({ action: 'SAY', say: 'Hear ye!' });
      const { newWorld, made } = setup(() => mockClient([offer(120), hail]), { v1: { callsPerWorld: 1 } });
      const w = await newWorld(['smith', 'crier']);
      expect((await w.send('/say', { npc: 'smith', text: 'A hammerhead sword, please.' })).json.state.calls_left).toBe(0);
      expect(await w.send('/say', { npc: 'smith', text: 'And a shield?' })).toMatchObject({ status: 429, json: { error: expect.stringMatching(/all 1 of its model calls/) } });

      // The crier would cry this at its board, but the world has no calls left: the news is logged, nobody acts.
      const told = await w.send('/report', dragon);
      expect(told.json.events.map((e) => e.type)).toEqual(['HAPPENED']);
      const ticked = await w.send('/tick', { hours: 2 });
      expect(ticked.status).toBe(200);
      expect(ticked.json.state.tick).toBe(2);
      expect(made).toHaveLength(1);
    });

    it('all worlds together have a per-minute quota of model calls', async () => {
      const t = 1_000_000;
      const { newWorld } = setup(() => mockClient([offer(120)]), { v1: { callsPerMinute: 1, now: () => t } });
      const a = await newWorld(['smith']);
      const b = await newWorld(['smith']);
      expect((await a.send('/say', { npc: 'smith', text: 'A hammerhead sword, please.' })).status).toBe(200);
      expect(await b.send('/say', { npc: 'smith', text: 'A sword.' })).toMatchObject({ status: 429, json: { error: 'The NPCs are busy right now. Try again in a minute.' } });
    });

    it('caps new worlds per address and across everyone, and evicts only long-idle ones when full', async () => {
      let t = 1_000_000;
      const { call } = setup(undefined, { v1: { maxNewPerIpPerMinute: 2, maxWorlds: 3, minIdleMs: 60_000, now: () => t }, clientIp: clientIpReader('X-Forwarded-For') });
      const from = (ip: string) => call('POST', '/api/v1/worlds', { npcs: ['smith'] }, undefined, { 'x-forwarded-for': ip });
      expect((await from('1.1.1.1')).status).toBe(201);
      expect((await from('1.1.1.1')).status).toBe(201);
      expect(await from('1.1.1.1')).toMatchObject({ status: 429, json: { error: 'Too many new worlds from your address. Try again in a minute.' } });
      expect((await from('2.2.2.2')).status).toBe(201);
      t += 30_000;
      expect(await from('3.3.3.3')).toMatchObject({ status: 503, json: { error: 'The server holds as many worlds as it can. Try again later.' } });
      t += 60_000; // the first three are idle long enough now
      expect((await from('3.3.3.3')).status).toBe(201);
    });

    it("a world's log is capped", async () => {
      const { newWorld } = setup(undefined, { v1: { maxEvents: 2 } });
      const w = await newWorld(['smith']);
      await w.send('/tick', { hours: 1 });
      await w.send('/tick', { hours: 1 });
      expect(await w.send('/tick', { hours: 1 })).toMatchObject({ status: 429, json: { error: expect.stringMatching(/log is full/) } });
    });

    it('rejects bad bodies, out-of-range hours and oversized requests before anything runs', async () => {
      const { newWorld, made } = setup();
      const w = await newWorld(['smith']);
      expect((await w.send('/say', { text: 'hi' })).status).toBe(400); // which NPC?
      expect((await w.send('/say', { npc: 'smith', text: '   ' })).status).toBe(400);
      expect((await w.send('/say', { npc: 'smith', text: 'x'.repeat(501) })).status).toBe(400);
      expect((await w.send('/tick', { hours: 0 })).status).toBe(400);
      expect((await w.send('/tick', { hours: 49 })).status).toBe(400);
      expect((await w.send('/tick', { ticks: 1 })).status).toBe(400);
      expect((await w.send('/accept', {})).status).toBe(400);
      expect(await w.send('/say', { npc: 'smith', text: 'x'.repeat(100_000) })).toMatchObject({ status: 413, json: { error: 'request too large' } });
      expect(made).toEqual([]);
      expect((await w.send<ApiState>('')).json.last_event_id).toBeNull();
    });

    it('a server without a model key answers 503 and changes nothing', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { newWorld } = setup(undefined, {
        makeModel: () => {
          throw new Error('MODEL_API_KEY is not set');
        },
      });
      const w = await newWorld(['merchant']);
      expect(await w.send('/say', { npc: 'merchant', text: 'Torches?' })).toMatchObject({ status: 503, json: { error: "Mira isn't at the market right now. Try again later." } });
      expect((await w.send<ApiState>('')).json).toMatchObject({ last_event_id: null, calls_left: 150 });
      logged.mockRestore();
    });
  });

  it('any site may call it (the token is the only credential), but the village routes stay same-site', async () => {
    const { app } = setup();
    const preflight = await app.request('/api/v1/worlds', {
      method: 'OPTIONS',
      headers: { origin: 'https://my-game.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/authorization/i);
    const village = await app.request('/api/state', { headers: { origin: 'https://my-game.example' } });
    expect(village.headers.get('access-control-allow-origin')).toBeNull();
  });

  it("the item's picture is drawn as in the village, and served to the world's token only", async () => {
    const artist = mockImageClient([picture()]);
    const { newWorld, call } = setup(undefined, { makeArtist: () => artist });
    const w = await newWorld(['smith']);
    await w.send('/say', { npc: 'smith', text: 'A hammerhead sword, please.' });
    const accepted = await w.send('/accept', { contract_id: 'c_001' });
    expect(accepted.json.state.art).toEqual({ c_001: { status: 'rendering', url: null } });
    await settle();
    const url = (await w.send<ApiState>('')).json.art.c_001.url!;
    expect(url).toMatch(new RegExp(`^/api/v1/worlds/${w.world_id}/art/[0-9a-f-]{36}\\.png$`));
    const png = await call('GET', url, undefined, w.token);
    expect(png.res.headers.get('content-type')).toBe('image/png');
    expect(PNG.sync.read(Buffer.from(await png.res.arrayBuffer())).width).toBe(32);
    expect((await call('GET', url)).status).toBe(401);
  });

  describe("the game's own inventories", () => {
    const torches = JSON.stringify({ action: 'OFFER', say: 'Three torches.', offer: { kind: 'in_stock', good: 'torch', qty: 3, price: 6, remarks: '' }, contract_id: null });

    it("a world can start from the game's save: the player's and an NPC's purse and stock", async () => {
      const { call } = setup(() => mockClient([torches, torches]));
      const r = await call<ApiWorldCreated>('POST', '/api/v1/worlds', {
        npcs: ['merchant'],
        start: { player: { gold: 12, stock: { itm_wolf_pelt: 2 } }, merchant: { gold: 0, stock: { torch: 1 } } },
      });
      expect(r.status).toBe(201);
      expect(r.json.state).toMatchObject({ gold: 12, goods: { itm_wolf_pelt: 2 }, shops: [{ id: 'merchant', stock: { torch: 1 } }] });

      // The ledger works from it: Mira has one torch, so an offer of three is refused.
      const said = await call<ApiResult>('POST', `/api/v1/worlds/${r.json.world_id}/say`, { npc: 'merchant', text: 'Three torches.' }, r.json.token);
      expect(said.json.outcome).toBe('fallback');
      expect(said.json.state.contracts).toEqual([]);
    });

    it('a start for someone not in the world, or of the wrong shape, is refused', async () => {
      const { call } = setup();
      expect(await call('POST', '/api/v1/worlds', { npcs: ['merchant'], start: { smith: { gold: 1, stock: {} } } })).toMatchObject({
        status: 400,
        json: { error: "start: 'smith' isn't in this world (the player is 'player')" },
      });
      expect((await call('POST', '/api/v1/worlds', { npcs: ['merchant'], start: { player: { gold: -1, stock: {} } } })).status).toBe(400);
      expect((await call('POST', '/api/v1/worlds', { npcs: ['merchant'], start: { player: { gold: 1, stock: { 'Wolf Pelt': 1 } } } })).status).toBe(400);
    });

    it('a sync logs what the game changed itself; the same one twice logs nothing; no model is called', async () => {
      const { newWorld, made } = setup();
      const w = await newWorld(['smith']);
      const looted = await w.send('/sync', { actor: 'player', gold: 260, stock: { itm_wolf_pelt: 3 }, reason: 'looted the wolf den' });
      expect(looted.json).toMatchObject({ ok: true, events: [{ type: 'SYNCED', target: 'player', data: { reason: 'looted the wolf den' } }] });
      expect(looted.json.state).toMatchObject({ gold: 260, goods: { itm_wolf_pelt: 3 } });
      expect((await w.send('/sync', { actor: 'player', gold: 260, reason: 'looted the wolf den' })).json).toMatchObject({ ok: true, events: [] });
      expect(made).toEqual([]);
    });

    it("a sync can't take what is promised to accepted work, and a bad one says why", async () => {
      const { newWorld } = setup();
      const w = await newWorld(['smith']);
      await w.send('/say', { npc: 'smith', text: 'A hammerhead sword, please.' });
      await w.send('/accept', { contract_id: 'c_001' }); // 3 iron and 1 sharkskin promised
      const robbed = await w.send('/sync', { actor: 'smith', stock: { iron: 0 }, reason: 'thieves' });
      expect(robbed.json).toMatchObject({ ok: false, reason: expect.stringMatching(/3 iron promised to accepted work/), events: [] });
      expect((await w.send('/sync', { actor: 'baron', gold: 1, reason: 'x' })).json).toMatchObject({ ok: false, reason: "there's nobody called 'baron' in this world" });
      // The job still comes due and is delivered.
      expect((await w.send('/tick', { hours: 8 })).json.state.items).toHaveLength(1);
    });
  });

  it('a game can end a world', async () => {
    const { newWorld, call } = setup();
    const w = await newWorld(['smith']);
    expect(await call('DELETE', w.at(), undefined, w.token)).toMatchObject({ status: 200, json: { ok: true } });
    expect((await w.send('')).status).toBe(404);
  });
});
