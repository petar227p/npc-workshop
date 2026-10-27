import { ACTION_SCHEMAS, type Action, type ActionOf } from '@blacksmith/shared';
import type { ZodType } from 'zod';
import { ECONOMY, ITEM_TYPES, MATERIALS } from '../config/world';
import type { EventDraft } from './events';
import { activeJobs, availableMaterials, type World } from './state';

export type Verdict = { ok: true; events: EventDraft[] } | { ok: false; reason: string };

export type ActOptions = {
  customer?: string; // who a proposal is for; defaults to the player
};

// A verb is its schema plus one rule. Actors (NPC definitions, the player) list the verbs they may use;
// DELIVER is in nobody's list: only the clock delivers.
export type VerbDef<V extends Action['action']> = {
  verb: V;
  schema: ZodType<ActionOf<V>>;
  rule(world: World, actor: string, action: ActionOf<V>, opts: ActOptions): Verdict;
};
export type AnyVerbDef = { [V in Action['action']]: VerbDef<V> }[Action['action']];

export type Actor = { id: string; verbs: readonly AnyVerbDef[] };

const FORGE = 'forge';
const STATS = ['damage', 'weight', 'durability'] as const;

type Terms = ActionOf<'PROPOSE_CONTRACT'>;

export const reject = (reason: string): Verdict => ({ ok: false, reason });

// Lookups by model-supplied keys must ignore Object.prototype, or 'toString' reads as a real item type or material.
export function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function materialCost(materials: Record<string, number>): number {
  return Object.entries(materials).reduce((sum, [m, n]) => sum + (own(MATERIALS, m)?.cost ?? 0) * n, 0);
}

export function minPrice(materials: Record<string, number>): number {
  return Math.ceil(materialCost(materials) * (1 + ECONOMY.min_margin));
}

export function minDeliveryTicks(world: World, itemType: string): number {
  return Math.ceil(ITEM_TYPES[itemType].base_ticks * (1 + ECONOMY.workload_per_job * activeJobs(world)));
}

// Checks shared by PROPOSE_CONTRACT and COUNTER_OFFER. Returns a reason, or null if the terms are legal.
function checkTerms(world: World, t: Terms): string | null {
  const def = own(ITEM_TYPES, t.item_type);
  if (!def) return `unknown item type '${t.item_type}'; Brann makes: ${Object.keys(ITEM_TYPES).join(', ')}`;

  for (const stat of STATS) {
    const v = t.stats[stat];
    const { min, max } = def[stat];
    if (v > max) return `${stat} ${v} is above the cap of ${max} for a ${t.item_type}`;
    if (v < min) return `${stat} ${v} is below the floor of ${min} for a ${t.item_type}`;
  }

  const used = Object.entries(t.materials_used);
  if (used.length === 0) return 'a contract must use at least one material';
  const available = availableMaterials(world);
  for (const [m, n] of used) {
    if (!own(MATERIALS, m)) return `unknown material '${m}'`;
    const have = own(available, m) ?? 0;
    if (n > have) return `needs ${n} ${m}, only ${have} available`;
  }

  const floor = minPrice(t.materials_used);
  if (t.price < floor) {
    return `price ${t.price} is below the minimum of ${floor} (materials ${materialCost(t.materials_used)} + ${ECONOMY.min_margin * 100}% margin)`;
  }

  const minTicks = minDeliveryTicks(world, t.item_type);
  if (t.delivery_ticks < minTicks) {
    return `delivery in ${t.delivery_ticks} ticks is too fast; a ${t.item_type} takes at least ${minTicks} with ${activeJobs(world)} job(s) on the bench`;
  }
  return null;
}

function nextContractId(world: World): string {
  return `c_${String(Object.keys(world.contracts).length + 1).padStart(3, '0')}`;
}

function proposal(world: World, actor: string, t: Terms, customer: string, replaces: string | null): EventDraft {
  const { action: _, ...terms } = t;
  return {
    type: 'CONTRACT_PROPOSED',
    tick: world.tick,
    actor,
    target: customer,
    location: FORGE,
    witnesses: [],
    data: { contract: { ...terms, contract_id: nextContractId(world) }, customer, replaces },
  };
}

const at = (world: World, actor: string) => ({ tick: world.tick, actor, location: FORGE, witnesses: [] as string[] });

export const SAY: VerbDef<'SAY'> = {
  verb: 'SAY',
  schema: ACTION_SCHEMAS.SAY,
  rule: (world, actor, action) => ({ ok: true, events: [{ ...at(world, actor), type: 'SAID', target: null, data: { text: action.text } }] }),
};

