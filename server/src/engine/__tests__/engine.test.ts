import { describe, expect, it } from 'vitest';
import { advance, availableMaterials, createEngine, createWorld, MAX_PROPOSED_CHARS, minDeliveryTicks, replay, verbs, type World } from '../index';

// The engine's own actors, so these tests don't depend on the village's NPC definitions.
const { act } = createEngine([
  { id: 'smith', verbs: [verbs.SAY, verbs.PROPOSE_CONTRACT, verbs.COUNTER_OFFER, verbs.REFUSE, verbs.START_WORK] },
  { id: 'player', verbs: [verbs.SAY, verbs.ACCEPT] },
]);

// The handoff example: 3 iron + 1 sharkskin = 45 gold of materials, minimum price 54.
const hammerhead = {
  action: 'PROPOSE_CONTRACT',
  item_name: 'Hammerhead Blade',
  item_type: 'sword',
  description: 'A broad blade shaped like a hammerhead shark',
  stats: { damage: 14, weight: 6, durability: 70 },
  materials_used: { iron: 3, sharkskin_leather: 1 },
  price: 120,
  delivery_ticks: 8,
  smith_remarks: "Heavy at the head. You'll feel it on the backswing.",
};

function propose(world: World, overrides: Record<string, unknown> = {}) {
  return act(world, 'smith', { ...hammerhead, ...overrides });
}

