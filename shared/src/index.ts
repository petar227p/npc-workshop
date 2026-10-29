import { z } from 'zod';
import { MAX_EMOTE_LENGTH, MAX_NEWS_LENGTH, MAX_SAY_LENGTH } from './limits';
import { GiftSchema, TermsSchema } from './trade';

// Shapes from the handoff. The model proposes these; the server validates them before anything changes.

export const VERBS = [
  'SAY',
  'EMOTE',
  'OFFER',
  'COUNTER_OFFER',
  'ACCEPT',
  'REFUSE',
  'START_WORK',
  'DELIVER',
  'GIVE',
  'TELL',
  'RETELL',
  'ANNOUNCE',
] as const;
export const VerbSchema = z.enum(VERBS);
export type Verb = z.infer<typeof VerbSchema>;

// One schema per verb, so an NPC definition can list exactly the verbs it may use.
const news = z.string().min(1).max(MAX_NEWS_LENGTH);

export const ACTION_SCHEMAS = {
  SAY: z.object({ action: z.literal('SAY'), text: z.string().min(1).max(MAX_SAY_LENGTH) }),
  EMOTE: z.object({ action: z.literal('EMOTE'), text: z.string().min(1).max(MAX_EMOTE_LENGTH) }),
  OFFER: z.object({ action: z.literal('OFFER'), terms: TermsSchema }),
  COUNTER_OFFER: z.object({ action: z.literal('COUNTER_OFFER'), replaces: z.string(), terms: TermsSchema }),
  REFUSE: z.object({ action: z.literal('REFUSE'), contract_id: z.string().nullable(), reason: z.string().min(1).max(400) }),
  ACCEPT: z.object({ action: z.literal('ACCEPT'), contract_id: z.string() }),
  START_WORK: z.object({ action: z.literal('START_WORK'), contract_id: z.string() }),
  DELIVER: z.object({ action: z.literal('DELIVER'), contract_id: z.string() }),
  GIVE: z.object({ action: z.literal('GIVE'), to: z.string().nullable(), gift: GiftSchema }), // to: null = whoever it's talking to
  // News: the event it cites must be one it knows; `summary` is its own wording, which may drift from what happened.
  TELL: z.object({ action: z.literal('TELL'), to: z.string().nullable(), event_id: z.string(), summary: news }), // to: null = whoever it's talking to
  RETELL: z.object({ action: z.literal('RETELL'), event_id: z.string(), summary: news }),
  ANNOUNCE: z.object({ action: z.literal('ANNOUNCE'), event_id: z.string(), summary: news }),
};

export const ActionSchema = z.discriminatedUnion('action', [
  ACTION_SCHEMAS.SAY,
  ACTION_SCHEMAS.EMOTE,
  ACTION_SCHEMAS.OFFER,
  ACTION_SCHEMAS.COUNTER_OFFER,
  ACTION_SCHEMAS.REFUSE,
  ACTION_SCHEMAS.ACCEPT,
  ACTION_SCHEMAS.START_WORK,
  ACTION_SCHEMAS.DELIVER,
  ACTION_SCHEMAS.GIVE,
  ACTION_SCHEMAS.TELL,
  ACTION_SCHEMAS.RETELL,
  ACTION_SCHEMAS.ANNOUNCE,
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


export * from './clock';
export * from './events';
export * from './limits';
export * from './npc';
export * from './npc-info';
export * from './trade';
export * from './village';
