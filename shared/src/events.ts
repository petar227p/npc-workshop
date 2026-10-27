import type { Contract } from './index';

// Typed events, shared by the engine (which produces them) and the browser (which renders them).

export type Item = Pick<Contract, 'contract_id' | 'item_name' | 'item_type' | 'description' | 'stats'> & {
  item_id: string;
  owner: string;
  delivered_tick: number;
};

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
  | Base<'CONTRACT_PROPOSED', { contract: Contract; customer: string; replaces: string | null }>
  | Base<'CONTRACT_REFUSED', { contract_id: string | null; reason: string }>
  | Base<'CONTRACT_ACCEPTED', { contract_id: string; price: number }>
  | Base<'WORK_STARTED', { contract_id: string; due_tick: number }>
  | Base<'ITEM_DELIVERED', { contract_id: string; item: Item }>
  | Base<'ACTION_REJECTED', { verb: string | null; reason: string; proposed: unknown }>
  | Base<'CLOCK_ADVANCED', { from: number }>;

export type EventType = EngineEvent['type'];

// What the browser gets: the player's side of the world plus the log.
export type ContractStatus = 'proposed' | 'superseded' | 'refused' | 'accepted' | 'in_progress' | 'delivered';

export type ContractView = Contract & { status: ContractStatus; replaces: string | null; due_tick: number | null };

// The Muse Image picture of a contract's item, from when work starts. Not part of the ledger.
export type ItemArt = { status: 'rendering' | 'ready' | 'unavailable'; url: string | null };

export type StateView = {
  tick: number;
  gold: number;
  materials: Record<string, number>; // unreserved stock at the forge
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
