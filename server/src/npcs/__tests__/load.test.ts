import { describe, expect, it, vi } from 'vitest';
import { createEngine, createWorld, verbs } from '../../engine';
import { NO_FACTS } from '../facts';
import { buildNpc, newVillage, player, readDraft, smith } from '../index';
import { toNpc } from '../load';

describe('NPC files', () => {
  it("Brann's file builds the same NPC the village runs", () => {
    const built = buildNpc(readDraft('smith'));
    expect(built.ok && built.npc.schema).toEqual(smith.schema);
    expect(built.ok && built.npc.facts(newVillage(), 'player')).toBe(smith.facts(newVillage(), 'player'));
  });

  it('facts are the chosen blocks in a fixed order, or a plain line when none are chosen', () => {
    const base = readDraft('smith');
    const some = buildNpc({ ...base, facts: ['price_floor', 'purse'] });
    expect(some.ok && some.npc.facts(newVillage(), 'player')).toBe(
      "Customer's purse: 200 gold.\n\nPrice floor for made-to-order work: material cost + 20%, rounded up.",
    );
    const none = buildNpc({ ...base, facts: [] });
    expect(none.ok && none.npc.facts(newVillage(), 'player')).toBe(NO_FACTS);
  });

  it("the facts are the NPC's own: its stock, its catalogue, its jobs", () => {
    const merchant = buildNpc(readDraft('merchant'));
    if (!merchant.ok) throw new Error(merchant.errors.join('; '));
    const text = merchant.npc.facts(newVillage(), 'player');
    expect(text).toMatch(/Goods on the shelf: torch 10, rope 4, rations 8, healing_salve 3, lantern 1\./);
    expect(text).toMatch(/- lantern: at least 20 gold each/);
    expect(text).toMatch(/Price floor for goods: the minimum price each, times the quantity\./);
    expect(text).not.toMatch(/iron|material cost/);
    expect(smith.facts(newVillage(), 'player')).not.toMatch(/torch/);
  });

  it('a catalogue, stock and place are checked like the rest of the file', () => {
    const base = readDraft('merchant');
    const errors = (npc: unknown) => (({ ok, ...r }) => (ok ? [] : (r as { errors: string[] }).errors))(buildNpc(npc));
    expect(errors({ ...base, catalogue: { in_stock: { Torch: { min_price: 1 } } } })[0]).toMatch(/^catalogue\.in_stock\.Torch: names are lowercase/);
    expect(errors({ ...base, start: { gold: -5, stock: {} } })[0]).toMatch(/^start\.gold/);
    expect(errors({ ...base, location: 'Town Square' })[0]).toMatch(/^location: a place name/);
    expect(errors({ ...base, catalogue: {} })[0]).toMatch(/need a catalogue with something to sell/);
  });

  it("its place and the places in its day must be on the village map; a day can't start twice at one hour", () => {
    const base = readDraft('merchant');
    const errors = (npc: unknown) => (({ ok, ...r }) => (ok ? [] : (r as { errors: string[] }).errors))(buildNpc(npc));
    expect(errors({ ...base, location: 'mill' })[0]).toMatch(/^there's no place called 'mill' on the village map \(places: forge, market/);
    expect(errors({ ...base, schedule: [{ from: 20, place: 'moon' }] })).toEqual([expect.stringMatching(/no place called 'moon'/)]);
    expect(errors({ ...base, schedule: [{ from: 9, place: 'market' }, { from: 9, place: 'tavern' }] })).toEqual(['schedule: two entries start at the same hour']);
    expect(errors({ ...base, schedule: [{ from: 24, place: 'market' }] })[0]).toMatch(/^schedule\.0\.from/);
    expect(errors({ ...base, sprite: 85 })).toEqual(['sprite: not one of the character sprites']); // the player's look
  });

  it('a file from before schedules and looks stays at its place, looking like the default villager', () => {
    const { schedule: _s, sprite: _l, ...old } = readDraft('merchant');
    const built = buildNpc(old);
    if (!built.ok) throw new Error(built.errors.join('; '));
    expect(built.draft).toMatchObject({ schedule: [], sprite: 98 });
  });

  it("a file whose place isn't on the map still loads at start, with a warning, so an old NPC can't stop the village", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const npc = toNpc({ ...readDraft('merchant'), location: 'mill', schedule: [{ from: 20, place: 'tavern' }] });
      expect(npc.location).toBe('mill');
      expect(warn.mock.calls).toEqual([[expect.stringMatching(/^npcs\/merchant\.json: there's no place called 'mill' on the village map/)]]);
    } finally {
      warn.mockRestore();
    }
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
  const { act } = createEngine([player, smith, desk.npc]);
  const offer = (name: string) => ({
    action: 'OFFER',
    terms: {
      kind: 'made_to_order',
      item_name: name,
      item_type: 'dagger',
      description: 'A plain dagger',
      stats: { damage: 6, weight: 2, durability: 40 },
      materials_used: { iron: 1 },
      price: 60,
      delivery_ticks: 6,
      remarks: 'Simple.',
    },
  });

  // Brann offers c_001, the desk offers c_002; the player buys the desk's dagger and work starts on it.
  let w = act(createWorld([player, smith, desk.npc]), 'smith', offer('Brann Dagger')).world;
  w = act(w, 'desk', offer('Desk Dagger')).world;
  w = act(w, 'player', { action: 'ACCEPT', contract_id: 'c_002' }).world;
  w = act(w, 'desk', { action: 'START_WORK', contract_id: 'c_002' }).world;

  it('the desk is paid, not the smith', () => {
    expect(w.gold).toMatchObject({ player: 140, smith: 50, desk: 110 });
  });

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

  it('passing news on needs the memories facts, or the NPC could never know an event id to cite', () => {
    const farmer = readDraft('farmer');
    expect(buildNpc(farmer).ok).toBe(true);
    expect(buildNpc({ ...farmer, facts: ['clock'] })).toEqual({ ok: false, errors: ['TELL needs the "News it knows" facts, or it can\'t know an event id to pass on'] });
  });
});
