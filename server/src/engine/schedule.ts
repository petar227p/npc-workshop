import { hourOf, type ScheduleEntry } from '@blacksmith/shared';
import type { Actor } from './validator';

// Where each actor is at any tick. Code owns it: the browser only walks people toward the place it's told,
// so who was standing where when something happened can't be faked from the page.

// The entry for an hour: the latest one that has started by then, or, before the day's first, the last one
// (it runs on past midnight).
export function entryAt(schedule: readonly ScheduleEntry[], hour: number): ScheduleEntry | null {
  if (schedule.length === 0) return null;
  const sorted = [...schedule].sort((a, b) => a.from - b.from);
  return sorted.filter((e) => e.from <= hour).at(-1) ?? sorted.at(-1)!;
}

// 'village' for an actor with no place of its own (the player).
export function placeAt(actor: Pick<Actor, 'location' | 'schedule'>, tick: number): string {
  return entryAt(actor.schedule ?? [], hourOf(tick))?.place ?? actor.location ?? 'village';
}
