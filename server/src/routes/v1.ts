import {
  MAX_SAY_LENGTH,
  StartSchema,
  type ApiEvents,
  type ApiLine,
  type ApiNpc,
  type ApiResult,
  type ApiState,
  type ApiWorldCreated,
  type EngineEvent,
  type ModelChoice,
} from '@blacksmith/shared';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { NpcModel } from '../agents/npc';
import { ART_FILE, artView, type Studio } from '../art';
import { placeAt } from '../engine';
import { answers, passTime, playerAccepts, playerGives, playerSays, playerSpeaks, worldReports } from '../game';
import type { ImageClient } from '../models/image';
import { nameOf, NPCS, type NpcDefinition } from '../npcs';
import { toView } from '../sessions';
import { createWorldStore, sameToken, type GameWorld, type WorldLimits } from '../worlds';

// The dev API: a game makes its own world from the NPCs it picks, then sends what its player says and does and renders
// the events it gets back. Every action still goes through the ledger, so a game's own code can't skip the rules
// either. A world is driven with the bearer token it was made with; no cookie, so any engine or script can call it,
// and any site may (the token is the only credential, so there is nothing for another site to borrow).
// The player is the actor 'player', as in the village; one player per world.

const MAX_HOURS = 48; // one call moves the clock at most two days, like the village's longest skip
const MAX_PAGE = 500; // events per read of the log

// `start`: by actor id ('player' or an NPC in the world), what it holds when the world begins, from the game's own save.
const NewWorldBody = z.object({ npcs: z.array(z.string()).min(1).max(NPCS.length).optional(), start: z.record(z.string(), StartSchema).optional() }).strict();
const SayBody = z.object({ npc: z.string(), text: z.string().trim().min(1).max(MAX_SAY_LENGTH) });
const AcceptBody = z.object({ contract_id: z.string() });
const GiveBody = z.object({ to: z.string(), gift: z.unknown() }); // the engine checks the gift itself
const TickBody = z.object({ hours: z.number().int().min(1).max(MAX_HOURS) });
const Limit = z.coerce.number().int().min(1).max(MAX_PAGE);

// A model call costs money, so each world has a quota of them and all worlds together a per-minute one. The log is
// capped too: a script ticking the clock forever would otherwise grow one world without end.
export type V1Limits = WorldLimits & { callsPerWorld?: number; callsPerMinute?: number; maxEvents?: number };

export type V1Deps = {
  makeModel: (worldId: string, choice: ModelChoice) => NpcModel;
  makeArtist?: (worldId: string) => ImageClient;
  studio: Studio; // shared with the village, so the per-minute picture cap is everyone's
  clientIp?: (c: Context) => string | null;
  limits?: V1Limits;
};

const sells = (n: NpcDefinition) => [...Object.keys(n.catalogue?.made_to_order?.items ?? {}), ...Object.keys(n.catalogue?.in_stock ?? {})];
const npcInfo = (n: NpcDefinition): ApiNpc => ({
  id: n.id,
  name: n.name,
  model: n.model,
  place: n.location ?? 'village',
  verbs: n.verbs.map((v) => v.verb),
  sells: sells(n),
  labels: { ...n.labels },
  answers: answers(n),
});

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const bearer = (c: Context) => /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1] ?? null;
const isLine = (e: EngineEvent): e is Extract<EngineEvent, { type: 'SAID' }> => e.type === 'SAID' && e.actor !== 'player';

