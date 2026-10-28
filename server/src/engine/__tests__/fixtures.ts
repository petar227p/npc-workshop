import type { Catalogue, Start } from '@blacksmith/shared';
import { verbs, type Actor } from '../index';

// The engine's own actors, so engine tests don't depend on the village's NPC files. Same numbers as Brann's.

export const FORGE: Catalogue = {
  made_to_order: {
    items: {
      sword: { damage: { min: 4, max: 20 }, weight: { min: 3, max: 12 }, durability: { min: 20, max: 90 }, base_ticks: 6 },
      dagger: { damage: { min: 2, max: 10 }, weight: { min: 1, max: 4 }, durability: { min: 15, max: 70 }, base_ticks: 3 },
    },
    materials: { iron: 10, steel: 25, oak: 4, leather: 6, sharkskin_leather: 15, silver: 40 },
    min_margin: 0.2,
    workload_per_job: 0.5,
  },
};
export const FORGE_START: Start = { gold: 50, stock: { iron: 12, steel: 4, oak: 8, leather: 6, sharkskin_leather: 2, silver: 1 } };

export const STALL: Catalogue = { in_stock: { torch: { min_price: 2 }, rope: { min_price: 4 } } };
export const STALL_START: Start = { gold: 30, stock: { torch: 10, rope: 2 } };

const sellerVerbs = [verbs.SAY, verbs.OFFER, verbs.COUNTER_OFFER, verbs.REFUSE, verbs.START_WORK];

export const smith: Actor = { id: 'smith', verbs: sellerVerbs, location: 'forge', catalogue: FORGE, start: FORGE_START };
export const merchant: Actor = { id: 'merchant', verbs: sellerVerbs, location: 'market', catalogue: STALL, start: STALL_START };
export const player: Actor = { id: 'player', verbs: [verbs.SAY, verbs.ACCEPT], start: { gold: 200, stock: {} } };

// The handoff example: 3 iron + 1 sharkskin = 45 gold of materials, minimum price 54.
export const hammerheadTerms = {
  kind: 'made_to_order',
  item_name: 'Hammerhead Blade',
  item_type: 'sword',
  description: 'A broad blade shaped like a hammerhead shark',
  stats: { damage: 14, weight: 6, durability: 70 },
  materials_used: { iron: 3, sharkskin_leather: 1 },
  price: 120,
  delivery_ticks: 8,
  remarks: "Heavy at the head. You'll feel it on the backswing.",
};
export const hammerhead = { action: 'OFFER', terms: hammerheadTerms };
