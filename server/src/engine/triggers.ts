import type { Trigger } from '@blacksmith/shared';
import type { EventDraft } from './events';
import { memoriesOf, newsFor, passedOnBy } from './memory';
import type { World } from './state';
import { placeAt } from './schedule';
import { placeOf, type Actor } from './validator';

// When an NPC acts on its own. Pure: town/ asks which timers came round and logs the firing; the turn itself is the agent's.

export type TimedTrigger = Extract<Trigger, { kind: 'every_hours' }>;

// The timer that came round for one NPC as the clock moved from `from` to `to`: a multiple of its hours was passed.
// At most one per NPC however many multiples a long skip crosses, so a skip never queues a turn for each of them.
export function timedTrigger(triggers: readonly Trigger[], from: number, to: number): TimedTrigger | null {
  for (const t of triggers) {
    if (t.kind === 'every_hours' && Math.floor(to / t.hours) > Math.floor(from / t.hours)) return t;
  }
  return null;
}

// The tick an NPC last acted on its own, or -1. Who waited longest goes first when the per-tick cap bites.
export function lastFired(world: World, npcId: string): number {
  for (let i = world.events.length - 1; i >= 0; i--) {
    const e = world.events[i];
    if (e.type === 'TRIGGER_FIRED' && e.actor === npcId) return e.tick;
  }
  return -1;
}

// Where in the log it last acted on its own, or -1: what it learned after that is new to it.
export function lastFiredAt(world: World, npcId: string): number {
  for (let i = world.events.length - 1; i >= 0; i--) {
    const e = world.events[i];
    if (e.type === 'TRIGGER_FIRED' && e.actor === npcId) return i;
  }
  return -1;
}

export type Meeting = { with: string; news: string[] }; // news: event ids it knows and they haven't heard

type Placed = Pick<Actor, 'id' | 'location' | 'schedule'>;

// Someone it is with now and wasn't with at `from` (one of them has come along), who hasn't heard something it knows.
// Null when nobody: meeting someone with nothing to tell them costs no turn.
export function meeting(world: World, npc: Placed, others: readonly Placed[], from: number): Meeting | null {
  const here = placeAt(npc, world.tick);
  for (const o of others) {
    if (o.id === npc.id || o.location === undefined || placeAt(o, world.tick) !== here) continue;
    if (placeAt(o, from) === placeAt(npc, from)) continue; // together already: they met before
    const news = newsFor(world, npc.id, o.id);
    if (news.length) return { with: o.id, news };
  }
  return null;
}

// It has learned something since it last acted on its own that it hasn't passed on yet, and is at its own place to
// share it (the bard at the tavern). News it already told, even when asked, isn't news again because someone tells it
// more surely.
export function hasNews(world: World, npc: Placed): boolean {
  if (placeAt(npc, world.tick) !== placeOf(npc)) return false;
  const since = lastFiredAt(world, npc.id);
  const shared = passedOnBy(world, npc.id);
  return memoriesOf(world, npc.id).some((m) => m.learned > since && !shared.has(m.event_id));
}

export function triggerFired(world: World, npc: Pick<Actor, 'id' | 'location' | 'schedule'>, trigger: Trigger): EventDraft {
  return { type: 'TRIGGER_FIRED', tick: world.tick, actor: npc.id, target: null, location: placeAt(npc, world.tick), witnesses: [], data: { trigger } };
}
