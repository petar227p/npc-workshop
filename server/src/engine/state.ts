import type { Contract, ContractStatus, EngineEvent, Item } from '@blacksmith/shared';
import { SEED } from '../config/world';

export type { ContractStatus, Item };

export type ContractRecord = Contract & {
  status: ContractStatus;
  customer: string;
  seller: string; // the actor who proposed it; only they may counter or withdraw it
  replaces: string | null;
  proposed_tick: number;
  due_tick: number | null;
};

// Everything here is derived from the event log; see events.ts `apply` / `replay`.
export type World = {
  tick: number;
  gold: Record<string, number>; // purse per actor id
  materials: Record<string, number>; // the smith's stock on hand, reserved or not
  contracts: Record<string, ContractRecord>;
  items: Item[];
  events: EngineEvent[];
};

export function createWorld(): World {
  return {
    tick: 0,
    gold: { ...SEED.gold },
    materials: { ...SEED.materials },
    contracts: {},
    items: [],
    events: [],
  };
}

// Jobs that hold gold and materials: they count toward workload and reservations.
export const isActive = (c: ContractRecord) => c.status === 'accepted' || c.status === 'in_progress';

export function activeJobs(world: World): number {
  return Object.values(world.contracts).filter(isActive).length;
}

export function reservedMaterials(world: World): Record<string, number> {
  const reserved: Record<string, number> = {};
  for (const c of Object.values(world.contracts).filter(isActive)) {
    for (const [m, n] of Object.entries(c.materials_used)) reserved[m] = (reserved[m] ?? 0) + n;
  }
  return reserved;
}

export function availableMaterials(world: World): Record<string, number> {
  const reserved = reservedMaterials(world);
  return Object.fromEntries(Object.entries(world.materials).map(([m, n]) => [m, n - (reserved[m] ?? 0)]));
}
