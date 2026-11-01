import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { draftKey, type ApiConnection } from '@blacksmith/shared/src/snapshot';
import type { ModelChoice, NpcDraft, Start } from '@blacksmith/shared';
import type { NpcModel } from './agents/npc';
import type { Gallery } from './art';
import { createEngine, createWorld, senses, type Act, type Report, type Sense, type Sync, type World } from './engine';
import type { ImageClient } from './models/image';
import { player, type NpcDefinition } from './npcs';
import { buildCast } from './npcs/load';
import { cappedStore } from './sessions';
import { PLACE_NAMES, placeDistance } from './village';

// A game's own world for the dev API (/api/v1). It holds only the NPCs the game picked, with an engine and a sense of
// who witnesses what built for exactly those, so nobody outside it sees its events. A bearer token, not a cookie, says
// who may drive it. `busy` names who is answering while a model call runs, like a browser session's lock.
// `calls` counts model calls against the world's quota; `art`, `artRenders` and `artist` are its item pictures.
export type GameWorld = {
  id: string;
  token: string;
  cast: readonly NpcDefinition[];
  connection: ApiConnection['npcs'];
  act: Act;
  report: Report;
  sync: Sync;
  sense: Sense;
  world: World;
  busy: string | null;
  models: Partial<Record<ModelChoice, NpcModel>>;
  calls: number;
  art: Gallery;
  artRenders: number;
  artist: ImageClient | null;
  lastSeen: number;
};

export type WorldLimits = {
  maxWorlds?: number;
  maxNewPerMinute?: number; // across all games
  maxNewPerIpPerMinute?: number;
  minIdleMs?: number; // only worlds idle this long may be evicted, so a game in play is never dropped
  now?: () => number;
};

// `start`: what the game says the player and any NPC hold when the world begins (its own saved inventories), in place
// of what their files say. The world is seeded from it, so replay starts from the same place.
function gameWorld(id: string, lastSeen: number, picked: readonly NpcDefinition[], drafts: readonly NpcDraft[], start: Record<string, Start>): GameWorld {
  start = structuredClone(start);
  const from = <T extends { id: string; start?: Start }>(a: T): T => (Object.hasOwn(start, a.id) ? { ...a, start: start[a.id] } : a);
  const cast = picked.map(from);
  const actors = [from({ ...player, start: structuredClone(player.start) }), ...cast];
  const sense = senses(actors, placeDistance);
  const { act, report, sync } = createEngine(actors, { sense, places: PLACE_NAMES });
  return {
    id,
    token: randomBytes(24).toString('base64url'),
    cast,
    connection: drafts.map((d) => ({ id: d.id, name: d.name, snapshot: `sha256:${createHash('sha256').update(draftKey(d)).digest('hex')}`, first_reply: null, last_say: null })),
    act,
    report,
    sync,
    sense,
    world: createWorld(actors),
    busy: null,
    models: {},
    calls: 0,
    art: new Map(),
    artRenders: 0,
    artist: null,
    lastSeen,
  };
}

// Compared in constant time, so a token can't be guessed a character at a time from how long a refusal takes.
export function sameToken(given: string | null, token: string): boolean {
  if (given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createWorldStore(limits: WorldLimits = {}) {
  const { maxWorlds = 200, maxNewPerMinute = 20, maxNewPerIpPerMinute = 5, minIdleMs = 30 * 60_000, now = Date.now } = limits;
  const store = cappedStore<GameWorld>(
    { max: maxWorlds, perMinute: maxNewPerMinute, perIpPerMinute: maxNewPerIpPerMinute, minIdleMs, now },
    {
      fromIp: 'Too many new worlds from your address. Try again in a minute.',
      overall: 'Too many new worlds right now. Try again in a minute.',
      full: 'The server holds as many worlds as it can. Try again later.',
    },
  );

  return {
    get: store.get,
    create(ip: string | null, drafts: readonly NpcDraft[], start: Record<string, Start> = {}, places: readonly string[] | null = PLACE_NAMES) {
      const built = buildCast(drafts, places);
      if (!built.ok) return { ok: false as const, status: 400 as const, error: built.errors.join('; ') };
      return store.add(ip, (id, t) => gameWorld(id, t, built.cast, drafts, start));
    },
    delete: store.delete,
    get size() {
      return store.size;
    },
  };
}
