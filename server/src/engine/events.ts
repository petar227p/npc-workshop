import type { EngineEvent } from '@blacksmith/shared';
import type { World } from './state';

export type { EngineEvent, EventType } from '@blacksmith/shared';

// The event log is the source of truth: the world is whatever `apply` makes of it, and `replay` rebuilds it.
// `apply` trusts its input. Checking belongs to validator.ts and clock.ts, which only ever produce legal events.

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventDraft = DistributiveOmit<EngineEvent, 'id'>;

export function apply(world: World, event: EngineEvent): World {
  const w = structuredClone(world);
  w.tick = Math.max(w.tick, event.tick); // an event reported late keeps its own time; the clock never goes back for it
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
        location: event.location,
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
      w.gold[c.customer] = (w.gold[c.customer] ?? 0) - event.data.price;
      w.gold[c.seller] = (w.gold[c.seller] ?? 0) + event.data.price;
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
      if (c.kind === 'made_to_order') {
        const stock = (w.stock[c.seller] ??= {});
        for (const [m, n] of Object.entries(c.materials_used)) stock[m] -= n;
      }
      w.items.push(event.data.item);
      break;
    }
    case 'GOODS_DELIVERED': {
      const c = w.contracts[event.data.contract_id];
      const { good, qty } = event.data;
      c.status = 'delivered';
      const from = (w.stock[c.seller] ??= {});
      const to = (w.stock[c.customer] ??= {});
      from[good] -= qty;
      to[good] = (to[good] ?? 0) + qty;
      break;
    }
    case 'GIVEN': {
      const { gift } = event.data;
      const [from, to] = [event.actor, event.target as string];
      if (gift.kind === 'gold') {
        w.gold[from] -= gift.amount;
        w.gold[to] = (w.gold[to] ?? 0) + gift.amount;
      } else if (gift.kind === 'good') {
        const a = (w.stock[from] ??= {});
        const b = (w.stock[to] ??= {});
        a[gift.good] -= gift.qty;
        b[gift.good] = (b[gift.good] ?? 0) + gift.qty;
      } else {
        const item = w.items.find((i) => i.item_id === gift.item_id);
        if (item) item.owner = to;
      }
      break;
    }
    // The game's own change (engine/sync.ts): the totals it says, for gold and for each good it names.
    case 'SYNCED': {
      const to = event.target as string;
      for (const c of event.data.changes) {
        if (c.what === 'gold') w.gold[to] = c.to;
        else (w.stock[to] ??= {})[c.what] = c.to;
      }
      break;
    }
    // News changes no state: who knows what is read from the log itself (memory.ts).
    case 'TOLD':
    case 'RETOLD':
    case 'ANNOUNCED':
    case 'HAPPENED': // narrative only: what it changes is who knows it
    case 'SAID':
    case 'EMOTED':
    case 'SIGNALED': // the game acts on it, in its own code
    case 'GIFT_REFUSED':
    case 'TRIGGER_FIRED':
    case 'ACTION_REJECTED':
    case 'CLOCK_ADVANCED':
      break;
  }
  return w;
}

// Who saw an event: worked out from where everyone is at its tick (perception.ts). Without one, nobody did.
export type Sense = (draft: EventDraft) => string[];

// Assigns sequential ids and applies drafts in order. `sense` fills in each event's witnesses as it is committed, so
// the log records who saw what and replay never has to work it out again.
export function commit(world: World, drafts: EventDraft[], sense?: Sense): { world: World; events: EngineEvent[] } {
  const events: EngineEvent[] = [];
  let w = world;
  for (const draft of drafts) {
    const seen = sense ? { ...draft, witnesses: sense(draft) } : draft;
    const event = { ...seen, id: `e_${String(w.events.length + 1).padStart(4, '0')}` } as EngineEvent;
    w = apply(w, event);
    events.push(event);
  }
  return { world: w, events };
}

// `seed` is the world the log started from (createWorld with the same actors).
export function replay(events: EngineEvent[], seed: World): World {
  return events.reduce(apply, seed);
}
