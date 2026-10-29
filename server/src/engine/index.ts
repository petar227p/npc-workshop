import type { Action } from '@blacksmith/shared';
import type { ZodError, ZodType } from 'zod';
import { commit, type EngineEvent, type Sense } from './events';
import { reported } from './happen';
import type { World } from './state';
import { placeAt } from './schedule';
import { own, reject, type ActOptions, type Actor, type ActorOf, type Verdict } from './validator';

export { advance } from './clock';
export { entryAt, placeAt } from './schedule';
export { apply, commit, replay, type EngineEvent, type EventDraft, type Sense } from './events';
export { DECAY, decayed, IN_MIND, inMind, isPassedOn, MEMORABLE, memoriesOf, memoryOf, newsFor, NOTABLE_KEPT, notableIds, passedOnBy, type Memory } from './memory';
export { WORLD } from './happen';
export { senses, type Distance } from './perception';
export * from './state';
export { hasNews, lastFired, lastFiredAt, meeting, timedTrigger, triggerFired, type Meeting, type TimedTrigger } from './triggers';
export * as verbs from './verbs';
export { minDeliveryTicks, minPrice, materialCost, placeOf, type ActOptions, type Actor, type AnyVerbDef, type Verdict, type VerbDef } from './validator';

export type ActResult = { world: World; ok: boolean; reason: string | null; events: EngineEvent[] };

function parseReason(error: ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'action'}: ${i.message}`).join('; ');
}

// The raw proposal is kept for the ledger, but a rejection must not let a huge input sit in the log
// (and in every response that echoes it). Anything longer is stored as a clipped JSON string.
export const MAX_PROPOSED_CHARS = 2000;

function clip(raw: unknown): unknown {
  const json = JSON.stringify(raw);
  return json !== undefined && json.length > MAX_PROPOSED_CHARS ? `${json.slice(0, MAX_PROPOSED_CHARS)}… (${json.length} characters)` : raw;
}

function verbOf(raw: unknown): string | null {
  const v = (raw as { action?: unknown } | null)?.action;
  return typeof v === 'string' ? v : null;
}

type Actors = Record<string, Actor>;
export type Act = (world: World, actor: string, raw: unknown, opts?: ActOptions) => ActResult;
export type Report = (world: World, raw: unknown) => ActResult;

// Who may do what comes from the actors passed in (see npcs/), not from the engine.
// A verb the actor doesn't list is rejected before its schema or rule ever runs.
function check(actors: Actors, world: World, actor: string, raw: unknown, opts: ActOptions): Verdict {
  const verb = verbOf(raw);
  const self = own(actors, actor);
  const def = self?.verbs.find((v) => v.verb === verb);
  if (!self || !def) {
    if (verb === 'DELIVER') return reject('only the clock delivers items, once the work is done');
    if (verb === null) return reject(`action: expected a JSON object with an "action" field`);
    return reject(`${actor} may not use ${verb}`);
  }
  // Each definition's schema only ever yields its own verb's action, so its rule can take what it parses.
  const run = def as unknown as { schema: ZodType<Action>; rule(w: World, a: Actor, action: Action, o: ActOptions, actorOf: ActorOf): Verdict };
  const parsed = run.schema.safeParse(raw);
  return parsed.success ? run.rule(world, self, parsed.data, opts, (id) => own(actors, id)) : reject(parseReason(parsed.error));
}

// The one door into the world for agents and the player: role check → parse → rule → commit.
// A rejection is logged as ACTION_REJECTED (no witnesses) and its reason comes back so the agent can voice it.
// Actors are keyed by their own id; two with one id is a definition error, not a silent overwrite.
// `sense` records who witnessed each accepted event (perception.ts); without it nobody does.
// `report` is the other door: a world event the game reports (happen.ts). A bad report changes nothing and isn't
// logged, since nobody in the world proposed it; the reason goes back to whoever sent it.
// `places` are where a report may say something happened; without them, anywhere.
export function createEngine(list: readonly Actor[], config: { sense?: Sense; places?: readonly string[] } = {}): { act: Act; report: Report } {
  const actors: Actors = {};
  for (const a of list) {
    if (Object.hasOwn(actors, a.id)) throw new Error(`two actors have the id '${a.id}'`);
    actors[a.id] = a;
  }
  return {
    act(world, actor, raw, opts = {}) {
      const verdict = check(actors, world, actor, raw, opts);
      if (verdict.ok) return { ...commit(world, verdict.events, config.sense), ok: true, reason: null };

      const rejected = commit(world, [
        {
          type: 'ACTION_REJECTED',
          tick: world.tick,
          actor,
          target: null,
          location: placeAt(own(actors, actor) ?? {}, world.tick),
          witnesses: [],
          data: { verb: verbOf(raw), reason: verdict.reason, proposed: clip(raw) },
        },
      ]);
      return { ...rejected, ok: false, reason: verdict.reason };
    },
    report(world, raw) {
      const r = reported(world, raw, list, config);
      if (!r.ok) return { world, events: [], ok: false, reason: r.reason };
      return { ...commit(world, [r.draft]), ok: true, reason: null };
    },
  };
}
