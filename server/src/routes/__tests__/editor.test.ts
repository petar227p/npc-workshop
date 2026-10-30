import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAX_REFERENCE_BYTES, type BenchResponse, type EditorLibrary, type NpcDraft, type PreviewResponse, type SaveResponse, type SketchResponse, type StateView } from '@blacksmith/shared';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { mockClient, mockImageClient, type ChatClient, type ChatRequest } from '../../models';
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
  effort: 'medium',
  location: 'cottage',
  schedule: [],
  sprite: 98,
  art: { style: '', references: [] },
  start: { gold: 5, stock: {} },
  catalogue: {},
  labels: {},
  triggers: [{ kind: 'on_spoken_to' }],
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
// A render with something in it (the sprite step refuses an empty one), and a tiny reference picture.
function render(): Buffer {
  const png = new PNG({ width: 60, height: 60 });
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) png.data.set(x > 20 && x < 40 && y > 10 && y < 50 ? [120, 90, 60, 255] : [237, 236, 231, 255], (y * 60 + x) * 4);
  return PNG.sync.write(png);
}
const pngUrl = (width = 2) => `data:image/png;base64,${PNG.sync.write(new PNG({ width, height: 2 })).toString('base64')}`;

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
    expect(ok.json).toMatchObject({ ok: true, facts: 'It is Day 1 · 08:00. Jobs in hand: 0.' });
    expect(ok.json.ok && ok.json.schema).toMatchObject({ required: ['action', 'say'] });

    const bad = await send<PreviewResponse>('/api/editor/preview', {
      npc: { ...miller, id: 'player', facts: ['clock', 'secrets'] },
    });
    expect(bad.json.ok).toBe(false);
    expect(bad.json.errors.join('\n')).toMatch(/id: that id is taken: player, world, clock are the engine's own/);
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

  it('a draft edited to start with other stock gets a fresh bench world, not the first one', async () => {
    const { send } = setup([say('Flour.'), say('More flour.')]);
    const first = await send<BenchResponse>('/api/editor/bench/say', { npc: miller, text: 'Hi' });
    const richer = { ...miller, start: { ...miller.start, gold: miller.start.gold + 500 } };
    const second = await send<BenchResponse>('/api/editor/bench/say', { npc: richer, text: 'Hi' });
    expect(second.json.view.events.length).toBe(first.json.events.length);
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

  it('the bench thinks at the level the draft picked; a draft from before the picker thinks at low', async () => {
    const { send, client } = setup([say('Flour.'), say('Flour.'), say('Flour.')]);
    await send('/api/editor/bench/say', { npc: miller, text: 'Hi' });
    await send('/api/editor/bench/say', { npc: { ...miller, effort: 'high' }, text: 'Hi' });
    const { effort: _, ...old } = miller;
    await send('/api/editor/bench/say', { npc: old, text: 'Hi' });
    expect(client.requests.map((r) => r.reasoning_effort)).toEqual(['medium', 'high', 'low']);
    const bad = await send<PreviewResponse>('/api/editor/preview', { npc: { ...miller, effort: 'xhigh' } });
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
    expect(r.json.events.find((e) => e.type === 'CONTRACT_PROPOSED')).toMatchObject({ actor: 'miller', location: 'cottage' });
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

  it('a draft on a timer acts on the bench when its hours come round, and only then calls the model', async () => {
    const crier: NpcDraft = { ...miller, triggers: [{ kind: 'every_hours', hours: 6, cue: 'Call out the news.' }] };
    const { send, client } = setup([say('Hear ye! Flour is cheap today.')]);
    const early = await send<BenchResponse>('/api/editor/bench/tick', { npc: crier, ticks: 5 });
    expect(early.json.events.map((e) => e.type)).toEqual(['CLOCK_ADVANCED']);
    expect(client.requests).toHaveLength(0);

    const due = await send<BenchResponse>('/api/editor/bench/tick', { npc: crier, ticks: 1 });
    expect(due.json).toMatchObject({ ok: true, outcome: 'acted' });
    expect(due.json.events.map((e) => [e.type, e.actor, e.target])).toEqual([
      ['CLOCK_ADVANCED', 'clock', null],
      ['TRIGGER_FIRED', 'miller', null],
      ['SAID', 'miller', null],
    ]);
    expect(client.requests[0].messages.at(-1)?.content).toMatch(/Call out the news\.$/);
    expect(due.json.view.tick).toBe(6);
  });

  it('a draft that does not answer when spoken to hears the line and makes no call', async () => {
    const { send, client } = setup([say('never used')]);
    const r = await send<BenchResponse>('/api/editor/bench/say', { npc: { ...miller, triggers: [] }, text: 'Hello?' });
    expect(r.json).toMatchObject({ ok: true, outcome: null });
    expect(r.json.events.map((e) => [e.type, e.actor])).toEqual([['SAID', 'player']]);
    expect(client.requests).toHaveLength(0);
  });

  it('a draft without triggers (an older file) answers when spoken to; each kind of trigger once', async () => {
    const { send } = setup();
    const { triggers: _t, ...old } = miller;
    expect((await send<PreviewResponse>('/api/editor/preview', { npc: old })).json.ok).toBe(true);
    const twice = await send<PreviewResponse>('/api/editor/preview', { npc: { ...miller, triggers: [{ kind: 'on_spoken_to' }, { kind: 'on_spoken_to' }] } });
    expect(twice.json.errors).toEqual(['triggers: each kind of trigger once']);
  });

  it('GIVE is for givers, not sellers: a draft that sells anything may not list it', async () => {
    const { send } = setup();
    const r = await send<PreviewResponse>('/api/editor/preview', {
      npc: { ...miller, verbs: ['SAY', 'OFFER', 'GIVE'], model_verbs: ['SAY', 'OFFER', 'GIVE'], catalogue: { in_stock: { flour: { min_price: 2 } } }, start: { gold: 5, stock: { flour: 2 } } },
    });
    expect(r.json.errors).toEqual(['miller: GIVE is for NPCs who give (quest givers, gifts), not sellers: a seller could be talked into giving its stock away']);
  });

  it('GIVE in the model verbs: the schema offers its goods, and a gift the ledger allows moves them', async () => {
    const beggar: NpcDraft = {
      ...miller,
      verbs: ['SAY', 'EMOTE', 'GIVE'],
      model_verbs: ['SAY', 'EMOTE', 'GIVE'],
      facts: ['inventory'],
      start: { gold: 5, stock: { flour: 2 } },
    };
    const gift = JSON.stringify({ action: 'GIVE', say: 'Take it, friend.', gift: { kind: 'good', good: 'flour', qty: 1 }, emote: null });
    const { send } = setup([gift, JSON.stringify({ action: 'EMOTE', say: '', emote: 'shrugs', gift: null })]);
    const preview = await send<PreviewResponse>('/api/editor/preview', { npc: beggar });
    expect(preview.json.ok && preview.json.facts).toBe('Your purse: 5 gold.\nYou have (not promised to a job): flour 2.');
    expect(JSON.stringify(preview.json.ok && preview.json.schema)).toContain('"enum":["flour"]');
    // No recipient to fill in: the model doesn't know anyone's id, so a gift always goes to whoever it's talking to.
    expect(Object.keys((preview.json.ok && preview.json.schema.properties) as object)).not.toContain('give_to');

    const r = await send<BenchResponse>('/api/editor/bench/say', { npc: beggar, text: 'Spare some flour?' });
    expect(r.json.events.map((e) => e.type)).toEqual(['SAID', 'GIVEN', 'SAID']);
    expect(r.json.view.goods).toEqual({ flour: 1 });
    const shrug = await send<BenchResponse>('/api/editor/bench/say', { npc: beggar, text: 'More?' });
    expect(shrug.json.events.map((e) => [e.type, e.target])).toEqual([
      ['SAID', 'miller'],
      ['EMOTED', 'player'],
    ]);
  });

  describe('art', () => {
    const styled = (references: string[] = [pngUrl()]): NpcDraft => ({ ...miller, art: { style: '  dusty  flour\nsacks ', references } });

    it("a trial picture is drawn in the draft's art and comes back as a sprite", async () => {
      const artist = mockImageClient([render()]);
      const { send } = setup([], { makeArtist: () => artist });
      const r = await send<SketchResponse>('/api/editor/sketch', { npc: styled(), subject: 'a  sack of\nflour' });
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ ok: true, sprite: expect.stringMatching(/^data:image\/png;base64,/), references: 1 });
      // The style is one line, so it can't open a section of its own; the subject is the item.
      const req = artist.prompts[0];
      expect(req.prompt).toContain('Art direction: dusty flour sacks');
      expect(req.prompt).toMatch(/Match the look of the reference picture:/);
      expect(req.prompt).toMatch(/The item: a sack of flour$/);
      expect(req.references).toEqual([pngUrl()]);
    });

    it('trial pictures are capped per visit, and need Muse Image and a valid draft', async () => {
      const { send } = setup([], { makeArtist: () => mockImageClient([render(), render()]), bench: { sketchesPerSession: 1 } });
      expect((await send<SketchResponse>('/api/editor/sketch', { npc: { ...miller, name: '' }, subject: 'flour' })).json).toMatchObject({ ok: false });
      expect((await send<SketchResponse>('/api/editor/sketch', { npc: miller, subject: 'flour' })).json.ok).toBe(true);
      const capped = await send<{ error: string }>('/api/editor/sketch', { npc: miller, subject: 'flour' });
      expect(capped.status).toBe(429);
      expect(capped.json.error).toMatch(/trial pictures/);

      const none = await setup().send<{ error: string }>('/api/editor/sketch', { npc: miller, subject: 'flour' });
      expect(none.status).toBe(503);
    });

    it('a failed or refused picture says so', async () => {
      const artist = mockImageClient([new Error('image 400: {"error":{"code":"content_policy_violation"}}')]);
      const r = await setup([], { makeArtist: () => artist }).send<{ error: string }>('/api/editor/sketch', { npc: miller, subject: 'flour' });
      expect(r.status).toBe(502);
      expect(r.json.error).toMatch(/refused/);
    });

    it('references must be small PNG, JPEG or WebP pictures, at most three', async () => {
      const { send } = setup();
      const check = async (references: string[]) => (await send<PreviewResponse>('/api/editor/preview', { npc: styled(references) })).json.errors;
      expect(await check(['data:text/html;base64,PGI+'])).toEqual(['art.references.0: a PNG, JPEG or WebP picture']);
      expect(await check([pngUrl(), pngUrl(), pngUrl(), pngUrl()])).toEqual(['art.references: at most 3 reference pictures']);
      // Too big for the preview route's body limit, and for a reference.
      const big = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_REFERENCE_BYTES * 4) / 3) + 8)}`;
      expect((await send('/api/editor/preview', { npc: styled([big]) })).status).toBe(413);
      const r = await setup([], { makeArtist: () => mockImageClient([]) }).send<SketchResponse>('/api/editor/sketch', { npc: styled([big]), subject: 'flour' });
      expect(r.json).toEqual({ ok: false, errors: ['art.references.0: a reference picture is at most 300 KB'] });
    });

    it('saving writes the references beside the file and reads them back; dropped ones are removed', async () => {
      const { dirs, files, path } = tempFiles();
      const { send } = setup([], { canSaveNpcs: true, npcFiles: files });
      const two = styled([pngUrl(), pngUrl(3)]);
      expect((await send<SaveResponse>('/api/editor/save', { npc: two })).json.ok).toBe(true);
      expect(JSON.parse(readFileSync(path('miller.json'), 'utf8')).art).toEqual({ style: 'dusty flour sacks', references: ['miller-1.png', 'miller-2.png'] });
      expect(readDraft('miller', dirs).art).toEqual({ style: 'dusty flour sacks', references: [pngUrl(), pngUrl(3)] });

      expect((await send<SaveResponse>('/api/editor/save', { npc: styled([pngUrl(3)]), overwrite: true })).json.ok).toBe(true);
      expect(existsSync(path('art/miller-2.png'))).toBe(false);
      expect(readDraft('miller', dirs).art.references).toEqual([pngUrl(3)]);
    });
  });
});
