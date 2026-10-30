import type { NpcDraft } from '@blacksmith/shared';
import { describe, expect, it } from 'vitest';
import { npcTurn } from '../../agents/npc';
import { createEngine, createWorld } from '../../engine';
import { mockClient } from '../../models';
import { buildNpc, player, readDraft, summarize } from '../index';
import { registerLabels } from '../news';

// A game's own item ids as an NPC's goods: the model reads and answers in words, the ledger and the log keep the ids.

const quartermaster: NpcDraft = {
  ...readDraft('merchant'),
  id: 'quartermaster',
  name: 'Hilde',
  start: { gold: 30, stock: { itm_torch_01: 10, itm_rope_7: 2 } },
  catalogue: { in_stock: { itm_torch_01: { min_price: 2 }, itm_rope_7: { min_price: 4 } } },
  labels: { itm_torch_01: 'pitch torch', itm_rope_7: 'hemp rope' },
};

function built(draft: NpcDraft) {
  const b = buildNpc(draft);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return b.npc;
}
type Shape = { properties: Record<string, { enum?: string[] } & Shape>; anyOf?: Shape[] };
const offerShape = (schema: Record<string, unknown>) => (schema as unknown as Shape).properties.offer.anyOf![0];
const reply = (good: string) => JSON.stringify({ action: 'OFFER', say: 'Three of those.', offer: { kind: 'in_stock', good, qty: 3, price: 6, remarks: '' }, contract_id: null });

describe('labels', () => {
  it("the model's schema and facts are in the NPC's words, never the ids", () => {
    const npc = built(quartermaster);
    expect(offerShape(npc.schema).properties.good.enum).toEqual(['pitch torch', 'hemp rope']);
    const facts = npc.facts(createWorld([player, npc]), 'player');
    expect(facts).toMatch(/Goods on the shelf: pitch torch 10, hemp rope 2\./);
    expect(facts).toMatch(/- hemp rope: at least 4 gold each/);
    expect(facts).not.toMatch(/itm_/);
  });

  it('an answer in words becomes an action on the ids: the contract, the delivery and the stock are the game’s own', async () => {
    const npc = built(quartermaster);
    const { act } = createEngine([player, npc]);
    const turn = await npcTurn(npc, createWorld([player, npc]), { client: mockClient([reply('pitch torch')]), model: 'test' }, { act });
    expect(turn.outcome).toBe('acted');
    expect(turn.world.contracts.c_001).toMatchObject({ kind: 'in_stock', good: 'itm_torch_01', qty: 3 });

    const bought = act(turn.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
    expect(bought.events.find((e) => e.type === 'GOODS_DELIVERED')?.data).toMatchObject({ good: 'itm_torch_01', qty: 3 });
    expect(bought.world.stock.player).toEqual({ itm_torch_01: 3 });
    // And it remembers the sale in its own words.
    expect(npc.history(bought.world, 'player')).toMatch(/3 × pitch torch/);
    expect(npc.history(bought.world, 'player')).not.toMatch(/itm_/);
  });

  it('a word it has no thing for passes through, and the ledger refuses it', async () => {
    const npc = built(quartermaster);
    const { act } = createEngine([player, npc]);
    const turn = await npcTurn(npc, createWorld([player, npc]), { client: mockClient([reply('golden torch'), reply('golden torch')]), model: 'test' }, { act });
    expect(turn.outcome).toBe('fallback');
    expect(turn.events.filter((e) => e.type === 'ACTION_REJECTED').map((e) => e.type === 'ACTION_REJECTED' && e.data.reason)).toEqual([
      expect.stringMatching(/golden torch/),
      expect.stringMatching(/golden torch/),
    ]);
  });

  it('two things one word would make an answer ambiguous, so the NPC does not build', () => {
    const b = buildNpc({ ...quartermaster, labels: { itm_torch_01: 'hemp rope', itm_rope_7: 'hemp rope' } });
    expect(!b.ok && b.errors.join('\n')).toMatch(/two things are called "hemp rope": 'itm_torch_01' and 'itm_rope_7'/);
    const clash = buildNpc({ ...quartermaster, catalogue: { in_stock: { ...quartermaster.catalogue.in_stock, torch: { min_price: 1 } } }, labels: { itm_torch_01: 'torch' } });
    expect(clash.ok).toBe(false);
  });

  it('a giver can be handed things it has no stock of yet, by naming them: GIVE takes those words too', () => {
    const farmer = readDraft('farmer');
    const giver = built({
      ...farmer,
      verbs: [...farmer.verbs, 'GIVE'],
      model_verbs: [...farmer.model_verbs, 'GIVE'],
      facts: [...farmer.facts, 'inventory'],
      start: { gold: 5, stock: { itm_bread: 2 } },
      labels: { itm_bread: 'rye loaf', itm_wolf_pelt: 'wolf pelt' },
    });
    const gift = (giver.schema as unknown as Shape).properties.gift.anyOf!.find((s) => s.properties?.good);
    expect(gift?.properties.good.enum).toEqual(['rye loaf', 'wolf pelt']);
  });

  it('labels are bounded, one line each, and on valid names', () => {
    expect(buildNpc({ ...quartermaster, labels: { itm_torch_01: 'pitch\ntorch' } }).ok).toBe(true); // collapsed to one line
    expect(buildNpc({ ...quartermaster, labels: { itm_torch_01: 'x'.repeat(41) } }).ok).toBe(false);
    expect(buildNpc({ ...quartermaster, labels: { 'Iron Sword': 'iron sword' } }).ok).toBe(false);
    expect(buildNpc({ ...quartermaster, labels: { itm_torch_01: '  ' } }).ok).toBe(false);
  });

  it("the village's news uses the world's labels, and two files can't call one thing two names", () => {
    registerLabels([{ id: 'quartermaster', labels: quartermaster.labels }]);
    const npc = built(quartermaster);
    const { act } = createEngine([player, npc]);
    const offered = act(createWorld([player, npc]), 'quartermaster', { action: 'OFFER', terms: { kind: 'in_stock', good: 'itm_rope_7', qty: 1, price: 4, remarks: '' } });
    const bought = act(offered.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
    expect(summarize(bought.world, bought.events[0])).toMatch(/paid quartermaster 4 gold for 1 × hemp rope/);
    expect(() => registerLabels([{ id: 'smith', labels: { itm_rope_7: 'rope' } }])).toThrow(/calls 'itm_rope_7' "rope", but another NPC calls it "hemp rope"/);
  });
});
