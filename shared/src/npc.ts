import { z } from 'zod';
import { MAX_LABEL_LENGTH, MAX_SAY_LENGTH, MAX_SIGNAL_TEXT, MAX_SIGNALS } from './limits';
import { CatalogueSchema, NameSchema, StartSchema } from './trade';
import {
  DEFAULT_SPRITE,
  EFFORT_CHOICES,
  FACT_BLOCKS,
  LEDGER_VERBS,
  MAX_ART_STYLE,
  MAX_REFERENCE_BYTES,
  MAX_REFERENCES,
  MAX_PERSONA_LENGTH,
  MAX_TRIGGER_HOURS,
  MODEL_CHOICES,
  MODEL_VERBS,
  NPC_ID_PATTERN,
  NO_ART,
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

// One line, so a style can't open a new section of the image prompt.
const style = z.string().max(MAX_ART_STYLE).transform((s) => s.replace(/\s+/g, ' ').trim());
const ArtFileSchema = z
  .object({
    style,
    references: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,40}-[1-3]\.(png|jpg|webp)$/, 'a picture name under npcs/art/')).max(MAX_REFERENCES),
  })
  .strict();
// base64 is 4 characters for every 3 bytes, so the decoded size is checked before anything decodes it.
const reference = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'a PNG, JPEG or WebP picture')
  .refine((u) => ((u.length - u.indexOf(',') - 1) * 3) / 4 <= MAX_REFERENCE_BYTES, `a reference picture is at most ${MAX_REFERENCE_BYTES / 1024} KB`);
const ArtDraftSchema = z.object({ style, references: z.array(reference).max(MAX_REFERENCES, `at most ${MAX_REFERENCES} reference pictures`) }).strict();

// What players and the model call a good, material or item type, by its name in the world (a game's own item id, say).
// One line, so a label can't open a new section of the prompt. The names may also be ones it doesn't stock yet: a
// game can sync them in later, and GIVE can name them.
const label = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(MAX_LABEL_LENGTH));
const LabelsSchema = z.record(NameSchema, label).refine((r) => Object.keys(r).length <= 200, 'at most 200 labels');

// What it may ask the game to do (SIGNAL), by name, with what each means as the model is told it. One line each, like a label.
const meaning = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(MAX_SIGNAL_TEXT));
const SignalsSchema = z.record(NameSchema, meaning).refine((r) => Object.keys(r).length <= MAX_SIGNALS, `at most ${MAX_SIGNALS} signals`);

export const NpcFileSchema = z
  .object({
    id: z
      .string()
      .regex(new RegExp(NPC_ID_PATTERN), 'lowercase letters, digits and _, starting with a letter')
      .refine((id) => !(RESERVED_IDS as readonly string[]).includes(id), `that id is taken: ${RESERVED_IDS.join(', ')} are the engine's own`),
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
    art: ArtFileSchema.default(() => ({ ...NO_ART, references: [] })), // files from before the art box drew in the plain pixel-art style
    start: StartSchema,
    catalogue: CatalogueSchema,
    labels: LabelsSchema.default({}), // files from before labels go by their names
    signals: SignalsSchema.default({}), // files from before signals ask the game for nothing
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

export const NpcDraftSchema = NpcFileSchema.extend({
  persona: z.string().trim().min(1).max(MAX_PERSONA_LENGTH),
  art: ArtDraftSchema.default(() => ({ ...NO_ART, references: [] })),
}).strict();

// Compile-time check that the zod shape and the plain type agree.
const _same: z.infer<typeof NpcDraftSchema> extends NpcDraft ? (NpcDraft extends z.infer<typeof NpcDraftSchema> ? true : never) : never = true;
void _same;
