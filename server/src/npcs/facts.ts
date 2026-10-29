import { clockText, type Catalogue, type Contract, type FactBlock } from '@blacksmith/shared';
import { activeJobs, availableStock, minDeliveryTicks, type World } from '../engine';

// The facts an NPC can be told, one block each. Code-owned numbers, so the model can quote prices and limits that will pass.
// A definition picks blocks by name; their text is joined in this order. Every block reads the NPC's own catalogue and stock.

type Block = (world: World, npcId: string, customer: string, catalogue: Catalogue) => string | null;

const show = (name: string) => name.replace(/_/g, ' ');

export const FACTS: Record<FactBlock, Block> = {
  // The same day and time the player sees, so a line about the morning comes in the morning.
  clock: (world, npcId) => `It is ${clockText(world.tick)}. Jobs in hand: ${activeJobs(world, npcId)}.`,
  purse: (world, _npc, customer) => `Customer's purse: ${world.gold[customer] ?? 0} gold.`,
  stock: (world, npcId, _customer, catalogue) => {
    const available = availableStock(world, npcId);
    const count = (name: string) => Math.max(0, Object.hasOwn(available, name) ? available[name] : 0);
    const lines: string[] = [];
    const mto = catalogue.made_to_order;
    if (mto) {
      const stock = Object.entries(mto.materials)
        .map(([m, cost]) => `${m} ${count(m)} (${cost} gold each)`)
        .join(', ');
      lines.push(`Materials in stock (unreserved): ${stock}.`);
    }
    if (catalogue.in_stock) lines.push(`Goods on the shelf: ${Object.keys(catalogue.in_stock).map((g) => `${g} ${count(g)}`).join(', ')}.`);
    return lines.join('\n') || null;
  },
  // Everything it owns, not only what it sells: GIVE can hand over any of it, and items go by id.
  inventory: (world, npcId) => {
    const goods = Object.entries(availableStock(world, npcId))
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${g} ${n}`)
      .join(', ');
    const items = world.items.filter((i) => i.owner === npcId).map((i) => `${i.item_id} ${JSON.stringify(i.item_name)} (${i.item_type})`);
    const lines = [`Your purse: ${world.gold[npcId] ?? 0} gold.`, `You have (not promised to a job): ${goods || 'nothing'}.`];
    if (items.length) lines.push(`Items you own: ${items.join(', ')}.`);
    return lines.join('\n');
  },
  catalogue: (world, npcId, _customer, catalogue) => {
    const parts: string[] = [];
    const mto = catalogue.made_to_order;
    if (mto) {
      const makes = Object.entries(mto.items)
        .map(
          ([type, d]) =>
            `- ${type}: damage ${d.damage.min}–${d.damage.max}, weight ${d.weight.min}–${d.weight.max}, durability ${d.durability.min}–${d.durability.max}; at least ${minDeliveryTicks(world, npcId, mto, type)} hours`,
        )
        .join('\n');
      parts.push(`What you make to order (stat ranges; minimum hours with your current workload):\n${makes}`);
    }
    if (catalogue.in_stock) {
      const sells = Object.entries(catalogue.in_stock)
        .map(([g, { min_price }]) => `- ${g}: at least ${min_price} gold each`)
        .join('\n');
      parts.push(`What you sell from stock:\n${sells}`);
    }
    return parts.join('\n\n') || 'You have nothing to sell.';
  },
  price_floor: (_world, _npc, _customer, catalogue) => {
    const lines: string[] = [];
    if (catalogue.made_to_order) lines.push(`Price floor for made-to-order work: material cost + ${Math.round(catalogue.made_to_order.min_margin * 1000) / 10}%, rounded up.`);
    if (catalogue.in_stock) lines.push('Price floor for goods: the minimum price each, times the quantity.');
    return lines.join('\n') || null;
  },
  // Only this NPC's own offers: another seller's aren't its to quote, counter or withdraw.
  open_offers: (world, npcId, customer) => {
    const open = Object.values(world.contracts).filter((c) => c.status === 'proposed' && c.customer === customer && c.seller === npcId);
    const offers = open.length ? open.map((c) => `- ${c.contract_id}: ${describe(c)}`).join('\n') : '- none';
    return `Your open offers to this customer:\n${offers}`;
  },
};

export const NO_FACTS = 'Nothing else is known right now.';

export function factsFor(npcId: string, blocks: readonly FactBlock[], catalogue: Catalogue): (world: World, customer: string) => string {
  const chosen = Object.keys(FACTS).filter((b) => blocks.includes(b as FactBlock)) as FactBlock[];
  return (world, customer) =>
    chosen
      .map((b) => FACTS[b](world, npcId, customer, catalogue))
      .filter((t): t is string => t !== null)
      .join('\n\n') || NO_FACTS;
}

export function describe(c: Contract): string {
  if (c.kind === 'in_stock') return `${c.qty} × ${show(c.good)} from stock, ${c.price} gold`;
  return `${c.item_name} (${c.item_type}) damage ${c.stats.damage} / weight ${c.stats.weight} / durability ${c.stats.durability}, ${c.price} gold, ${c.delivery_ticks} hours`;
}
