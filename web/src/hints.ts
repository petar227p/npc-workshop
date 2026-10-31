import type { EngineEvent, StateView } from '@blacksmith/shared';

// The village's one contextual hint, picked from what the ledger actually shows. Pure, so the choice is testable: no
// hint is ever made up for show (no delivery, telling or offer that isn't in the view), and the page only decides
// how to display it.
//
// Two kinds:
// - lessons (talk, ask, offer, work): learned once per world. They stop when what they teach has been done, or when
//   dismissed.
// - news (delivered, heard): about events that happened while the page was open. `baseline` holds the event ids the
//   page already had when it first saw this world, so a returning session's history is never announced, and
//   dismissing one covers everything it was about, so the rest don't queue up behind it.

export type HintLink = { kind: 'item'; id: string } | { kind: 'goods' } | { kind: 'news'; event_id: string; knower: string };
export type Hint = {
  key: string;
  text: string;
  covers: string[]; // dismissed together with it
  examples?: string[]; // requests to put in the chat box for the player to read over, never sent for them
  link?: { label: string; to: HintLink };
};

export type HintInput = {
  view: StateView;
  talkTo: string; // whose chat is open
  engaged: boolean; // the player has opened a conversation this visit
  canClick: boolean; // villagers can be clicked to talk to them
  baseline: ReadonlySet<string>; // event ids that are history, not news
  dismissed: ReadonlySet<string>;
};

export const SMITH_EXAMPLES = ['Could you forge me a light dagger for the road?', "I'd like a sturdy hatchet for splitting firewood."];

// As Chat's nameOf, without bringing React into this module (and its tests).
const nameOf = (view: StateView, id: string) => view.people.find((p) => p.id === id)?.name ?? view.shops.find((s) => s.id === id)?.name ?? id;
const goodName = (good: string) => good.replace(/_/g, ' ');

// News events still in the view that the page didn't have when it first saw this world, oldest first.
const fresh = (input: HintInput, pick: (e: EngineEvent) => boolean) => input.view.events.filter((e) => pick(e) && !input.baseline.has(e.id));

function delivered(input: HintInput): Hint | null {
  const { view } = input;
  const all = fresh(input, (e) => (e.type === 'ITEM_DELIVERED' || e.type === 'GOODS_DELIVERED') && e.target === 'player');
  const open = all.filter((e) => !input.dismissed.has(e.id));
  const e = open.at(-1);
  if (!e) return null;
  const covers = all.map((x) => x.id);
  if (e.type === 'ITEM_DELIVERED') {
    // Only an item the player still holds gets a link: one given away since has nothing to show.
    const held = view.items.some((i) => i.item_id === e.data.item.item_id);
    return {
      key: e.id,
      covers,
      text: `Your ${e.data.item.item_name} is ready.`,
      link: held ? { label: 'Show it', to: { kind: 'item', id: e.data.item.item_id } } : undefined,
    };
  }
  if (e.type !== 'GOODS_DELIVERED') return null;
  return {
    key: e.id,
    covers,
    text: `${nameOf(view, e.actor)} handed you ${e.data.qty} × ${goodName(e.data.good)}.`,
    link: { label: 'Show it', to: { kind: 'goods' } },
  };
}

// Who learned of an event secondhand from this telling: told directly, or among those who heard it retold or cried, and
// only if the news view agrees they now know it from that teller. No news entry (pruned from the view), no hint.
function heardFrom(e: EngineEvent, view: StateView): { listeners: { id: string; name: string }[]; teller: string; text: string; event_id: string } | null {
  if (e.type !== 'TOLD' && e.type !== 'RETOLD' && e.type !== 'ANNOUNCED') return null;
  const news = view.news.find((n) => n.event_id === e.data.event_id);
  if (!news) return null;
  const teller = nameOf(view, e.actor);
  const reached = e.type === 'TOLD' ? [e.target ?? ''] : e.witnesses.filter((id) => id !== e.actor && id !== 'player');
  const listeners = reached.flatMap((id) =>
    news.knowers.filter((k) => k.id === id && k.how === 'told_by' && k.told_by === teller).map((k) => ({ id: k.id, name: k.name })),
  );
  return listeners.length ? { listeners, teller, text: news.text, event_id: news.event_id } : null;
}

