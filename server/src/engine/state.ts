import type { Contract, ContractStatus, EngineEvent, Item, Start } from '@blacksmith/shared';

export type { ContractStatus, Item };

export type ContractRecord = Contract & {
  status: ContractStatus;
  customer: string;
  seller: string; // the actor who proposed it; only they may counter or withdraw it, and they are paid on accept
  location: string; // where it was offered; the sale and the handover happen there
  replaces: string | null;
  proposed_tick: number;
  due_tick: number | null;
};

export type MadeToOrderRecord = Extract<ContractRecord, { kind: 'made_to_order' }>;
export const isMadeToOrder = (c: ContractRecord): c is MadeToOrderRecord => c.kind === 'made_to_order';

// Everything here is derived from the event log; see events.ts `apply` / `replay`.
export type World = {
  tick: number;
  gold: Record<string, number>; // purse per actor id
  stock: Record<string, Record<string, number>>; // goods and materials on hand per actor, reserved or not
  contracts: Record<string, ContractRecord>;
  items: Item[];
  events: EngineEvent[];
};

// A new world from what each actor starts with. The same actors give the same world, so replay can rebuild it.
export function createWorld(actors: readonly { id: string; start?: Start }[] = []): World {
  const gold: World['gold'] = {};
  const stock: World['stock'] = {};
  for (const a of actors) {
    if (!a.start) continue;
    gold[a.id] = a.start.gold;
    stock[a.id] = { ...a.start.stock };
  }
  return { tick: 0, gold, stock, contracts: {}, items: [], events: [] };
}

// Jobs that hold gold and materials: they count toward workload and reservations.
export const isActive = (c: ContractRecord) => c.status === 'accepted' || c.status === 'in_progress';

// Made-to-order jobs a seller has in hand.
export function activeJobs(world: World, seller: string): number {
  return Object.values(world.contracts).filter((c) => c.seller === seller && isActive(c)).length;
}

export function reservedStock(world: World, owner: string): Record<string, number> {
  const reserved: Record<string, number> = {};
  for (const c of Object.values(world.contracts)) {
    if (c.seller !== owner || !isActive(c) || c.kind !== 'made_to_order') continue;
    for (const [m, n] of Object.entries(c.materials_used)) reserved[m] = (reserved[m] ?? 0) + n;
  }
  return reserved;
}

export function availableStock(world: World, owner: string): Record<string, number> {
  const reserved = reservedStock(world, owner);
  const onHand = Object.hasOwn(world.stock, owner) ? world.stock[owner] : {};
  return Object.fromEntries(Object.entries(onHand).map(([m, n]) => [m, n - (reserved[m] ?? 0)]));
}
