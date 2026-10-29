import { z } from 'zod';
import { MAX_SAY_LENGTH } from './limits';
import { CatalogueSchema, StartSchema } from './trade';
import {
  DEFAULT_SPRITE,
  EFFORT_CHOICES,
  FACT_BLOCKS,
  LEDGER_VERBS,
  MAX_PERSONA_LENGTH,
  MAX_TRIGGER_HOURS,
  MODEL_CHOICES,
  MODEL_VERBS,
  NPC_ID_PATTERN,
  NPC_SPRITES,
  RESERVED_IDS,
  type NpcDraft,
} from './npc-info';

// The shape check for an NPC file or an editor draft. Cross-field rules (SAY required, model verbs ⊆ verbs)
// are checked again by defineNpc on the server, which is the one that counts.

const unique = <T>(list: T[]) => new Set(list).size === list.length;
const line = z.string().trim().min(1).max(MAX_SAY_LENGTH);
const cue = z.string().trim().min(1).max(300);

const placeName = z.string().regex(new RegExp(NPC_ID_PATTERN), 'a place name: lowercase letters, digits and _');

// Hours must differ, so it's never unclear where an NPC is. Sorted by the loader, so the order in the file doesn't matter.
const ScheduleSchema = z
  .array(z.object({ from: z.number().int().min(0).max(23), place: placeName }).strict())
  .max(24)
  .refine((s) => unique(s.map((e) => e.from)), 'two entries start at the same hour');

const TriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('on_spoken_to') }).strict(),
  z.object({ kind: z.literal('every_hours'), hours: z.number().int().min(1).max(MAX_TRIGGER_HOURS), cue }).strict(),
  z.object({ kind: z.literal('on_meet'), cue }).strict(),
  z.object({ kind: z.literal('on_new_memory'), cue }).strict(),
]);

export const NpcFileSchema = z
  .object({
    id: z
      .string()
      .regex(new RegExp(NPC_ID_PATTERN), 'lowercase letters, digits and _, starting with a letter')
      .refine((id) => !(RESERVED_IDS as readonly string[]).includes(id), 'that id is taken by the player'),
    name: z.string().trim().min(1).max(40),
    verbs: z.array(z.enum(LEDGER_VERBS)).min(1).refine(unique, 'listed twice'),
    model_verbs: z.array(z.enum(MODEL_VERBS)).min(1).refine(unique, 'listed twice'),
    facts: z.array(z.enum(FACT_BLOCKS)).refine(unique, 'listed twice'),
    perception_radius: z.number().int().min(0).max(20),
    model: z.enum(MODEL_CHOICES).default('muse_spark'), // files from before the picker are sellers on Muse Spark
    effort: z.enum(EFFORT_CHOICES).default('low'), // files from before the picker thought at low, the old fixed value
    location: placeName,
    schedule: ScheduleSchema.default([]), // files from before schedules stayed at their place all day
    sprite: z.number().int().refine((n) => (NPC_SPRITES as readonly number[]).includes(n), 'not one of the character sprites').default(DEFAULT_SPRITE),
    start: StartSchema,
    catalogue: CatalogueSchema,
    // Files from before triggers only ever answered when spoken to.
    triggers: z
      .array(TriggerSchema)
      .refine((ts) => unique(ts.map((t) => t.kind)), 'each kind of trigger once')
      .default([{ kind: 'on_spoken_to' }]),
    cue,
    fallbacks: z.object({ rejected: line, unavailable: line }).strict(),
  })
  .strict();
export type NpcFile = z.infer<typeof NpcFileSchema>;

export const NpcDraftSchema = NpcFileSchema.extend({ persona: z.string().trim().min(1).max(MAX_PERSONA_LENGTH) }).strict();

// Compile-time check that the zod shape and the plain type agree.
const _same: z.infer<typeof NpcDraftSchema> extends NpcDraft ? (NpcDraft extends z.infer<typeof NpcDraftSchema> ? true : never) : never = true;
void _same;
