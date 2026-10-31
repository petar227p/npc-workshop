import { MAX_WORLD_CREATE_BYTES, MAX_WORLD_DEFINITIONS, NpcDraftSchema, type ApiEvents, type ApiNpc, type ApiResult, type ApiState, type ApiWorldCreated, type NpcDraft } from '@blacksmith/shared';
import { describe, expect, it, vi } from 'vitest';
import { mockClient, type ChatClient, type ChatRequest } from '../../models';
import { NPCS, readDraft } from '../../npcs';
import { createWorldStore } from '../../worlds';
import { createApi, type ApiDeps } from '../api';

const say = JSON.stringify({ action: 'SAY', say: 'Welcome, traveller.' });
const signal = (name: string) => JSON.stringify({ action: 'SIGNAL', signal: name, say: 'Come through.' });
const offer = (price = 8) => JSON.stringify({ action: 'OFFER', say: 'Fresh bread.', offer: { kind: 'in_stock', good: 'moon bread', qty: 1, price, remarks: '' } });
const draft = (overrides: Partial<NpcDraft> = {}): NpcDraft => NpcDraftSchema.parse({
  id: 'ada', name: 'Ada', persona: 'You are Ada, a patient gatekeeper.',
  verbs: ['SAY', 'SIGNAL'], model_verbs: ['SAY', 'SIGNAL'], facts: ['clock', 'signals', 'memories'],
  perception_radius: 20, model: 'muse_spark_open', effort: 'low', location: 'square',
  start: { gold: 0, stock: {} }, catalogue: {}, signals: { open_gate: 'Ask the game to open the gate.' },
  cue: 'Reply briefly.', fallbacks: { rejected: 'Try again.', unavailable: 'Come back later.' }, ...overrides,
});
const seller = () => draft({ verbs: ['SAY', 'OFFER', 'ACCEPT'], model_verbs: ['SAY', 'OFFER'], facts: ['stock', 'catalogue', 'memories'],
  catalogue: { in_stock: { bread: { min_price: 8 } } }, start: { gold: 0, stock: { bread: 3 } }, labels: { bread: 'moon bread' } });

