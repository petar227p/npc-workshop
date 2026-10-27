import { z } from 'zod';
import { MAX_SAY_LENGTH } from './limits';
import { TermsSchema } from './trade';

// Shapes from the handoff. The model proposes these; the server validates them before anything changes.

export const VERBS = [
  'SAY',
  'OFFER',
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

// One schema per verb, so an NPC definition can list exactly the verbs it may use. TELL / REACT / ANNOUNCE arrive with the villagers.
export const ACTION_SCHEMAS = {
  SAY: z.object({ action: z.literal('SAY'), text: z.string().min(1).max(MAX_SAY_LENGTH) }),
  OFFER: z.object({ action: z.literal('OFFER'), terms: TermsSchema }),
  COUNTER_OFFER: z.object({ action: z.literal('COUNTER_OFFER'), replaces: z.string(), terms: TermsSchema }),
  REFUSE: z.object({ action: z.literal('REFUSE'), contract_id: z.string().nullable(), reason: z.string().min(1).max(400) }),
  ACCEPT: z.object({ action: z.literal('ACCEPT'), contract_id: z.string() }),
  START_WORK: z.object({ action: z.literal('START_WORK'), contract_id: z.string() }),
  DELIVER: z.object({ action: z.literal('DELIVER'), contract_id: z.string() }),
};

export const ActionSchema = z.discriminatedUnion('action', [
  ACTION_SCHEMAS.SAY,
  ACTION_SCHEMAS.OFFER,
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
export * from './trade';
