import { clockText, type EngineEvent, type Gift } from '@npc-workshop/shared';
import { inMind, involves, notableIds, recognition, type Recognition, type World } from '../engine';

// Events as news: what really happened, in words an NPC (or the who-knows panel) can read. Names come from the NPC
// files; npcs/index.ts registers them at start, so this module imports none of them.

const NAMES = new Map<string, string>([['player', 'the stranger']]);
export const registerNames = (list: readonly { id: string; name: string }[]) => list.forEach((n) => NAMES.set(n.id, n.name));
export const nameOf = (id: string) => NAMES.get(id) ?? id;

const show = (name: string) => name.replace(/_/g, ' ');

// What a good, material or item type is called, from the NPC files' labels: a game's own item id reads as "iron sword".
// Any NPC can hear of a thing another sells, so the labels are the whole world's. Two files can't call one thing two names.
const LABELS = new Map<string, string>();
export function registerLabels(list: readonly { id: string; labels?: Record<string, string> }[]) {
  for (const n of list) {
    for (const [name, label] of Object.entries(n.labels ?? {})) {
      const seen = LABELS.get(name);
      if (seen !== undefined && seen !== label) throw new Error(`npcs/${n.id}.json calls '${name}' "${label}", but another NPC calls it "${seen}"`);
      LABELS.set(name, label);
    }
  }
}
export const labelOf = (name: string) => LABELS.get(name) ?? show(name);
// For one NPC: its own labels first (a draft on the bench isn't registered), then the world's, then the name as it is.
export const labelsFor = (own: Record<string, string> = {}) => (name: string) => (Object.hasOwn(own, name) ? own[name] : (LABELS.get(name) ?? name));

export type Vocabulary = { nameOf(id: string): string; labelOf(id: string): string };
export const villageVocabulary: Vocabulary = { nameOf, labelOf: (id) => LABELS.get(id) ?? id };

// An API world's words belong only to its cast. Copy strings into maps, never the village registry.
export function vocabularyFor(cast: readonly { id: string; name: string; labels?: Record<string, string> }[]): Vocabulary {
  const names = new Map([['player', 'the stranger'], ...cast.map((n) => [n.id, n.name] as [string, string])]);
  const labels = new Map<string, string>();
  for (const n of cast) {
    for (const [id, label] of Object.entries(n.labels ?? {})) {
      const seen = labels.get(id);
      if (seen !== undefined && seen !== label) throw new Error(`${n.id}.labels.${id}: calls '${id}' "${label}", but another NPC calls it "${seen}"`);
      labels.set(id, label);
    }
  }
  return { nameOf: (id) => names.get(id) ?? id, labelOf: (id) => labels.get(id) ?? id };
}

const gift = (g: Gift, itemName: string | null, labelOf: Vocabulary['labelOf']) => (g.kind === 'gold' ? `${g.amount} gold` : g.kind === 'good' ? `${g.qty} × ${labelOf(g.good)}` : (itemName ?? 'an item'));

// What happened, by whom, where and when. Null for events that aren't news (see engine/memory.ts MEMORABLE).
export function summarize(world: World, e: EngineEvent, vocabulary: Vocabulary = villageVocabulary): string | null {
  const { nameOf } = vocabulary;
  const labelOf = (id: string) => {
    const label = vocabulary.labelOf(id);
    return label === id ? show(id) : label;
  };
  const when = `(at the ${show(e.location)}, ${clockText(e.tick)})`;
  const contract = (id: string) => world.contracts[id];
  const what = (id: string) => {
    const c = contract(id);
    if (!c) return id;
    return c.kind === 'made_to_order' ? `a ${c.item_name} (${labelOf(c.item_type)})` : `${c.qty} × ${labelOf(c.good)}`;
  };
  switch (e.type) {
    case 'CONTRACT_ACCEPTED':
      return `${nameOf(e.actor)} paid ${nameOf(e.target ?? '')} ${e.data.price} gold for ${what(e.data.contract_id)} ${when}`;
    case 'ITEM_DELIVERED': {
      const c = contract(e.data.contract_id);
      return `${nameOf(c?.seller ?? 'someone')} handed ${nameOf(e.target ?? '')} the finished ${e.data.item.item_name} ${when}`;
    }
    case 'GIVEN':
      return `${nameOf(e.actor)} gave ${nameOf(e.target ?? '')} ${gift(e.data.gift, e.data.item_name, labelOf)} ${when}`;
    case 'GIFT_REFUSED':
      return `${nameOf(e.actor)} handed back ${gift(e.data.gift, e.data.item_name, labelOf)} from ${nameOf(e.target ?? '')} ${when}`;
    case 'CONTRACT_REFUSED':
      return `${nameOf(e.actor)} turned down ${nameOf(e.target ?? '')}'s order ${when}`;
    // The game's (or god mode's) own words, quoted like a claim it was told, so they read as one report, not as lines.
    case 'HAPPENED':
      return `${JSON.stringify(e.data.text)} ${when}`;
    default:
      return null;
  }
}

const pct = (c: number) => `${Math.round(c * 100)}%`;

// Talking to the player, whether it takes them for the stranger in a piece of news (engine/memory.ts recognition).
// Said outright either way, so the word "stranger" alone can't make it guess.
const KNOWS_YOU: Record<Recognition, string> = {
  sure: 'The stranger in it is the customer in front of you: you saw them.',
  likely: 'From how the stranger in it was described, it is likely the customer in front of you.',
  unsure: "You half-suspect the stranger in it is the customer in front of you, though the telling was too vague to be sure. You may wonder aloud, but don't claim it.",
  none: "You wouldn't know the stranger in it by sight: nothing tells you it was the customer in front of you.",
};

// The memories fact block: what it has in mind, newest first (engine/memory.ts inMind). What it saw reads as what
// happened; what it was told reads as the words it was told in, since that is all it has.
// `passOn`: the model can TELL, RETELL or ANNOUNCE. Without one, the news is background to talk about, with no event id
// to cite: told to cite one, it would try a verb it hasn't and the ledger would reject it.
export function memoriesText(world: World, npcId: string, vocabulary: Vocabulary = villageVocabulary, customer: string | null = null, passOn = true): string {
  const { nameOf } = vocabulary;
  const known = inMind(world, npcId);
  if (known.length === 0) return passOn ? 'News you know: none yet. You have nothing to pass on, so never claim you have.' : "What you know of the village's news: nothing yet, so never claim you have heard any.";
  const byId = new Map(world.events.map((e) => [e.id, e]));
  const big = notableIds(world);
  // Only what it saw itself is marked big news: told it, all it has is the teller's words.
  const lines = known.map((m) => {
    const line =
      m.how_learned === 'witnessed'
        ? `- ${m.event_id}: you saw it (sure${big.has(m.event_id) ? ', big news' : ''}). ${summarize(world, byId.get(m.event_id)!, vocabulary) ?? ''}`
        : `- ${m.event_id}: ${nameOf(m.told_by ?? '')} told you (${pct(m.confidence)} sure): ${JSON.stringify(m.claim)}`;
    return customer === 'player' && involves(byId.get(m.event_id)!, 'player') ? `${line} ${KNOWS_YOU[recognition(m)]}` : line;
  });
  if (!passOn) return `What you know of the village's news. It is yours to talk about if it comes up, in your own words:\n${lines.join('\n')}`;
  return `News you know. To pass one on, give its id in event_id; the ledger checks you really know it:\n${lines.join('\n')}`;
}
