import type { ModelChoice } from '@blacksmith/shared';
import { npcTurn, type Attempt, type NpcModel, type TurnResult } from '../agents/npc';
import { commit, lastFired, timedTrigger, triggerFired, type Act, type EngineEvent, type World } from '../engine';
import type { NpcDefinition } from '../npcs/types';

// Decides which NPCs act on their own after the clock moves. Each is a model call, so a busy town is capped:
// at most `cap` triggered turns per tick, whoever waited longest first. The rest get their turn when their timer next comes round.

export const MAX_TURNS_PER_TICK = 2;

export type TownDeps = {
  act: Act; // the engine these NPCs are registered with
  modelFor: (choice: ModelChoice) => NpcModel | null; // null: that model isn't available, so the NPC sits this one out
  cap?: number;
};

// `outcome` is the last turn's, null when nobody acted; `attempts` are every turn's model answers, in order.
export type TownResult = { world: World; events: EngineEvent[]; turns: number; outcome: TurnResult['outcome'] | null; attempts: Attempt[] };

// NPCs whose timer came round between `from` and now, in the order they would act.
export function dueNpcs(world: World, from: number, npcs: readonly NpcDefinition[]) {
  return npcs
    .map((npc, i) => ({ npc, i, trigger: timedTrigger(npc.triggers, from, world.tick) }))
    .filter((d) => d.trigger !== null)
    .sort((a, b) => lastFired(world, a.npc.id) - lastFired(world, b.npc.id) || a.i - b.i)
    .map(({ npc, trigger }) => ({ npc, trigger: trigger! }));
}

export async function runTriggers(world: World, from: number, npcs: readonly NpcDefinition[], deps: TownDeps): Promise<TownResult> {
  let w = world;
  const events: EngineEvent[] = [];
  const attempts: Attempt[] = [];
  let outcome: TownResult['outcome'] = null;
  let turns = 0;
  for (const { npc, trigger } of dueNpcs(world, from, npcs)) {
    if (turns >= (deps.cap ?? MAX_TURNS_PER_TICK)) break;
    const model = deps.modelFor(npc.model);
    if (!model) continue;
    const fired = commit(w, [triggerFired(w, npc, trigger)]);
    const turn = await npcTurn(npc, fired.world, model, { act: deps.act, cue: trigger.cue, to: null });
    w = turn.world;
    events.push(...fired.events, ...turn.events);
    attempts.push(...turn.attempts);
    outcome = turn.outcome;
    turns += 1;
  }
  return { world: w, events, turns, outcome, attempts };
}
