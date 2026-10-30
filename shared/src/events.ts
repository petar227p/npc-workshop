import type { ModelChoice, Trigger } from './npc-info';
import type { Contract, Gift, MadeToOrderTerms } from './trade';

// Typed events, shared by the engine (which produces them) and the browser (which renders them).

// A made-to-order item, handed over by the clock. In-stock goods are counts in an actor's stock instead.
export type Item = Pick<MadeToOrderTerms, 'item_name' | 'item_type' | 'description' | 'stats'> & {
  item_id: string;
  contract_id: string;
  owner: string;
  delivered_tick: number;
};

// News passed on: the event it is about (one the teller knew), the teller's words for it, and how sure the listener
// can be (the teller's own confidence, less a share for each retelling). Set by code, never by the model.
export type News = { event_id: string; summary: string; confidence: number };

// Something that happened that no verb covers (a boss slain at the gate, a fire at the farm), reported by the game,
// or typed in god mode. Who saw it: anyone near enough to (perception), only these, or the whole village.
export type Sighting = { kind: 'nearby' } | { kind: 'only'; ids: string[] } | { kind: 'everyone' };
export type WorldReport = {
  text: string;
  place: string;
  involved: string[]; // who took part; they know it too
  seen_by: Sighting;
  notable: boolean; // big news: it stays in mind however much happens after it
  hours_ago: number; // reported late: who saw it is worked out from where everyone was then
};

// What an actor holds now, as the game's own code says (see InventorySyncSchema): new totals, and why.
export type InventorySync = { actor: string; gold?: number; stock?: Record<string, number>; reason: string };
// One thing a sync changed, from what the ledger had to what the game says.
export type Change = { what: string; from: number; to: number }; // what: 'gold' or a good's name

type Base<T extends string, D> = {
  id: string;
  tick: number;
  type: T;
  actor: string;
  target: string | null;
  data: D;
  location: string;
  witnesses: string[];
};

export type EngineEvent =
  | Base<'SAID', { text: string }>
  | Base<'EMOTED', { text: string }>
  | Base<'CONTRACT_PROPOSED', { contract: Contract; customer: string; replaces: string | null }>
  | Base<'CONTRACT_REFUSED', { contract_id: string | null; reason: string }>
  | Base<'CONTRACT_ACCEPTED', { contract_id: string; price: number }>
  | Base<'WORK_STARTED', { contract_id: string; due_tick: number }>
  | Base<'ITEM_DELIVERED', { contract_id: string; item: Item }>
  | Base<'GOODS_DELIVERED', { contract_id: string; good: string; qty: number }>
  | Base<'GIVEN', { gift: Gift; item_name: string | null }> // target: who got it; item_name for an item, so the log can name it
  | Base<'GIFT_REFUSED', { gift: Gift; item_name: string | null; reason: string }> // actor: who wouldn't take it; target: the giver, who keeps it
  | Base<'TOLD', News> // target: who was told
  | Base<'RETOLD', News> // to everyone around: its witnesses heard it
  | Base<'ANNOUNCED', News> // cried at the actor's own place: its witnesses heard it
  | Base<'HAPPENED', { text: string; involved: string[]; seen_by: Sighting['kind']; notable: boolean; reported_tick: number }> // actor: 'world'; narrative only. tick: when it happened; reported_tick: when it was logged (later, if reported late)
  | Base<'SYNCED', { changes: Change[]; reason: string }> // actor: 'world'; target: whose inventory the game changed itself. Nobody sees it
  | Base<'TRIGGER_FIRED', { trigger: Trigger }> // an NPC acting on its own; its turn's events follow
  | Base<'ACTION_REJECTED', { verb: string | null; reason: string; proposed: unknown }>
  | Base<'CLOCK_ADVANCED', { from: number }>;

export type EventType = EngineEvent['type'];

// What the browser gets: the player's side of the world plus the log.
export type ContractStatus = 'proposed' | 'superseded' | 'refused' | 'accepted' | 'in_progress' | 'delivered';

export type ContractView = Contract & { status: ContractStatus; seller: string; replaces: string | null; due_tick: number | null };
export type MadeToOrderView = Extract<ContractView, { kind: 'made_to_order' }>;

// The Muse Image picture of a contract's item, from when work starts. Not part of the ledger.
export type ItemArt = { status: 'rendering' | 'ready' | 'unavailable'; url: string | null };

// An NPC in the village and the place it is at this tick, worked out by the server. The browser walks it there.
export type PersonView = { id: string; name: string; sprite: number; place: string; model: ModelChoice }; // model: who voices it, for the chat's badge

// Who knows about one event and how: saw it, or was told (by whom, in what words, how sure).
export type KnowerView = { id: string; name: string; how: 'witnessed' | 'told_by'; told_by: string | null; confidence: number; claim: string | null };
export type NewsView = { event_id: string; tick: number; place: string; text: string; knowers: KnowerView[] }; // text: what really happened

export type StateView = {
  tick: number;
  people: PersonView[];
  places: string[]; // the named places on the village map, as the server reads them (where god mode can say something happened)
  news: NewsView[]; // the latest events anyone knows about, newest first
  gold: number;
  goods: Record<string, number>; // the player's own stock (bought in-stock goods)
  shops: { id: string; name: string; stock: Record<string, number> }[]; // each seller's unreserved stock
  contracts: ContractView[];
  items: Item[];
  events: EngineEvent[];
  busy: boolean; // the smith is mid-turn
  art: Record<string, ItemArt>; // by contract id
};

export type ArtResponse = { art: StateView['art'] };

// God mode's reading of a note in plain words: a report to check and send, not yet in the log.
export type ReadNoteResponse = { report: WorldReport };

export type ActionResponse = {
  ok: boolean;
  reason: string | null;
  outcome: 'acted' | 'fallback' | 'unavailable' | null; // smith turns only
  events: EngineEvent[];
  view: StateView;
};

// The dev API (/api/v1): a game's own world, made from the NPCs it picks and driven with a bearer token, not a cookie.
// The game sends what the player did and renders the events it gets back; the ledger still decides everything.

// An NPC a world can be made with. `sells`: what is in its catalogue, made to order or from stock.
// `labels`: what it calls the things it deals in, by their names in the world (a game's own item ids).
export type ApiNpc = { id: string; name: string; model: ModelChoice; place: string; verbs: string[]; sells: string[]; labels: Record<string, string>; answers: boolean };

// The world as the game sees it: the player's side, who is where, and the news, without the log (that is /events).
// `last_event_id` is where to read the log on from; `calls_left` is how many model calls this world may still make.
export type ApiState = Omit<StateView, 'events' | 'busy'> & {
  world_id: string;
  last_event_id: string | null;
  busy: string | null; // who is answering, while a model call runs
  calls_left: number;
};

// A line an NPC said in reply, so a game can show it without reading the events.
export type ApiLine = { by: string; name: string; text: string; to: string | null };

export type ApiResult = {
  ok: boolean;
  reason: string | null; // why the ledger refused the player's own action
  outcome: 'acted' | 'fallback' | 'unavailable' | null; // the NPC's turn, if one ran
  events: EngineEvent[]; // what this call added to the log, in order
  said: ApiLine[];
  state: ApiState;
};

export type ApiWorldCreated = { world_id: string; token: string; npcs: string[]; state: ApiState };
export type ApiEvents = { events: EngineEvent[]; last_event_id: string | null; more: boolean };
