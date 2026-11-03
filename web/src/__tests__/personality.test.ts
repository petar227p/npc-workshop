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
  it('reads and edits the first "Who" bullet of an unmarked example prompt in place', () => {
    const persona = 'You voice Brann.\n\n## Who Brann is\n\n- Gruff and proud.\n- Honest about trade-offs.\n\n## Rules\n\nStay in character.';
    expect(readPersonality(persona)).toBe('Gruff and proud.');
    const edited = writePersonality(persona, 'Gruff, proud and kind.');
    expect(readPersonality(edited)).toBe('Gruff, proud and kind.');
    expect(edited).not.toContain('- Gruff and proud.');
    expect(edited.indexOf('Gruff, proud and kind.')).toBeLessThan(edited.indexOf('Honest about trade-offs.'));
    expect(edited).toContain('## Rules\n\nStay in character.');
    expect(readPersonality(writePersonality(edited, ''))).toBe('');
  });
  it('puts a new personality at the top of a prompt without a "Who" section', () => {
    expect(writePersonality('Custom prompt', 'Shy')).toMatch(/^<!-- workshop:personality -->\nShy\n<!-- \/workshop:personality -->\n\nCustom prompt$/);
  });
});
