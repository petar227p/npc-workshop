import type { EngineEvent, StateView } from './events';

// What the NPC editor can build from, as plain constants (no zod), so the browser can import them.
// Rules behind each verb and fact block live in server code; the editor only picks from these lists.

export const LEDGER_VERBS = ['SAY', 'PROPOSE_CONTRACT', 'COUNTER_OFFER', 'REFUSE', 'ACCEPT', 'START_WORK'] as const;
export type LedgerVerb = (typeof LEDGER_VERBS)[number];

// The verbs a model can answer with (each has a flat-schema mapping on the server). ACCEPT and START_WORK are code-only.
export const MODEL_VERBS = ['SAY', 'PROPOSE_CONTRACT', 'COUNTER_OFFER', 'REFUSE'] as const satisfies readonly LedgerVerb[];
export type ModelVerb = (typeof MODEL_VERBS)[number];

export const VERB_INFO: Record<LedgerVerb, string> = {
  SAY: 'Talk. Every NPC needs it: replies and fallback lines go through it.',
  PROPOSE_CONTRACT: 'Offer a forge contract. The ledger checks stat caps, stock, the price floor and forge time.',
  COUNTER_OFFER: 'Replace one of its own open offers with new terms. Same checks as an offer.',
  REFUSE: 'Turn a request down, or withdraw one of its open offers.',
  ACCEPT: 'Take an offer made to it: pays and reserves materials. Customers use this, not sellers.',
  START_WORK: 'Start the forge timer on an accepted contract.',
};

export const FACT_BLOCKS = ['clock', 'purse', 'stock', 'catalogue', 'price_floor', 'open_offers'] as const;
export type FactBlock = (typeof FACT_BLOCKS)[number];

export const FACT_INFO: Record<FactBlock, { label: string; description: string }> = {
  clock: { label: 'Clock and workload', description: 'The hour and how many jobs are on the bench.' },
  purse: { label: "Customer's purse", description: 'How much gold the customer has.' },
  stock: { label: 'Stock and costs', description: 'Unreserved materials and what each costs.' },
  catalogue: { label: 'What it can make', description: 'Stat ranges per item type and the minimum forge time right now.' },
  price_floor: { label: 'Price floor', description: 'The margin the ledger requires on material cost.' },
  open_offers: { label: 'Open offers', description: 'Its offers to this customer that are still open.' },
};

export const MAX_PERSONA_LENGTH = 6000;
export const NPC_ID_PATTERN = '^[a-z][a-z0-9_]{0,40}$';
export const RESERVED_IDS = ['player'] as const; // actor ids an NPC can't take

// An NPC as the editor and the files hold it. `persona` is stored beside it in prompts/<id>.md.
export type NpcDraft = {
  id: string;
  name: string;
  persona: string;
  verbs: LedgerVerb[];
  model_verbs: ModelVerb[];
  facts: FactBlock[];
  perception_radius: number;
  cue: string;
  fallbacks: { rejected: string; unavailable: string };
};

export type EditorLibrary = { npcs: NpcDraft[]; can_save: boolean };

export type PreviewResponse =
  | { ok: true; schema: Record<string, unknown>; facts: string; errors: [] }
  | { ok: false; errors: string[] };

// `exists`: the id is already a file; the editor asks before saving again with `overwrite`.
export type SaveResponse = { ok: boolean; errors: string[]; exists?: boolean };

export type BenchAttempt = { content: string; ok: boolean; reason: string | null; latency_ms: number };

export type BenchResponse = {
  ok: boolean;
  errors: string[]; // definition problems; nothing ran
  outcome: 'acted' | 'fallback' | 'unavailable' | null;
  attempts: BenchAttempt[];
  events: EngineEvent[]; // this turn's
  view: StateView; // the bench world, from the player's side
};