function setup(client: ChatClient = mockClient([say]), overrides: Partial<ApiDeps> = {}) {
  const makeModel = vi.fn(() => ({ client, model: 'scripted' }));
  const app = createApi({ makeModel, ...overrides });
  async function call<T = ApiResult>(method: string, path: string, body?: unknown, token?: string) {
    const res = await app.request(path, { method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() as T };
  }
  async function create(definitions = [draft()], start?: Record<string, { gold: number; stock: Record<string, number> }>) {
    const r = await call<ApiWorldCreated>('POST', '/api/v1/worlds', { definitions, ...(start && { start }) });
    expect(r.status).toBe(201);
    const { world_id, token } = r.json;
    const at = (suffix = '') => `/api/v1/worlds/${world_id}${suffix}`;
    return { ...r.json, at, send: <T = ApiResult>(suffix: string, body?: unknown) => call<T>(body === undefined ? 'GET' : 'POST', at(suffix), body, token) };
  }
  return { app, makeModel, call, create };
}

describe('API worlds made directly from Workshop drafts', () => {
  it('stops reading an oversized streamed world request at the API body limit', async () => {
    const { app } = setup();
    let chunksRead = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksRead++;
        controller.enqueue(new Uint8Array(1024 * 1024));
        if (chunksRead === 10) controller.close();
      },
    }, { highWaterMark: 0 });
    const request = new Request('http://localhost/api/v1/worlds', {
      method: 'POST', body: stream, duplex: 'half', headers: { 'content-type': 'application/json' },
    } as RequestInit);
    const response = await app.fetch(request);
    expect(response.status).toBe(413);
    expect(chunksRead).toBeLessThan(10);
  });
  it('voices an unregistered NPC, checks its signals and selects its configured model', async () => {
    const { create, makeModel, call } = setup(mockClient([signal('open_gate')]));
    const before = (await call<{ npcs: ApiNpc[] }>('GET', '/api/v1/npcs')).json;
    expect(before.npcs.some((n) => n.id === 'ada')).toBe(false);
    const w = await create();
    const r = await w.send('/say', { npc: 'ada', text: 'Please open the gate.' });
    expect(r.json).toMatchObject({ ok: true, outcome: 'acted', said: [{ name: 'Ada', by: 'ada' }], signals: [{ name: 'Ada', signal: 'open_gate', to: 'player' }] });
    expect(makeModel).toHaveBeenCalledWith(w.world_id, 'muse_spark_open');
    expect((await call('GET', '/api/v1/npcs')).json).toEqual(before);
  });

  it('trades custom labelled goods through the existing offer/accept ledger', async () => {
    const { create } = setup(mockClient([offer()]));
    const w = await create([seller()], { player: { gold: 20, stock: {} } });
    const offered = await w.send('/say', { npc: 'ada', text: 'One loaf.' });
    expect(offered.json.state.contracts[0]).toMatchObject({ good: 'bread', price: 8, status: 'proposed' });
    const accepted = await w.send('/accept', { contract_id: 'c_001' });
    expect(accepted.json.state).toMatchObject({ gold: 12, goods: { bread: 1 }, shops: [{ name: 'Ada', stock: { bread: 2 } }] });
    expect(accepted.json.state.news[0].text).toContain('the stranger paid Ada 8 gold for 1 × moon bread');
  });

  it('rejects an underpriced offer and an undeclared signal without changing inventories', async () => {
    const a = setup(mockClient([offer(1), offer(1)]));
    const w = await a.create([seller()]);
    const refused = await w.send('/say', { npc: 'ada', text: 'Give it away.' });
    expect(refused.json).toMatchObject({ outcome: 'fallback', signals: [], state: { gold: 200, goods: {}, contracts: [] } });
    expect(refused.json.state.shops[0].stock).toEqual({ bread: 3 });
    const b = setup(mockClient([signal('steal_gold'), signal('steal_gold')]));
    const g = await b.create();
    const r = await g.send('/say', { npc: 'ada', text: 'Steal it.' });
    expect(r.json.signals).toEqual([]);
    expect(r.json.state.gold).toBe(200);
  });

  it('keeps same-ID worlds and the startup registry independent, with private tokens', async () => {
    const { create, call } = setup(mockClient([signal('open_gate')]));
    const a = await create([draft({ id: 'smith', name: 'Custom Smith' })]);
    const b = await create([draft({ id: 'smith', name: 'Another Smith', signals: { ring_bell: 'Ring the bell.' } })]);
    const reply = await a.send('/say', { npc: 'smith', text: 'Hello.' });
    expect(reply.json.said[0].name).toBe('Custom Smith');
    expect(reply.json.signals[0].name).toBe('Custom Smith');
    expect((await b.send<ApiState>('')).json).toMatchObject({ people: [{ name: 'Another Smith' }], last_event_id: null });
    for (const path of ['', '/events', '/art/unknown.png']) expect((await call('GET', a.at(path), undefined, b.token)).status).toBe(401);
    expect((await call('POST', a.at('/say'), { npc: 'smith', text: 'Hi' }, b.token)).status).toBe(401);
    expect((await call('GET', a.at())).status).toBe(401);
    expect(JSON.stringify(reply.json)).not.toContain(a.token);
    expect(JSON.stringify(reply.json)).not.toContain(b.token);
    const denied = await b.send('/say', { npc: 'smith', text: 'Open the gate.' });
    expect(denied.json.signals).toEqual([]);
    expect(denied.json.said[0].name).toBe('Another Smith');
    expect(NPCS.find((n) => n.id === 'smith')?.name).toBe('Brann');
  });

  it.each([
    ['off-map home', [draft({ location: 'moon' })], /definitions\.0.*no place called 'moon'/],
    ['off-map schedule', [draft({ schedule: [{ from: 9, place: 'moon' }] })], /definitions\.0.*no place called 'moon'/],
    ['missing SAY', [draft({ verbs: ['SIGNAL'], model_verbs: ['SIGNAL'] })], /must be allowed SAY/],
    ['missing signal facts', [draft({ facts: ['clock'] })], /SIGNAL needs/],
    ['second invalid draft', [draft(), draft({ id: 'bea', verbs: ['SAY', 'OFFER'], model_verbs: ['SAY', 'OFFER'] })], /definitions\.1.*catalogue/],
    ['conflicting labels', [draft({ labels: { bread: 'moon bread' } }), draft({ id: 'bea', labels: { bread: 'sun bread' } })], /labels\.bread/],
  ])('rejects %s before spending world-creation quota', async (_name, definitions, error) => {
    const { call, create, makeModel } = setup(undefined, { v1: { maxNewPerMinute: 1, maxWorlds: 1 } });
    const r = await call<{ error: string }>('POST', '/api/v1/worlds', { definitions });
    expect(r).toMatchObject({ status: 400, json: { error: expect.stringMatching(error) } });
    await create();
    expect(makeModel).not.toHaveBeenCalled();
  });

  it('rejects mixed, duplicate, reserved, unknown-start and malformed definitions without consuming a slot', async () => {
    const { call, create } = setup(undefined, { v1: { maxNewPerMinute: 1 } });
    for (const input of [null, '{bad', { definitions: [] }, { definitions: [draft()], npcs: ['smith'] },
      { definitions: [draft(), draft()] }, { definitions: [{ ...draft(), id: 'player' }] },
      { definitions: [draft()], start: { merchant: { gold: 0, stock: {} } } },
      { definitions: [{ ...draft(), model_verbs: ['CUSTOM'] }] }, { definitions: [{ ...draft(), token: 'secret' }] }]) {
      expect((await call('POST', '/api/v1/worlds', input)).status).toBe(400);
    }
    await create();
  });

  it('bounds draft count independently and applies the same creation/store quotas', async () => {
    const { call, create } = setup(undefined, { v1: { maxNewPerMinute: 1, maxWorlds: 1 } });
    const drafts = Array.from({ length: MAX_WORLD_DEFINITIONS + 1 }, (_, i) => draft({ id: `npc_${i}` }));
    expect((await call('POST', '/api/v1/worlds', { definitions: drafts })).status).toBe(400);
    await create(drafts.slice(0, MAX_WORLD_DEFINITIONS));
    expect((await call('POST', '/api/v1/worlds', { definitions: [draft()] })).status).toBe(429);
    const full = setup(undefined, { v1: { maxWorlds: 1 } });
    await full.create();
    expect((await full.call('POST', '/api/v1/worlds', { definitions: [draft()] })).status).toBe(503);
  });

  it('accepts picture-bearing drafts above 16 KiB and enforces raw byte and action limits', async () => {
    const { call, create } = setup();
    const art = { style: 'Blue ink', references: [`data:image/png;base64,${'AAAA'.repeat(10_000)}`] };
    const w = await create([draft({ art })]);
    expect((await w.send('/say', { npc: 'ada', text: 'Hi', padding: ' '.repeat(17_000) })).status).toBe(413);
    expect((await call('POST', '/api/v1/worlds', ' '.repeat(MAX_WORLD_CREATE_BYTES) + '{}')).status).toBe(413);
    expect((await call('POST', '/api/v1/worlds', JSON.stringify({ definitions: [draft()] }) + ' '.repeat(MAX_WORLD_CREATE_BYTES))).status).toBe(413);
    const res = await setup().app.request('/api/v1/worlds', { method: 'POST', headers: { 'content-length': String(MAX_WORLD_CREATE_BYTES + 1) }, body: '{}' });
    expect(res.status).toBe(413);
  });

  it('rejects a chunked multibyte payload before creating any world', async () => {
    const { app, create } = setup(undefined, { v1: { maxWorlds: 1, maxNewPerMinute: 1 } });
    const chunk = new TextEncoder().encode('🌙'.repeat(128 * 1024));
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      for (let i = 0; i < 9; i++) controller.enqueue(chunk);
      controller.close();
    } });
    const request = new Request('http://localhost/api/v1/worlds', { method: 'POST', body, duplex: 'half' } as RequestInit);
    const res = await app.request(request);
    expect(res.status).toBe(413);
    await create();
  });

  it('takes an owned nested snapshot and rebuilds facts, model words, history and schedules from it', () => {
    const input = seller();
    input.art = { style: 'Ink', references: ['data:image/png;base64,AAAA'] };
    input.schedule = [{ from: 0, place: 'square' }, { from: 9, place: 'gate' }];
    const start = { ada: { gold: 7, stock: { bread: 2 } }, player: { gold: 30, stock: {} } };
    const store = createWorldStore();
    const a = store.create(null, [input], start);
    expect(a.ok).toBe(true);
    if (!a.ok) throw new Error(a.error);
    input.persona = 'Edited persona'; input.name = 'Edited Ada'; input.labels.bread = 'new bread';
    input.catalogue.in_stock!.bread.min_price = 99; input.signals.open_gate = 'Edited signal';
    input.art.references[0] = 'data:image/png;base64,BBBB'; input.art.style = 'Paint'; input.schedule[1].place = 'tavern';
    start.ada.gold = 100; start.ada.stock.bread = 99;
    const old = a.entry.cast[0];
    expect(old).toMatchObject({ name: 'Ada', prompt: 'You are Ada, a patient gatekeeper.', start: { gold: 7, stock: { bread: 2 } },
      catalogue: { in_stock: { bread: { min_price: 8 } } }, labels: { bread: 'moon bread' },
      art: { style: 'Ink', references: ['data:image/png;base64,AAAA'] }, schedule: [{ from: 0, place: 'square' }, { from: 9, place: 'gate' }],
      signals: { open_gate: 'Ask the game to open the gate.' } });
    expect(old.facts(a.entry.world, 'player')).toContain('moon bread: at least 8 gold');
    expect(JSON.stringify(old.schema)).toContain('moon bread');
    expect(JSON.stringify(old.schema)).not.toContain('new bread');
    const b = store.create(null, [input]);
    expect(b.ok && b.entry.cast[0].prompt).toBe('Edited persona');
    expect(b.ok && b.entry.cast[0].facts(b.entry.world, 'player')).toContain('new bread: at least 99 gold');
  });

  it('uses cast labels in other NPC facts, memories and news without registry fallback', async () => {
    const requests: ChatRequest[] = [];
    const base = mockClient([offer(), say, say]);
    const client: ChatClient = { provider: 'mock', chat(req) { requests.push(structuredClone(req)); return base.chat(req); } };
    const { create } = setup(client);
    const w = await create([seller(), draft({ id: 'merchant', name: 'Custom Merchant', verbs: ['SAY'], model_verbs: ['SAY'],
      start: { gold: 0, stock: { bread: 1 } }, facts: ['inventory', 'memories'], triggers: [{ kind: 'on_spoken_to' }, { kind: 'on_meet', cue: 'Greet your neighbour.' }] })]);
    await w.send('/say', { npc: 'ada', text: 'A loaf.' });
    await w.send('/accept', { contract_id: 'c_001' });
    await w.send('/say', { npc: 'merchant', text: 'What happened?' });
    const facts = requests[1].messages[1].content;
    expect(facts).toContain('moon bread 1');
    expect(facts).toContain('the stranger paid Ada 8 gold');
  });

  it('uses local names in meeting conversations, heard memories and told-by views', async () => {
    const tell = JSON.stringify({ action: 'TELL', event_id: 'e_0001', say: 'A dragon arrived.' });
    const client = mockClient([tell, say]);
    const { create } = setup(client);
    const teller = draft({ id: 'smith', name: 'Local Smith', verbs: ['SAY', 'TELL'], model_verbs: ['SAY', 'TELL'],
      facts: ['memories'], triggers: [{ kind: 'on_meet', cue: 'Share the news.' }],
      schedule: [{ from: 0, place: 'square' }, { from: 10, place: 'gate' }] });
    const listener = draft({ id: 'merchant', name: 'Local Merchant', location: 'gate', perception_radius: 0,
      verbs: ['SAY'], model_verbs: ['SAY'], facts: ['memories'] });
    const w = await create([teller, listener]);
    await w.send('/report', { text: 'A dragon arrived.', place: 'square', involved: [], seen_by: { kind: 'only', ids: ['smith'] } });
    // Leave a prior conversation between these two so meeting history must resolve the other speaker.
    const store = createWorldStore();
    const made = store.create(null, [teller, listener]);
    if (!made.ok) throw new Error(made.error);
    const spoken = made.entry.act(made.entry.world, 'merchant', { action: 'SAY', text: 'Greetings.' }, { to: 'smith' });
    expect(made.entry.cast[0].history(spoken.world, 'merchant')).toContain('Local Merchant: "Greetings."');
    // At 10:00 the smith reaches the gate and meets the merchant with private news to tell.
    const tick = await w.send('/tick', { hours: 2 });
    expect(tick.json.said[0]).toMatchObject({ name: 'Local Smith', to: 'merchant' });
    expect(client.requests[0].messages.at(-1)!.content).toContain('You have just run into Local Merchant');
    const known = tick.json.state.news[0].knowers.find((n) => n.id === 'merchant');
    expect(known).toMatchObject({ told_by: 'Local Smith', how: 'told_by' });
    await w.send('/say', { npc: 'merchant', text: 'What did you hear?' });
    expect(client.requests.at(-1)!.messages[1].content).toContain('Local Smith told you');
  });

  it('never borrows labels from the village registry', async () => {
    const labelled = NPCS.flatMap((n) => Object.entries(n.labels ?? {})).find(([id, label]) => id !== label);
    expect(labelled).toBeDefined();
    const [good, registryLabel] = labelled!;
    const client = mockClient([say]);
    const { create } = setup(client);
    const w = await create([draft({ verbs: ['SAY'], model_verbs: ['SAY'], start: { gold: 0, stock: { [good]: 2 } }, facts: ['inventory'] })]);
    await w.send('/say', { npc: 'ada', text: 'What do you hold?' });
    expect(client.requests[0].messages[1].content).toContain(`${good} 2`);
    expect(client.requests[0].messages[1].content).not.toContain(registryLabel);
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])('enforces the final call across repairs (provider throws: %s, registry: %s)', async (throws, registry) => {
    const chat = vi.fn(async () => { if (throws) throw new Error('provider down'); return { model: 'scripted', content: 'invalid', reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 }; });
    const { create, call } = setup({ provider: 'mock', chat }, { v1: { callsPerWorld: 1 } });
    if (registry) {
      const made = await call<ApiWorldCreated>('POST', '/api/v1/worlds', { npcs: ['smith'] });
      const path = `/api/v1/worlds/${made.json.world_id}/say`;
      const r = await call('POST', path, { npc: 'smith', text: 'Hello.' }, made.json.token);
      expect(r.json.state.calls_left).toBe(0);
      expect(chat).toHaveBeenCalledTimes(1);
      expect((await call('POST', path, { npc: 'smith', text: 'Again.' }, made.json.token)).status).toBe(429);
      return;
    }
    const w = await create();
    const r = await w.send('/say', { npc: 'ada', text: 'Hello.' });
    expect(r.status).toBe(200);
    expect(r.json.outcome).toBe('unavailable');
    expect(r.json.state.calls_left).toBe(0);
    expect(chat).toHaveBeenCalledTimes(1);
    expect((await w.send('/say', { npc: 'ada', text: 'Again.' })).status).toBe(429);
  });

  it('charges triggered calls immediately so a batch cannot overrun its quota', async () => {
    const client = mockClient([say]);
    const chat = vi.spyOn(client, 'chat');
    const { create } = setup(client, { v1: { callsPerWorld: 1 } });
    const timed = (id: string) => draft({ id, triggers: [{ kind: 'every_hours', hours: 1, cue: 'Call out.' }] });
    const w = await create([timed('ada'), timed('bea'), timed('cyra')]);
    const r = await w.send('/tick', { hours: 1 });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(r.json.state.calls_left).toBe(0);
    expect(r.json.events.filter((e) => e.type === 'TRIGGER_FIRED')).toHaveLength(1);
  });

  it('reserves global call quota before an in-flight request finishes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const base = mockClient([say]);
    const chat = vi.fn(async (req: ChatRequest) => { await gate; return base.chat(req); });
    const { create } = setup({ provider: 'mock', chat }, { v1: { callsPerMinute: 1 } });
    const a = await create(); const b = await create();
    const pending = a.send('/say', { npc: 'ada', text: 'Hi.' });
    await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
    try { expect((await b.send('/say', { npc: 'ada', text: 'Hi.' })).status).toBe(429); } finally { release(); }
    expect((await pending).status).toBe(200);
  });

  it('rolls back an over-cap sale atomically and keeps persisted events under the hard cap', async () => {
    const { create } = setup(mockClient([offer()]), { v1: { maxEvents: 3 } });
    const w = await create([seller()]);
    expect((await w.send('/say', { npc: 'ada', text: 'A loaf.' })).json.events).toHaveLength(3);
    expect((await w.send('/accept', { contract_id: 'c_001' })).status).toBe(429);
    expect((await w.send<ApiState>('')).json).toMatchObject({ gold: 200, goods: {}, contracts: [{ status: 'proposed' }] });
    expect((await w.send<ApiEvents>('/events')).json.events).toHaveLength(3);
  });

  it('rolls back made-to-order acceptance at the cap before charging gold or starting artwork', async () => {
    const makeArtist = vi.fn();
    const client = mockClient([JSON.stringify({ action: 'OFFER', say: 'A blade for you.', offer: {
      kind: 'made_to_order', item_name: 'Moon blade', item_type: 'sword', description: 'A sturdy blade.',
      stats: { damage: 14, weight: 6, durability: 70 }, materials: [{ material: 'iron', qty: 3 }, { material: 'sharkskin_leather', qty: 1 }],
      price: 120, delivery_ticks: 8, remarks: '',
    } })]);
    const { create } = setup(client, { v1: { maxEvents: 4 }, makeArtist });
    const w = await create([{ ...readDraft('smith'), id: 'ada', name: 'Ada' }]);
    expect((await w.send('/say', { npc: 'ada', text: 'A blade.' })).json.outcome).toBe('acted');
    const r = await w.send('/accept', { contract_id: 'c_001' });
    expect(r.status).toBe(429); // ACCEPT + WORK_STARTED needs two slots, only one remains
    expect((await w.send<ApiState>('')).json).toMatchObject({ gold: 200, goods: {}, contracts: [{ status: 'proposed' }] });
    expect((await w.send<ApiEvents>('/events')).json.events).toHaveLength(3);
    expect(makeArtist).not.toHaveBeenCalled();
  });

  it('rolls back dialogue and triggered time/news transactions that cross the cap but counts calls spent', async () => {
    const { create } = setup(mockClient([signal('open_gate')]), { v1: { maxEvents: 2 } });
    const w = await create();
    expect((await w.send('/say', { npc: 'ada', text: 'Hello.' })).status).toBe(429); // player + SIGNAL + SAY
    expect((await w.send<ApiState>('')).json).toMatchObject({ last_event_id: null, calls_left: 149 });
    const timed = await create([draft({ triggers: [{ kind: 'every_hours', hours: 1, cue: 'Call out.' }, { kind: 'on_new_memory', cue: 'News!' }] })]);
    expect((await timed.send('/tick', { hours: 1 })).status).toBe(429);
    expect((await timed.send<ApiState>('')).json).toMatchObject({ tick: 0, last_event_id: null });
    expect((await timed.send('/report', { text: 'A dragon arrived.', place: 'square', involved: [], seen_by: { kind: 'everyone' } })).status).toBe(429);
    expect((await timed.send<ApiState>('')).json.last_event_id).toBeNull();
  });

  it('builds selected startup drafts with owned data while preserving legacy creation requests', async () => {
    const { call } = setup();
    for (const input of [undefined, {}, { npcs: ['smith'] }, { start: { player: { gold: 3, stock: {} } } }]) {
      expect((await call('POST', '/api/v1/worlds', input)).status).toBe(201);
    }
    const seed = readDraft('smith');
    const store = createWorldStore();
    const w = store.create(null, [seed]);
    expect(w.ok && w.entry.cast[0].catalogue).not.toBe(seed.catalogue);
  });
});
