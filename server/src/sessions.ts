import { randomUUID } from 'node:crypto';
import { DEFAULT_SPRITE, type ContractView, type ModelChoice, type StateView } from '@blacksmith/shared';
import type { NpcModel } from './agents/npc';
import { artView, type Gallery } from './art';
import { availableStock, placeAt, type World } from './engine';
import { newVillage, type NpcSpec } from './npcs';
import type { ImageClient } from './models/image';

// One world per browser, in memory. `busy` locks the world while an NPC is thinking, so a tick or an
// accept can't land on a world that NPC's turn is about to overwrite.
// `bench` is the NPC editor's throwaway world, apart from the village one. The village chat and the bench share the lock
// (and the model client), so `busy` says which of them holds it (and, in the village, who is answering);
// `benchTurns` counts bench turns against its quota.
// `art` holds the item pictures of this world (a new game starts an empty one); `artRenders` counts them all.
export type Busy = { by: 'npc'; name: string } | { by: 'bench' } | null;
export type Session = {
  id: string;
  world: World;
  bench: World | null;
  busy: Busy;
  benchTurns: number;
  models: Partial<Record<ModelChoice, NpcModel>>; // made on first use, one per model choice
  art: Gallery;
  artRenders: number;
  artist: ImageClient | null;
  lastSeen: number;
};

// The 409 text for whichever turn holds the lock.
export const busyMessage = (s: Session) =>
  s.busy?.by === 'bench' ? 'The workshop bench is still answering.' : `${s.busy?.name ?? 'Someone'} is still answering.`;

const newSession = (id: string, lastSeen: number): Session => ({
  id,
  world: newVillage(),
  bench: null,
  busy: null,
  benchTurns: 0,
  models: {},
  art: new Map(),
  artRenders: 0,
  artist: null,
  lastSeen,
});

export type SessionLimits = {
  maxSessions?: number;
  maxNewPerMinute?: number; // across all visitors, so a script can't churn through the store
  maxNewPerIpPerMinute?: number; // so one address can't use up everyone's budget
  minIdleMs?: number; // only sessions idle this long may be evicted, so new visitors never push out active players
  now?: () => number;
};

export type Created = { ok: true; session: Session } | { ok: false; status: 429 | 503; error: string };

// A visitor who hasn't acted yet sees a fresh world that is stored nowhere.
export function guestSession(): Session {
  return newSession('', 0);
}

export function createSessionStore(limits: SessionLimits = {}) {
  const { maxSessions = 500, maxNewPerMinute = 60, maxNewPerIpPerMinute = 10, minIdleMs = 30 * 60_000, now = Date.now } = limits;
  const sessions = new Map<string, Session>();
  let recent: { at: number; ip: string | null }[] = []; // sessions created in the last minute

  return {
    get(id: string | undefined): Session | undefined {
      const s = id ? sessions.get(id) : undefined;
      if (s) s.lastSeen = now();
      return s;
    },
    // `ip` is the visitor's address when the host can tell us it reliably; null skips the per-address cap.
    create(ip: string | null = null): Created {
      const t = now();
      recent = recent.filter((r) => t - r.at < 60_000);
      if (ip !== null && recent.filter((r) => r.ip === ip).length >= maxNewPerIpPerMinute) {
        return { ok: false, status: 429, error: 'Too many new games from your address. Try again in a minute.' };
      }
      if (recent.length >= maxNewPerMinute) return { ok: false, status: 429, error: 'Too many new visitors right now. Try again in a minute.' };
      if (sessions.size >= maxSessions) {
        // Evict the least recently seen session that has been idle long enough; never an active player.
        const idle = [...sessions.values()]
          .filter((s) => !s.busy && t - s.lastSeen >= minIdleMs)
          .sort((a, b) => a.lastSeen - b.lastSeen)[0];
        if (!idle) return { ok: false, status: 503, error: 'The forge is full. Try again later.' };
        sessions.delete(idle.id);
      }
      recent.push({ at: t, ip });
      const s = newSession(randomUUID(), t);
      sessions.set(s.id, s);
      return { ok: true, session: s };
    },
    get size() {
      return sessions.size;
    },
  };
}

const VIEW_EVENTS = 300;

// The NPCs a view shows: their names label each seller's stock (an actor without one is shown by its id),
// and where they are comes from their schedule.
export type Cast = readonly Pick<NpcSpec, 'id' | 'name' | 'sprite' | 'location' | 'schedule'>[];

export function toView(world: World, busy: boolean, art: Gallery = new Map(), cast: Cast = [], customer = 'player'): StateView {
  const names = Object.fromEntries(cast.map((n) => [n.id, n.name]));
  const contracts: ContractView[] = Object.values(world.contracts)
    .filter((c) => c.customer === customer)
    .map(({ customer: _c, proposed_tick: _p, location: _l, ...c }) => c);
  return {
    tick: world.tick,
    people: cast.map((n) => ({ id: n.id, name: n.name, sprite: n.sprite ?? DEFAULT_SPRITE, place: placeAt(n, world.tick) })),
    gold: world.gold[customer] ?? 0,
    goods: { ...(world.stock[customer] ?? {}) },
    shops: Object.keys(world.stock)
      .filter((id) => id !== customer)
      .map((id) => ({ id, name: names[id] ?? id, stock: availableStock(world, id) })),
    contracts,
    items: world.items.filter((i) => i.owner === customer),
    events: world.events.slice(-VIEW_EVENTS),
    busy,
    art: artView(art),
  };
}