export const PROPOSE_CONTRACT: VerbDef<'PROPOSE_CONTRACT'> = {
  verb: 'PROPOSE_CONTRACT',
  schema: ACTION_SCHEMAS.PROPOSE_CONTRACT,
  rule(world, actor, action, opts) {
    const reason = checkTerms(world, action);
    if (reason) return reject(reason);
    return { ok: true, events: [proposal(world, actor, action, opts.customer ?? 'player', null)] };
  },
};

export const COUNTER_OFFER: VerbDef<'COUNTER_OFFER'> = {
  verb: 'COUNTER_OFFER',
  schema: ACTION_SCHEMAS.COUNTER_OFFER,
  rule(world, actor, action) {
    const old = own(world.contracts, action.replaces);
    if (!old) return reject(`no contract ${action.replaces} to counter`);
    if (old.status !== 'proposed') return reject(`contract ${action.replaces} is ${old.status}, not open for a counter-offer`);
    if (old.seller !== actor) return reject(`contract ${action.replaces} is ${old.seller}'s offer; ${actor} can only counter its own`);
    const { replaces, ...rest } = action;
    const terms: Terms = { ...rest, action: 'PROPOSE_CONTRACT' };
    const reason = checkTerms(world, terms);
    if (reason) return reject(reason);
    return { ok: true, events: [proposal(world, actor, terms, old.customer, replaces)] };
  },
};

export const REFUSE: VerbDef<'REFUSE'> = {
  verb: 'REFUSE',
  schema: ACTION_SCHEMAS.REFUSE,
  rule(world, actor, action, opts) {
    // The smith may always refuse an order (pride); withdrawing a specific contract needs it to be open and its own.
    if (action.contract_id) {
      const c = own(world.contracts, action.contract_id);
      if (!c) return reject(`no contract ${action.contract_id} to refuse`);
      if (c.status !== 'proposed') return reject(`contract ${action.contract_id} is ${c.status}; it can't be refused now`);
      if (c.seller !== actor) return reject(`contract ${action.contract_id} is ${c.seller}'s offer; ${actor} can only withdraw its own`);
    }
    const target = action.contract_id ? world.contracts[action.contract_id].customer : (opts.customer ?? 'player');
    return {
      ok: true,
      events: [{ ...at(world, actor), type: 'CONTRACT_REFUSED', target, data: { contract_id: action.contract_id, reason: action.reason } }],
    };
  },
};

export const ACCEPT: VerbDef<'ACCEPT'> = {
  verb: 'ACCEPT',
  schema: ACTION_SCHEMAS.ACCEPT,
  rule(world, actor, action) {
    const c = own(world.contracts, action.contract_id);
    if (!c) return reject(`no contract ${action.contract_id}`);
    if (c.status !== 'proposed') return reject(`contract ${action.contract_id} is ${c.status}, not open`);
    if (c.customer !== actor) return reject(`contract ${action.contract_id} was offered to ${c.customer}, not ${actor}`);
    const gold = world.gold[actor] ?? 0;
    if (gold < c.price) return reject(`${actor} has ${gold} gold; the contract costs ${c.price}`);
    // Stock may have been reserved by another contract since this one was proposed.
    const available = availableMaterials(world);
    for (const [m, n] of Object.entries(c.materials_used)) {
      const left = own(available, m) ?? 0;
      if (n > left) return reject(`needs ${n} ${m}, only ${left} left unreserved`);
    }
    return {
      ok: true,
      events: [{ ...at(world, actor), type: 'CONTRACT_ACCEPTED', target: 'smith', data: { contract_id: c.contract_id, price: c.price } }],
    };
  },
};

export const START_WORK: VerbDef<'START_WORK'> = {
  verb: 'START_WORK',
  schema: ACTION_SCHEMAS.START_WORK,
  rule(world, actor, action) {
    const c = own(world.contracts, action.contract_id);
    if (!c) return reject(`no contract ${action.contract_id}`);
    if (c.status !== 'accepted') return reject(`contract ${action.contract_id} is ${c.status}; work starts only after it's accepted`);
    return {
      ok: true,
      events: [
        {
          ...at(world, actor),
          type: 'WORK_STARTED',
          target: c.customer,
          data: { contract_id: c.contract_id, due_tick: world.tick + c.delivery_ticks },
        },
      ],
    };
  },
};
