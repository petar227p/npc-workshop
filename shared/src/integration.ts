import { z } from 'zod';
import { MAX_NPC_BUNDLE_BYTES, MAX_WORLD_CREATE_BYTES, MAX_WORLD_DEFINITIONS } from './limits';
import { NpcDraftSchema } from './npc';
import { StartSchema } from './trade';

export const NPC_BUNDLE_FORMAT = 'npc-workshop';
export const NPC_BUNDLE_VERSION = 1;

const encoder = new TextEncoder();
const fits = (text: string, max: number) => text.length <= max && encoder.encode(text).byteLength <= max;
const jsonFits = (value: unknown, max: number) => fits(JSON.stringify(value), max);

// Shape validation only. Before using a draft, the server must also buildNpc() it: that owns the
// cross-field rules, generated model schema and current map check used by the Workshop bench.
const PortableDraftSchema = NpcDraftSchema.refine((d) => jsonFits(d, MAX_NPC_BUNDLE_BYTES), {
  message: `NPC configuration must be at most ${MAX_NPC_BUNDLE_BYTES} UTF-8 bytes; reduce reference pictures or catalogue size`,
});

// Only configuration travels: no world, token, history or live inventory. Draft artwork already holds
// embedded data URLs; repository filenames and remote picture URLs fail NpcDraftSchema's art check.
export const NpcBundleSchema = z
  .object({
    format: z.literal(NPC_BUNDLE_FORMAT, { errorMap: () => ({ message: 'Expected an npc-workshop bundle' }) }),
    version: z.literal(NPC_BUNDLE_VERSION, { errorMap: () => ({ message: 'Unsupported NPC bundle version; this app supports version 1' }) }),
    npc: PortableDraftSchema,
  })
  .strict()
  .refine((b) => jsonFits(b, MAX_NPC_BUNDLE_BYTES), { message: `NPC bundle must be at most ${MAX_NPC_BUNDLE_BYTES} UTF-8 bytes` });

export type NpcBundle = z.infer<typeof NpcBundleSchema>;
export type BundleRead = { ok: true; bundle: NpcBundle } | { ok: false; errors: string[] };

// Check raw file bytes as well as normalized configuration size, before JSON parsing. A caller can
// inspect File.size before reading; this check also protects callers that only have the text.
export function parseNpcBundle(text: string): BundleRead {
  if (!fits(text, MAX_NPC_BUNDLE_BYTES)) {
    return { ok: false, errors: [`NPC bundle must be at most ${MAX_NPC_BUNDLE_BYTES} UTF-8 bytes; reduce reference pictures or catalogue size`] };
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Invalid JSON; choose a downloaded NPC bundle (.json)'] };
  }
  const parsed = NpcBundleSchema.safeParse(input);
  return parsed.success
    ? { ok: true, bundle: parsed.data }
    : { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'bundle'}: ${i.message}`) };
}

// Contract for Task 3's additive POST /api/v1/worlds path. The registry count remains a parameter
// so legacy requests keep their current bound. Neither field means all registered NPCs, as before.
// Membership (including start actor ids) and buildNpc() checks belong to the route, before store.create().
export function worldCreationSchema(registryCount: number) {
  return z
    .object({
      npcs: z.array(z.string()).min(1).max(registryCount).refine((ids) => new Set(ids).size === ids.length, 'each NPC once').optional(),
      definitions: z.array(PortableDraftSchema).min(1).max(MAX_WORLD_DEFINITIONS).optional(),
      start: z.record(z.string(), StartSchema).optional(),
    })
    .strict()
    .superRefine((body, ctx) => {
      if (body.npcs !== undefined && body.definitions !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['definitions'], message: 'Choose registry NPC ids (npcs) or draft definitions, not both' });
      }
      const seen = new Set<string>();
      body.definitions?.forEach((d, i) => {
        if (seen.has(d.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['definitions', i, 'id'], message: `Duplicate NPC id '${d.id}'; each NPC once` });
        seen.add(d.id);
      });
      if (!jsonFits(body, MAX_WORLD_CREATE_BYTES)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `World creation must be at most ${MAX_WORLD_CREATE_BYTES} UTF-8 bytes; reduce reference pictures or cast size` });
      }
    });
}

export type ApiWorldCreate = z.infer<ReturnType<typeof worldCreationSchema>>;
