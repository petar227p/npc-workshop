import { commit, type EngineEvent, type EventDraft, type Sense } from './events';
import { isMadeToOrder, type World } from './state';

// Moves time forward. Deliveries happen here, by code, at their due tick; the item is a copy of the contract.
// `sense`: who saw each delivery, from where everyone was at its tick.
export function advance(world: World, ticks: number, sense?: Sense): { world: World; events: EngineEvent[] } {
  if (!Number.isInteger(ticks) || ticks <= 0) throw new Error(`advance needs a positive whole number of ticks, got ${ticks}`);
  const to = world.tick + ticks;

  const due = Object.values(world.contracts)
    .filter(isMadeToOrder)
    .filter((c) => c.status === 'in_progress' && c.due_tick !== null && c.due_tick <= to)
    .sort((a, b) => a.due_tick! - b.due_tick! || a.contract_id.localeCompare(b.contract_id));

  const drafts: EventDraft[] = due.map((c) => ({
    type: 'ITEM_DELIVERED',
    tick: c.due_tick!,
    actor: 'clock',
    target: c.customer,
    location: c.location,
    witnesses: [],
    data: {
      contract_id: c.contract_id,
      item: {
        item_id: `i_${c.contract_id}`,
        contract_id: c.contract_id,
        owner: c.customer,
        item_name: c.item_name,
        item_type: c.item_type,
        description: c.description,
        stats: { ...c.stats },
        delivered_tick: c.due_tick!,
      },
    },
  }));
  drafts.push({
    type: 'CLOCK_ADVANCED',
    tick: to,
    actor: 'clock',
    target: null,
    location: 'village',
    witnesses: [],
    data: { from: world.tick },
  });

  return commit(world, drafts, sense);
}
