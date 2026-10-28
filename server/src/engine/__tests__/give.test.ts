import { describe, expect, it } from 'vitest';
import { createEngine, createWorld, replay, timedTrigger, verbs, type World } from '../index';
import { hammerheadTerms, merchant, player, smith } from './fixtures';

// GIVE and EMOTE on the engine's own actors: the merchant may give, the smith may not.
const giver = { ...merchant, verbs: [...merchant.verbs, verbs.GIVE, verbs.EMOTE] };
const ACTORS = [giver, smith, { ...player, verbs: [...player.verbs, verbs.GIVE] }];
const { act } = createEngine(ACTORS);
const fresh = () => createWorld(ACTORS);
const give = (w: World, actor: string, to: string | null, gift: unknown, customer?: string) =>
  act(w, actor, { action: 'GIVE', to, gift }, customer ? { customer } : {});

function expectUnchanged(before: World, after: World) {
  const { events: _a, ...b } = before;
  const { events: _b, ...a } = after;
  expect(a).toEqual(b);
  expect(after.events.at(-1)?.type).toBe('ACTION_REJECTED');
}

describe('GIVE', () => {
  it('gold and goods move from the giver to the receiver, at the giver’s place; replay agrees', () => {
    const w0 = fresh();
    const gold = give(w0, 'merchant', 'player', { kind: 'gold', amount: 5 });
    expect(gold.ok).toBe(true);
    expect(gold.events[0]).toMatchObject({ type: 'GIVEN', actor: 'merchant', target: 'player', location: 'market' });
    expect(gold.world.gold).toMatchObject({ merchant: 25, player: 205 });

    const torch = give(gold.world, 'merchant', 'player', { kind: 'good', good: 'torch', qty: 2 });
    expect(torch.ok).toBe(true);
    expect(torch.world.stock.merchant.torch).toBe(8);
    expect(torch.world.stock.player.torch).toBe(2);
    expect(replay(torch.world.events, fresh())).toEqual(torch.world);
  });

  it('to: null gives to whoever it is talking to', () => {
    const r = give(fresh(), 'merchant', null, { kind: 'gold', amount: 1 }, 'player');
    expect(r.events[0].target).toBe('player');
  });

  it('more gold or goods than it has → reject, nothing moves', () => {
    const w = fresh();
    const r1 = give(w, 'merchant', 'player', { kind: 'gold', amount: 31 });
    expect(r1.reason).toMatch(/merchant has 30 gold; it can't give 31/);
    expectUnchanged(w, r1.world);
    const r2 = give(w, 'merchant', 'player', { kind: 'good', good: 'lantern', qty: 1 });
    expect(r2.reason).toMatch(/has 0 lantern to spare/);
    const r3 = give(w, 'merchant', 'player', { kind: 'good', good: '__proto__', qty: 1 });
    expect(r3.ok).toBe(false);
  });

  it('goods promised to an accepted job are not its to give', () => {
    const { act: forge } = createEngine([{ ...smith, verbs: [...smith.verbs, verbs.GIVE] }, player]);
    let w = createWorld([smith, player]);
    w = forge(w, 'smith', { action: 'OFFER', terms: { ...hammerheadTerms, materials_used: { iron: 12 }, price: 200 } }).world;
    w = forge(w, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).world;
    expect(forge(w, 'smith', { action: 'GIVE', to: 'player', gift: { kind: 'good', good: 'iron', qty: 1 } }).reason).toMatch(/has 0 iron to spare/);
  });

  it('nobody to give to, or itself → reject', () => {
    const w = fresh();
    expect(give(w, 'merchant', 'baron', { kind: 'gold', amount: 1 }).reason).toMatch(/nobody called 'baron'/);
    expect(give(w, 'merchant', 'toString', { kind: 'gold', amount: 1 }).reason).toMatch(/nobody called 'toString'/);
    expect(give(w, 'merchant', 'merchant', { kind: 'gold', amount: 1 }).reason).toMatch(/to itself/);
  });

  it('an item changes owner only if the giver owns it', () => {
    const w: World = {
      ...fresh(),
      items: [{ item_id: 'i_c_001', contract_id: 'c_001', owner: 'player', item_name: 'Shark Fang', item_type: 'sword', description: '', stats: { damage: 9, weight: 5, durability: 50 }, delivered_tick: 6 }],
    };
    expect(give(w, 'merchant', 'player', { kind: 'item', item_id: 'i_c_001' }).reason).toMatch(/belongs to player, not merchant/);
    expect(give(w, 'merchant', 'player', { kind: 'item', item_id: 'i_c_404' }).reason).toMatch(/no item i_c_404/);
    const r = give(w, 'player', 'merchant', { kind: 'item', item_id: 'i_c_001' });
    expect(r.ok).toBe(true);
    expect(r.events[0].data).toMatchObject({ item_name: 'Shark Fang' });
    expect(r.world.items[0].owner).toBe('merchant');
  });

  it('a verb the actor does not list is rejected before its rule runs', () => {
    expect(give(fresh(), 'smith', 'player', { kind: 'gold', amount: 1 }).reason).toBe('smith may not use GIVE');
  });
});

describe('EMOTE', () => {
  it('is logged and changes nothing else', () => {
    const w = fresh();
    const r = act(w, 'merchant', { action: 'EMOTE', text: 'polishes a lantern' }, { to: 'player' });
    expect(r.ok).toBe(true);
    expect(r.events[0]).toMatchObject({ type: 'EMOTED', target: 'player', data: { text: 'polishes a lantern' } });
    const { events: _e, ...after } = r.world;
    const { events: _f, ...before } = w;
    expect(after).toEqual(before);
  });
});

describe('timed triggers', () => {
  const every6 = [{ kind: 'on_spoken_to' as const }, { kind: 'every_hours' as const, hours: 6, cue: 'Call out.' }];
  it('fire when the clock passes a multiple of their hours, once however far it skips', () => {
    expect(timedTrigger(every6, 0, 5)).toBeNull();
    expect(timedTrigger(every6, 0, 6)?.hours).toBe(6);
    expect(timedTrigger(every6, 5, 7)?.hours).toBe(6);
    expect(timedTrigger(every6, 6, 11)).toBeNull();
    expect(timedTrigger(every6, 0, 48)?.hours).toBe(6); // one, not eight
    expect(timedTrigger([{ kind: 'on_spoken_to' }], 0, 48)).toBeNull();
  });
});
