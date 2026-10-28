import { ACTION_SCHEMAS, STATS, type Action, type ActionOf, type Catalogue, type InStockTerms, type MadeToOrder, type MadeToOrderTerms, type ScheduleEntry, type Start, type Terms } from '@blacksmith/shared';
import type { ZodType } from 'zod';
import type { EventDraft } from './events';
import { placeAt } from './schedule';
import { activeJobs, availableStock, type World } from './state';

export type Verdict = { ok: true; events: EventDraft[] } | { ok: false; reason: string };

export type ActOptions = {
  customer?: string; // who a proposal is for; defaults to the player
  to?: string; // who a spoken line is addressed to, so each NPC's history holds only its own conversations
};

// A verb is its schema plus one rule. Actors (NPC definitions, the player) list the verbs they may use;
// DELIVER is in nobody's list: only the clock delivers. A rule gets the acting actor itself, so nothing in it
// names a particular NPC: the seller, its place and its catalogue all come from the actor and the offer.
export type VerbDef<V extends Action['action']> = {
  verb: V;
  schema: ZodType<ActionOf<V>>;
  rule(world: World, self: Actor, action: ActionOf<V>, opts: ActOptions): Verdict;
};
export type AnyVerbDef = { [V in Action['action']]: VerbDef<V> }[Action['action']];

export type Actor = {
  id: string;
  verbs: readonly AnyVerbDef[];
  location?: string; // its own place; 'village' for an actor with no place of its own (the player)
  schedule?: readonly ScheduleEntry[]; // where it is during the day; its own place when this says nothing
  catalogue?: Catalogue; // what it sells; OFFER checks terms against it
  start?: Start; // its purse and stock in a new world
};

// Its own place, whatever the hour. Events happen where it is at their tick: `placeAt`.
export const placeOf = (a: Pick<Actor, 'location'>) => a.location ?? 'village';

export const reject = (reason: string): Verdict => ({ ok: false, reason });

// Lookups by model-supplied keys must ignore Object.prototype, or 'toString' reads as a real item type or material.
export function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function materialCost(mto: MadeToOrder, materials: Record<string, number>): number {
  return Object.entries(materials).reduce((sum, [m, n]) => sum + (own(mto.materials, m) ?? 0) * n, 0);
}

export function minPrice(mto: MadeToOrder, materials: Record<string, number>): number {
  return Math.ceil(materialCost(mto, materials) * (1 + mto.min_margin));
}

export function minDeliveryTicks(world: World, seller: string, mto: MadeToOrder, itemType: string): number {
  return Math.ceil(mto.items[itemType].base_ticks * (1 + mto.workload_per_job * activeJobs(world, seller)));
}

const list = (r: Record<string, unknown> | undefined) => Object.keys(r ?? {}).join(', ') || 'nothing';

function checkMadeToOrder(world: World, self: Actor, t: MadeToOrderTerms): string | null {
  const mto = self.catalogue?.made_to_order;
  if (!mto) return `${self.id} doesn't take made-to-order work`;
  const def = own(mto.items, t.item_type);
  if (!def) return `unknown item type '${t.item_type}'; ${self.id} makes: ${list(mto.items)}`;

  for (const stat of STATS) {
    const v = t.stats[stat];
    const { min, max } = def[stat];
    if (v > max) return `${stat} ${v} is above the cap of ${max} for a ${t.item_type}`;
    if (v < min) return `${stat} ${v} is below the floor of ${min} for a ${t.item_type}`;
  }

  const used = Object.entries(t.materials_used);
  if (used.length === 0) return 'a made-to-order item must use at least one material';
  const available = availableStock(world, self.id);
  for (const [m, n] of used) {
    if (own(mto.materials, m) === undefined) return `unknown material '${m}'`;
    const have = own(available, m) ?? 0;
    if (n > have) return `needs ${n} ${m}, only ${have} available`;
  }

  const floor = minPrice(mto, t.materials_used);
  if (t.price < floor) {
    return `price ${t.price} is below the minimum of ${floor} (materials ${materialCost(mto, t.materials_used)} + ${mto.min_margin * 100}% margin)`;
  }

  const minTicks = minDeliveryTicks(world, self.id, mto, t.item_type);
  if (t.delivery_ticks < minTicks) {
    return `delivery in ${t.delivery_ticks} ticks is too fast; a ${t.item_type} takes at least ${minTicks} with ${activeJobs(world, self.id)} job(s) in hand`;
  }
  return null;
}

