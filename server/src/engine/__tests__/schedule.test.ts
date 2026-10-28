import { describe, expect, it } from 'vitest';
import { advance, createEngine, createWorld, entryAt, placeAt, triggerFired, type World } from '../index';
import { merchant, player, smith } from './fixtures';

// Mira's day in the village: the stall from 08:00, the tavern from 19:00, back at the stall from 23:00.
const DAY = [
  { from: 19, place: 'tavern' }, // out of order on purpose: the hours decide, not the list
  { from: 8, place: 'market' },
  { from: 23, place: 'market' },
];
const wanderer = { ...merchant, schedule: DAY };
const ACTORS = [wanderer, smith, player];
const { act } = createEngine(ACTORS);
// Tick 0 is 08:00, so tick n is (8 + n) o'clock.
const at = (hour: number): World => {
  const w = createWorld(ACTORS);
  const ticks = (hour - 8 + 24) % 24;
  return ticks === 0 ? w : advance(w, ticks).world;
};

describe('schedules', () => {
  it('the entry for an hour is the latest that has started; before the first, the day before runs on', () => {
    expect(entryAt(DAY, 8)?.place).toBe('market');
    expect(entryAt(DAY, 18)?.place).toBe('market');
    expect(entryAt(DAY, 19)?.place).toBe('tavern');
    expect(entryAt(DAY, 22)?.place).toBe('tavern');
    expect(entryAt(DAY, 23)?.place).toBe('market');
    expect(entryAt(DAY, 3)?.place).toBe('market'); // the 23:00 entry, past midnight
    expect(entryAt([{ from: 20, place: 'tavern' }, { from: 9, place: 'square' }], 5)?.place).toBe('tavern');
    expect(entryAt([], 12)).toBeNull();
  });

  it('without a schedule an actor is at its own place all day; the player is in the village', () => {
    expect(placeAt(smith, 0)).toBe('forge');
    expect(placeAt(smith, 13)).toBe('forge');
    expect(placeAt(player, 5)).toBe('village');
    expect(placeAt(wanderer, 0)).toBe('market');
    expect(placeAt(wanderer, 11)).toBe('tavern'); // 19:00
    expect(placeAt(wanderer, 11 + 24)).toBe('tavern'); // the next day too
  });

  it("what an actor does happens where it is at that tick: offers, rejections and its own turns", () => {
    const offer = { action: 'OFFER', terms: { kind: 'in_stock', good: 'torch', qty: 2, price: 6, remarks: 'Fresh pitch.' } };
    const morning = act(at(9), 'merchant', offer);
    expect(morning.events[0]).toMatchObject({ type: 'CONTRACT_PROPOSED', location: 'market' });

    const evening = act(at(20), 'merchant', offer);
    expect(evening.events[0]).toMatchObject({ type: 'CONTRACT_PROPOSED', location: 'tavern' });
    // The sale happens where it was offered, even if she has moved on by the time it's taken.
    const later = advance(evening.world, 4).world; // 00:00, back at the stall
    const taken = act(later, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
    expect(taken.events.map((e) => [e.type, e.location])).toEqual([
      ['CONTRACT_ACCEPTED', 'tavern'],
      ['GOODS_DELIVERED', 'tavern'],
    ]);

    const refused = act(at(20), 'merchant', { action: 'OFFER', terms: { kind: 'in_stock', good: 'torch', qty: 2, price: 1, remarks: 'Cheap.' } });
    expect(refused.events[0]).toMatchObject({ type: 'ACTION_REJECTED', location: 'tavern' });

    expect(triggerFired(at(20), wanderer, { kind: 'every_hours', hours: 6, cue: 'Call out.' }).location).toBe('tavern');
  });
});
