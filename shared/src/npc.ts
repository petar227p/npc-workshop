import { z } from 'zod';
import { MAX_SAY_LENGTH } from './limits';
import { CatalogueSchema, StartSchema } from './trade';
import { FACT_BLOCKS, LEDGER_VERBS, MAX_PERSONA_LENGTH, MODEL_CHOICES, MODEL_VERBS, NPC_ID_PATTERN, RESERVED_IDS, type NpcDraft } from './npc-info';

// The shape check for an NPC file or an editor draft. Cross-field rules (SAY required, model verbs ⊆ verbs)
// are checked again by defineNpc on the server, which is the one that counts.

const unique = <T>(list: T[]) => new Set(list).size === list.length;
const line = z.string().trim().min(1).max(MAX_SAY_LENGTH);

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
    location: z.string().regex(new RegExp(NPC_ID_PATTERN), 'a place name: lowercase letters, digits and _'),
    start: StartSchema,
    catalogue: CatalogueSchema,
    cue: z.string().trim().min(1).max(300),
    fallbacks: z.object({ rejected: line, unavailable: line }).strict(),
  })
  .strict();
export type NpcFile = z.infer<typeof NpcFileSchema>;

export const NpcDraftSchema = NpcFileSchema.extend({ persona: z.string().trim().min(1).max(MAX_PERSONA_LENGTH) }).strict();

// Compile-time check that the zod shape and the plain type agree.
const _same: z.infer<typeof NpcDraftSchema> extends NpcDraft ? (NpcDraft extends z.infer<typeof NpcDraftSchema> ? true : never) : never = true;
void _same;