function heard(input: HintInput): Hint | null {
  const all = fresh(input, (e) => heardFrom(e, input.view) !== null);
  const e = all.filter((x) => !input.dismissed.has(x.id)).at(-1);
  const h = e && heardFrom(e, input.view);
  if (!e || !h) return null;
  const who = h.listeners.length === 1 ? h.listeners[0].name : `${h.listeners[0].name} and ${h.listeners.length - 1} more`;
  return {
    key: e.id,
    covers: all.map((x) => x.id),
    text: `${who} heard about this from ${h.teller}: ${h.text}.`,
    link: { label: 'How word spread', to: { kind: 'news', event_id: h.event_id, knower: h.listeners[0].id } },
  };
}

function offer(input: HintInput): Hint | null {
  const { view, talkTo } = input;
  // Learned once an offer has been taken; until then, whenever an open one is in the chat on screen.
  if (input.dismissed.has('offer') || view.contracts.some((c) => c.status !== 'proposed' && c.status !== 'superseded' && c.status !== 'refused')) return null;
  if (!view.contracts.some((c) => c.status === 'proposed' && c.seller === talkTo)) return null;
  return { key: 'offer', covers: ['offer'], text: 'Negotiate further, or accept these terms.' };
}

function work(input: HintInput): Hint | null {
  const { view } = input;
  if (input.dismissed.has('work')) return null;
  const job = view.contracts.find((c) => c.kind === 'made_to_order' && c.status === 'in_progress');
  if (!job) return null;
  // Work that started while the page was open, and no time has passed since: once the player has moved time on, the
  // lesson is learned.
  const started = view.events.findIndex((e) => e.type === 'WORK_STARTED' && e.data.contract_id === job.contract_id && !input.baseline.has(e.id));
  if (started < 0 || view.events.slice(started + 1).some((e) => e.type === 'CLOCK_ADVANCED')) return null;
  return { key: 'work', covers: ['work'], text: `${nameOf(view, job.seller)} has started work. You choose when village time advances.` };
}

// Brann's first line in this world, while his chat is the one open. Nobody else is nudged toward him.
function ask(input: HintInput): Hint | null {
  const { view, talkTo } = input;
  if (!input.engaged || talkTo !== 'smith' || input.dismissed.has('ask')) return null;
  if (view.contracts.some((c) => c.seller === 'smith') || view.events.some((e) => e.type === 'SAID' && e.actor === 'player' && e.target === 'smith'))
    return null;
  return { key: 'ask', covers: ['ask'], text: 'Ask for something you’d like him to make.', examples: SMITH_EXAMPLES };
}

// Before the player has talked to anyone, in this world or this visit.
function talk(input: HintInput): Hint | null {
  const { view } = input;
  if (input.engaged || input.dismissed.has('talk')) return null;
  if (view.events.some((e) => e.actor === 'player') || view.contracts.length || view.items.length) return null;
  return {
    key: 'talk',
    covers: ['talk'],
    text: input.canClick
      ? 'Click a villager to talk. You can also walk with WASD and press E nearby.'
      : 'Walk with WASD or the arrow keys and press E next to a villager to talk, or choose someone in the chat.',
  };
}

// Highest first: what just happened to the player, then what's in front of them, then the lessons that set things up.
const ORDER = [delivered, offer, heard, work, ask, talk];

export function selectHint(input: HintInput): Hint | null {
  for (const pick of ORDER) {
    const h = pick(input);
    if (h) return h;
  }
  return null;
}

// What the page remembers per world. A new game has a new world_id, so it starts with nothing dismissed; the global
// on/off choice is kept apart from this and survives it.
export type WorldGuidance = { world: string; dismissed: string[] };
export const dismissedIn = (stored: WorldGuidance | null, world: string | undefined): Set<string> =>
  new Set(stored && world && stored.world === world ? stored.dismissed : []);

// The events that are history. The first view of a page load: everything already in it. Then the same set, until the
// world changes under the page (a new game): its events are all new, though their ids repeat the old world's.
export type Baseline = { world: string | undefined; ids: ReadonlySet<string> };
export function nextBaseline(prev: Baseline | null, view: StateView): Baseline {
  if (!prev) return { world: view.world_id, ids: new Set(view.events.map((e) => e.id)) };
  return prev.world === view.world_id ? prev : { world: view.world_id, ids: new Set() };
}