function checkInStock(world: World, self: Actor, t: InStockTerms): string | null {
  const goods = self.catalogue?.in_stock;
  const good = goods && own(goods, t.good);
  if (!good) return `'${t.good}' isn't for sale here; ${self.id} sells from stock: ${list(goods)}`;
  const have = own(availableStock(world, self.id), t.good) ?? 0;
  if (t.qty > have) return `needs ${t.qty} ${t.good}, only ${have} in stock`;
  const floor = good.min_price * t.qty;
  if (t.price < floor) return `price ${t.price} is below the minimum of ${floor} (${t.qty} × ${good.min_price})`;
  return null;
}

// Checks shared by OFFER and COUNTER_OFFER. Returns a reason, or null if the terms are legal for this seller.
function checkTerms(world: World, self: Actor, t: Terms): string | null {
  return t.kind === 'made_to_order' ? checkMadeToOrder(world, self, t) : checkInStock(world, self, t);
}

function nextContractId(world: World): string {
  return `c_${String(Object.keys(world.contracts).length + 1).padStart(3, '0')}`;
}

const at = (world: World, self: Actor) => ({ tick: world.tick, actor: self.id, location: placeAt(self, world.tick), witnesses: [] as string[] });

function proposal(world: World, self: Actor, terms: Terms, customer: string, replaces: string | null): EventDraft {
  return {
    ...at(world, self),
    type: 'CONTRACT_PROPOSED',
    target: customer,
    data: { contract: { ...terms, contract_id: nextContractId(world) }, customer, replaces },
  };
}

export const SAY: VerbDef<'SAY'> = {
  verb: 'SAY',
  schema: ACTION_SCHEMAS.SAY,
  rule: (world, self, action, opts) => ({ ok: true, events: [{ ...at(world, self), type: 'SAID', target: opts.to ?? null, data: { text: action.text } }] }),
};

// Flavour: a gesture changes nothing, so it is always allowed.
export const EMOTE: VerbDef<'EMOTE'> = {
  verb: 'EMOTE',
  schema: ACTION_SCHEMAS.EMOTE,
  rule: (world, self, action, opts) => ({ ok: true, events: [{ ...at(world, self), type: 'EMOTED', target: opts.to ?? null, data: { text: action.text } }] }),
};

export const OFFER: VerbDef<'OFFER'> = {
  verb: 'OFFER',
  schema: ACTION_SCHEMAS.OFFER,
  rule(world, self, action, opts) {
    const reason = checkTerms(world, self, action.terms);
    if (reason) return reject(reason);
    return { ok: true, events: [proposal(world, self, action.terms, opts.customer ?? 'player', null)] };
  },
};

export const COUNTER_OFFER: VerbDef<'COUNTER_OFFER'> = {
  verb: 'COUNTER_OFFER',
  schema: ACTION_SCHEMAS.COUNTER_OFFER,
  rule(world, self, action) {
    const old = own(world.contracts, action.replaces);
    if (!old) return reject(`no contract ${action.replaces} to counter`);
    if (old.status !== 'proposed') return reject(`contract ${action.replaces} is ${old.status}, not open for a counter-offer`);
    if (old.seller !== self.id) return reject(`contract ${action.replaces} is ${old.seller}'s offer; ${self.id} can only counter its own`);
    const reason = checkTerms(world, self, action.terms);
    if (reason) return reject(reason);
    return { ok: true, events: [proposal(world, self, action.terms, old.customer, action.replaces)] };
  },
};

export const REFUSE: VerbDef<'REFUSE'> = {
  verb: 'REFUSE',
  schema: ACTION_SCHEMAS.REFUSE,
  rule(world, self, action, opts) {
    // A seller may always refuse an order (pride); withdrawing a specific contract needs it to be open and its own.
    if (action.contract_id) {
      const c = own(world.contracts, action.contract_id);
      if (!c) return reject(`no contract ${action.contract_id} to refuse`);
      if (c.status !== 'proposed') return reject(`contract ${action.contract_id} is ${c.status}; it can't be refused now`);
      if (c.seller !== self.id) return reject(`contract ${action.contract_id} is ${c.seller}'s offer; ${self.id} can only withdraw its own`);
    }
    const target = action.contract_id ? world.contracts[action.contract_id].customer : (opts.customer ?? 'player');
    return {
      ok: true,
      events: [{ ...at(world, self), type: 'CONTRACT_REFUSED', target, data: { contract_id: action.contract_id, reason: action.reason } }],
    };
  },
};

