import { WorldReportSchema, type WorldReport } from '@blacksmith/shared';
import type { ZodError } from 'zod';
import type { EventDraft, Sense } from './events';
import type { World } from './state';
import type { Actor } from './validator';

// Something that happened in the world that no verb covers: a boss slain at the gate, a fire at the farm, a storm.
// A game reports it (god mode stands in for one); the engine logs it like any deed, works out who saw it, and gossip
// carries it from there. It is narrative only: gold, stock and contracts change through verbs alone.
// A game may learn of something late ("the boss fell three hours ago"): the report can say how long ago, and the event
// keeps that time, though the log only ever grows at its end.

export const WORLD = 'world'; // the actor of every reported event: nobody in the village did it through a verb

export type Reported = { ok: true; draft: EventDraft } | { ok: false; reason: string };

const parseReason = (error: ZodError) => error.issues.map((i) => `${i.path.join('.') || 'report'}: ${i.message}`).join('; ');

// Who saw it. Those who took part always know; past that, whoever perception puts near enough, only the ones named,
// or everyone who sees anything at all (the actors with a perception radius). In the actors' own order, once each.
function witnesses(r: WorldReport, draft: EventDraft, actors: readonly Actor[], sense: Sense | undefined): string[] {
  const seen = new Set(r.involved);
  if (r.seen_by.kind === 'nearby') sense?.(draft).forEach((id) => seen.add(id));
  if (r.seen_by.kind === 'only') r.seen_by.ids.forEach((id) => seen.add(id));
  if (r.seen_by.kind === 'everyone') actors.filter((a) => a.perception_radius !== undefined).forEach((a) => seen.add(a.id));
  return actors.filter((a) => seen.has(a.id)).map((a) => a.id);
}

// `places`: where something can happen (the map's places); without it, anywhere. The engine knows no map.
export function reported(world: World, raw: unknown, actors: readonly Actor[], config: { sense?: Sense; places?: readonly string[] }): Reported {
  const parsed = WorldReportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: parseReason(parsed.error) };
  const r = parsed.data;
  if (config.places && !config.places.includes(r.place)) return { ok: false, reason: `there's no place called '${r.place}' in the village` };
  const known = new Set(actors.map((a) => a.id));
  const named = [...r.involved, ...(r.seen_by.kind === 'only' ? r.seen_by.ids : [])];
  const stranger = named.find((id) => !known.has(id));
  if (stranger !== undefined) return { ok: false, reason: `there's nobody called '${stranger}' in the village` };
  if (r.hours_ago > world.tick) return { ok: false, reason: `hours_ago: the village's story starts ${world.tick} hours ago; nothing can have happened before that` };

  // Reported late, it happened back then: the log gets it now, but who saw it is who was near enough then.
  const draft: EventDraft = {
    type: 'HAPPENED',
    tick: world.tick - r.hours_ago,
    actor: WORLD,
    target: null,
    location: r.place,
    witnesses: [],
    data: {
      text: r.text,
      involved: r.involved.filter((id, i) => r.involved.indexOf(id) === i),
      seen_by: r.seen_by.kind,
      notable: r.notable,
      reported_tick: world.tick,
    },
  };
  return { ok: true, draft: { ...draft, witnesses: witnesses(r, draft, actors, config.sense) } };
}
