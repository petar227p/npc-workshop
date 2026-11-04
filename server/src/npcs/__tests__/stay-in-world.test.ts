import { describe, expect, it } from 'vitest';
import { STAY_IN_WORLD, turnMessages } from '../../agents/npc';
import { buildNpc, newVillage, NPCS, readDraft } from '../index';

describe('staying in the world', () => {
  it('is in the prompt of every village NPC, after its persona', () => {
    for (const npc of NPCS) {
      const prompt = turnMessages(npc, newVillage())[0].content;
      expect(prompt.startsWith(npc.prompt), npc.id).toBe(true);
      expect(prompt, npc.id).toContain(STAY_IN_WORLD);
    }
  });

  it('reaches a persona written in the workshop', () => {
    const built = buildNpc({ ...readDraft('merchant'), id: 'draft', persona: 'You voice Ana, who sells apples.' }, null);
    if (!built.ok) throw new Error(built.errors.join('; '));
    expect(turnMessages(built.npc, newVillage())[0].content).toContain(STAY_IN_WORLD);
  });
});
