import { describe, expect, it } from 'vitest';
import { advance, availableStock, createEngine, createWorld, MAX_PROPOSED_CHARS, minDeliveryTicks, replay, verbs, type World } from '../index';
import { FORGE, FORGE_START, hammerhead, hammerheadTerms, merchant, player, smith } from './fixtures';

const ACTORS = [smith, player];
const { act } = createEngine(ACTORS);
const fresh = () => createWorld(ACTORS);
const smithStock = (w: World) => availableStock(w, 'smith');

function propose(world: World, overrides: Record<string, unknown> = {}) {
  return act(world, 'smith', { action: 'OFFER', terms: { ...hammerheadTerms, ...overrides } });
}

// Proposes, accepts and starts work on the hammerhead sword.
function ordered(world = fresh(), overrides: Record<string, unknown> = {}) {
  const p = propose(world, overrides);
  expect(p.ok).toBe(true);
  const id = Object.keys(p.world.contracts).at(-1)!;
  const a = act(p.world, 'player', { action: 'ACCEPT', contract_id: id });
  expect(a.ok).toBe(true);
  const s = act(a.world, 'smith', { action: 'START_WORK', contract_id: id });
  expect(s.ok).toBe(true);
  return { world: s.world, id };
}

// A rejection must change nothing but the log.
function expectUnchanged(before: World, after: World) {
  const { events: _a, ...b } = before;
  const { events: _b, ...a } = after;
  expect(a).toEqual(b);
  expect(after.events.at(-1)?.type).toBe('ACTION_REJECTED');
  expect(after.events.at(-1)?.witnesses).toEqual([]);
}

