import { MAX_NOTE_LENGTH, MAX_REFERENCE_BYTES, MAX_REFERENCES, MAX_SAY_LENGTH, type ActionResponse, type ArtResponse, type ModelChoice, type ReadNoteResponse } from '@blacksmith/shared';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { readNote } from '../agents/note';
import type { NpcModel } from '../agents/npc';
import { ART_FILE, artView, createStudio, type StudioLimits } from '../art';
import { placeAt } from '../engine';
import { answers, passTime, playerAccepts, playerGives, playerSays, playerSpeaks, worldReports } from '../game';
import type { ImageClient } from '../models/image';
import { NPC_FILES, NPCS, nameOf, newVillage, player, smith as brann, type NpcFiles } from '../npcs';
import { PLACE_NAMES } from '../village';
import { busyMessage, createSessionStore, guestSession, toView, type Session, type SessionLimits } from '../sessions';
import { mountEditor, type BenchLimits } from './editor';
import { createV1, type V1Limits } from './v1';

const COOKIE = 'bs_session';
const MAX_SKIP = 48;
const MAX_BODY_BYTES = 16 * 1024; // the largest real body is a 500-character line
// An editor draft: a 6000-character persona is up to 36 KB of JSON if every character is escaped (\u0001), plus the short fields.
const MAX_EDITOR_BODY_BYTES = 64 * 1024;
// Saving and trial pictures carry the draft's reference pictures too: up to three, each at most 300 KB as base64.
const MAX_ART_BODY_BYTES = MAX_EDITOR_BODY_BYTES + MAX_REFERENCES * Math.ceil((MAX_REFERENCE_BYTES * 4) / 3 + 64);
const ART_ROUTES = ['/api/editor/save', '/api/editor/sketch'];

const SayBody = z.object({ text: z.string().max(MAX_SAY_LENGTH), npc: z.string().optional() }); // npc: who the player talks to; Brann by default
const AcceptBody = z.object({ contract_id: z.string() });
const TickBody = z.object({ ticks: z.number().int().min(1).max(MAX_SKIP) });
const GiveBody = z.object({ to: z.string(), gift: z.unknown() }); // the engine checks the gift itself
const NoteBody = z.object({ note: z.string().trim().min(1).max(MAX_NOTE_LENGTH) });

export type Env = { Variables: { session: Session } };

export type ApiDeps = {
  makeModel: (sessionId: string, choice: ModelChoice) => NpcModel; // the client for an NPC's model choice
  makeArtist?: (sessionId: string) => ImageClient; // Muse Image; without it items keep the placeholder picture
  art?: StudioLimits;
  sessions?: SessionLimits;
  clientIp?: (c: Context) => string | null; // the visitor's address, for the per-address session cap
  secureCookie?: boolean; // true behind HTTPS in production
  canSaveNpcs?: boolean; // dev only: the NPC editor may write npcs/ and prompts/
  npcFiles?: NpcFiles; // where the editor's library comes from and saves go; the repo's npcs/ and prompts/ by default
  bench?: BenchLimits;
  v1?: V1Limits; // the dev API's worlds and model calls
};

// Behind a proxy every request comes from the proxy, so the host's header names the visitor instead.
// The proxy appends the address it saw, so the last entry is the one it vouches for; earlier ones can be forged.
export function clientIpReader(trustedHeader?: string): (c: Context) => string | null {
  const header = trustedHeader?.trim().toLowerCase();
  if (header) return (c) => c.req.header(header)?.split(',').at(-1)?.trim() || null;
  return (c) => getConnInfo(c).remote.address ?? null;
}

