import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BenchResponse, EditorLibrary, NpcDraft, PreviewResponse, SaveResponse, StateView } from '@blacksmith/shared';
import { describe, expect, it } from 'vitest';
import { mockClient, type ChatClient, type ChatRequest } from '../../models';
import { npcFiles, readDraft } from '../../npcs';
import { createApi, type ApiDeps } from '../api';

const say = (text: string) => JSON.stringify({ action: 'SAY', say: text });
const offer = JSON.stringify({
  action: 'OFFER',
  say: 'Here is what I can do.',
  offer: {
    kind: 'made_to_order',
    item_name: 'Hammerhead Blade',
    item_type: 'sword',
    description: 'A broad blade',
    stats: { damage: 14, weight: 6, durability: 70 },
    materials: [{ material: 'iron', qty: 3 }],
    price: 120,
    delivery_ticks: 8,
    remarks: 'Heavy at the head.',
  },
  contract_id: null,
});

const miller: NpcDraft = {
  id: 'miller',
  name: 'Odda',
  persona: 'You voice Odda, the miller. Talk about flour.',
  verbs: ['SAY'],
  model_verbs: ['SAY'],
  facts: ['clock'],
  perception_radius: 3,
  model: 'muse_spark_open',
  location: 'mill',
  start: { gold: 5, stock: {} },
  catalogue: {},
  cue: 'Reply to the customer.',
  fallbacks: { rejected: 'Eh?', unavailable: 'The wheel is loud. Later.' },
};

