import { buildSetup } from '@blacksmith/shared/src/setup';
import { describe, expect, it } from 'vitest';
import { editorIdentity } from '../editorPresentation';

describe('editor identity', () => {
  it.each([
    ['merchant', 'Merchant'], ['craftsperson', 'Craftsperson'], ['guard', 'Guard'], ['villager', 'Villager'], ['storyteller', 'Bard'],
  ] as const)('identifies the current %s configuration', (role, expected) => {
    expect(editorIdentity(buildSetup({ role }).draft).role).toBe(expected);
  });

  it('summarizes actual abilities after editing, rather than retaining the template role', () => {
    const draft = buildSetup({ role: 'merchant' }).draft;
    expect(editorIdentity(draft).abilities).toBe('Sells stocked goods and bargains');
    draft.model_verbs = ['SAY'];
    expect(editorIdentity(draft)).toEqual({ role: 'Villager', abilities: 'Talks in character' });
  });

  it('distinguishes a town crier and a character that both sells and crafts', () => {
    expect(editorIdentity(buildSetup({ role: 'storyteller', teller: 'crier' }).draft).role).toBe('Town crier');
    const merchant = buildSetup({ role: 'merchant' }).draft;
    merchant.catalogue.made_to_order = buildSetup({ role: 'craftsperson' }).draft.catalogue.made_to_order;
    expect(editorIdentity(merchant).role).toBe('Merchant & craftsperson');
  });
});
