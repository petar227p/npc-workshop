import type { EventType, Sense } from './events';
import { placeAt } from './schedule';
import type { Actor } from './validator';

// Who sees what. An actor with a perception radius witnesses an event when, at the event's tick, its own place is
// within that radius of the event's place. Places come from schedules, which code owns, so nobody can claim to have
// been somewhere. The distance between places is the caller's (the village map's); the engine knows no map.

export type Distance = (a: string, b: string) => number; // between two named places, in tiles; Infinity if unknown

// Bookkeeping, not something that happened in the village: nobody sees it. (A sync is the game's own record of what
// it changed; if the change was a deed worth gossip, the game reports that too.)
const UNSEEN = new Set<EventType>(['ACTION_REJECTED', 'TRIGGER_FIRED', 'CLOCK_ADVANCED', 'SYNCED']);

export function senses(actors: readonly Actor[], distance: Distance): Sense {
  const lookers = actors.filter((a) => a.perception_radius !== undefined);
  return (e) =>
    UNSEEN.has(e.type)
      ? []
      : lookers.filter((a) => a.id !== e.actor && distance(placeAt(a, e.tick), e.location) <= a.perception_radius!).map((a) => a.id);
}
