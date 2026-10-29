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

export type ActionResponse = {
  ok: boolean;
  reason: string | null;
  outcome: 'acted' | 'fallback' | 'unavailable' | null; // smith turns only
  events: EngineEvent[];
  view: StateView;
};
