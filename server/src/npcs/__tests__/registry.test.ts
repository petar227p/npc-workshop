import { describe, expect, it } from 'vitest';
import * as flat from '../../agents/flat';
import { npcTurn } from '../../agents/npc';
import { createEngine, createWorld, verbs } from '../../engine';
import { mockClient } from '../../models';
import { ACTORS, defineNpc, NPCS, smith } from '../index';

const npc = (over: Partial<Parameters<typeof defineNpc>[0]> = {}) =>
  defineNpc({
    ...smith,
    id: 'miller',
    name: 'Miller',
    verbs: [verbs.SAY],
    modelVerbs: [flat.SAY],
    catalogue: {},
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

  it('the village has the player, the merchant and the smith, and nobody may DELIVER', () => {
    expect(ACTORS.map((a) => a.id)).toEqual(['player', 'merchant', 'smith']);
    for (const a of ACTORS) expect(a.verbs.map((v) => v.verb)).not.toContain('DELIVER');
  });

  it("a definition can't let its model choose a verb the ledger doesn't allow it", () => {
    expect(() => npc({ modelVerbs: [flat.SAY, flat.REFUSE] })).toThrow(/miller: model verb REFUSE isn't in its allowed verbs/);
  });

  it('every NPC must be allowed SAY: its lines and fallbacks go through it', () => {
    expect(() => npc({ verbs: [verbs.REFUSE], modelVerbs: [flat.REFUSE] })).toThrow(/miller: an NPC must be allowed SAY/);
  });

  it("an offer verb needs a catalogue, and made-to-order work needs START_WORK: no verb without the state behind it", () => {
    expect(() => npc({ verbs: [verbs.SAY, verbs.OFFER] })).toThrow(/miller: OFFER needs a catalogue with something to sell/);
    expect(() => npc({ verbs: [verbs.SAY, verbs.COUNTER_OFFER] })).toThrow(/miller: COUNTER_OFFER needs a catalogue/);
    expect(() => npc({ verbs: [verbs.SAY, verbs.OFFER], catalogue: smith.catalogue })).toThrow(/made-to-order catalogue needs START_WORK/);
    const stall = { in_stock: { flour: { min_price: 3 } } };
    expect(npc({ verbs: [verbs.SAY, verbs.OFFER], modelVerbs: [flat.SAY, flat.OFFER(stall)], catalogue: stall }).id).toBe('miller');
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
    expect(s.required).toEqual(['action', 'say', 'offer', 'contract_id']);
    expect(s.properties.action.enum).toEqual(['SAY', 'OFFER', 'COUNTER_OFFER', 'REFUSE']);
    expect(s.properties.contract_id.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
  });

  it("offer enums come from the seller's own catalogue; a seller with both kinds gets one shape per kind", () => {
    type Shape = { properties: Record<string, { enum?: string[] }> };
    const offerOf = (schema: Record<string, unknown>) => (schema as { properties: { offer: { anyOf: Shape[] } } }).properties.offer.anyOf;
    const [forge, none] = offerOf(smith.schema);
    expect(forge.properties.kind.enum).toEqual(['made_to_order']);
    expect(forge.properties.item_type.enum).toEqual(['sword', 'dagger', 'axe', 'hammer', 'shield']);
    expect(none).toEqual({ type: 'null' });
    const merchant = NPCS.find((n) => n.id === 'merchant')!;
    const [stall] = offerOf(merchant.schema);
    expect(stall.properties.kind.enum).toEqual(['in_stock']);
    expect(stall.properties.good.enum).toEqual(['torch', 'rope', 'rations', 'healing_salve', 'lantern']);
    const both = offerOf(flat.flatSchema([flat.OFFER({ ...smith.catalogue, ...merchant.catalogue })]));
    expect(both.map((s) => (s as Shape).properties?.kind?.enum?.[0] ?? 'null')).toEqual(['made_to_order', 'in_stock', 'null']);
  });

  it('a one-kind seller may leave `kind` out; the flat offer maps onto the terms', () => {
    const offer = flat.OFFER({ in_stock: { torch: { min_price: 2 } } });
    expect(offer.toAction({ action: 'OFFER', say: '', offer: { good: 'torch', qty: 2, price: 4, remarks: 'ok' } })).toEqual({
      action: 'OFFER',
      terms: { kind: 'in_stock', good: 'torch', qty: 2, price: 4, remarks: 'ok' },
    });
  });

  it('two verbs giving one field different shapes is a definition error, caught when the NPC is defined', () => {
    const clash: flat.FlatVerb = { ...flat.REFUSE, fields: { contract_id: { type: 'integer' } } };
    const counter = flat.COUNTER_OFFER(smith.catalogue!);
    expect(() => flat.flatSchema([counter, clash])).toThrow(/field 'contract_id' has two shapes/);
    const verbsFor = [verbs.SAY, verbs.COUNTER_OFFER, verbs.REFUSE, verbs.START_WORK];
    expect(() => npc({ verbs: verbsFor, modelVerbs: [counter, clash], catalogue: smith.catalogue })).toThrow(
      /field 'contract_id' has two shapes/,
    );
  });
});
