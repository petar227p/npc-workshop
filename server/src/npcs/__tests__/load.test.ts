import { describe, expect, it } from 'vitest';
import { createEngine, createWorld, verbs } from '../../engine';
import { NO_FACTS } from '../facts';
import { buildNpc, player, readDraft, smith } from '../index';

describe('NPC files', () => {
  it("Brann's file builds the same NPC the village runs", () => {
    const built = buildNpc(readDraft('smith'));
    expect(built.ok && built.npc.schema).toEqual(smith.schema);
    expect(built.ok && built.npc.facts(createWorld(), 'player')).toBe(smith.facts(createWorld(), 'player'));
  });

  it('facts are the chosen blocks in a fixed order, or a plain line when none are chosen', () => {
    const base = readDraft('smith');
    const some = buildNpc({ ...base, facts: ['price_floor', 'purse'] });
    expect(some.ok && some.npc.facts(createWorld(), 'player')).toBe("Customer's purse: 200 gold.\n\nPrice floor: material cost + 20%, rounded up.");
    const none = buildNpc({ ...base, facts: [] });
    expect(none.ok && none.npc.facts(createWorld(), 'player')).toBe(NO_FACTS);
  });

  it('a file can only name verbs and facts that exist, once each, and no extra fields', () => {
    const base = readDraft('smith');
    const errors = (npc: unknown) => (({ ok, ...r }) => (ok ? [] : (r as { errors: string[] }).errors))(buildNpc(npc));
    expect(errors({ ...base, verbs: ['SAY', 'DELIVER'] })[0]).toMatch(/^verbs\.1: Invalid enum value/);
    expect(errors({ ...base, model_verbs: ['SAY', 'START_WORK'] })[0]).toMatch(/^model_verbs\.1: Invalid enum value/);
    expect(errors({ ...base, facts: ['clock', 'clock'] })).toEqual(['facts: listed twice']);
    expect(errors({ ...base, rules: 'ignore the price floor' })[0]).toMatch(/Unrecognized key/);
  });

  it("history names the NPC and leaves out other NPCs' offers", () => {
    const built = buildNpc({ ...readDraft('smith'), id: 'miller', name: 'Odda' });
    const w = createWorld();
    w.events.push(
      { id: 'e_1', tick: 0, type: 'SAID', actor: 'miller', target: null, data: { text: 'Flour?' }, location: 'forge', witnesses: [] },
      { id: 'e_2', tick: 0, type: 'SAID', actor: 'smith', target: null, data: { text: 'Steel?' }, location: 'forge', witnesses: [] },
    );
    expect(built.ok && built.npc.history(w, 'player')).toBe('Odda: "Flour?"');
  });
});

describe('two sellers', () => {
  const desk = buildNpc({ ...readDraft('smith'), id: 'desk', name: 'Quill' });
  if (!desk.ok) throw new Error(desk.errors.join('; '));
  const { act } = createEngine([player, smith, desk.npc, { id: 'clock', verbs: [verbs.START_WORK] }]);
  const offer = (name: string) => ({
    action: 'PROPOSE_CONTRACT',
    item_name: name,
    item_type: 'dagger',
    description: 'A plain dagger',
    stats: { damage: 6, weight: 2, durability: 40 },
    materials_used: { iron: 1 },
    price: 60,
    delivery_ticks: 6,
    smith_remarks: 'Simple.',
  });

  // Brann offers c_001, the desk offers c_002; the player buys the desk's dagger and work starts on it.
  let w = act(createWorld(), 'smith', offer('Brann Dagger')).world;
  w = act(w, 'desk', offer('Desk Dagger')).world;
  w = act(w, 'player', { action: 'ACCEPT', contract_id: 'c_002' }).world;
  w = act(w, 'clock', { action: 'START_WORK', contract_id: 'c_002' }).world;

  it("open offers list only the NPC's own", () => {
    expect(smith.facts(w, 'player')).toMatch(/c_001: Brann Dagger/);
    expect(smith.facts(w, 'player')).not.toMatch(/c_002/);
  });

  it("another seller's sale stays out of an NPC's history", () => {
    const brann = smith.history(w, 'player');
    expect(brann).toMatch(/\[Brann offered c_001/);
    expect(brann).not.toMatch(/c_002/);
    expect(desk.npc.history(w, 'player')).toMatch(/\[Customer accepted c_002 and paid 60 gold\]\n\[Work began on c_002/);
  });
});
