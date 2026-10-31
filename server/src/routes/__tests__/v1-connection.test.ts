import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { draftKey, NpcDraftSchema, parseNpcBundle, type ApiConnection, type ApiResult, type ApiState, type ApiWorldCreated } from '@blacksmith/shared';
import { describe, expect, it } from 'vitest';
import { mockClient } from '../../models';
import { createApi, type ApiDeps } from '../api';

const fixture = parseNpcBundle(readFileSync(new URL('../../../../docs/workshop-game-integration-task-2/browser-export.npc.json', import.meta.url), 'utf8'));
if (!fixture.ok) throw new Error('Invalid browser export');
const npc = fixture.bundle.npc;
const say = JSON.stringify({ action: 'SAY', say: 'Welcome from the real ledger.' });
const signal = JSON.stringify({ action: 'SIGNAL', signal: 'open_gate', say: 'Come through.' });

function setup(replies: (string | Error)[] = [say], deps: Partial<ApiDeps> = {}) {
  const model = mockClient(replies);
  const app = createApi({ makeModel: () => ({ model: 'scripted', client: model }), ...deps });
  const call = (path: string, token?: string, body?: unknown, method?: string) => app.request(`/api/${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const create = async (draft = npc) => {
    const res = await call('v1/worlds', undefined, { definitions: [draft] });
    expect(res.status).toBe(201);
    const w = await res.json() as ApiWorldCreated;
    return { ...w, at: `v1/worlds/${w.world_id}` };
  };
  const status = async (w: { at: string; token: string }): Promise<ApiConnection> => {
    const res = await call(`${w.at}/connection`, w.token);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const data = await res.json() as ApiConnection;
    expect(JSON.stringify(data)).not.toContain(w.token);
    return data;
  };
  return { app, call, create, status, model };
}

describe('authenticated external reply evidence', () => {
  it('requires the matching world token and exposes only snapshot hashes and private reply metadata', async () => {
    const s = setup(); const a = await s.create(); const b = await s.create();
    for (const token of [undefined, 'wrong', b.token]) expect((await s.call(`${a.at}/connection`, token)).status).toBe(401);
    const data = await s.status(a);
    expect(data.npcs[0]).toEqual({ id: npc.id, name: npc.name,
      snapshot: `sha256:${createHash('sha256').update(draftKey(npc)).digest('hex')}`, first_reply: null, last_say: null });
    expect(s.model.requests).toHaveLength(0);
  });

  it('counts only committed external matching-NPC replies, never Workshop or timer traffic', async () => {
    const s = setup([say, say, signal]); const w = await s.create();
    await s.call('editor/bench/say', undefined, { npc, text: 'Bench hello' });
    await s.call(`${w.at}/tick`, w.token, { hours: 1 });
    expect((await s.status(w)).npcs[0].first_reply).toBeNull();
    const res = await (await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'External hello' })).json() as ApiResult;
    const data = await s.status(w);
    expect(data.npcs[0].first_reply).toEqual({ event_id: res.events.find((e) => e.type === 'SAID' && e.actor === npc.id)!.id, at: expect.any(String) });
    await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Again' });
    expect((await s.status(w)).npcs[0].first_reply).toEqual(data.npcs[0].first_reply);
  });

  it('does not count an actual model-driven timer broadcast or a player line without a reply trigger', async () => {
    const s = setup([say]);
    const w = await s.create({ ...npc, triggers: [{ kind: 'every_hours', hours: 1, cue: 'Greet everyone.' }] });
    const tick = await (await s.call(`${w.at}/tick`, w.token, { hours: 1 })).json() as ApiResult;
    expect(tick.said.some((line) => line.by === npc.id)).toBe(true);
    expect(s.model.requests).toHaveLength(1);
    await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Hello' });
    expect((await s.status(w)).npcs[0].first_reply).toBeNull();
    expect(s.model.requests).toHaveLength(1);
  });

  it('keeps per-NPC evidence distinct inside a multi-character world', async () => {
    const s = setup([say]);
    const created = await s.call('v1/worlds', undefined, { definitions: [npc, { ...npc, id: 'other_ada', name: 'Other Ada' }] });
    const world = await created.json() as ApiWorldCreated;
    const w = { at: `v1/worlds/${world.world_id}`, token: world.token };
    await s.call(`${w.at}/say`, w.token, { npc: 'other_ada', text: 'Hello' });
    const evidence = await s.status(w);
    expect(evidence.npcs[0].first_reply).toBeNull();
    expect(evidence.npcs[1].first_reply).not.toBeNull();
  });

  it('shows a busy world without evidence until the external transaction finishes', async () => {
    let finish!: (value: Awaited<ReturnType<ReturnType<typeof mockClient>['chat']>>) => void;
    const s = setup([], { makeModel: () => ({ model: 'scripted', client: { provider: 'mock', chat: () => new Promise((resolve) => { finish = resolve; }) } }) });
    const w = await s.create();
    const pending = s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Hello' });
    // Enter the async route before inspecting its authenticated status.
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await s.status(w)).toMatchObject({ busy: true, npcs: [{ first_reply: null }] });
    finish({ model: 'scripted', content: say, reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 });
    await pending;
    expect(await s.status(w)).toMatchObject({ busy: false, npcs: [{ first_reply: { event_id: expect.any(String) } }] });
  });

  it.each([
    ['provider outage', [new Error('offline')], 'unavailable'],
    ['rejected proposals', ['{}', '{}'], 'fallback'],
    ['accepted silent action', [JSON.stringify({ action: 'SIGNAL', signal: 'open_gate', say: '' })], 'no_reply'],
  ] as const)('does not count %s as a reply', async (_label, replies, last_say) => {
    const s = setup([...replies]); const w = await s.create();
    await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Hello' });
    expect((await s.status(w)).npcs[0]).toMatchObject({ first_reply: null, last_say });
  });

  it('records missing-provider guidance and preserves earlier successful evidence during an outage', async () => {
    const s = setup([say, new Error('offline')]); const w = await s.create();
    await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Hello' });
    const first = (await s.status(w)).npcs[0].first_reply;
    await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Again' });
    expect((await s.status(w)).npcs[0]).toMatchObject({ first_reply: first, last_say: 'unavailable' });
    const missing = setup([], { makeModel: () => { throw new Error('No key'); } });
    const m = await missing.create();
    expect((await missing.call(`${m.at}/say`, m.token, { npc: npc.id, text: 'Hello' })).status).toBe(503);
    expect((await missing.status(m)).npcs[0]).toMatchObject({ first_reply: null, last_say: 'unavailable' });
  });

  it('never awards evidence when the reply transaction exceeds the event cap', async () => {
    const s = setup([say], { v1: { maxEvents: 1 } }); const w = await s.create();
    expect((await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Hello' })).status).toBe(429);
    expect((await s.status(w))).toMatchObject({ calls_left: 149, npcs: [{ first_reply: null }] });
    const state = await (await s.call(w.at, w.token)).json() as ApiState;
    expect(state.last_event_id).toBeNull();
    expect(state.gold).toBe(w.state.gold);
  });

  it('keeps snapshot/personality/limits isolated after edits and identifies a fresh world separately', async () => {
    const offer = JSON.stringify({ action: 'OFFER', say: 'A pass.', offer: { kind: 'in_stock', good: 'gate pass', qty: 1, price: 0, remarks: '' } });
    const s = setup([offer, offer, offer]); const original = structuredClone(npc); const w = await s.create(original);
    const before = await s.status(w);
    original.persona = 'A completely different person'; original.name = 'Changed Ada';
    original.catalogue.in_stock!.gate_pass.min_price = 100;
    const next = await s.create(original);
    expect((await s.status(w)).npcs).toEqual(before.npcs);
    expect((await s.status(next)).npcs[0].snapshot).not.toBe(before.npcs[0].snapshot);
    const accepted = await (await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'A pass' })).json() as ApiResult;
    expect(accepted.state.contracts).toHaveLength(1); // Original zero-price limit is retained.
    const rejected = await (await s.call(`${next.at}/say`, next.token, { npc: npc.id, text: 'A pass' })).json() as ApiResult;
    expect(rejected.said[0].name).toBe('Changed Ada');
    expect(rejected.outcome).toBe('fallback');
    expect(rejected.state.contracts).toHaveLength(0); // Edited world enforces its higher floor.
    expect(rejected.state.gold).toBe(next.state.gold);
    expect(rejected.state.shops[0].stock).toEqual(next.state.shops[0].stock);
    expect(s.model.requests[0].messages.some((m) => m.content.includes(npc.persona))).toBe(true);
    expect(s.model.requests[0].messages.some((m) => m.content.includes(original.persona))).toBe(false);
  });

  it('continues authenticated status reads at zero call quota without spending calls', async () => {
    const s = setup([new Error('offline')], { v1: { callsPerWorld: 1 } }); const w = await s.create();
    await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Hello' });
    expect((await s.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Again' })).status).toBe(429);
    expect((await s.status(w))).toMatchObject({ calls_left: 0, npcs: [{ first_reply: null }] });
    expect(s.model.requests).toHaveLength(1);
  });

  it('does not restore old worlds after restart; the portable bundle creates a new matching world', async () => {
    const first = setup(); const w = await first.create();
    await first.call(`${w.at}/say`, w.token, { npc: npc.id, text: 'Hello' });
    const restarted = setup();
    expect((await restarted.call(`${w.at}/connection`, w.token)).status).toBe(404);
    const fresh = await restarted.create(NpcDraftSchema.parse(npc));
    expect(fresh.world_id).not.toBe(w.world_id);
    expect((await restarted.status(fresh)).npcs[0]).toMatchObject({ snapshot: (await first.status(w)).npcs[0].snapshot, first_reply: null });
    await restarted.call(`${fresh.at}/say`, fresh.token, { npc: npc.id, text: 'Hello again' });
    expect((await restarted.status(fresh)).npcs[0].first_reply).not.toBeNull();
  });

  it('reports deleted and evicted worlds as unavailable', async () => {
    let now = 0;
    const s = setup([], { v1: { maxWorlds: 1, minIdleMs: 100, now: () => now } });
    const w = await s.create(); now = 101;
    const fresh = await s.create();
    expect((await s.call(`${w.at}/connection`, w.token)).status).toBe(404);
    await s.call(fresh.at, fresh.token, undefined, 'DELETE');
    expect((await s.call(`${fresh.at}/connection`, fresh.token)).status).toBe(404);
  });
});
