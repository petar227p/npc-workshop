import { MAX_SAY_LENGTH, MAX_TRIGGER_HOURS, MODEL_INFO, type ModelChoice, type BenchResponse, type EditorLibrary, type PreviewResponse, type SaveResponse } from '@blacksmith/shared';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { npcTurn, type Attempt, type NpcModel } from '../agents/npc';
import { createEngine, createWorld, timedTrigger, type World } from '../engine';
import { answers, passTime } from '../game';
import { buildNpc, player, type NpcDefinition, type NpcFiles } from '../npcs';
import { busyMessage, toView, type Session } from '../sessions';
import type { Env } from './api';

// The NPC editor. Drafts live in the browser and come with every request, so nothing a visitor writes is
// stored on the server (except via save, which only the dev server allows). The test bench runs the draft
// against its own engine and a throwaway world, through the same rules as the village.

const DraftBody = z.object({ npc: z.unknown() });
const SaveBody = z.object({ npc: z.unknown(), overwrite: z.boolean().optional() });
const BenchSayBody = z.object({ npc: z.unknown(), text: z.string().trim().min(1).max(MAX_SAY_LENGTH) });
const BenchTickBody = z.object({ npc: z.unknown(), ticks: z.number().int().min(1).max(MAX_TRIGGER_HOURS) });

// A bench persona is the visitor's own, so on the public site the bench could otherwise be used as a free
// general-purpose model. Turns are capped per session and per minute across everyone, and the raw model
// answer shown under the hood is clipped (a real one is well under this).
export type BenchLimits = { perSession?: number; perMinute?: number; now?: () => number };
const MAX_ATTEMPT_CHARS = 3000;

type Deps = { modelFor: (s: Session, choice: ModelChoice) => NpcModel | null; canSave: boolean; files: NpcFiles; limits?: BenchLimits };

// Saving writes into the repo, so only the editor page itself may ask: a JSON body forces a CORS preflight that
// this server never answers, and browsers mark a request from another site. (Non-browser clients send neither.)
function fromThisSite(c: Context): boolean {
  const site = c.req.header('sec-fetch-site');
  return (c.req.header('content-type') ?? '').startsWith('application/json') && (site === undefined || site === 'same-origin' || site === 'none');
}

