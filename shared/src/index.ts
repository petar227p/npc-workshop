import { z } from 'zod';
import { MAX_SAY_LENGTH } from './limits';

// Shapes from the handoff. The model proposes these; the server validates them before anything changes.

export const VERBS = [
  'SAY',
  'PROPOSE_CONTRACT',
  'COUNTER_OFFER',
  'ACCEPT',
  'REFUSE',
  'START_WORK',
  'DELIVER',
  'TELL',
  'REACT',
  'ANNOUNCE',
] as const;
export const VerbSchema = z.enum(VERBS);
export type Verb = z.infer<typeof VerbSchema>;

export const StatsSchema = z.object({
  damage: z.number().int(),
  weight: z.number().int(),
  durability: z.number().int(),
});

export const ContractSchema = z.object({
  contract_id: z.string(),
  item_name: z.string().min(1).max(60),
  item_type: z.string(),
  description: z.string().max(400),
  stats: StatsSchema,
  materials_used: z.record(z.string(), z.number().int().positive()),
  price: z.number().int().nonnegative(),
  delivery_ticks: z.number().int().positive(),
  smith_remarks: z.string().max(400),
});
export type Contract = z.infer<typeof ContractSchema>;

// What an agent (or the player's button) may propose. Contract ids are assigned by code, never by the model.
// Unknown extra fields are stripped, so they can't smuggle anything in. TELL / REACT / ANNOUNCE arrive with the villagers.
const ContractTermsSchema = ContractSchema.omit({ contract_id: true });

// One schema per verb, so an NPC definition can list exactly the verbs it may use.
export const ACTION_SCHEMAS = {
  SAY: z.object({ action: z.literal('SAY'), text: z.string().min(1).max(MAX_SAY_LENGTH) }),
  PROPOSE_CONTRACT: ContractTermsSchema.extend({ action: z.literal('PROPOSE_CONTRACT') }),
  COUNTER_OFFER: ContractTermsSchema.extend({ action: z.literal('COUNTER_OFFER'), replaces: z.string() }),
  REFUSE: z.object({ action: z.literal('REFUSE'), contract_id: z.string().nullable(), reason: z.string().min(1).max(400) }),
  ACCEPT: z.object({ action: z.literal('ACCEPT'), contract_id: z.string() }),
  START_WORK: z.object({ action: z.literal('START_WORK'), contract_id: z.string() }),
  DELIVER: z.object({ action: z.literal('DELIVER'), contract_id: z.string() }),
};

export const ActionSchema = z.discriminatedUnion('action', [
  ACTION_SCHEMAS.SAY,
  ACTION_SCHEMAS.PROPOSE_CONTRACT,
  ACTION_SCHEMAS.COUNTER_OFFER,
  ACTION_SCHEMAS.REFUSE,
  ACTION_SCHEMAS.ACCEPT,
  ACTION_SCHEMAS.START_WORK,
  ACTION_SCHEMAS.DELIVER,
]);
export type Action = z.infer<typeof ActionSchema>;
export type ActionOf<V extends Action['action']> = Extract<Action, { action: V }>;

export const EventSchema = z.object({
  id: z.string(),
  tick: z.number().int().nonnegative(),
  type: z.string(),
  actor: z.string(),
  target: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  location: z.string(),
  witnesses: z.array(z.string()),
});
export type GameEvent = z.infer<typeof EventSchema>;

export const MemorySchema = z.object({
  npc: z.string(),
  event_id: z.string(),
  how_learned: z.enum(['witnessed', 'told_by']),
  told_by: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});
export type Memory = z.infer<typeof MemorySchema>;

export * from './events';
export * from './limits';
export * from './npc';
export * from './npc-info';
