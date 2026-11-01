import type { NpcDraft } from '@blacksmith/shared';
import { abilitiesOf, type Ability } from '@blacksmith/shared/src/setup';

const SUMMARY: Record<Ability, string> = {
  talk: 'Talks in character', gesture: 'Uses gestures', sell: 'Sells stocked goods and bargains',
  craft: 'Makes items to order', grant: 'Offers free items from stock', knows: 'Remembers news',
  tell: 'Shares news in conversation', retell: 'Tells stories to a crowd', announce: 'Announces news',
  signal: 'Requests actions from your game', give: 'Gives gifts',
};

// Roles describe the current abilities, including imported drafts and edits after setup.
export function editorIdentity(draft: NpcDraft): { role: string; abilities: string } {
  const abilities = abilitiesOf(draft);
  const has = (ability: Ability) => abilities.includes(ability);
  const role = has('craft') ? has('sell') ? 'Merchant & craftsperson' : 'Craftsperson'
    : has('sell') ? 'Merchant' : has('grant') && has('signal') ? 'Guard'
    : has('announce') ? 'Town crier' : has('retell') ? 'Bard' : 'Villager';
  const useful = abilities.filter((ability) => ability !== 'talk');
  return { role, abilities: (useful.length ? useful : ['talk' as const]).map((ability) => SUMMARY[ability]).join(' · ') };
}
