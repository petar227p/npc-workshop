import type { ContractView, EngineEvent, NewsView, StateView } from '@blacksmith/shared';
import { describe, expect, it } from 'vitest';
import { dismissedIn, nextBaseline, selectHint, SMITH_EXAMPLES, type HintInput } from '../hints';

// Just the parts of a view the hints read.
const view = (v: Partial<StateView> = {}): StateView => ({
  tick: 8,
  people: [
    { id: 'smith', name: 'Brann', sprite: 86, place: 'forge', model: 'muse_spark' },
    { id: 'farmer', name: 'Edda', sprite: 88, place: 'farm', model: 'muse_spark' },
    { id: 'cottager', name: 'Mira', sprite: 98, place: 'cottage', model: 'muse_spark' },
  ] as StateView['people'],
  places: [],
  news: [],
  gold: 200,
  goods: {},
  shops: [{ id: 'smith', name: 'Brann', stock: { iron: 12 } }],
  contracts: [],
  items: [],
  events: [],
  busy: false,
  art: {},
  world_id: 'w1',
  ...v,
});

let n = 0;
const ev = (type: string, e: { actor?: string; target?: string | null; tick?: number; data?: unknown; witnesses?: string[] } = {}): EngineEvent =>
  ({ id: `e_${String(++n).padStart(4, '0')}`, tick: 8, type, actor: 'player', target: null, data: {}, location: 'forge', witnesses: [], ...e }) as EngineEvent;

const dagger = (status: ContractView['status']): ContractView =>
  ({
    kind: 'made_to_order',
    contract_id: 'c_001',
    seller: 'smith',
    status,
    item_name: 'Hammerhead Dagger',
    item_type: 'dagger',
    description: 'A short blade',
    stats: { damage: 8, weight: 2, durability: 60 },
    materials_used: { iron: 2 },
    price: 60,
    delivery_ticks: 3,
    remarks: 'Keep it oiled.',
    replaces: null,
    due_tick: status === 'in_progress' ? 11 : null,
  }) as ContractView;

const input = (v: StateView, i: Partial<HintInput> = {}): HintInput => ({
  view: v,
  talkTo: 'smith',
  engaged: false,
  canClick: false,
  baseline: new Set(),
  dismissed: new Set(),
  ...i,
});

// The ledger after an order was taken, worked on and delivered: the item in hand, and the delivery event.
function deliveredWorld() {
  const said = ev('SAID', { target: 'smith', data: { text: 'a dagger' } });
  const accepted = ev('CONTRACT_ACCEPTED', { target: 'smith', data: { contract_id: 'c_001', price: 60 } });
  const started = ev('WORK_STARTED', { actor: 'smith', target: 'player', data: { contract_id: 'c_001', due_tick: 11 } });
  const clock = ev('CLOCK_ADVANCED', { actor: 'world', data: { from: 8 } });
  const delivered = ev('ITEM_DELIVERED', {
    actor: 'world',
    target: 'player',
    tick: 11,
    data: { contract_id: 'c_001', item: { item_id: 'i_001', item_name: 'Hammerhead Dagger' } },
  });
  const v = view({
    tick: 11,
    contracts: [dagger('delivered')],
    items: [{ item_id: 'i_001', contract_id: 'c_001', owner: 'player', item_name: 'Hammerhead Dagger' } as StateView['items'][number]],
    events: [said, accepted, started, clock, delivered],
  });
  return { v, delivered };
}

// Edda saw the delivery; she told Mira, who now knows it from her.
function toldWorld(delivered: EngineEvent, base: StateView) {
  const told = ev('TOLD', {
    actor: 'farmer',
    target: 'cottager',
    tick: 12,
    data: { event_id: delivered.id, summary: 'the smith made a dagger', confidence: 0.7 },
  });
  const news: NewsView = {
    event_id: delivered.id,
    tick: 11,
    place: 'forge',
    text: 'Brann handed the stranger the finished Hammerhead Dagger',
    knowers: [
      { id: 'farmer', name: 'Edda', how: 'witnessed', told_by: null, confidence: 1, claim: null },
      { id: 'cottager', name: 'Mira', how: 'told_by', told_by: 'Edda', confidence: 0.7, claim: 'the smith made a dagger' },
    ],
  };
  return { v: { ...base, news: [news], events: [...base.events, told] }, told };
}

