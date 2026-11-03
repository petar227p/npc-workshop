import { describe, expect, it } from 'vitest';
import { validationHelp } from '../validationHelp';
import { PROBLEM_PAGES, WORKSHOP_PAGES } from '../workshopPages';

describe('workshop pages', () => {
  it('groups the workshop into four pages', () => {
    expect(WORKSHOP_PAGES.map(([id]) => id)).toEqual(['character', 'abilities', 'world', 'advanced']);
  });

  it('routes every validation target to an existing page', () => {
    const ids: string[] = WORKSHOP_PAGES.map(([id]) => id);
    for (const page of Object.values(PROBLEM_PAGES)) expect(ids).toContain(page);
  });

  it.each([
    ['sprite: Invalid', 'character'], ['name: Too short', 'character'], ['art.style: Too long', 'abilities'],
    ['catalogue.in_stock: bad', 'abilities'], ['id: Invalid format', 'advanced'], ['fallbacks.rejected: bad', 'advanced'],
    ['location: unknown', 'world'], ['verbs: bad', 'advanced'],
  ])('opens %s on the %s page', (error, page) => {
    const target = validationHelp(error).target;
    expect(target && PROBLEM_PAGES[target]).toBe(page);
  });
});
