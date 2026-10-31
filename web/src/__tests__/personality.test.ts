import { describe, expect, it } from 'vitest';
import { readPersonality, writePersonality } from '../personality';

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
});