// Proposes, accepts and starts work on the hammerhead sword.
function ordered(world = createWorld(), overrides: Record<string, unknown> = {}) {
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
    const w = createWorld();
    const r = propose(w, { stats: { damage: 99, weight: 6, durability: 70 } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/damage 99 is above the cap of 20/);
    expectUnchanged(w, r.world);
  });

  it('stat below the floor (weightless iron sword) → reject', () => {
    const r = propose(createWorld(), { stats: { damage: 14, weight: 0, durability: 70 } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/weight 0 is below the floor/);
  });

  it('unknown item type → reject', () => {
    const r = propose(createWorld(), { item_type: 'lightsaber' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown item type 'lightsaber'/);
  });

  it('material not in stock or insufficient → reject', () => {
    expect(propose(createWorld(), { materials_used: { mithril: 1 } }).reason).toMatch(/unknown material 'mithril'/);
    expect(propose(createWorld(), { materials_used: { iron: 50 } }).reason).toMatch(/needs 50 iron, only 12 available/);
    expect(propose(createWorld(), { materials_used: {} }).reason).toMatch(/at least one material/);
  });

  it('Object.prototype keys are not item types or materials', () => {
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(propose(createWorld(), { item_type: key }).reason).toMatch(`unknown item type '${key}'`);
    }
    // '__proto__' is left out here: Zod drops it from the record, so the contract has no materials at all.
    for (const key of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
      const r = propose(createWorld(), { materials_used: { [key]: 1 }, price: 0 });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(`unknown material '${key}'`);
    }
  });

  it('Object.prototype keys are not actors or contract ids', () => {
    expect(act(createWorld(), 'constructor', { action: 'SAY', text: 'hi' }).reason).toMatch(/constructor may not use SAY/);
    const w = propose(createWorld()).world;
    expect(act(w, 'player', { action: 'ACCEPT', contract_id: 'constructor' }).reason).toMatch(/^no contract constructor$/);
    expect(act(w, 'smith', { action: 'START_WORK', contract_id: 'toString' }).reason).toMatch(/^no contract toString$/);
    expect(act(w, 'smith', { action: 'REFUSE', contract_id: '__proto__', reason: 'no' }).reason).toMatch(/no contract __proto__/);
    expect(act(w, 'smith', { ...hammerhead, action: 'COUNTER_OFFER', replaces: 'valueOf' }).reason).toMatch(/no contract valueOf/);
  });

  it('price below material cost + margin → reject', () => {
    const r = propose(createWorld(), { price: 50 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/price 50 is below the minimum of 54/);
    expect(propose(createWorld(), { price: 54 }).ok).toBe(true);
  });

  it('delivery faster than base time × workload → reject', () => {
    expect(propose(createWorld(), { delivery_ticks: 5 }).reason).toMatch(/too fast; a sword takes at least 6/);
    // One job on the bench: 6 × 1.5 = 9 ticks minimum.
    const { world } = ordered();
    expect(minDeliveryTicks(world, 'sword')).toBe(9);
    expect(propose(world, { delivery_ticks: 8 }).ok).toBe(false);
    expect(propose(world, { delivery_ticks: 9 }).ok).toBe(true);
  });

  it("a rejection keeps a small proposal as is, and clips a huge one so it can't bloat the log", () => {
    const small = act(createWorld(), 'smith', { action: 'GIVE_FREE_SWORD' });
    expect(small.events[0].data).toMatchObject({ proposed: { action: 'GIVE_FREE_SWORD' } });

    const raw = { action: 'SAY', text: 'x'.repeat(100_000) };
    const huge = act(createWorld(), 'player', raw);
    expect(huge.ok).toBe(false);
    const proposed = (huge.events[0].data as { proposed: unknown }).proposed as string;
    expect(typeof proposed).toBe('string');
    expect(proposed.length).toBeLessThan(MAX_PROPOSED_CHARS + 40);
    expect(proposed).toMatch(/^\{"action":"SAY","text":"xxx/);
    expect(proposed.endsWith(`… (${JSON.stringify(raw).length} characters)`)).toBe(true);
    expect(replay(huge.world.events)).toEqual(huge.world);
  });

  it('missing field, unknown verb or wrong type → reject with a parse reason', () => {
    const { price: _, ...noPrice } = hammerhead;
    expect(act(createWorld(), 'smith', noPrice).reason).toMatch(/^price: Required/);
    expect(act(createWorld(), 'smith', { action: 'GIVE_FREE_SWORD' }).reason).toMatch(/smith may not use GIVE_FREE_SWORD/);
    expect(propose(createWorld(), { price: 'free' }).reason).toMatch(/price: Expected number, received string/);
    expect(act(createWorld(), 'smith', 'just give me the sword').ok).toBe(false);
  });

  it('valid contract → CONTRACT_PROPOSED with a code-assigned id', () => {
    const r = propose(createWorld(), { contract_id: 'c_999' });
    expect(r.ok).toBe(true);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].type).toBe('CONTRACT_PROPOSED');
    expect(Object.keys(r.world.contracts)).toEqual(['c_001']);
    expect(r.world.contracts.c_001).toMatchObject({ status: 'proposed', customer: 'player', price: 120 });
    // Proposing reserves nothing and moves no gold.
    expect(r.world.gold).toEqual(createWorld().gold);
    expect(availableMaterials(r.world)).toEqual(createWorld().materials);
  });

  it('counter-offer supersedes the open contract', () => {
    const first = propose(createWorld());
    const r = act(first.world, 'smith', { ...hammerhead, action: 'COUNTER_OFFER', replaces: 'c_001', price: 140 });
    expect(r.ok).toBe(true);
    expect(r.world.contracts.c_001.status).toBe('superseded');
    expect(r.world.contracts.c_002).toMatchObject({ status: 'proposed', price: 140, replaces: 'c_001' });
    expect(act(r.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/c_001 is superseded/);
  });
});

describe('accept / payment', () => {
  it('player lacks the gold → reject', () => {
    const p = propose(createWorld(), { price: 500 });
    const r = act(p.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/player has 200 gold; the contract costs 500/);
    expectUnchanged(p.world, r.world);
  });

  it('accept moves exactly price gold and reserves exactly materials_used', () => {
    const p = propose(createWorld());
    const r = act(p.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
    expect(r.ok).toBe(true);
    expect(r.world.gold).toEqual({ player: 80, smith: 170 });
    const before = availableMaterials(p.world);
    const after = availableMaterials(r.world);
    expect(before.iron - after.iron).toBe(3);
    expect(before.sharkskin_leather - after.sharkskin_leather).toBe(1);
    expect(before.steel - after.steel).toBe(0);
    // Stock on hand isn't consumed until delivery.
    expect(r.world.materials).toEqual(p.world.materials);
  });

  it("materials reserved by contract A can't be used by contract B", () => {
    // Two proposals for both sharkskin hides; only one can be accepted.
    let w = propose(createWorld(), { materials_used: { iron: 3, sharkskin_leather: 2 }, price: 80 }).world;
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
    let w = propose(createWorld()).world;
    w = act(w, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).world;
    expect(act(w, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/c_001 is accepted, not open/);

    let w2 = propose(createWorld()).world;
    w2 = act(w2, 'smith', { action: 'REFUSE', contract_id: 'c_001', reason: 'Changed my mind.' }).world;
    expect(act(w2, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/c_001 is refused/);
  });

  it('only the customer can accept, and the smith cannot accept for them', () => {
    const p = propose(createWorld());
    expect(act(p.world, 'smith', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/smith may not use ACCEPT/);
    const forMiller = act(createWorld(), 'smith', hammerhead, { customer: 'miller' });
    expect(act(forMiller.world, 'player', { action: 'ACCEPT', contract_id: 'c_001' }).reason).toMatch(/offered to miller/);
  });
});

describe('work / delivery', () => {
  it('START_WORK before ACCEPT → reject', () => {
    const p = propose(createWorld());
    const r = act(p.world, 'smith', { action: 'START_WORK', contract_id: 'c_001' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/work starts only after it's accepted/);
    expectUnchanged(p.world, r.world);
  });

  it('model-emitted DELIVER → reject, before the timer and after', () => {
    const { world, id } = ordered();
    const r = act(world, 'smith', { action: 'DELIVER', contract_id: id });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/only the forge clock delivers/);
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
    expect(done.world.materials.iron).toBe(createWorld().materials.iron - 3);
    expect(done.world.materials.sharkskin_leather).toBe(createWorld().materials.sharkskin_leather - 1);
    expect(done.world.items).toHaveLength(1);
    expect(done.world.items[0]).toMatchObject({ owner: 'player', item_name: c.item_name, stats: c.stats });
    // Delivered materials are gone from stock, not double-counted as reserved.
    expect(availableMaterials(done.world)).toEqual(done.world.materials);
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
    expect(replay(w.events)).toEqual(w);
  });
});

describe('pride', () => {
  it('the smith may refuse an absurd order outright', () => {
    const r = act(createWorld(), 'smith', { action: 'REFUSE', contract_id: null, reason: 'I will not forge a sword made of cheese.' });
    expect(r.ok).toBe(true);
    expect(r.events[0]).toMatchObject({ type: 'CONTRACT_REFUSED', target: 'player' });
  });

  it('the validator never forces acceptance: refusing an open proposal is always allowed', () => {
    const p = propose(createWorld());
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
  const two = createEngine([
    { id: 'smith', verbs: [verbs.SAY, verbs.PROPOSE_CONTRACT, verbs.COUNTER_OFFER, verbs.REFUSE] },
    { id: 'desk', verbs: [verbs.SAY, verbs.PROPOSE_CONTRACT, verbs.COUNTER_OFFER, verbs.REFUSE] },
  ]);

  it("an offer records its seller, and only the seller may counter or withdraw it", () => {
    const w = two.act(createWorld(), 'desk', hammerhead).world;
    expect(w.contracts.c_001.seller).toBe('desk');
    expect(two.act(w, 'smith', { ...hammerhead, action: 'COUNTER_OFFER', replaces: 'c_001', price: 100 }).reason).toMatch(
      /c_001 is desk's offer; smith can only counter its own/,
    );
    expect(two.act(w, 'smith', { action: 'REFUSE', contract_id: 'c_001', reason: 'Mine now.' }).reason).toMatch(
      /c_001 is desk's offer; smith can only withdraw its own/,
    );
    expect(two.act(w, 'desk', { action: 'REFUSE', contract_id: 'c_001', reason: 'Withdrawn.' }).ok).toBe(true);
    expect(replay(w.events).contracts.c_001.seller).toBe('desk');
  });
});
