import { describe, expect, it } from 'vitest';
import { createEngine, createWorld, replay, type World } from '../index';
import { hammerhead, merchant, player, smith } from './fixtures';

// The third door: the game's own code says what an actor holds now, after changing it itself.
const ACTORS = [smith, merchant, player];
const everyoneSees = () => ['smith', 'merchant']; // a sense that would make anything a witnessed deed
const { act, sync } = createEngine(ACTORS, { sense: everyoneSees });
const fresh = () => createWorld(ACTORS);

function expectUnchanged(before: World, after: World) {
  expect(after).toEqual(before);
}

describe('sync', () => {
  it('sets the totals the game says, logs what changed from what, and replays to the same world', () => {
    const r = sync(fresh(), { actor: 'player', gold: 340, stock: { itm_wolf_pelt: 2 }, reason: 'looted the wolf den' });
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([
      {
        id: 'e_0001',
        type: 'SYNCED',
        tick: 0,
        actor: 'world',
        target: 'player',
        location: 'village',
        witnesses: [], // the game's bookkeeping, not a deed anyone saw
        data: {
          changes: [
            { what: 'gold', from: 200, to: 340 },
            { what: 'itm_wolf_pelt', from: 0, to: 2 },
          ],
          reason: 'looted the wolf den',
        },
      },
    ]);
    expect(r.world.gold.player).toBe(340);
    expect(r.world.stock.player).toEqual({ itm_wolf_pelt: 2 });
    expect(replay(r.world.events, fresh())).toEqual(r.world);
  });

  it('the same sync twice changes nothing the second time, and logs nothing', () => {
    const once = sync(fresh(), { actor: 'merchant', stock: { torch: 4 }, reason: 'a thief emptied the stall' });
    const twice = sync(once.world, { actor: 'merchant', stock: { torch: 4 }, reason: 'a thief emptied the stall' });
    expect(twice).toMatchObject({ ok: true, events: [] });
    expect(twice.world).toBe(once.world);
    // Only what differs is logged.
    const some = sync(once.world, { actor: 'merchant', gold: 30, stock: { torch: 4, rope: 5 }, reason: 'restocked' });
    expect(some.events[0].type === 'SYNCED' && some.events[0].data.changes).toEqual([{ what: 'rope', from: 2, to: 5 }]);
  });

  it("can't take away what is promised to accepted work, but may leave exactly that", () => {
    const offered = act(fresh(), 'smith', hammerhead);
    const accepted = act(offered.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' }); // 3 iron, 1 sharkskin promised
    const tooFew = sync(accepted.world, { actor: 'smith', stock: { iron: 2 }, reason: 'rust' });
    expect(tooFew).toMatchObject({ ok: false, reason: "smith has 3 iron promised to accepted work; it can't hold fewer than that", events: [] });
    expectUnchanged(accepted.world, tooFew.world);
    expect(sync(accepted.world, { actor: 'smith', stock: { iron: 3 }, reason: 'rust' }).ok).toBe(true);
  });

  it('the ledger works from the synced stock: what was taken away can no longer be sold', () => {
    const emptied = sync(fresh(), { actor: 'merchant', stock: { torch: 0, lantern: 1 }, reason: 'a thief emptied the stall' });
    const torches = act(emptied.world, 'merchant', { action: 'OFFER', terms: { kind: 'in_stock', good: 'torch', qty: 1, price: 2, remarks: '' } });
    expect(torches.reason).toMatch(/torch/);
    // Holding something isn't selling it: a lantern the stall's catalogue doesn't list still can't be offered.
    const lantern = act(emptied.world, 'merchant', { action: 'OFFER', terms: { kind: 'in_stock', good: 'lantern', qty: 1, price: 20, remarks: '' } });
    expect(lantern.ok).toBe(false);
  });

  it('refuses a sync for nobody, or one that is badly formed, and logs nothing', () => {
    const w = fresh();
    for (const [raw, reason] of [
      [{ actor: 'baron', gold: 5, reason: 'tax' }, "there's nobody called 'baron' in this world"],
      [{ actor: 'constructor', gold: 5, reason: 'tax' }, "there's nobody called 'constructor' in this world"],
      [{ actor: 'player', reason: 'nothing' }, /give gold, stock or both/],
      [{ actor: 'player', gold: -5, reason: 'debt' }, /gold/],
      [{ actor: 'player', stock: { 'Iron Sword': 1 }, reason: 'found' }, /names are lowercase/],
      [{ actor: 'player', stock: { __proto__x: 1 }, reason: 'found' }, /names are lowercase/],
      [{ actor: 'player', gold: 5, reason: '   ' }, /reason/],
      [{ actor: 'player', gold: 5, reason: 'ok', extra: true }, /Unrecognized key/],
      [null, /sync/],
    ] as const) {
      const r = sync(w, raw);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(reason);
      expect(r.world).toBe(w);
    }
  });
});
