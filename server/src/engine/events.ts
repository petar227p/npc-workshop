import type { EngineEvent } from '@blacksmith/shared';
import { createWorld, type World } from './state';

export type { EngineEvent, EventType } from '@blacksmith/shared';

// The event log is the source of truth: the world is whatever `apply` makes of it, and `replay` rebuilds it.
// `apply` trusts its input. Checking belongs to validator.ts and clock.ts, which only ever produce legal events.

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventDraft = DistributiveOmit<EngineEvent, 'id'>;

export function apply(world: World, event: EngineEvent): World {
  const w = structuredClone(world);
  w.tick = event.tick;
  w.events.push(event);

  switch (event.type) {
    case 'CONTRACT_PROPOSED': {
      const { contract, customer, replaces } = event.data;
      if (replaces) w.contracts[replaces].status = 'superseded';
      w.contracts[contract.contract_id] = {
        ...contract,
        status: 'proposed',
        customer,
        seller: event.actor,
        replaces,
        proposed_tick: event.tick,
        due_tick: null,
      };
      break;
    }
    case 'CONTRACT_REFUSED':
      if (event.data.contract_id) w.contracts[event.data.contract_id].status = 'refused';
      break;
    case 'CONTRACT_ACCEPTED': {
      const c = w.contracts[event.data.contract_id];
      c.status = 'accepted';
      w.gold[c.customer] -= event.data.price;
      w.gold.smith = (w.gold.smith ?? 0) + event.data.price;
      break;
    }
    case 'WORK_STARTED': {
      const c = w.contracts[event.data.contract_id];
      c.status = 'in_progress';
      c.due_tick = event.data.due_tick;
      break;
    }
    case 'ITEM_DELIVERED': {
      const c = w.contracts[event.data.contract_id];
      c.status = 'delivered';
      for (const [m, n] of Object.entries(c.materials_used)) w.materials[m] -= n;
      w.items.push(event.data.item);
      break;
    }
    case 'SAID':
    case 'ACTION_REJECTED':
    case 'CLOCK_ADVANCED':
      break;
  }
  return w;
}

// Assigns sequential ids and applies drafts in order.
export function commit(world: World, drafts: EventDraft[]): { world: World; events: EngineEvent[] } {
  const events: EngineEvent[] = [];
  let w = world;
  for (const draft of drafts) {
    const event = { ...draft, id: `e_${String(w.events.length + 1).padStart(4, '0')}` } as EngineEvent;
    w = apply(w, event);
    events.push(event);
  }
  return { world: w, events };
}

export function replay(events: EngineEvent[], seed: World = createWorld()): World {
  return events.reduce(apply, seed);
}