// The customer pays the offer's seller. In-stock goods change hands at once; made-to-order work waits for START_WORK.
export const ACCEPT: VerbDef<'ACCEPT'> = {
  verb: 'ACCEPT',
  schema: ACTION_SCHEMAS.ACCEPT,
  rule(world, self, action) {
    const c = own(world.contracts, action.contract_id);
    if (!c) return reject(`no contract ${action.contract_id}`);
    if (c.status !== 'proposed') return reject(`contract ${action.contract_id} is ${c.status}, not open`);
    if (c.customer !== self.id) return reject(`contract ${action.contract_id} was offered to ${c.customer}, not ${self.id}`);
    const gold = world.gold[self.id] ?? 0;
    if (gold < c.price) return reject(`${self.id} has ${gold} gold; the contract costs ${c.price}`);
    // Stock may have been reserved or sold since this offer was made.
    const needs = c.kind === 'made_to_order' ? c.materials_used : { [c.good]: c.qty };
    const available = availableStock(world, c.seller);
    for (const [m, n] of Object.entries(needs)) {
      const left = own(available, m) ?? 0;
      if (n > left) return reject(`needs ${n} ${m}, only ${left} left unreserved`);
    }
    const here = { tick: world.tick, location: c.location, witnesses: [] as string[] };
    const events: EventDraft[] = [
      { ...here, type: 'CONTRACT_ACCEPTED', actor: self.id, target: c.seller, data: { contract_id: c.contract_id, price: c.price } },
    ];
    if (c.kind === 'in_stock') {
      events.push({ ...here, type: 'GOODS_DELIVERED', actor: c.seller, target: c.customer, data: { contract_id: c.contract_id, good: c.good, qty: c.qty } });
    }
    return { ok: true, events };
  },
};

export const START_WORK: VerbDef<'START_WORK'> = {
  verb: 'START_WORK',
  schema: ACTION_SCHEMAS.START_WORK,
  rule(world, self, action) {
    const c = own(world.contracts, action.contract_id);
    if (!c) return reject(`no contract ${action.contract_id}`);
    if (c.seller !== self.id) return reject(`contract ${action.contract_id} is ${c.seller}'s job, not ${self.id}'s`);
    if (c.kind !== 'made_to_order') return reject(`contract ${action.contract_id} is a sale from stock; there is no work to start`);
    if (c.status !== 'accepted') return reject(`contract ${action.contract_id} is ${c.status}; work starts only after it's accepted`);
    return {
      ok: true,
      events: [
        {
          ...at(world, self),
          type: 'WORK_STARTED',
          target: c.customer,
          data: { contract_id: c.contract_id, due_tick: world.tick + c.delivery_ticks },
        },
      ],
    };
  },
};

// A gift needs only that the giver has it: gold in its purse, goods it hasn't promised to a job, an item it owns.
// Whether an NPC should give at all is the definition's call (GIVE in its verbs); nothing is ever taken from the receiver.
export const GIVE: VerbDef<'GIVE'> = {
  verb: 'GIVE',
  schema: ACTION_SCHEMAS.GIVE,
  rule(world, self, action, opts) {
    const to = action.to ?? opts.customer ?? 'player';
    if (to === self.id) return reject(`${self.id} can't give something to itself`);
    // Every actor in a world has a purse from its start. Being in range waits for positions (the village).
    if (!Object.hasOwn(world.gold, to)) return reject(`there's nobody called '${to}' here to give to`);
    const g = action.gift;
    let itemName: string | null = null;
    if (g.kind === 'gold') {
      const have = world.gold[self.id] ?? 0;
      if (g.amount > have) return reject(`${self.id} has ${have} gold; it can't give ${g.amount}`);
    } else if (g.kind === 'good') {
      const have = own(availableStock(world, self.id), g.good) ?? 0;
      if (g.qty > have) return reject(`${self.id} has ${have} ${g.good} to spare; it can't give ${g.qty}`);
    } else {
      const item = world.items.find((i) => i.item_id === g.item_id);
      if (!item) return reject(`there is no item ${g.item_id}`);
      if (item.owner !== self.id) return reject(`${g.item_id} belongs to ${item.owner}, not ${self.id}`);
      itemName = item.item_name;
    }
    return { ok: true, events: [{ ...at(world, self), type: 'GIVEN', target: to, data: { gift: g, item_name: itemName } }] };
  },
};