export function createApi(deps: ApiDeps) {
  const store = createSessionStore(deps.sessions);
  const studio = createStudio(deps.art);
  const app = new Hono<Env>();

  app.get('/api/health', (c) => c.json({ ok: true }));

  const tooLarge = (c: Context) => c.json({ error: 'request too large' }, 413);
  const limit = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: tooLarge });
  const editorLimit = bodyLimit({ maxSize: MAX_EDITOR_BODY_BYTES, onError: tooLarge });
  const artLimit = bodyLimit({ maxSize: MAX_ART_BODY_BYTES, onError: tooLarge });
  const limitFor = (path: string) => (ART_ROUTES.includes(path) ? artLimit : path.startsWith('/api/editor/') ? editorLimit : limit);
  app.use('/api/*', (c, next) => limitFor(c.req.path)(c, next));

  // Sessions are made on the first action, not the first look: a crawler or a curl loop of GETs stores nothing.
  // The dev API has none: a game's world comes with its own token (routes/v1.ts).
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/v1/')) return next();
    let s = store.get(getCookie(c, COOKIE));
    if (!s && c.req.method === 'GET') {
      c.set('session', guestSession());
      return next();
    }
    if (!s) {
      const created = store.create(deps.clientIp?.(c) ?? null);
      if (!created.ok) return c.json({ error: created.error }, created.status);
      s = created.session;
      setCookie(c, COOKIE, s.id, { httpOnly: true, secure: deps.secureCookie ?? false, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
    }
    c.set('session', s);
    await next();
  });

  const respond = (c: Context<Env>, r: Omit<ActionResponse, 'view'>) => {
    const s = c.get('session');
    return c.json({ ...r, view: toView(s.world, s.busy !== null, s.art, NPCS) } satisfies ActionResponse);
  };
  // A missing key or bad config is the server's problem: say so plainly, log the cause, change nothing.
  const modelFor = (s: Session, choice: ModelChoice): NpcModel | null => {
    if (!s.models[choice]) {
      try {
        s.models[choice] = deps.makeModel(s.id, choice);
      } catch (err) {
        console.error(`${choice} unavailable: ${(err as Error).message}`);
        return null;
      }
    }
    return s.models[choice] ?? null;
  };
  // Same as an NPC's model: a missing key only costs the pictures.
  const artistFor = (s: Session): ImageClient | null => {
    if (!s.artist && deps.makeArtist) {
      try {
        s.artist = deps.makeArtist(s.id);
      } catch (err) {
        console.error(`item pictures unavailable: ${(err as Error).message}`);
      }
    }
    return s.artist;
  };
  const busy = (c: Context<Env>) => c.json({ error: busyMessage(c.get('session')) }, 409);
  const body = async <T>(c: Context<Env>, schema: z.ZodType<T>) => schema.safeParse(await c.req.json().catch(() => null));

  app.get('/api/state', (c) => {
    const s = c.get('session');
    return c.json(toView(s.world, s.busy !== null, s.art, NPCS));
  });

  // Polled by the page while a picture renders; only the pictures, so a poll can't overwrite a newer world.
  app.get('/api/art', (c) => c.json({ art: artView(c.get('session').art) } satisfies ArtResponse));

  app.get('/api/art/:file', (c) => {
    const id = ART_FILE.exec(c.req.param('file'))?.[1];
    const entry = id ? [...c.get('session').art.values()].find((e) => e.id === id) : undefined;
    if (!entry?.png) return c.json({ error: 'no such picture' }, 404);
    // The id is new for every picture, so it never changes under the same URL.
    return c.body(new Uint8Array(entry.png), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=31536000, immutable' });
  });

  app.post('/api/say', async (c) => {
    const s = c.get('session');
    const parsed = await body(c, SayBody);
    if (!parsed.success) return c.json({ error: `expected { text, npc? } with text of at most ${MAX_SAY_LENGTH} characters` }, 400);
    const npc = parsed.data.npc === undefined ? brann : NPCS.find((n) => n.id === parsed.data.npc);
    if (!npc) return c.json({ error: `there's nobody called '${parsed.data.npc}' in the village` }, 400);
    if (s.busy) return busy(c);
    if (!answers(npc)) {
      const r = playerSpeaks(s.world, parsed.data.text, npc);
      s.world = r.world;
      return respond(c, { ok: r.ok, reason: r.reason, outcome: null, events: r.events });
    }

    const model = modelFor(s, npc.model);
    if (!model) return c.json({ error: `${npc.name} isn't at the ${placeAt(npc, s.world.tick).replace(/_/g, ' ')} right now. Try again later.` }, 503);

    s.busy = { by: 'npc', name: npc.name };
    try {
      const r = await playerSays(s.world, parsed.data.text, model, npc);
      s.world = r.world;
      if ('attempts' in r) return respond(c, { ok: true, reason: null, outcome: r.outcome, events: r.events });
      return respond(c, { ok: r.ok, reason: r.reason, outcome: null, events: r.events });
    } finally {
      s.busy = null;
    }
  });

  app.post('/api/accept', async (c) => {
    const s = c.get('session');
    const parsed = await body(c, AcceptBody);
    if (!parsed.success) return c.json({ error: 'expected { contract_id }' }, 400);
    if (s.busy) return busy(c);
    const r = playerAccepts(s.world, parsed.data.contract_id);
    s.world = r.world;
    // Work has started, so the item is settled: draw it while the clock runs. Not awaited.
    if (r.ok) {
      const contract = s.world.contracts[parsed.data.contract_id];
      studio.start(s, contract, artistFor(s), NPCS.find((n) => n.id === contract.seller)?.art);
    }
    return respond(c, { ok: r.ok, reason: r.reason, outcome: null, events: r.events });
  });

  app.post('/api/tick', async (c) => {
    const s = c.get('session');
    const parsed = await body(c, TickBody);
    if (!parsed.success) return c.json({ error: `expected { ticks: 1–${MAX_SKIP} }` }, 400);
    if (s.busy) return busy(c);
    // NPCs on a timer may act once the clock has moved, so the world is locked until they have.
    s.busy = { by: 'npc', name: 'The village' };
    try {
      const r = await passTime(s.world, parsed.data.ticks, (choice) => modelFor(s, choice));
      s.world = r.world;
      return respond(c, { ok: true, reason: null, outcome: null, events: r.events });
    } finally {
      s.busy = null;
    }
  });

  app.post('/api/give', async (c) => {
    const s = c.get('session');
    const parsed = await body(c, GiveBody);
    if (!parsed.success) return c.json({ error: 'expected { to, gift }' }, 400);
    if (s.busy) return busy(c);
    const r = playerGives(s.world, parsed.data.to, parsed.data.gift);
    s.world = r.world;
    return respond(c, { ok: r.ok, reason: r.reason, outcome: null, events: r.events });
  });

  // God mode: something happened that no verb covers. The engine checks the report (the body is passed as it came) and
  // logs it; whoever it gave news to share at their own place may act on it, so the world is locked until they have.
  app.post('/api/god', async (c) => {
    const s = c.get('session');
    const raw: unknown = await c.req.json().catch(() => null);
    if (s.busy) return busy(c);
    s.busy = { by: 'npc', name: 'The village' };
    try {
      const r = await worldReports(s.world, raw, (choice) => modelFor(s, choice));
      s.world = r.world;
      return respond(c, { ok: r.ok, reason: r.reason, outcome: null, events: r.events });
    } finally {
      s.busy = null;
    }
  });

  // God mode in plain words: Muse Spark fills in the report form from a note. Nothing is logged until the form is sent.
  // It is a model call like a turn, so it takes the same lock: one at a time, and the clock waits for it.
  app.post('/api/god/read', async (c) => {
    const s = c.get('session');
    const parsed = await body(c, NoteBody);
    if (!parsed.success) return c.json({ error: `expected { note } of at most ${MAX_NOTE_LENGTH} characters` }, 400);
    if (s.busy) return busy(c);
    const model = modelFor(s, 'muse_spark');
    if (!model) return c.json({ error: "The chronicler isn't available right now. Fill in the form yourself." }, 503);
    s.busy = { by: 'npc', name: 'The chronicler' };
    try {
      const people = [player.id, ...NPCS.map((n) => n.id)].map((id) => ({ id, name: nameOf(id) }));
      const report = await readNote(parsed.data.note, model, { places: PLACE_NAMES, people, now: s.world.tick });
      if (!report) return c.json({ error: "The chronicler couldn't make sense of that. Try other words, or fill in the form yourself." }, 502);
      return c.json({ report } satisfies ReadNoteResponse);
    } finally {
      s.busy = null;
    }
  });

  app.post('/api/reset', (c) => {
    const s = c.get('session');
    if (s.busy) return busy(c);
    s.world = newVillage();
    s.art = new Map();
    return respond(c, { ok: true, reason: null, outcome: null, events: [] });
  });

  mountEditor(app, { modelFor, artistFor, canSave: deps.canSaveNpcs ?? false, files: deps.npcFiles ?? NPC_FILES, limits: deps.bench });
  app.route('/api/v1', createV1({ makeModel: deps.makeModel, makeArtist: deps.makeArtist, studio, clientIp: deps.clientIp, limits: deps.v1 }));

  return app;
}
