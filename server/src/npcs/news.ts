import { clockText, type EngineEvent, type Gift } from '@blacksmith/shared';
import { inMind, type World } from '../engine';

// Events as news: what really happened, in words an NPC (or the who-knows panel) can read. Names come from the NPC
// files; npcs/index.ts registers them at start, so this module imports none of them.

const NAMES = new Map<string, string>([['player', 'the stranger']]);
export const registerNames = (list: readonly { id: string; name: string }[]) => list.forEach((n) => NAMES.set(n.id, n.name));
export const nameOf = (id: string) => NAMES.get(id) ?? id;

const show = (name: string) => name.replace(/_/g, ' ');
const gift = (g: Gift, itemName: string | null) => (g.kind === 'gold' ? `${g.amount} gold` : g.kind === 'good' ? `${g.qty} × ${show(g.good)}` : (itemName ?? 'an item'));

// What happened, by whom, where and when. Null for events that aren't news (see engine/memory.ts MEMORABLE).
export function summarize(world: World, e: EngineEvent): string | null {
  const when = `(at the ${show(e.location)}, ${clockText(e.tick)})`;
  const contract = (id: string) => world.contracts[id];
  const what = (id: string) => {
    const c = contract(id);
    if (!c) return id;
    return c.kind === 'made_to_order' ? `a ${c.item_name} (${c.item_type})` : `${c.qty} × ${show(c.good)}`;
  };
  switch (e.type) {
    case 'CONTRACT_ACCEPTED':
      return `${nameOf(e.actor)} paid ${nameOf(e.target ?? '')} ${e.data.price} gold for ${what(e.data.contract_id)} ${when}`;
    case 'ITEM_DELIVERED': {
      const c = contract(e.data.contract_id);
      return `${nameOf(c?.seller ?? 'someone')} handed ${nameOf(e.target ?? '')} the finished ${e.data.item.item_name} ${when}`;
    }
    case 'GIVEN':
      return `${nameOf(e.actor)} gave ${nameOf(e.target ?? '')} ${gift(e.data.gift, e.data.item_name)} ${when}`;
    case 'GIFT_REFUSED':
      return `${nameOf(e.actor)} handed back ${gift(e.data.gift, e.data.item_name)} from ${nameOf(e.target ?? '')} ${when}`;
    case 'CONTRACT_REFUSED':
      return `${nameOf(e.actor)} turned down ${nameOf(e.target ?? '')}'s order ${when}`;
    default:
      return null;
  }
}

const pct = (c: number) => `${Math.round(c * 100)}%`;

// The memories fact block: what it has in mind, newest first (engine/memory.ts inMind). What it saw reads as what
// happened; what it was told reads as the words it was told in, since that is all it has.
export function memoriesText(world: World, npcId: string): string {
  const known = inMind(world, npcId);
  if (known.length === 0) return 'News you know: none yet. You have nothing to pass on, so never claim you have.';
  const byId = new Map(world.events.map((e) => [e.id, e]));
  const lines = known.map((m) => {
    if (m.how_learned === 'witnessed') return `- ${m.event_id}: you saw it (sure). ${summarize(world, byId.get(m.event_id)!) ?? ''}`;
    return `- ${m.event_id}: ${nameOf(m.told_by ?? '')} told you (${pct(m.confidence)} sure): ${JSON.stringify(m.claim)}`;
  });
  return `News you know. To pass one on, give its id in event_id; the ledger checks you really know it:\n${lines.join('\n')}`;
}
