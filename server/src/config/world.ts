// World seed. Every number the validator checks against lives here, so balancing never touches engine code.

export type StatRange = { min: number; max: number };

export type ItemTypeDef = {
  damage: StatRange;
  weight: StatRange;
  durability: StatRange;
  base_ticks: number; // forge time with nothing else queued
};

// Brann's skill caps per item type. Floors stop physically silly items (a weightless iron sword).
export const ITEM_TYPES: Record<string, ItemTypeDef> = {
  sword: { damage: { min: 4, max: 20 }, weight: { min: 3, max: 12 }, durability: { min: 20, max: 90 }, base_ticks: 6 },
  dagger: { damage: { min: 2, max: 10 }, weight: { min: 1, max: 4 }, durability: { min: 15, max: 70 }, base_ticks: 3 },
  axe: { damage: { min: 6, max: 22 }, weight: { min: 4, max: 14 }, durability: { min: 25, max: 90 }, base_ticks: 6 },
  hammer: { damage: { min: 5, max: 18 }, weight: { min: 5, max: 16 }, durability: { min: 40, max: 100 }, base_ticks: 5 },
  shield: { damage: { min: 0, max: 4 }, weight: { min: 4, max: 15 }, durability: { min: 40, max: 100 }, base_ticks: 5 },
};

export const MATERIALS: Record<string, { cost: number }> = {
  iron: { cost: 10 },
  steel: { cost: 25 },
  oak: { cost: 4 },
  leather: { cost: 6 },
  sharkskin_leather: { cost: 15 },
  silver: { cost: 40 },
};

export const ECONOMY = {
  min_margin: 0.2, // price must cover material cost plus this share
  workload_per_job: 0.5, // each accepted or in-progress job adds this share of base_ticks
};

export const SEED = {
  gold: { player: 200, smith: 50 } as Record<string, number>,
  materials: { iron: 12, steel: 4, oak: 8, leather: 6, sharkskin_leather: 2, silver: 1 } as Record<string, number>,
};