function setup(replies: string[] = [], deps: Partial<ApiDeps> = {}, client: ChatClient = mockClient(replies)) {
  const choices: string[] = []; // which model each new client was made for
  const app = createApi({
    makeModel: (_id, choice) => {
      choices.push(choice);
      return { client, model: `test-${choice}` };
    },
    ...deps,
  });
  // Each browser keeps its own cookie, so one app can serve several visitors.
  const browser = () => {
    let cookie = '';
    return async <T>(path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await app.request(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(cookie && { cookie }), ...(body !== undefined && { 'content-type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, json: (await res.json()) as T };
    };
  };
  return { send: browser(), browser, choices, client: client as ChatClient & { requests: ChatRequest[] } };
}

// An empty npcs/ + prompts/ pair in a temp folder, so save tests never touch the repo.
function tempFiles() {
  const root = mkdtempSync(join(tmpdir(), 'npcs-'));
  const dirs = { npcs: pathToFileURL(`${root}/`), prompts: pathToFileURL(`${root}/`) };
  return { dirs, files: npcFiles(dirs), path: (f: string) => join(root, f) };
}

describe('NPC editor api', () => {
  it('the library lists the NPC files with their personas; saving is off by default', async () => {
    const r = await setup().send<EditorLibrary>('/api/editor/library');
    expect(r.json.can_save).toBe(false);
    const brann = r.json.npcs.find((n) => n.id === 'smith');
    expect(brann).toMatchObject({ name: 'Brann', model_verbs: ['SAY', 'OFFER', 'COUNTER_OFFER', 'REFUSE'] });
    expect(brann?.persona).toMatch(/You voice Brann/);
  });

  it('preview returns the generated schema and the facts, or every problem with the draft', async () => {
    const { send } = setup();
    const ok = await send<PreviewResponse>('/api/editor/preview', { npc: miller });
    expect(ok.json).toMatchObject({ ok: true, facts: 'Hour 0. Jobs in hand: 0.' });
    expect(ok.json.ok && ok.json.schema).toMatchObject({ required: ['action', 'say'] });

    const bad = await send<PreviewResponse>('/api/editor/preview', {
      npc: { ...miller, id: 'player', facts: ['clock', 'secrets'] },
    });
    expect(bad.json.ok).toBe(false);
    expect(bad.json.errors.join('\n')).toMatch(/id: that id is taken by the player/);
    expect(bad.json.errors.join('\n')).toMatch(/facts\.1: Invalid enum value/);

    const loose = await send<PreviewResponse>('/api/editor/preview', { npc: { ...miller, model_verbs: ['SAY', 'REFUSE'] } });
    expect(loose.json.errors).toEqual(["miller: model verb REFUSE isn't in its allowed verbs"]);
  });

  it('the bench runs a draft on its own world; the village world is untouched', async () => {
    const { send, client } = setup([say('Fresh flour, today only.')]);
    const r = await send<BenchResponse>('/api/editor/bench/say', { npc: miller, text: 'Got any flour?' });
    expect(r.json).toMatchObject({ ok: true, outcome: 'acted' });
    expect(r.json.events.map((e) => [e.type, e.actor])).toEqual([
      ['SAID', 'player'],
      ['SAID', 'miller'],
    ]);
    expect(r.json.attempts).toEqual([expect.objectContaining({ ok: true, reason: null })]);
    expect(client.requests[0].messages[0].content).toBe(miller.persona);
    expect(client.requests[0].json_schema?.name).toBe('miller_action');

    const village = await send<StateView>('/api/state');
    expect(village.json.events).toEqual([]);
  });

  it('the bench voices a draft with the model it picked, one client per model per visit', async () => {
    const { send, client, choices } = setup([say('Flour.'), say('Steel.'), say('More flour.')]);
    await send('/api/editor/bench/say', { npc: miller, text: 'Hi' });
    await send('/api/editor/bench/reset', {});
    await send('/api/editor/bench/say', { npc: { ...miller, model: 'muse_spark' }, text: 'Hi' });
    await send('/api/editor/bench/say', { npc: miller, text: 'Hi again' });
    expect(choices).toEqual(['muse_spark_open', 'muse_spark']);
    expect(client.requests.map((r) => r.model)).toEqual(['test-muse_spark_open', 'test-muse_spark', 'test-muse_spark_open']);
    const bad = await send<PreviewResponse>('/api/editor/preview', { npc: { ...miller, model: 'gpt' } });
    expect(bad.json.ok).toBe(false);
  });

  it("a draft's model can't use a verb the draft doesn't allow; the ledger rejects it and the fallback is said", async () => {
    const { send } = setup([offer, offer]);
    const r = await send<BenchResponse>('/api/editor/bench/say', { npc: miller, text: 'Forge me a sword.' });
    expect(r.json.outcome).toBe('fallback');
    expect(r.json.attempts.map((a) => a.reason)).toEqual(['miller may not use OFFER', 'miller may not use OFFER']);
    expect(r.json.view.contracts).toEqual([]);
    expect(r.json.events.at(-1)).toMatchObject({ type: 'SAID', actor: 'miller', data: { text: 'Eh?' } });
  });

  it('a draft that may offer contracts gets them checked by the same rules, under its own name', async () => {
    const { send } = setup([offer]);
    const { catalogue, start } = readDraft('smith');
    const trader = { ...miller, verbs: ['SAY', 'OFFER', 'START_WORK'], model_verbs: ['SAY', 'OFFER'], catalogue, start };
    const r = await send<BenchResponse>('/api/editor/bench/say', { npc: trader, text: 'A sword.' });
    expect(r.json.view.contracts).toEqual([expect.objectContaining({ contract_id: 'c_001', price: 120, status: 'proposed', seller: 'miller' })]);
    expect(r.json.events.find((e) => e.type === 'CONTRACT_PROPOSED')).toMatchObject({ actor: 'miller', location: 'mill' });
    // The bench world gives the draft its own starting stock, shown under its name.
    expect(r.json.view.shops).toEqual([{ id: 'miller', name: 'Odda', stock: start.stock }]);
  });

  it('a broken draft runs nothing, and reset clears the bench', async () => {
    const { send, client } = setup([say('Hello.')]);
    const broken = await send<BenchResponse>('/api/editor/bench/say', { npc: { ...miller, verbs: ['REFUSE'] }, text: 'Hi' });
    expect(broken.json.ok).toBe(false);
    expect(broken.json.errors).toEqual(['miller: an NPC must be allowed SAY']);
    expect(client.requests).toHaveLength(0);

    await send('/api/editor/bench/say', { npc: miller, text: 'Hi' });
    const reset = await send<BenchResponse>('/api/editor/bench/reset', {});
    expect(reset.json.view.events).toEqual([]);
  });

  it('saving is refused unless the server allows it, and a bad draft is never written', async () => {
    expect((await setup().send('/api/editor/save', { npc: miller })).status).toBe(403);
    const r = await setup([], { canSaveNpcs: true }).send<{ ok: boolean; errors: string[] }>('/api/editor/save', {
      npc: { ...miller, id: 'Bad Id' },
    });
    expect(r.json.ok).toBe(false);
    expect(r.json.errors[0]).toMatch(/^id: lowercase letters/);
  });

  it('saving never overwrites an existing NPC unless asked, and writes both files', async () => {
    const { dirs, files, path } = tempFiles();
    const { send } = setup([], { canSaveNpcs: true, npcFiles: files });
    expect((await send<SaveResponse>('/api/editor/save', { npc: miller })).json).toEqual({ ok: true, errors: [] });
    expect(readDraft('miller', dirs)).toEqual({ ...miller, persona: `${miller.persona}\n` });

    const changed = { ...miller, persona: 'You voice Odda. Grumpy today.' };
    expect((await send<SaveResponse>('/api/editor/save', { npc: changed })).json).toMatchObject({ ok: false, exists: true });
    expect(readFileSync(path('miller.md'), 'utf8')).toBe(`${miller.persona}\n`);

    expect((await send<SaveResponse>('/api/editor/save', { npc: changed, overwrite: true })).json.ok).toBe(true);
    expect(readFileSync(path('miller.md'), 'utf8')).toBe('You voice Odda. Grumpy today.\n');
    expect(existsSync(path('miller.json.tmp'))).toBe(false);
    // The library follows saves without re-reading the disk.
    expect((await send<EditorLibrary>('/api/editor/library')).json.npcs.map((n) => n.persona)).toEqual(['You voice Odda. Grumpy today.']);
  });

  it('saving is refused from another site, or without a JSON body', async () => {
    const { files, path } = tempFiles();
    const { send } = setup([], { canSaveNpcs: true, npcFiles: files });
    const crossSite = await send('/api/editor/save', { npc: miller }, { 'sec-fetch-site': 'cross-site' });
    expect(crossSite.status).toBe(403);
    // A form or no-cors fetch can only send text/plain without a preflight.
    const plain = await send('/api/editor/save', JSON.stringify({ npc: miller }), { 'content-type': 'text/plain' });
    expect(plain.status).toBe(403);
    expect(existsSync(path('miller.json'))).toBe(false);
  });

  it('the bench has a per-visit and a per-minute quota, and clips what it echoes', async () => {
    const long = say(`${'flour '.repeat(800)}`);
    const { browser } = setup([long, say('b'), say('c')], { bench: { perSession: 1, perMinute: 2 } });
    const a = browser();
    const first = await a<BenchResponse>('/api/editor/bench/say', { npc: miller, text: 'Hi' });
    expect(first.json.attempts[0].content).toMatch(/… \(clipped\)$/);
    expect(first.json.attempts[0].content.length).toBeLessThan(3100);
    expect((await a('/api/editor/bench/say', { npc: miller, text: 'Again' })).status).toBe(429);

    const b = browser();
    expect((await b('/api/editor/bench/say', { npc: miller, text: 'Hi' })).status).toBe(200);
    expect((await browser()('/api/editor/bench/say', { npc: miller, text: 'Hi' })).status).toBe(429); // third turn this minute
  });

  it('a long persona fits the editor body limit', async () => {
    const persona = '鍛冶屋'.repeat(2000); // 6000 characters, 18 KB of UTF-8
    const r = await setup().send<PreviewResponse>('/api/editor/preview', { npc: { ...miller, persona } });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
  });

  it('while the bench is answering, the forge says so (not that Brann is)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: ChatClient = {
      provider: 'mock',
      async chat(req) {
        await gate;
        return { model: req.model, content: say('Flour.'), reasoning: null, finish_reason: 'stop', usage: null, latency_ms: 0 };
      },
    };
    const { send } = setup([], {}, slow);
    await send('/api/editor/bench/reset', {}); // holds a session cookie before the slow turn
    const turn = send<BenchResponse>('/api/editor/bench/say', { npc: miller, text: 'Flour?' });
    await new Promise((r) => setTimeout(r, 0));
    expect((await send<{ error: string }>('/api/say', { text: 'hello?' })).json.error).toBe('The workshop bench is still answering.');
    release();
    expect((await turn).json.outcome).toBe('acted');
  });
});
