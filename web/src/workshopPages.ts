import type { ValidationHelp } from './validationHelp';

// The workshop's pages, in the rail's order. Appearance sits with the character, item artwork beside the catalogue,
// and the character's id, model and fallbacks with the other advanced settings.
export const WORKSHOP_PAGES = [
  ['character', 'Character', 'Name, personality, appearance'],
  ['abilities', 'Abilities', 'Catalogue, prices, item artwork'],
  ['world', 'World', 'Place, schedule, timers'],
  ['advanced', 'Advanced', 'Model, permissions, facts, labels'],
] as const;

export type WorkshopPage = (typeof WORKSHOP_PAGES)[number][0];

export const PROBLEM_PAGES: Record<NonNullable<ValidationHelp['target']>, WorkshopPage> = {
  character: 'character', appearance: 'character', artwork: 'abilities', 'character-advanced': 'advanced',
  catalogue: 'abilities', abilities: 'abilities', world: 'world', permissions: 'advanced',
};
