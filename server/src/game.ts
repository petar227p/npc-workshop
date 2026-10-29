import { npcTurn, type NpcModel, type TurnResult } from './agents/npc';
import { advance, type Act, type ActResult, type EngineEvent, type Sense, type World } from './engine';
import { act, NPCS, sense, smith, type NpcDefinition } from './npcs';
import { runTriggers, type TownDeps, type TownResult } from './town';

// What the player can do. Routes call these; each returns the new world plus the events it produced.

// An NPC without the on_spoken_to trigger hears the line (it's in the log) but never answers it.
export const answers = (npc: NpcDefinition) => npc.triggers.some((t) => t.kind === 'on_spoken_to');

// The line alone, with no reply: for an NPC that doesn't answer when spoken to.
export function playerSpeaks(world: World, text: string, npc: NpcDefinition): ActResult {
  return act(world, 'player', { action: 'SAY', text }, { to: npc.id });
}

export async function playerSays(world: World, text: string, model: NpcModel, npc: NpcDefinition = smith): Promise<TurnResult | ActResult> {
  const said = playerSpeaks(world, text, npc);
  if (!said.ok || !answers(npc)) return said;
  const turn = await npcTurn(npc, said.world, model);
  return { ...turn, events: [...said.events, ...turn.events] };
}

// Accepting a made-to-order offer starts the work at once: START_WORK is issued by code on the seller's behalf,
// so the timer can't stall. An in-stock sale is already handed over by the accept itself.
export function playerAccepts(world: World, contractId: string): ActResult {
  const accepted = act(world, 'player', { action: 'ACCEPT', contract_id: contractId });
  if (!accepted.ok) return accepted;
  const c = accepted.world.contracts[contractId];
  if (c.kind !== 'made_to_order') return accepted;
  const started = act(accepted.world, c.seller, { action: 'START_WORK', contract_id: contractId });
  return { ...started, events: [...accepted.events, ...started.events] };
}

// `gift` is checked by the engine like any proposal, so a malformed one is logged as a rejection.
export function playerGives(world: World, to: string, gift: unknown): ActResult {
  return act(world, 'player', { action: 'GIVE', to, gift }, { to });
}

export function skipTime(world: World, ticks: number): { world: World; events: EngineEvent[] } {
  return advance(world, ticks, sense);
}

// The clock moves (the village sees whatever it delivers), then any NPC whose trigger fires acts on its own
// (capped per tick; see town/). `sense: null` for a world outside the village, where nobody witnesses anything.
export async function passTime(
  world: World,
  ticks: number,
  modelFor: TownDeps['modelFor'],
  opts: { npcs?: readonly NpcDefinition[]; act?: Act; cap?: number; sense?: Sense | null } = {},
): Promise<TownResult> {
  const moved = advance(world, ticks, opts.sense === null ? undefined : (opts.sense ?? sense));
  const town = await runTriggers(moved.world, world.tick, opts.npcs ?? NPCS, { act: opts.act ?? act, modelFor, cap: opts.cap });
  return { ...town, events: [...moved.events, ...town.events] };
}
