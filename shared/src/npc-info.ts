import type { EngineEvent, StateView } from './events';
import type { Catalogue, Start } from './trade';

// What the NPC editor can build from, as plain constants (no zod), so the browser can import them.
// Rules behind each verb and fact block live in server code; the editor only picks from these lists.

export const LEDGER_VERBS = ['SAY', 'EMOTE', 'OFFER', 'COUNTER_OFFER', 'REFUSE', 'ACCEPT', 'START_WORK', 'GIVE'] as const;
export type LedgerVerb = (typeof LEDGER_VERBS)[number];

// The verbs a model can answer with (each has a flat-schema mapping on the server). ACCEPT and START_WORK are code-only.
export const MODEL_VERBS = ['SAY', 'EMOTE', 'OFFER', 'COUNTER_OFFER', 'REFUSE', 'GIVE'] as const satisfies readonly LedgerVerb[];
export type ModelVerb = (typeof MODEL_VERBS)[number];

export const VERB_INFO: Record<LedgerVerb, string> = {
  SAY: 'Talk. Every NPC needs it: replies and fallback lines go through it.',
  EMOTE: 'A gesture or expression (shrugs, wipes the anvil). Flavour only: it changes nothing in the world.',
  OFFER: 'Offer something from its catalogue. The ledger checks it is listed, stats, stock, the price floor and making time. Needs a catalogue.',
  COUNTER_OFFER: 'Replace one of its own open offers with new terms. Same checks as an offer.',
  REFUSE: 'Turn a request down, or withdraw one of its open offers.',
  ACCEPT: 'Take an offer made to it: pays, and gets in-stock goods at once. Customers use this, not sellers.',
  START_WORK: 'Start the timer on an accepted made-to-order job. Needed when the catalogue has made-to-order items.',
  GIVE: 'Hand over gold, goods or an item it owns, for nothing: a quest reward, a gift. The ledger checks it has them. Not for sellers: an NPC with a catalogue can\'t have it, or it could be talked into giving its stock away.',
};

export const FACT_BLOCKS = ['clock', 'purse', 'stock', 'inventory', 'catalogue', 'price_floor', 'open_offers'] as const;
export type FactBlock = (typeof FACT_BLOCKS)[number];

export const FACT_INFO: Record<FactBlock, { label: string; description: string }> = {
  clock: { label: 'Clock and workload', description: 'The hour and how many made-to-order jobs it has in hand.' },
  purse: { label: "Customer's purse", description: 'How much gold the customer has.' },
  stock: { label: 'Stock and costs', description: 'Its unreserved stock, and what each material costs.' },
  inventory: { label: 'What it has', description: 'Its own gold, everything in its stock and the items it owns, with ids. What GIVE needs.' },
  catalogue: { label: 'What it sells', description: 'Item types with stat ranges and minimum making time; goods with their minimum price.' },
  price_floor: { label: 'Price floor', description: 'How the ledger sets the lowest price it accepts.' },
  open_offers: { label: 'Open offers', description: 'Its offers to this customer that are still open.' },
};

// Which model voices an NPC. The server maps each to a provider and model id from its env.
export const MODEL_CHOICES = ['muse_spark', 'muse_spark_open'] as const;
export type ModelChoice = (typeof MODEL_CHOICES)[number];

export const MODEL_INFO: Record<ModelChoice, { label: string; description: string }> = {
  muse_spark: { label: 'Muse Spark', description: 'Meta Model API. Its JSON schema is enforced while it writes; slower on the contributor tier.' },
  muse_spark_open: { label: 'Muse Spark Open', description: 'Open weights on Baseten. About 2 s a turn; Mira the merchant runs on it. Its schema isn\'t enforced, so the ledger and one retry catch a bad answer.' },
};

// How hard the model thinks before it answers (reasoning_effort). Both providers take all three.
export const EFFORT_CHOICES = ['low', 'medium', 'high'] as const;
export type EffortChoice = (typeof EFFORT_CHOICES)[number];

// Times are Muse Spark p50 from the Oct 27 latency test (docs/api-notes.md); high wasn't timed.
export const EFFORT_INFO: Record<EffortChoice, { label: string; description: string }> = {
  low: { label: 'Low', description: 'Quick replies, about 4 s on Muse Spark. The default.' },
  medium: { label: 'Medium', description: 'Thinks longer first, about 6 s on Muse Spark, and costs more reasoning tokens.' },
  high: { label: 'High', description: 'The slowest and most reasoning tokens. For hard bargains, not small talk.' },
};

// When an NPC takes a turn. Being spoken to uses its cue; a timer has a cue of its own (what to do when it comes round).
export const TRIGGER_KINDS = ['on_spoken_to', 'every_hours'] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];
export type Trigger = { kind: 'on_spoken_to' } | { kind: 'every_hours'; hours: number; cue: string };
export const MAX_TRIGGER_HOURS = 48;

export const TRIGGER_INFO: Record<TriggerKind, { label: string; description: string }> = {
  on_spoken_to: { label: 'When spoken to', description: 'Replies each time someone talks to it, with the cue below. Without it, it hears but never answers.' },
  every_hours: { label: 'On a timer', description: 'Acts on its own when the clock passes every N hours (a call to customers, a gift). A capped number of NPCs act per tick.' },
};

// From `from` o'clock it is at `place`, until the next entry's hour (the last entry runs on past midnight to the first).
export type ScheduleEntry = { from: number; place: string };

// The character frames in Tiny Dungeon (rows 7–9 of the sheet). The player is 85.
export const PLAYER_SPRITE = 85;
export const NPC_SPRITES = [84, 86, 87, 88, 96, 97, 98, 99, 100, 108, 109, 110, 111, 112] as const;
export const DEFAULT_SPRITE = 98;

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
  model: ModelChoice;
  effort: EffortChoice;
  location: string; // its own place (forge, market…): where it is when its schedule says nothing
  schedule: ScheduleEntry[]; // where it goes during the day; its events happen wherever it is
  sprite: number; // its look: a character frame in Kenney's Tiny Dungeon sheet
  start: Start; // its purse and stock in a new world
  catalogue: Catalogue; // what it sells; empty for an NPC that only talks
  triggers: Trigger[];
  cue: string;
  fallbacks: { rejected: string; unavailable: string };
};

export type EditorLibrary = { npcs: NpcDraft[]; can_save: boolean; places: string[] }; // places: the named places on the village map

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