describe('village hints', () => {
  it('starts with how to talk, and the click instruction only once villagers can be clicked', () => {
    expect(selectHint(input(view()))?.key).toBe('talk');
    expect(selectHint(input(view()))?.text).not.toMatch(/click/i);
    expect(selectHint(input(view(), { canClick: true }))?.text).toMatch(/^Click a villager/);
  });

  it("asks for Brann's first request with examples to fill in, and never nudges toward him from someone else's chat", () => {
    const h = selectHint(input(view(), { engaged: true }));
    expect(h).toMatchObject({ key: 'ask', examples: SMITH_EXAMPLES });
    expect(selectHint(input(view(), { engaged: true, talkTo: 'farmer' }))).toBeNull();
  });

  it('a rejected proposal is not an offer: only a contract the ledger holds is', () => {
    const rejected = ev('ACTION_REJECTED', { actor: 'smith', data: { verb: 'OFFER', reason: 'price below the floor', proposed: {} } });
    const said = ev('SAID', { target: 'smith', data: { text: 'a dagger' } });
    expect(selectHint(input(view({ events: [said, rejected] }), { engaged: true }))).toBeNull();
    const open = view({ events: [said], contracts: [dagger('proposed')] });
    expect(selectHint(input(open, { engaged: true }))?.key).toBe('offer');
    // Only in the seller's own chat.
    expect(selectHint(input(open, { engaged: true, talkTo: 'farmer' }))).toBeNull();
  });

  it('work that started now gets a hint until time is moved on', () => {
    const started = ev('WORK_STARTED', { actor: 'smith', target: 'player', data: { contract_id: 'c_001', due_tick: 11 } });
    const working = view({ contracts: [dagger('in_progress')], events: [started] });
    expect(selectHint(input(working, { engaged: true }))?.text).toBe('Brann has started work. You choose when village time advances.');
    const later = { ...working, events: [started, ev('CLOCK_ADVANCED', { actor: 'world', data: { from: 8 } })] };
    expect(selectHint(input(later, { engaged: true }))).toBeNull();
  });

  it('a returning session: history already in the log is never announced', () => {
    const { v } = deliveredWorld();
    const { v: told } = toldWorld(v.events.at(-1)!, v);
    const history = new Set(told.events.map((e) => e.id));
    expect(selectHint(input(told, { baseline: history }))).toBeNull();
  });

  it('a delivery while the page is open names the actual item and links to it; a later view (new art) does not repeat it once dismissed', () => {
    const { v, delivered } = deliveredWorld();
    const before = new Set(v.events.slice(0, -1).map((e) => e.id));
    const h = selectHint(input(v, { baseline: before, engaged: true }));
    expect(h).toMatchObject({ key: delivered.id, text: 'Your Hammerhead Dagger is ready.', link: { to: { kind: 'item', id: 'i_001' } } });
    const drawn = { ...v, art: { c_001: { status: 'ready' as const, url: '/api/art/x.png' } } };
    expect(selectHint(input(drawn, { baseline: before, engaged: true, dismissed: new Set(h!.covers) }))).toBeNull();
  });

  it('dismissing one hint lets the next relevant one appear, without bringing the dismissed one back', () => {
    const { v, delivered } = deliveredWorld();
    const { v: told, told: telling } = toldWorld(delivered, v);
    const before = new Set(v.events.slice(0, -1).map((e) => e.id));
    const first = selectHint(input(told, { baseline: before, engaged: true }))!;
    expect(first.key).toBe(delivered.id);
    const next = selectHint(input(told, { baseline: before, engaged: true, dismissed: new Set(first.covers) }))!;
    expect(next).toMatchObject({ key: telling.id, text: 'Mira heard about this from Edda: Brann handed the stranger the finished Hammerhead Dagger.' });
    expect(next.link?.to).toEqual({ kind: 'news', event_id: delivered.id, knower: 'cottager' });
    expect(selectHint(input(told, { baseline: before, engaged: true, dismissed: new Set([...first.covers, ...next.covers]) }))).toBeNull();
  });

  it('a telling the news view does not back up (pruned, or a different source) gives no hint', () => {
    const { v, delivered } = deliveredWorld();
    const { v: told } = toldWorld(delivered, v);
    const before = new Set(v.events.map((e) => e.id));
    expect(selectHint(input({ ...told, news: [] }, { baseline: before, engaged: true }))).toBeNull();
    const otherSource = { ...told, news: [{ ...told.news[0], knowers: [{ ...told.news[0].knowers[1], told_by: 'Osric' }] }] };
    expect(selectHint(input(otherSource, { baseline: before, engaged: true }))).toBeNull();
  });

  it("a new game: nothing dismissed carries over, and its events are news though their ids repeat the old world's", () => {
    expect(dismissedIn({ world: 'w1', dismissed: ['talk', 'e_0005'] }, 'w1')).toEqual(new Set(['talk', 'e_0005']));
    expect(dismissedIn({ world: 'w1', dismissed: ['talk', 'e_0005'] }, 'w2')).toEqual(new Set());
    const old = view({ events: [ev('SAID', { target: 'smith', data: { text: 'hi' } })] });
    const first = nextBaseline(null, old);
    expect([...first.ids]).toEqual([old.events[0].id]);
    expect(nextBaseline(first, { ...old, tick: 9 })).toBe(first);
    const reset = view({ world_id: 'w2', events: [{ ...old.events[0] }] });
    expect(nextBaseline(first, reset).ids.size).toBe(0);
  });
});
