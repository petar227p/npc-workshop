import { describe, expect, it } from 'vitest';
import { markSetupPersonality, readPersonality, writePersonality } from '../personality';
import { buildSetup } from '@blacksmith/shared/src/setup';

describe('personality notes', () => {
  it('preserves existing instructions when adding, changing and clearing notes', () => {
    const original = 'Existing persona\n\nRules stay here.';
    const added = writePersonality(original, 'Friendly ');
    expect(readPersonality(added)).toBe('Friendly ');
    const changed = writePersonality(added, 'Friendly and curious');
    expect(changed).toContain(original);
    expect(readPersonality(changed)).toBe('Friendly and curious');
    expect(writePersonality(changed, '')).toContain(original);
  });
  it('leaves an unmarked or incomplete persona untouched when reading', () => {
    expect(readPersonality('An existing custom prompt')).toBe('');
    expect(readPersonality('<!-- workshop:personality --> unfinished')).toBe('');
  });
  it('lets a guided personality be edited without leaving the old instruction behind', () => {
    const draft = buildSetup({ role: 'merchant', name: 'Mira', personality: 'Friendly and curious' }, []).draft;
    const marked = markSetupPersonality(draft.persona, 'Friendly and curious');
    expect(readPersonality(marked)).toBe('Friendly and curious');
    const edited = writePersonality(marked, 'Stern');
    expect(edited).not.toContain('Friendly and curious');
    expect(readPersonality(edited)).toBe('Stern');
  });
});
