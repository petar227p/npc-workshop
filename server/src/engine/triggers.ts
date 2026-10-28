import type { Trigger } from '@blacksmith/shared';
import type { EventDraft } from './events';
import type { World } from './state';
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

export function triggerFired(world: World, npc: Pick<Actor, 'id' | 'location'>, trigger: Trigger): EventDraft {
  return { type: 'TRIGGER_FIRED', tick: world.tick, actor: npc.id, target: null, location: placeOf(npc), witnesses: [], data: { trigger } };
}
