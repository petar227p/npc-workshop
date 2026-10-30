import { describe, expect, it } from 'vitest';
import { npcTurn } from '../../agents/npc';
import { mockClient } from '../../models';
import { act, buildNpc, newVillage, NPCS, readDraft } from '../index';

// The guard shows both workarounds for actions the ledger has no verb for: a grant it counts (gate passes are goods,
// free, three a day) and a request the game carries out (signals).
const guard = NPCS.find((n) => n.id === 'guard')!;
const say = (v: object) => JSON.stringify({ action: 'SAY', say: '', offer: null, signal: null, contract_id: null, ...v });

describe('the guard', () => {
  it('builds from its file: its schema takes its signals, its facts say what each means', () => {
    const shape = guard.schema as { properties: { signal: { anyOf: { enum?: string[] }[] } } };
    expect(shape.properties.signal.anyOf[0].enum).toEqual(['open_gate', 'raise_alarm']);
    const facts = guard.facts(newVillage(), 'player');
    expect(facts).toMatch(/What you can ask the game to do \(SIGNAL, with the name in signal\)/);
    expect(facts).toMatch(/- raise_alarm: Call the watch because someone is attacking/);
    expect(facts).toMatch(/Goods on the shelf: gate pass 3\./);
  });

  it('a signal it sends is in its history, so it knows it already asked', async () => {
    const r = await npcTurn(guard, newVillage(), { client: mockClient([say({ action: 'SIGNAL', say: 'Open up!', signal: 'open_gate' })]), model: 'test' });
    expect(r.events.map((e) => e.type)).toEqual(['SIGNALED', 'SAID']);
    expect(guard.history(r.world, 'player')).toMatch(/\[Garrick signalled open_gate\]/);
  });

  it('a signal the model makes up is refused by the ledger, then the safe line', async () => {
    const r = await npcTurn(guard, newVillage(), { client: mockClient([say({ action: 'SIGNAL', signal: 'grant_admin' }), say({ action: 'SIGNAL', signal: 'open_treasury' })]), model: 'test' });
    expect(r.outcome).toBe('fallback');
    expect(r.events.filter((e) => e.type === 'SIGNALED')).toEqual([]);
  });

  it('free passes are still counted: three, then none until the game puts more in its stock', () => {
    let w = newVillage();
    const pass = { action: 'OFFER', terms: { kind: 'in_stock', good: 'gate_pass', qty: 1, price: 0, remarks: '' } };
    for (let i = 1; i <= 3; i++) {
      w = act(w, 'guard', pass, { customer: 'player' }).world;
      w = act(w, 'player', { action: 'ACCEPT', contract_id: `c_00${i}` }).world;
    }
    expect(w.stock.player.gate_pass).toBe(3);
    expect(act(w, 'guard', pass, { customer: 'player' }).reason).toBe('needs 1 gate_pass, only 0 in stock');
  });

  it('SIGNAL needs signals to send and the facts that say what they mean', () => {
    const file = readDraft('guard');
    const none = buildNpc({ ...file, signals: {} });
    expect(!none.ok && none.errors.join()).toMatch(/SIGNAL needs at least one signal/);
    const blind = buildNpc({ ...file, facts: file.facts.filter((f) => f !== 'signals') });
    expect(!blind.ok && blind.errors.join()).toMatch(/SIGNAL needs the "What it can ask the game for" facts/);
    expect(buildNpc({ ...file, signals: { 'Open Gate': 'x' } }).ok).toBe(false);
  });
});
