import type { NpcDraft, PreviewResponse } from '@blacksmith/shared';
import { NpcBundleSchema, parseNpcBundle } from '@blacksmith/shared/src/integration';
import { MAX_NPC_BUNDLE_BYTES } from '@blacksmith/shared/src/limits';

type Failure = { ok: false; errors: string[] };
type NpcFile = Pick<File, 'size' | 'text'>;
const sizeError = 'NPC files can be up to 2 MiB. Reduce reference pictures or catalogue size, then download again.';

// Called lazily from the Workshop so bundle/schema validation needn't load until a transfer is requested.
export function createNpcDownload(npc: NpcDraft): { ok: true; text: string; filename: string; npc: NpcDraft } | Failure {
  const parsed = NpcBundleSchema.safeParse({ format: 'npc-workshop', version: 1, npc });
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'bundle'}: ${i.message}`) };
  // Check the bytes actually downloaded too: formatting adds bytes to the normalized object.
  const text = `${JSON.stringify(parsed.data, null, 2)}\n`;
  if (new TextEncoder().encode(text).byteLength > MAX_NPC_BUNDLE_BYTES) return { ok: false, errors: [sizeError] };
  return { ok: true, text, filename: `${parsed.data.npc.id}.npc.json`, npc: parsed.data.npc };
}

// Preparing an import never resets a session or replaces a draft. Only a fully validated configuration is
// handed back to the editor's existing confirm → reset → replace path. Art stays in the returned draft;
// preview may omit its references because the complete bundle has already passed local validation.
export async function prepareNpcImport(file: NpcFile, preview: (npc: NpcDraft) => Promise<PreviewResponse>): Promise<{ ok: true; draft: NpcDraft } | Failure> {
  if (file.size > MAX_NPC_BUNDLE_BYTES) return { ok: false, errors: [sizeError] };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, errors: ['The file could not be read. Choose the NPC JSON file again.'] };
  }
  const parsed = parseNpcBundle(text);
  if (!parsed.ok) return parsed;
  try {
    const checked = await preview(parsed.bundle.npc);
    if (!checked.ok) return { ok: false, errors: checked.errors };
  } catch (e) {
    return { ok: false, errors: [`The server could not validate this NPC. Your draft and test session are unchanged. ${e instanceof Error ? e.message : 'Try again when the server is available.'}`] };
  }
  return { ok: true, draft: parsed.bundle.npc };
}
