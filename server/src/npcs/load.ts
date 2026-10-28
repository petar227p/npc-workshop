import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NpcDraftSchema, NpcFileSchema, type Catalogue, type ModelVerb, type NpcDraft } from '@blacksmith/shared';
import * as flat from '../agents/flat';
import { verbs } from '../engine';
import { factsFor } from './facts';
import { historyFor } from './history';
import { defineNpc, type NpcDefinition } from './types';

// NPCs as data: npcs/<id>.json holds the settings, prompts/<id>.md the persona. Both are checked here and
// built through defineNpc, so a file (or an editor draft) can only pick verbs and facts that exist in code.

export type NpcDirs = { npcs: URL; prompts: URL };
export const NPC_DIRS: NpcDirs = {
  npcs: new URL('../../../npcs/', import.meta.url),
  prompts: new URL('../../../prompts/', import.meta.url),
};

const LEDGER = { SAY: verbs.SAY, OFFER: verbs.OFFER, COUNTER_OFFER: verbs.COUNTER_OFFER, REFUSE: verbs.REFUSE, ACCEPT: verbs.ACCEPT, START_WORK: verbs.START_WORK };

// The offer verbs' schemas are built from the NPC's own catalogue.
function modelVerb(v: ModelVerb, catalogue: Catalogue): flat.FlatVerb {
  if (v === 'OFFER') return flat.OFFER(catalogue);
  if (v === 'COUNTER_OFFER') return flat.COUNTER_OFFER(catalogue);
  return flat[v];
}

export type Built = { ok: true; npc: NpcDefinition; draft: NpcDraft } | { ok: false; errors: string[] };

// Every problem as one readable line, for the editor.
export function buildNpc(input: unknown): Built {
  const parsed = NpcDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'npc'}: ${i.message}`) };
  const d = parsed.data;
  try {
    const npc = defineNpc({
      id: d.id,
      name: d.name,
      prompt: d.persona,
      verbs: d.verbs.map((v) => LEDGER[v]),
      location: d.location,
      catalogue: d.catalogue,
      start: d.start,
      modelVerbs: d.model_verbs.map((v) => modelVerb(v, d.catalogue)),
      perception_radius: d.perception_radius,
      model: d.model,
      facts: factsFor(d.id, d.facts, d.catalogue),
      history: historyFor(d.id, d.name),
      cue: d.cue,
      fallbacks: d.fallbacks,
    });
    return { ok: true, npc, draft: d };
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
}

// A file that doesn't build stops the server at start, loudly, rather than leaving an NPC out.
export function toNpc(draft: NpcDraft): NpcDefinition {
  const built = buildNpc(draft);
  if (!built.ok) throw new Error(`npcs/${draft.id}.json: ${built.errors.join('; ')}`);
  return built.npc;
}

export function readDraft(id: string, dirs: NpcDirs = NPC_DIRS): NpcDraft {
  const file = NpcFileSchema.parse(JSON.parse(readFileSync(new URL(`${id}.json`, dirs.npcs), 'utf8')));
  if (file.id !== id) throw new Error(`npcs/${id}.json has id '${file.id}'`);
  return { ...file, persona: readFileSync(new URL(`${id}.md`, dirs.prompts), 'utf8') };
}

export function npcIds(dirs: NpcDirs = NPC_DIRS): string[] {
  return readdirSync(dirs.npcs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

// Write beside, then rename: a crash mid-save never leaves half a file for the next start to choke on.
function writeAtomic(url: URL, text: string) {
  const path = fileURLToPath(url);
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}

export type NpcFiles = { list(): NpcDraft[]; has(id: string): boolean; save(draft: NpcDraft): void };

// The NPC files, read once at start and kept in step with saves, so the editor's library never re-reads the disk.
// Saving is dev only (the route checks); the village picks a change up on the next server start.
export function npcFiles(dirs: NpcDirs = NPC_DIRS): NpcFiles {
  const drafts = new Map(npcIds(dirs).map((id) => [id, readDraft(id, dirs)]));
  return {
    list: () => [...drafts.values()],
    has: (id) => drafts.has(id) || existsSync(new URL(`${id}.json`, dirs.npcs)),
    save(draft) {
      const { persona, ...file } = draft;
      // The persona first: a settings file is what makes an NPC, so it never appears without one.
      writeAtomic(new URL(`${draft.id}.md`, dirs.prompts), persona.endsWith('\n') ? persona : `${persona}\n`);
      writeAtomic(new URL(`${draft.id}.json`, dirs.npcs), `${JSON.stringify(file, null, 2)}\n`);
      drafts.set(draft.id, draft);
    },
  };
}
