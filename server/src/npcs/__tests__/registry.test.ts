import { describe, expect, it } from 'vitest';
import * as flat from '../../agents/flat';
import { npcTurn } from '../../agents/npc';
import { createEngine, createWorld, verbs } from '../../engine';
import { mockClient } from '../../models';
import { ACTORS, defineNpc, smith } from '../index';

const npc = (over: Partial<Parameters<typeof defineNpc>[0]> = {}) =>
  defineNpc({
    ...smith,
    id: 'miller',
    name: 'Miller',
    verbs: [verbs.SAY],
    modelVerbs: [flat.SAY],
    ...over,
  });

const model = (replies: string[]) => ({ client: mockClient(replies), model: 'test-model' });

describe('actor registry', () => {
  it('the engine only knows the actors it is given', () => {
    const { act } = createEngine([npc()]);
    expect(act(createWorld(), 'miller', { action: 'SAY', text: 'Morning.' }).ok).toBe(true);
    expect(act(createWorld(), 'miller', { action: 'REFUSE', contract_id: null, reason: 'no' }).reason).toMatch(/miller may not use REFUSE/);
    expect(act(createWorld(), 'smith', { action: 'SAY', text: 'hi' }).reason).toMatch(/smith may not use SAY/);
  });

  it('the village has the player and the smith, and nobody may DELIVER', () => {
    expect(ACTORS.map((a) => a.id)).toEqual(['player', 'smith']);
    for (const a of ACTORS) expect(a.verbs.map((v) => v.verb)).not.toContain('DELIVER');
  });

  it("a definition can't let its model choose a verb the ledger doesn't allow it", () => {
    expect(() => npc({ modelVerbs: [flat.SAY, flat.REFUSE] })).toThrow(/miller: model verb REFUSE isn't in its allowed verbs/);
  });

  it('every NPC must be allowed SAY: its lines and fallbacks go through it', () => {
    expect(() => npc({ verbs: [verbs.REFUSE], modelVerbs: [flat.REFUSE] })).toThrow(/miller: an NPC must be allowed SAY/);
  });

  it('the id names the model schema, so it must be a plain identifier', () => {
    expect(() => npc({ id: 'Old Mara' })).toThrow(/npc id 'Old Mara'/);
  });

  it('npcTurn runs on the engine an NPC is registered with', async () => {
    const miller = npc();
    const reply = JSON.stringify({ action: 'SAY', say: 'Flour is dear this week.' });
    const own = await npcTurn(miller, createWorld(), model([reply]), { act: createEngine([miller]).act });
    expect(own.outcome).toBe('acted');
    expect(own.events.map((e) => e.type)).toEqual(['SAID']);

    // The village engine has never heard of the miller.
    const village = await npcTurn(miller, createWorld(), model([reply, reply]));
    expect(village.attempts[0].reason).toMatch(/miller may not use SAY/);
  });

  it("a spoken line the ledger won't take is dropped; the action stands", async () => {
    const refuser = npc({ verbs: [verbs.SAY, verbs.REFUSE], modelVerbs: [flat.SAY, flat.REFUSE] });
    const { act } = createEngine([{ id: 'miller', verbs: [verbs.REFUSE] }]);
    const r = await npcTurn(refuser, createWorld(), model([JSON.stringify({ action: 'REFUSE', say: 'Not today.', contract_id: null })]), { act });
    expect(r.outcome).toBe('acted');
    expect(r.events.map((e) => e.type)).toEqual(['CONTRACT_REFUSED']);
    expect(r.world.events.map((e) => e.type)).toEqual(['CONTRACT_REFUSED']);
  });
});

describe('flatSchema', () => {
  it('is generated from the verb list: a talk-only NPC gets only action and say', () => {
    expect(flat.flatSchema([flat.SAY])).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['action', 'say'],
      properties: { action: { type: 'string', enum: ['SAY'] }, say: { type: 'string' } },
    });
  });

  it("the smith's schema has every field required and the verb-specific ones nullable", () => {
    const s = smith.schema as { required: string[]; properties: Record<string, { enum?: string[]; anyOf?: unknown[] }> };
    expect(s.required).toEqual(['action', 'say', 'contract', 'contract_id']);
    expect(s.properties.action.enum).toEqual(['SAY', 'PROPOSE_CONTRACT', 'COUNTER_OFFER', 'REFUSE']);
    expect(s.properties.contract_id.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
  });

  it('two verbs giving one field different shapes is a definition error, caught when the NPC is defined', () => {
    const clash: flat.FlatVerb = { ...flat.REFUSE, fields: { contract_id: { type: 'integer' } } };
    expect(() => flat.flatSchema([flat.COUNTER_OFFER, clash])).toThrow(/field 'contract_id' has two shapes/);
    expect(() => npc({ verbs: [verbs.SAY, verbs.COUNTER_OFFER, verbs.REFUSE], modelVerbs: [flat.COUNTER_OFFER, clash] })).toThrow(
      /field 'contract_id' has two shapes/,
    );
  });
});
