import { describe, expect, it } from 'vitest';
import { memoriesText, newVillage, report } from '..';

describe('the memories fact block', () => {
  it('reads a reported world event as what happened, where and when, and says when it is big news', () => {
    const w = report(newVillage(), { text: 'The stranger slew the troll at the gate.', place: 'gate', involved: ['keeper'], notable: true }).world;
    expect(memoriesText(w, 'keeper')).toContain('- e_0001: you saw it (sure, big news). The stranger slew the troll at the gate. (at the gate, Day 1 · 08:00)');
    const small = report(newVillage(), { text: 'A cart lost a wheel.', place: 'gate', involved: ['keeper'] }).world;
    expect(memoriesText(small, 'keeper')).toContain('you saw it (sure). A cart lost a wheel.');
  });
});
