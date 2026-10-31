import { describe, it, expect } from 'vitest';
import { validationHelp } from '../validationHelp';

describe('validation help', () => {
  it('routes catalogue, character and behaviour errors to their settings', () => {
    expect(validationHelp('smith: OFFER needs a catalogue with something to sell').target).toBe('catalogue');
    expect(validationHelp('OFFER and COUNTER_OFFER need a catalogue with something to sell').target).toBe('catalogue');
    expect(validationHelp('id: Invalid format').target).toBe('character-advanced');
    expect(validationHelp('triggers.0.cue: Too long').target).toBe('world');
    expect(validationHelp('SIGNAL needs the "What it can ask the game for" facts').target).toBe('permissions');
  });
  it('preserves an unknown error without guessing a destination', () => {
    expect(validationHelp('Unexpected error')).toEqual({ message: 'Unexpected error', target: null, label: '' });
  });
});
