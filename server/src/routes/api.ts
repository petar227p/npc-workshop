import { MAX_SAY_LENGTH, type ActionResponse, type ArtResponse } from '@blacksmith/shared';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { NpcModel } from '../agents/npc';
import { artView, createStudio, type StudioLimits } from '../art';
import { playerAccepts, playerSays, skipTime } from '../game';
import type { ImageClient } from '../models/image';
import { NAMES, NPC_FILES, NPCS, newVillage, smith as brann, type NpcFiles } from '../npcs';
import { busyMessage, createSessionStore, guestSession, toView, type Session, type SessionLimits } from '../sessions';
import { mountEditor, type BenchLimits } from './editor';

const COOKIE = 'bs_session';
const MAX_SKIP = 48;
const MAX_BODY_BYTES = 16 * 1024; // the largest real body is a 500-character line
// An editor draft: a 6000-character persona is up to 36 KB of JSON if every character is escaped (\u0001), plus the short fields.
const MAX_EDITOR_BODY_BYTES = 64 * 1024;
const SMITH_UNAVAILABLE = "Brann isn't at the forge right now. Try again later.";
const ART_FILE = /^([0-9a-f-]{36})\.png$/;

const SayBody = z.object({ text: z.string().max(MAX_SAY_LENGTH), npc: z.string().optional() }); // npc: who the player talks to; Brann by default
const AcceptBody = z.object({ contract_id: z.string() });
const TickBody = z.object({ ticks: z.number().int().min(1).max(MAX_SKIP) });

export type Env = { Variables: { session: Session } };

export type ApiDeps = {
  makeSmith: (sessionId: string) => NpcModel;
  makeArtist?: (sessionId: string) => ImageClient; // Muse Image; without it items keep the placeholder picture
  art?: StudioLimits;
  sessions?: SessionLimits;
  clientIp?: (c: Context) => string | null; // the visitor's address, for the per-address session cap
  secureCookie?: boolean; // true behind HTTPS in production
  canSaveNpcs?: boolean; // dev only: the NPC editor may write npcs/ and prompts/
  npcFiles?: NpcFiles; // where the editor's library comes from and saves go; the repo's npcs/ and prompts/ by default
  bench?: BenchLimits;
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
  app.use('/api/*', (c, next) => (c.req.path.startsWith('/api/editor/') ? editorLimit : limit)(c, next));

  // Sessions are made on the first action, not the first look: a crawler or a curl loop of GETs stores nothing.
  app.use('/api/*', async (c, next) => {
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
    return c.json({ ...r, view: toView(s.world, s.busy !== null, s.art, NAMES) } satisfies ActionResponse);
  };
  // A missing key or bad config is the server's problem: say so plainly, log the cause, change nothing.
  const modelFor = (s: Session): NpcModel | null => {
    if (!s.smith) {
      try {
        s.smith = deps.makeSmith(s.id);
      } catch (err) {
        console.error(`smith unavailable: ${(err as Error).message}`);
        return null;
      }
    }
    return s.smith;
  };
  // Same as the smith: a missing key only costs the pictures.
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
    return c.json(toView(s.world, s.busy !== null, s.art, NAMES));
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

    const smith = modelFor(s);
    if (!smith) return c.json({ error: SMITH_UNAVAILABLE }, 503);

    s.busy = 'forge';
    try {
      const r = await playerSays(s.world, parsed.data.text, smith, npc);
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
    if (r.ok) studio.start(s, s.world.contracts[parsed.data.contract_id], artistFor(s));
    return respond(c, { ok: r.ok, reason: r.reason, outcome: null, events: r.events });
  });

  app.post('/api/tick', async (c) => {
    const s = c.get('session');
    const parsed = await body(c, TickBody);
    if (!parsed.success) return c.json({ error: `expected { ticks: 1–${MAX_SKIP} }` }, 400);
    if (s.busy) return busy(c);
    const r = skipTime(s.world, parsed.data.ticks);
    s.world = r.world;
    return respond(c, { ok: true, reason: null, outcome: null, events: r.events });
  });

  app.post('/api/reset', (c) => {
    const s = c.get('session');
    if (s.busy) return busy(c);
    s.world = newVillage();
    s.art = new Map();
    return respond(c, { ok: true, reason: null, outcome: null, events: [] });
  });

  mountEditor(app, { modelFor, canSave: deps.canSaveNpcs ?? false, files: deps.npcFiles ?? NPC_FILES, limits: deps.bench });

  return app;
}
