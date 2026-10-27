import { npcTurn, type NpcModel, type TurnResult } from './agents/npc';
import { advance, type ActResult, type EngineEvent, type World } from './engine';
import { act, smith } from './npcs';

// What the player can do. Routes call these; each returns the new world plus the events it produced.

export async function playerSays(world: World, text: string, model: NpcModel): Promise<TurnResult | ActResult> {
  const said = act(world, 'player', { action: 'SAY', text });
  if (!said.ok) return said;
  const turn = await npcTurn(smith, said.world, model);
  return { ...turn, events: [...said.events, ...turn.events] };
}

// Accepting starts the work at once: START_WORK is issued by code on the smith's behalf, so the timer can't stall.
export function playerAccepts(world: World, contractId: string): ActResult {
  const accepted = act(world, 'player', { action: 'ACCEPT', contract_id: contractId });
  if (!accepted.ok) return accepted;
  const started = act(accepted.world, 'smith', { action: 'START_WORK', contract_id: contractId });
  return { ...started, events: [...accepted.events, ...started.events] };
}

export function skipTime(world: World, ticks: number): { world: World; events: EngineEvent[] } {
  return advance(world, ticks);
}
