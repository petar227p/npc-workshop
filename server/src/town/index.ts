import type { ModelChoice, Trigger } from '@blacksmith/shared';
import { npcTurn, type Attempt, type NpcModel, type TurnResult } from '../agents/npc';
import { commit, hasNews, lastFired, meeting, timedTrigger, triggerFired, type Act, type EngineEvent, type Meeting, type World } from '../engine';
import type { NpcDefinition } from '../npcs/types';

// Decides which NPCs act on their own after the clock moves: a timer came round, the day brought it to someone with
// news to share, or it has heard something new and is at its own place. Each is a model call, so a busy town is capped:
// at most `cap` triggered turns per tick, whoever waited longest first. The rest get their turn when one next fires.

export const MAX_TURNS_PER_TICK = 3;

export type TownDeps = {
  act: Act; // the engine these NPCs are registered with
  modelFor: (choice: ModelChoice) => NpcModel | null; // null: that model isn't available, so the NPC sits this one out
  cap?: number;
};

// `outcome` is the last turn's, null when nobody acted; `attempts` are every turn's model answers, in order.
export type TownResult = { world: World; events: EngineEvent[]; turns: number; outcome: TurnResult['outcome'] | null; attempts: Attempt[] };

export type Due = { npc: NpcDefinition; trigger: Trigger; meeting?: Meeting };

// The first of its triggers that fires now, in the order they are listed.
function dueTrigger(world: World, from: number, npc: NpcDefinition, npcs: readonly NpcDefinition[]): Omit<Due, 'npc'> | null {
  for (const t of npc.triggers) {
    if (t.kind === 'every_hours' && timedTrigger([t], from, world.tick)) return { trigger: t };
    if (t.kind === 'on_meet') {
      const m = meeting(world, npc, npcs, from);
      if (m) return { trigger: t, meeting: m };
    }
    if (t.kind === 'on_new_memory' && hasNews(world, npc)) return { trigger: t };
  }
  return null;
}

// NPCs with a trigger that fires between `from` and now, in the order they would act.
export function dueNpcs(world: World, from: number, npcs: readonly NpcDefinition[]): Due[] {
  return npcs
    .map((npc, i) => ({ npc, i, due: dueTrigger(world, from, npc, npcs) }))
    .filter((d) => d.due !== null)
    .sort((a, b) => lastFired(world, a.npc.id) - lastFired(world, b.npc.id) || a.i - b.i)
    .map(({ npc, due }) => ({ npc, ...due! }));
}

// Meeting someone, the turn is a conversation with them: they are who it talks to, and the cue says who they are and
// which of its news they haven't heard (the ledger still checks whatever it passes on). Any other trigger speaks to nobody in particular.
function turnFor(d: Due, npcs: readonly NpcDefinition[]): { cue: string; customer?: string; to: string | null } {
  const cue = 'cue' in d.trigger ? d.trigger.cue : '';
  if (!d.meeting) return { cue, to: null };
  const name = npcs.find((n) => n.id === d.meeting!.with)?.name ?? d.meeting.with;
  return { cue: `${cue}\n\nYou have just run into ${name}. They haven't heard about: ${d.meeting.news.join(', ')}.`, customer: d.meeting.with, to: d.meeting.with };
}

export async function runTriggers(world: World, from: number, npcs: readonly NpcDefinition[], deps: TownDeps): Promise<TownResult> {
  let w = world;
  const events: EngineEvent[] = [];
  const attempts: Attempt[] = [];
  let outcome: TownResult['outcome'] = null;
  let turns = 0;
  for (const d of dueNpcs(world, from, npcs)) {
    if (turns >= (deps.cap ?? MAX_TURNS_PER_TICK)) break;
    const model = deps.modelFor(d.npc.model);
    if (!model) continue;
    const fired = commit(w, [triggerFired(w, d.npc, d.trigger)]);
    const turn = await npcTurn(d.npc, fired.world, model, { act: deps.act, ...turnFor(d, npcs) });
    w = turn.world;
    events.push(...fired.events, ...turn.events);
    attempts.push(...turn.attempts);
    outcome = turn.outcome;
    turns += 1;
  }
  return { world: w, events, turns, outcome, attempts };
}