export function createV1(deps: V1Deps) {
  const { callsPerWorld = 150, callsPerMinute = 60, maxEvents = 5000, now = Date.now } = deps.limits ?? {};
  const worlds = createWorldStore(deps.limits);
  let recent: number[] = []; // model calls made in the last minute, across all worlds
  const app = new Hono();

  app.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'DELETE'] }));

  const body = async <T>(c: Context, schema: z.ZodType<T>) => schema.safeParse(await c.req.json().catch(() => null));
  const busy = (c: Context, w: GameWorld) => c.json({ error: `${w.busy} is still answering.` }, 409);

  // The world named in the path, if the bearer token is its own; otherwise the refusal to send.
  const open = (c: Context): GameWorld | Response => {
    const w = worlds.get(c.req.param('id'));
    if (!w) return c.json({ error: 'no such world (an idle one is dropped after a while; make a new one)' }, 404);
    if (!sameToken(bearer(c), w.token)) return c.json({ error: "send this world's token as 'Authorization: Bearer <token>'" }, 401);
    return w;
  };
  const logFull = (c: Context, w: GameWorld) =>
    w.world.events.length >= maxEvents ? c.json({ error: `This world's log is full (${maxEvents} events). Make a new world.` }, 429) : null;

  const canCall = (w: GameWorld) => {
    recent = recent.filter((at) => now() - at < 60_000);
    return w.calls < callsPerWorld && recent.length < callsPerMinute;
  };
  const noCalls = (c: Context, w: GameWorld) =>
    w.calls >= callsPerWorld
      ? c.json({ error: `This world has made all ${callsPerWorld} of its model calls. Make a new world.` }, 429)
      : c.json({ error: 'The NPCs are busy right now. Try again in a minute.' }, 429);
  const spent = (w: GameWorld, calls: number) => {
    w.calls += calls;
    for (let i = 0; i < calls; i++) recent.push(now());
  };

  // A missing key or bad config is the server's problem: the cause goes to the server log, the game gets null.
  const modelFor = (w: GameWorld, choice: ModelChoice): NpcModel | null => {
    if (!w.models[choice]) {
      try {
        w.models[choice] = deps.makeModel(w.id, choice);
      } catch (err) {
        console.error(`${choice} unavailable: ${(err as Error).message}`);
        return null;
      }
    }
    return w.models[choice] ?? null;
  };
  // NPCs that act on their own after the clock moves or news arrives: none do once the world is out of calls.
  const townModel = (w: GameWorld) => (choice: ModelChoice) => (canCall(w) ? modelFor(w, choice) : null);
  const artistFor = (w: GameWorld): ImageClient | null => {
    if (!w.artist && deps.makeArtist) {
      try {
        w.artist = deps.makeArtist(w.id);
      } catch (err) {
        console.error(`item pictures unavailable: ${(err as Error).message}`);
      }
    }
    return w.artist;
  };

  const stateOf = (w: GameWorld): ApiState => {
    const { events: _events, busy: _busy, ...view } = toView(w.world, false, undefined, w.cast);
    return {
      ...view,
      art: artView(w.art, (e) => `/api/v1/worlds/${w.id}/art/${e.id}.png`),
      world_id: w.id,
      last_event_id: w.world.events.at(-1)?.id ?? null,
      busy: w.busy,
      calls_left: Math.max(0, callsPerWorld - w.calls),
    };
  };
  const said = (events: EngineEvent[]): ApiLine[] =>
    events.filter(isLine).map((e) => ({ by: e.actor, name: nameOf(e.actor), text: e.data.text, to: e.target }));
  const result = (c: Context, w: GameWorld, r: { ok: boolean; reason: string | null; events: EngineEvent[] }, outcome: ApiResult['outcome'] = null) =>
    c.json({ ok: r.ok, reason: r.reason, outcome, events: r.events, said: said(r.events), state: stateOf(w) } satisfies ApiResult);

  app.get('/npcs', (c) => c.json({ npcs: NPCS.map(npcInfo) }));

  // No body, or no `npcs`, makes a world with every NPC there is.
  app.post('/worlds', async (c) => {
    const text = await c.req.text();
    const parsed = NewWorldBody.safeParse(text.trim() === '' ? {} : parseJson(text));
    if (!parsed.success) {
      const why = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return c.json({ error: `expected { npcs?: [<npc id>, …], start?: { <actor id>: { gold, stock } } } (GET /api/v1/npcs lists the NPCs). ${why}` }, 400);
    }
    const ids = parsed.data.npcs ?? NPCS.map((n) => n.id);
    const unknown = ids.filter((id) => !NPCS.some((n) => n.id === id));
    if (unknown.length) return c.json({ error: `no NPC called ${unknown.map((id) => `'${id}'`).join(', ')} (there are: ${NPCS.map((n) => n.id).join(', ')})` }, 400);
    if (new Set(ids).size !== ids.length) return c.json({ error: 'each NPC once' }, 400);
    const start = parsed.data.start ?? {};
    const stranger = Object.keys(start).find((id) => id !== 'player' && !ids.includes(id));
    if (stranger !== undefined) return c.json({ error: `start: '${stranger}' isn't in this world (the player is 'player')` }, 400);

    // In the game's order: who acts first when several NPCs' triggers fire at once and none has waited longer.
    const created = worlds.create(deps.clientIp?.(c) ?? null, ids.map((id) => NPCS.find((n) => n.id === id)!), start);
    if (!created.ok) return c.json({ error: created.error }, created.status);
    const w = created.entry;
    return c.json({ world_id: w.id, token: w.token, npcs: w.cast.map((n) => n.id), state: stateOf(w) } satisfies ApiWorldCreated, 201);
  });

  app.get('/worlds/:id', (c) => {
    const w = open(c);
    return w instanceof Response ? w : c.json(stateOf(w));
  });

  // The log from just after `since` (an event id), or from the start: at most `limit` events, `more` if there are others.
  app.get('/worlds/:id/events', (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    const since = c.req.query('since');
    const from = since === undefined ? 0 : w.world.events.findIndex((e) => e.id === since) + 1;
    if (from === 0 && since !== undefined) return c.json({ error: `there's no event '${since}' in this world` }, 400);
    const limit = Limit.safeParse(c.req.query('limit') ?? MAX_PAGE);
    if (!limit.success) return c.json({ error: `limit: 1–${MAX_PAGE}` }, 400);
    const page = w.world.events.slice(from, from + limit.data);
    return c.json({ events: page, last_event_id: page.at(-1)?.id ?? since ?? null, more: from + page.length < w.world.events.length } satisfies ApiEvents);
  });

  app.post('/worlds/:id/say', async (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    const parsed = await body(c, SayBody);
    if (!parsed.success) return c.json({ error: `expected { npc, text } with text of 1–${MAX_SAY_LENGTH} characters` }, 400);
    const npc = w.cast.find((n) => n.id === parsed.data.npc);
    if (!npc) return c.json({ error: `there's nobody called '${parsed.data.npc}' in this world (in it: ${w.cast.map((n) => n.id).join(', ')})` }, 400);
    if (w.busy) return busy(c, w);
    const full = logFull(c, w);
    if (full) return full;
    if (!answers(npc)) {
      const r = playerSpeaks(w.world, parsed.data.text, npc, { act: w.act });
      w.world = r.world;
      return result(c, w, r);
    }

    if (!canCall(w)) return noCalls(c, w);
    const model = modelFor(w, npc.model);
    if (!model) return c.json({ error: `${npc.name} isn't at the ${placeAt(npc, w.world.tick).replace(/_/g, ' ')} right now. Try again later.` }, 503);
    w.busy = npc.name;
    try {
      const r = await playerSays(w.world, parsed.data.text, model, npc, { act: w.act });
      w.world = r.world;
      if (!('attempts' in r)) return result(c, w, r);
      spent(w, r.attempts.length);
      return result(c, w, { ok: true, reason: null, events: r.events }, r.outcome);
    } finally {
      w.busy = null;
    }
  });

  app.post('/worlds/:id/accept', async (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    const parsed = await body(c, AcceptBody);
    if (!parsed.success) return c.json({ error: 'expected { contract_id }' }, 400);
    if (w.busy) return busy(c, w);
    const full = logFull(c, w);
    if (full) return full;
    const r = playerAccepts(w.world, parsed.data.contract_id, { act: w.act });
    w.world = r.world;
    // Work has started, so the item is settled: draw it while the clock runs. Not awaited.
    if (r.ok) {
      const contract = w.world.contracts[parsed.data.contract_id];
      deps.studio.start(w, contract, artistFor(w), w.cast.find((n) => n.id === contract.seller)?.art);
    }
    return result(c, w, r);
  });

  app.post('/worlds/:id/give', async (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    const parsed = await body(c, GiveBody);
    if (!parsed.success) return c.json({ error: 'expected { to, gift }' }, 400);
    if (w.busy) return busy(c, w);
    const full = logFull(c, w);
    if (full) return full;
    const r = playerGives(w.world, parsed.data.to, parsed.data.gift, { act: w.act });
    w.world = r.world;
    return result(c, w, r);
  });

  // The clock moves (work comes due, and is delivered by code); then NPCs whose triggers fire may act, so the world
  // is locked until they have. A world out of model calls still keeps time; its NPCs just don't act on their own.
  app.post('/worlds/:id/tick', async (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    const parsed = await body(c, TickBody);
    if (!parsed.success) return c.json({ error: `expected { hours: 1–${MAX_HOURS} } (one tick is one hour)` }, 400);
    if (w.busy) return busy(c, w);
    const full = logFull(c, w);
    if (full) return full;
    w.busy = 'The town';
    try {
      const r = await passTime(w.world, parsed.data.hours, townModel(w), { npcs: w.cast, act: w.act, sense: w.sense });
      w.world = r.world;
      spent(w, r.attempts.length);
      return result(c, w, { ok: true, reason: null, events: r.events }, r.outcome);
    } finally {
      w.busy = null;
    }
  });

  // Something the game's own code saw happen that no verb covers (a boss slain, a fire): the body is a world report,
  // checked by the engine as it came. It changes no gold or stock; it is news for whoever saw it.
  app.post('/worlds/:id/report', async (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    const raw: unknown = await c.req.json().catch(() => null);
    if (w.busy) return busy(c, w);
    const full = logFull(c, w);
    if (full) return full;
    w.busy = 'The town';
    try {
      const r = await worldReports(w.world, raw, townModel(w), { npcs: w.cast, act: w.act, report: w.report });
      w.world = r.world;
      spent(w, r.attempts.length);
      return result(c, w, r, r.outcome);
    } finally {
      w.busy = null;
    }
  });

  // The game changed an inventory itself (loot, theft, crafting): the body says what the actor holds now (totals) and
  // why. Logged so replay still holds; refused if it would take away what is promised to accepted work. No model runs.
  app.post('/worlds/:id/sync', async (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    const raw: unknown = await c.req.json().catch(() => null);
    if (w.busy) return busy(c, w);
    const full = logFull(c, w);
    if (full) return full;
    const r = w.sync(w.world, raw);
    w.world = r.world;
    return result(c, w, r);
  });

  app.get('/worlds/:id/art/:file', (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    const id = ART_FILE.exec(c.req.param('file'))?.[1];
    const entry = id ? [...w.art.values()].find((e) => e.id === id) : undefined;
    if (!entry?.png) return c.json({ error: 'no such picture' }, 404);
    return c.body(new Uint8Array(entry.png), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable' });
  });

  app.delete('/worlds/:id', (c) => {
    const w = open(c);
    if (w instanceof Response) return w;
    if (w.busy) return busy(c, w);
    worlds.delete(w.id);
    return c.json({ ok: true });
  });

  return app;
}
