import type { EngineEvent, StateView } from './events';
import type { Catalogue, Start } from './trade';

// What the NPC editor can build from, as plain constants (no zod), so the browser can import them.
// Rules behind each verb and fact block live in server code; the editor only picks from these lists.

export const LEDGER_VERBS = ['SAY', 'OFFER', 'COUNTER_OFFER', 'REFUSE', 'ACCEPT', 'START_WORK'] as const;
export type LedgerVerb = (typeof LEDGER_VERBS)[number];

// The verbs a model can answer with (each has a flat-schema mapping on the server). ACCEPT and START_WORK are code-only.
export const MODEL_VERBS = ['SAY', 'OFFER', 'COUNTER_OFFER', 'REFUSE'] as const satisfies readonly LedgerVerb[];
export type ModelVerb = (typeof MODEL_VERBS)[number];

export const VERB_INFO: Record<LedgerVerb, string> = {
  SAY: 'Talk. Every NPC needs it: replies and fallback lines go through it.',
  OFFER: 'Offer something from its catalogue. The ledger checks it is listed, stats, stock, the price floor and making time. Needs a catalogue.',
  COUNTER_OFFER: 'Replace one of its own open offers with new terms. Same checks as an offer.',
  REFUSE: 'Turn a request down, or withdraw one of its open offers.',
  ACCEPT: 'Take an offer made to it: pays, and gets in-stock goods at once. Customers use this, not sellers.',
  START_WORK: 'Start the timer on an accepted made-to-order job. Needed when the catalogue has made-to-order items.',
};

export const FACT_BLOCKS = ['clock', 'purse', 'stock', 'catalogue', 'price_floor', 'open_offers'] as const;
export type FactBlock = (typeof FACT_BLOCKS)[number];

export const FACT_INFO: Record<FactBlock, { label: string; description: string }> = {
  clock: { label: 'Clock and workload', description: 'The hour and how many made-to-order jobs it has in hand.' },
  purse: { label: "Customer's purse", description: 'How much gold the customer has.' },
  stock: { label: 'Stock and costs', description: 'Its unreserved stock, and what each material costs.' },
  catalogue: { label: 'What it sells', description: 'Item types with stat ranges and minimum making time; goods with their minimum price.' },
  price_floor: { label: 'Price floor', description: 'How the ledger sets the lowest price it accepts.' },
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
  location: string; // the place its events happen at (forge, market…)
  start: Start; // its purse and stock in a new world
  catalogue: Catalogue; // what it sells; empty for an NPC that only talks
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