describe('contract proposal', () => {
  it('stat above the skill cap → reject, reason names the stat', () => {
    const w = fresh();
    const r = propose(w, { stats: { damage: 99, weight: 6, durability: 70 } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/damage 99 is above the cap of 20/);
    expectUnchanged(w, r.world);
  });

  it('stat below the floor (weightless iron sword) → reject', () => {
    const r = propose(fresh(), { stats: { damage: 14, weight: 0, durability: 70 } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/weight 0 is below the floor/);
  });

  it('unknown item type → reject', () => {
    const r = propose(fresh(), { item_type: 'lightsaber' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown item type 'lightsaber'/);
  });

  it('material not in stock or insufficient → reject', () => {
    expect(propose(fresh(), { materials_used: { mithril: 1 } }).reason).toMatch(/unknown material 'mithril'/);
    expect(propose(fresh(), { materials_used: { iron: 50 } }).reason).toMatch(/needs 50 iron, only 12 available/);
    expect(propose(fresh(), { materials_used: {} }).reason).toMatch(/at least one material/);
  });

  it('Object.prototype keys are not item types or materials', () => {
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(propose(fresh(), { item_type: key }).reason).toMatch(`unknown item type '${key}'`);
    }
    // '__proto__' is left out here: Zod drops it from the record, so the contract has no materials at all.
    for (const key of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
      const r = propose(fresh(), { materials_used: { [key]: 1 }, price: 0 });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(`unknown material '${key}'`);
    }
  });

  it('Object.prototype keys are not actors or contract ids', () => {
    expect(act(fresh(), 'constructor', { action: 'SAY', text: 'hi' }).reason).toMatch(/constructor may not use SAY/);
    const w = propose(fresh()).world;
    expect(act(w, 'player', { action: 'ACCEPT', contract_id: 'constructor' }).reason).toMatch(/^no contract constructor$/);
    expect(act(w, 'smith', { action: 'START_WORK', contract_id: 'toString' }).reason).toMatch(/^no contract toString$/);
    expect(act(w, 'smith', { action: 'REFUSE', contract_id: '__proto__', reason: 'no' }).reason).toMatch(/no contract __proto__/);
    expect(act(w, 'smith', { ...hammerhead, action: 'COUNTER_OFFER', replaces: 'valueOf' }).reason).toMatch(/no contract valueOf/);
  });

  it('price below material cost + margin → reject', () => {
    const r = propose(fresh(), { price: 50 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/price 50 is below the minimum of 54/);
    expect(propose(fresh(), { price: 54 }).ok).toBe(true);
  });

  it('delivery faster than base time × workload → reject', () => {
    expect(propose(fresh(), { delivery_ticks: 5 }).reason).toMatch(/too fast; a sword takes at least 6/);
    // One job on the bench: 6 × 1.5 = 9 ticks minimum.
    const { world } = ordered();
    expect(minDeliveryTicks(world, 'smith', FORGE.made_to_order!, 'sword')).toBe(9);
    expect(propose(world, { delivery_ticks: 8 }).ok).toBe(false);
    expect(propose(world, { delivery_ticks: 9 }).ok).toBe(true);
  });

  it("a rejection keeps a small proposal as is, and clips a huge one so it can't bloat the log", () => {
    const small = act(fresh(), 'smith', { action: 'GIVE_FREE_SWORD' });
    expect(small.events[0].data).toMatchObject({ proposed: { action: 'GIVE_FREE_SWORD' } });

    const raw = { action: 'SAY', text: 'x'.repeat(100_000) };
    const huge = act(fresh(), 'player', raw);
    expect(huge.ok).toBe(false);
    const proposed = (huge.events[0].data as { proposed: unknown }).proposed as string;
    expect(typeof proposed).toBe('string');
    expect(proposed.length).toBeLessThan(MAX_PROPOSED_CHARS + 40);
    expect(proposed).toMatch(/^\{"action":"SAY","text":"xxx/);
    expect(proposed.endsWith(`… (${JSON.stringify(raw).length} characters)`)).toBe(true);
    expect(replay(huge.world.events, fresh())).toEqual(huge.world);
  });

  it('missing field, unknown verb or wrong type → reject with a parse reason', () => {
    const { price: _, ...noPrice } = hammerheadTerms;
    expect(act(fresh(), 'smith', { action: 'OFFER', terms: noPrice }).reason).toMatch(/^terms.price: Required/);
    expect(act(fresh(), 'smith', { action: 'GIVE_FREE_SWORD' }).reason).toMatch(/smith may not use GIVE_FREE_SWORD/);
    expect(propose(fresh(), { price: 'free' }).reason).toMatch(/terms.price: Expected number, received string/);
    expect(act(fresh(), 'smith', 'just give me the sword').ok).toBe(false);
  });

  it('valid contract → CONTRACT_PROPOSED with a code-assigned id', () => {
    const r = propose(fresh(), { contract_id: 'c_999' });
    expect(r.ok).toBe(true);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].type).toBe('CONTRACT_PROPOSED');
    expect(Object.keys(r.world.contracts)).toEqual(['c_001']);
    expect(r.world.contracts.c_001).toMatchObject({ status: 'proposed', customer: 'player', price: 120 });
    // Proposing reserves nothing and moves no gold.
    expect(r.world.gold).toEqual(fresh().gold);
    expect(smithStock(r.world)).toEqual(fresh().stock.smith);
    expect(r.world.contracts.c_001).toMatchObject({ seller: 'smith', location: 'forge' });
    expect(r.events[0].location).toBe('forge');
  });

  it('counter-offer supersedes the open contract', () => {
    const first = propose(fresh());
    const r = act(first.world, 'smith', { action: 'COUNTER_OFFER', replaces: 'c_001', terms: { ...hammerheadTerms, price: 140 } });
    expect(r.ok).toBe(true);
    expect(r.world.contracts.c_001.status).toBe('superseded');
    expect(r.world.contracts.c_002).toMatchObject({ status: 'proposed', price: 140, replaces: 'c_001' });
    expect(act(r.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/c_001 is superseded/);
  });
});

describe('accept / payment', () => {
  it('player lacks the gold → reject', () => {
    const p = propose(fresh(), { price: 500 });
    const r = act(p.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/player has 200 gold; the contract costs 500/);
    expectUnchanged(p.world, r.world);
  });

  it('accept moves exactly price gold and reserves exactly materials_used', () => {
    const p = propose(fresh());
    const r = act(p.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
    expect(r.ok).toBe(true);
    expect(r.world.gold).toEqual({ player: 80, smith: 170 });
    expect(r.events[0]).toMatchObject({ type: 'CONTRACT_ACCEPTED', actor: 'player', target: 'smith', location: 'forge' });
    const before = smithStock(p.world);
    const after = smithStock(r.world);
    expect(before.iron - after.iron).toBe(3);
    expect(before.sharkskin_leather - after.sharkskin_leather).toBe(1);
    expect(before.steel - after.steel).toBe(0);
    // Stock on hand isn't consumed until delivery.
    expect(r.world.stock).toEqual(p.world.stock);
  });

  it("materials reserved by contract A can't be used by contract B", () => {
    // Two proposals for both sharkskin hides; only one can be accepted.
    let w = propose(fresh(), { materials_used: { iron: 3, sharkskin_leather: 2 }, price: 80 }).world;
    w = propose(w, { materials_used: { iron: 3, sharkskin_leather: 2 }, price: 80 }).world;
    w = act(w, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).world;
    const r = act(w, 'player', { action: 'ACCEPT', contract_id: 'c_002' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/needs 2 sharkskin_leather, only 0 left unreserved/);
    // And a new proposal can't promise them either.
    expect(propose(r.world, { materials_used: { sharkskin_leather: 1, iron: 1 }, delivery_ticks: 9 }).reason).toMatch(
      /only 0 available/,
    );
  });

  it('accepting an already accepted or refused contract → reject', () => {
    let w = propose(fresh()).world;
    w = act(w, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).world;
    expect(act(w, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/c_001 is accepted, not open/);

    let w2 = propose(fresh()).world;
    w2 = act(w2, 'smith', { action: 'REFUSE', contract_id: 'c_001', reason: 'Changed my mind.' }).world;
    expect(act(w2, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/c_001 is refused/);
  });

  it('only the customer can accept, and the smith cannot accept for them', () => {
    const p = propose(fresh());
    expect(act(p.world, 'smith', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/smith may not use ACCEPT/);
    const forMiller = act(fresh(), 'smith', hammerhead, { customer: 'miller' });
    expect(act(forMiller.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/offered to miller/);
  });
});

describe('work / delivery', () => {
  it('START_WORK before ACCEPT → reject', () => {
    const p = propose(fresh());
    const r = act(p.world, 'smith', { action: 'START_WORK', contract_id: 'c_001' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/work starts only after it's accepted/);
    expectUnchanged(p.world, r.world);
  });

  it('model-emitted DELIVER → reject, before the timer and after', () => {
    const { world, id } = ordered();
    const r = act(world, 'smith', { action: 'DELIVER', contract_id: id });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/only the clock delivers/);
    expectUnchanged(world, r.world);
    expect(act(world, 'player', { action: 'DELIVER', contract_id: id }).ok).toBe(false);
  });

  it('clock reaching the timer → ITEM_DELIVERED, materials consumed, stats copied exactly', () => {
    const { world, id } = ordered();
    const early = advance(world, 7);
    expect(early.events.map((e) => e.type)).toEqual(['CLOCK_ADVANCED']);
    expect(early.world.items).toEqual([]);

    const done = advance(early.world, 1);
    expect(done.events.map((e) => e.type)).toEqual(['ITEM_DELIVERED', 'CLOCK_ADVANCED']);
    expect(done.events[0].tick).toBe(8);
    const c = done.world.contracts[id];
    expect(c.status).toBe('delivered');
    expect(done.world.stock.smith.iron).toBe(fresh().stock.smith.iron - 3);
    expect(done.world.stock.smith.sharkskin_leather).toBe(fresh().stock.smith.sharkskin_leather - 1);
    expect(done.world.items).toHaveLength(1);
    if (c.kind !== 'made_to_order') throw new Error('expected a made-to-order contract');
    expect(done.world.items[0]).toMatchObject({ owner: 'player', item_name: c.item_name, stats: c.stats });
    expect(done.events[0].location).toBe('forge');
    // Delivered materials are gone from stock, not double-counted as reserved.
    expect(smithStock(done.world)).toEqual(done.world.stock.smith);
  });

  it('a long skip delivers at the due tick, not the skip target', () => {
    const { world } = ordered();
    const r = advance(world, 20);
    expect(r.events[0]).toMatchObject({ type: 'ITEM_DELIVERED', tick: 8 });
    expect(r.world.tick).toBe(20);
    expect(advance(r.world, 5).world.items).toHaveLength(1);
  });

  it('world rebuilt by replaying the log equals the live world', () => {
    let w = ordered().world;
    w = act(w, 'smith', { action: 'SAY', text: 'Come back tomorrow.' }).world;
    w = act(w, 'smith', { action: 'DELIVER', contract_id: 'c_001' }).world; // rejected, still logged
    w = advance(w, 10).world;
    w = propose(w, { item_type: 'dagger', stats: { damage: 6, weight: 2, durability: 40 }, materials_used: { steel: 1 } }).world;
    expect(replay(w.events, fresh())).toEqual(w);
  });
});

describe('pride', () => {
  it('the smith may refuse an absurd order outright', () => {
    const r = act(fresh(), 'smith', { action: 'REFUSE', contract_id: null, reason: 'I will not forge a sword made of cheese.' });
    expect(r.ok).toBe(true);
    expect(r.events[0]).toMatchObject({ type: 'CONTRACT_REFUSED', target: 'player' });
  });

  it('the validator never forces acceptance: refusing an open proposal is always allowed', () => {
    const p = propose(fresh());
    const r = act(p.world, 'smith', { action: 'REFUSE', contract_id: 'c_001', reason: 'On reflection, no.' });
    expect(r.ok).toBe(true);
    expect(r.world.contracts.c_001.status).toBe('refused');
  });
});

describe('actors', () => {
  it('two actors with one id is a definition error', () => {
    expect(() => createEngine([{ id: 'smith', verbs: [verbs.SAY] }, { id: 'smith', verbs: [verbs.REFUSE] }])).toThrow(
      /two actors have the id 'smith'/,
    );
  });
});

describe('two sellers', () => {
  // A second made-to-order seller with the forge's catalogue and stock but its own purse and place.
  const desk = { ...smith, id: 'desk', location: 'desk', start: { gold: 30, stock: { ...FORGE_START.stock } } };
  const two = createEngine([smith, desk, merchant, player]);
  const world = () => createWorld([smith, desk, merchant, player]);

  it('an offer records its seller, and only the seller may counter or withdraw it', () => {
    const w = two.act(world(), 'desk', hammerhead).world;
    expect(w.contracts.c_001.seller).toBe('desk');
    expect(two.act(w, 'smith', { action: 'COUNTER_OFFER', replaces: 'c_001', terms: { ...hammerheadTerms, price: 100 } }).reason).toMatch(
      /c_001 is desk's offer; smith can only counter its own/,
    );
    expect(two.act(w, 'smith', { action: 'REFUSE', contract_id: 'c_001', reason: 'Mine now.' }).reason).toMatch(
      /c_001 is desk's offer; smith can only withdraw its own/,
    );
    expect(two.act(w, 'desk', { action: 'REFUSE', contract_id: 'c_001', reason: 'Withdrawn.' }).ok).toBe(true);
    expect(replay(w.events, world()).contracts.c_001.seller).toBe('desk');
  });

  it("accepting B's offer pays B, not the smith; each uses its own stock and workload", () => {
    let w = two.act(world(), 'smith', hammerhead).world;
    w = two.act(w, 'desk', hammerhead).world;
    const before = w;
    const a = two.act(w, 'player', { action: 'ACCEPT', contract_id: 'c_002' });
    expect(a.ok).toBe(true);
    expect(a.world.gold).toMatchObject({ player: 80, smith: 50, desk: 30 + 120 });
    expect(a.events[0]).toMatchObject({ target: 'desk', location: 'desk' });
    // The desk's iron is reserved; the smith's isn't, and the smith's workload is unchanged.
    expect(availableStock(a.world, 'desk').iron).toBe(availableStock(before, 'desk').iron - 3);
    expect(availableStock(a.world, 'smith').iron).toBe(availableStock(before, 'smith').iron);
    expect(minDeliveryTicks(a.world, 'smith', FORGE.made_to_order!, 'sword')).toBe(6);
    expect(minDeliveryTicks(a.world, 'desk', FORGE.made_to_order!, 'sword')).toBe(9);
    // Only the seller starts its own job.
    expect(two.act(a.world, 'smith', { action: 'START_WORK', contract_id: 'c_002' }).reason).toMatch(/c_002 is desk's job, not smith's/);
    const started = two.act(a.world, 'desk', { action: 'START_WORK', contract_id: 'c_002' });
    expect(started.events[0].location).toBe('desk');
    const done = advance(started.world, 8);
    expect(done.events[0]).toMatchObject({ type: 'ITEM_DELIVERED', location: 'desk' });
    expect(done.world.stock.desk.iron).toBe(before.stock.desk.iron - 3);
    expect(done.world.stock.smith).toEqual(before.stock.smith);
    expect(replay(done.world.events, world())).toEqual(done.world);
  });

  it("a seller can only offer what is in its own catalogue", () => {
    expect(two.act(world(), 'merchant', hammerhead).reason).toMatch(/merchant doesn't take made-to-order work/);
    const torch = { action: 'OFFER', terms: { kind: 'in_stock', good: 'torch', qty: 1, price: 2, remarks: 'Burns an hour.' } };
    expect(two.act(world(), 'smith', torch).reason).toMatch(/'torch' isn't for sale here; smith sells from stock: nothing/);
  });
});

describe('in-stock sales', () => {
  const { act: shop } = createEngine([merchant, player]);
  const world = () => createWorld([merchant, player]);
  const sell = (w: World, terms: Record<string, unknown>) =>
    shop(w, 'merchant', { action: 'OFFER', terms: { kind: 'in_stock', good: 'torch', qty: 3, price: 9, remarks: 'Good pitch.', ...terms } });

  it('a good not in the catalogue, more than in stock, or under the floor → reject', () => {
    expect(sell(world(), { good: 'lantern' }).reason).toMatch(/'lantern' isn't for sale here; merchant sells from stock: torch, rope/);
    expect(sell(world(), { good: 'toString' }).reason).toMatch(/'toString' isn't for sale here/);
    expect(sell(world(), { good: 'rope', qty: 3, price: 12 }).reason).toMatch(/needs 3 rope, only 2 in stock/);
    expect(sell(world(), { price: 5 }).reason).toMatch(/price 5 is below the minimum of 6 \(3 × 2\)/);
    expect(sell(world(), { price: 6 }).ok).toBe(true);
  });

  it('accept pays the merchant and hands the goods over at once', () => {
    const p = sell(world(), {});
    expect(p.events[0].location).toBe('market');
    const a = shop(p.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
    expect(a.ok).toBe(true);
    expect(a.events.map((e) => e.type)).toEqual(['CONTRACT_ACCEPTED', 'GOODS_DELIVERED']);
    expect(a.events.every((e) => e.location === 'market')).toBe(true);
    expect(a.world.gold).toMatchObject({ player: 191, merchant: 39 });
    expect(a.world.stock.merchant.torch).toBe(7);
    expect(a.world.stock.player.torch).toBe(3);
    expect(a.world.contracts.c_001.status).toBe('delivered');
    expect(replay(a.world.events, world())).toEqual(a.world);
  });

  it('goods sold since the offer was made → accept is rejected', () => {
    let w = sell(world(), { qty: 8, price: 16 }).world;
    w = sell(w, { qty: 8, price: 16 }).world;
    w = shop(w, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).world;
    expect(shop(w, 'player', { action: 'ACCEPT', contract_id: 'c_002' }).reason).toMatch(/needs 8 torch, only 2 left unreserved/);
  });

  it('there is no work to start on a sale from stock', () => {
    const { act: both } = createEngine([{ ...merchant, verbs: [...merchant.verbs] }, player]);
    let w = sell(world(), {}).world;
    w = both(w, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).world;
    expect(both(w, 'merchant', { action: 'START_WORK', contract_id: 'c_001' }).reason).toMatch(/a sale from stock/);
  });
});
