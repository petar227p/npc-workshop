import type { FactBlock } from '@blacksmith/shared';
import { ECONOMY, ITEM_TYPES, MATERIALS } from '../config/world';
import { activeJobs, availableMaterials, minDeliveryTicks, type World } from '../engine';

// The facts an NPC can be told, one block each. Code-owned numbers, so the model can quote prices and limits that will pass.
// A definition picks blocks by name; their text is joined in this order.

type Block = (world: World, npcId: string, customer: string) => string;

export const FACTS: Record<FactBlock, Block> = {
  clock: (world) => `Hour ${world.tick}. Jobs on your bench: ${activeJobs(world)}.`,
  purse: (world, _npc, customer) => `Customer's purse: ${world.gold[customer] ?? 0} gold.`,
  stock: (world) => {
    const available = availableMaterials(world);
    const stock = Object.entries(MATERIALS)
      .map(([m, { cost }]) => `${m} ${Math.max(0, available[m] ?? 0)} (${cost} gold each)`)
      .join(', ');
    return `Materials in stock (unreserved): ${stock}.`;
  },
  catalogue: (world) => {
    const makes = Object.entries(ITEM_TYPES)
      .map(
        ([type, d]) =>
          `- ${type}: damage ${d.damage.min}–${d.damage.max}, weight ${d.weight.min}–${d.weight.max}, durability ${d.durability.min}–${d.durability.max}; at least ${minDeliveryTicks(world, type)} hours`,
      )
      .join('\n');
    return `What you make (stat ranges; minimum forge hours with your current workload):\n${makes}`;
  },
  price_floor: () => `Price floor: material cost + ${ECONOMY.min_margin * 100}%, rounded up.`,
  // Only this NPC's own offers: another seller's aren't its to quote, counter or withdraw.
  open_offers: (world, npcId, customer) => {
    const open = Object.values(world.contracts).filter((c) => c.status === 'proposed' && c.customer === customer && c.seller === npcId);
    const offers = open.length ? open.map((c) => `- ${c.contract_id}: ${describe(c)}`).join('\n') : '- none';
    return `Your open offers to this customer:\n${offers}`;
  },
};

export const NO_FACTS = 'Nothing else is known right now.';

export function factsFor(npcId: string, blocks: readonly FactBlock[]): (world: World, customer: string) => string {
  const chosen = Object.keys(FACTS).filter((b) => blocks.includes(b as FactBlock)) as FactBlock[];
  return (world, customer) => chosen.map((b) => FACTS[b](world, npcId, customer)).join('\n\n') || NO_FACTS;
}

export function describe(c: { item_name: string; item_type: string; stats: { damage: number; weight: number; durability: number }; price: number; delivery_ticks: number }) {
  return `${c.item_name} (${c.item_type}) damage ${c.stats.damage} / weight ${c.stats.weight} / durability ${c.stats.durability}, ${c.price} gold, ${c.delivery_ticks} hours`;
}
