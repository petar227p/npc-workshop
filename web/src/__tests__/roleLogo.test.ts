import { readFileSync, existsSync } from 'node:fs';
import type { NpcDraft } from '@blacksmith/shared';
import { buildSetup } from '@blacksmith/shared/src/setup';
import { describe, expect, it } from 'vitest';
import { ROLE_OPTIONS, roleLogoForDraft } from '../RoleLogo';

describe('role logos', () => {
  it.each(ROLE_OPTIONS)('keeps the $label choice and created draft consistent', option => {
    const draft = buildSetup({ role: option.role, teller: option.teller }).draft;
    expect(roleLogoForDraft(draft)).toBe(option.logo);
    expect(existsSync(`web/public/brand/roles/${option.logo}.png`)).toBe(true);
  });

  it.each(['smith', 'merchant', 'cottager', 'crier', 'farmer', 'guard', 'keeper', 'bard'])('uses the corresponding village badge for %s', id => {
    const draft = JSON.parse(readFileSync(`npcs/${id}.json`, 'utf8')) as NpcDraft;
    expect(roleLogoForDraft(draft)).toBe(id);
  });

  it('follows edited abilities and gives custom conversational NPCs the villager badge', () => {
    const draft = buildSetup({ role: 'merchant' }).draft;
    draft.model_verbs = ['SAY'];
    expect(roleLogoForDraft(draft)).toBe('villager');
  });
});
