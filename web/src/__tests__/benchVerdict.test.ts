import { describe, expect, it } from 'vitest';
import { outcomeText } from '../benchVerdict';

describe('bench verdict', () => {
  it('explains a provider outage even when no answer was returned', () => {
    expect(outcomeText({ outcome: 'unavailable', attempts: [] })).toBe(
      "The model didn't answer, so it said its fallback line. Nothing changed. Try again in a moment.",
    );
  });

  it('still distinguishes an NPC with no spoken-response trigger', () => {
    expect(outcomeText({ outcome: null, attempts: [] })).toBe("No model call: it doesn't answer when spoken to.");
  });
});