export function mountEditor(app: Hono<Env>, deps: Deps) {
  const { perSession = 40, perMinute = 30, now = Date.now } = deps.limits ?? {};
  let recent: number[] = []; // bench turns started in the last minute, across all visitors

  const body = async <T>(c: Context<Env>, schema: z.ZodType<T>) => schema.safeParse(await c.req.json().catch(() => null));
  // The bench world holds the player and the draft, each with what it starts with.
  const benchWorld = (npc: NpcDefinition | null): World => createWorld(npc ? [player, npc] : [player]);
  const benchView = (s: Session, npc: NpcDefinition | null = null) =>
    toView(s.bench ?? benchWorld(npc), s.busy !== null, undefined, npc ? { [npc.id]: npc.name } : {});
  const busy = (c: Context<Env>) => c.json({ error: busyMessage(c.get('session')) }, 409);
  const clip = (content: string) => (content.length > MAX_ATTEMPT_CHARS ? `${content.slice(0, MAX_ATTEMPT_CHARS)}… (clipped)` : content);
  const shown = (attempts: Attempt[]) => attempts.map(({ content, ok, reason, latency_ms }) => ({ content: clip(content), ok, reason, latency_ms }));

  // A bench turn calls the model, so it counts against this visit's quota and everyone's per-minute one.
  // Gives the model to use, or the refusal to send.
  const claimTurn = (c: Context<Env>, npc: NpcDefinition): NpcModel | Response => {
    const s = c.get('session');
    if (s.benchTurns >= perSession) {
      return c.json({ error: `That's all ${perSession} test turns for this visit. The forge is still open.` }, 429);
    }
    const t = now();
    recent = recent.filter((at) => t - at < 60_000);
    if (recent.length >= perMinute) return c.json({ error: 'The workshop is busy right now. Try again in a minute.' }, 429);

    const model = deps.modelFor(s, npc.model);
    if (!model) return c.json({ error: `${MODEL_INFO[npc.model].label} isn't available right now. Try again later.` }, 503);
    recent.push(t);
    s.benchTurns += 1;
    return model;
  };

  app.get('/api/editor/library', (c) => c.json({ npcs: deps.files.list(), can_save: deps.canSave } satisfies EditorLibrary));

  // The generated model schema and what the NPC would be told in a fresh world.
  app.post('/api/editor/preview', async (c) => {
    const parsed = await body(c, DraftBody);
    if (!parsed.success) return c.json({ error: 'expected { npc }' }, 400);
    const built = buildNpc(parsed.data.npc);
    if (!built.ok) return c.json({ ok: false, errors: built.errors } satisfies PreviewResponse);
    return c.json({ ok: true, schema: built.npc.schema, facts: built.npc.facts(benchWorld(built.npc), 'player'), errors: [] } satisfies PreviewResponse);
  });

  app.post('/api/editor/bench/say', async (c) => {
    const s = c.get('session');
    const parsed = await body(c, BenchSayBody);
    if (!parsed.success) return c.json({ error: `expected { npc, text } with text of at most ${MAX_SAY_LENGTH} characters` }, 400);
    if (s.busy) return busy(c);

    const built = buildNpc(parsed.data.npc);
    const empty = { outcome: null, attempts: [], events: [] };
    if (!built.ok) return c.json({ ok: false, errors: built.errors, ...empty, view: benchView(s) } satisfies BenchResponse);

    const { act } = createEngine([player, built.npc]);
    const said = act(s.bench ?? benchWorld(built.npc), 'player', { action: 'SAY', text: parsed.data.text }, { to: built.npc.id });
    // Without on_spoken_to the draft hears the line and stays quiet, as it would in the village: no model call.
    if (!answers(built.npc)) {
      s.bench = said.world;
      return c.json({ ok: true, errors: [], outcome: null, attempts: [], events: said.events, view: benchView(s, built.npc) } satisfies BenchResponse);
    }
    const model = claimTurn(c, built.npc);
    if (model instanceof Response) return model;
    s.bench = said.world;
    s.busy = { by: 'bench' };
    try {
      const turn = await npcTurn(built.npc, said.world, model, { act });
      s.bench = turn.world;
      return c.json({
        ok: true,
        errors: [],
        outcome: turn.outcome,
        attempts: shown(turn.attempts),
        events: [...said.events, ...turn.events],
        view: benchView(s, built.npc),
      } satisfies BenchResponse);
    } finally {
      s.busy = null;
    }
  });

  // Moves the bench clock, so a draft on a timer can be seen acting on its own. A model call only if its timer comes round.
  app.post('/api/editor/bench/tick', async (c) => {
    const s = c.get('session');
    const parsed = await body(c, BenchTickBody);
    if (!parsed.success) return c.json({ error: `expected { npc, ticks: 1–${MAX_TRIGGER_HOURS} }` }, 400);
    if (s.busy) return busy(c);

    const built = buildNpc(parsed.data.npc);
    if (!built.ok) return c.json({ ok: false, errors: built.errors, outcome: null, attempts: [], events: [], view: benchView(s) } satisfies BenchResponse);

    const world = s.bench ?? benchWorld(built.npc);
    let model: NpcModel | null = null;
    if (timedTrigger(built.npc.triggers, world.tick, world.tick + parsed.data.ticks)) {
      const claimed = claimTurn(c, built.npc);
      if (claimed instanceof Response) return claimed;
      model = claimed;
    }
    s.busy = { by: 'bench' };
    try {
      const { act } = createEngine([player, built.npc]);
      const r = await passTime(world, parsed.data.ticks, () => model, { npcs: [built.npc], act });
      s.bench = r.world;
      return c.json({
        ok: true,
        errors: [],
        outcome: r.outcome,
        attempts: shown(r.attempts),
        events: r.events,
        view: benchView(s, built.npc),
      } satisfies BenchResponse);
    } finally {
      s.busy = null;
    }
  });

  app.post('/api/editor/bench/reset', (c) => {
    const s = c.get('session');
    if (s.busy) return busy(c);
    s.bench = null;
    return c.json({ ok: true, errors: [], outcome: null, attempts: [], events: [], view: benchView(s) } satisfies BenchResponse);
  });

  app.post('/api/editor/save', async (c) => {
    if (!deps.canSave) return c.json({ error: 'Saving NPC files is only possible on the dev server.' }, 403);
    if (!fromThisSite(c)) return c.json({ error: 'Saving is only possible from the editor page.' }, 403);
    const parsed = await body(c, SaveBody);
    if (!parsed.success) return c.json({ error: 'expected { npc, overwrite? }' }, 400);
    const built = buildNpc(parsed.data.npc);
    if (!built.ok) return c.json({ ok: false, errors: built.errors } satisfies SaveResponse);
    // An existing file (Brann's, if the draft started from him and kept his id) is only replaced when asked.
    const { id } = built.draft;
    if (!parsed.data.overwrite && deps.files.has(id)) {
      return c.json({ ok: false, exists: true, errors: [`npcs/${id}.json already exists`] } satisfies SaveResponse);
    }
    deps.files.save(built.draft);
    return c.json({ ok: true, errors: [] } satisfies SaveResponse);
  });
}
