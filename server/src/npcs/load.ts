import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NpcDraftSchema, NpcFileSchema, type Catalogue, type ModelVerb, type NpcArt, type NpcDraft } from '@blacksmith/shared';
import * as flat from '../agents/flat';
import { verbs } from '../engine';
import { PLACE_NAMES } from '../village';
import { factsFor } from './facts';
import { historyFor } from './history';
import { labelsFor, vocabularyFor, type Vocabulary } from './news';
import { defineNpc, type NpcDefinition } from './types';

// NPCs as data: npcs/<id>.json holds the settings, prompts/<id>.md the persona, npcs/art/<id>-<n>.<ext> its reference
// pictures. All are checked here and built through defineNpc, so a file (or an editor draft) can only pick verbs and
// facts that exist in code.

export type NpcDirs = { npcs: URL; prompts: URL };
export const NPC_DIRS: NpcDirs = {
  npcs: new URL('../../../npcs/', import.meta.url),
  prompts: new URL('../../../prompts/', import.meta.url),
};

const LEDGER = {
  SAY: verbs.SAY,
  EMOTE: verbs.EMOTE,
  OFFER: verbs.OFFER,
  COUNTER_OFFER: verbs.COUNTER_OFFER,
  REFUSE: verbs.REFUSE,
  ACCEPT: verbs.ACCEPT,
  START_WORK: verbs.START_WORK,
  GIVE: verbs.GIVE,
  TELL: verbs.TELL,
  RETELL: verbs.RETELL,
  ANNOUNCE: verbs.ANNOUNCE,
  SIGNAL: verbs.SIGNAL,
};

// Everything it deals in, by name: what its catalogue lists, what it starts with, and what its labels name (a game may
// sync those in later). Item types are only made, never held, so GIVE leaves them out.
function goodsOf(d: Pick<NpcDraft, 'start' | 'catalogue' | 'labels'>): string[] {
  const types = d.catalogue.made_to_order?.items ?? {};
  const named = [...Object.keys(d.start.stock), ...Object.keys(d.catalogue.in_stock ?? {}), ...Object.keys(d.catalogue.made_to_order?.materials ?? {}), ...Object.keys(d.labels)];
  return [...new Set(named)].filter((n) => !Object.hasOwn(types, n));
}

// The offer verbs' schemas are built from the NPC's own catalogue, GIVE's from what it may hold, all in its words;
// SIGNAL's from the signals it declares.
function modelVerb(v: ModelVerb, d: Pick<NpcDraft, 'catalogue' | 'signals'>, goods: string[], words: flat.Words): flat.FlatVerb {
  if (v === 'OFFER') return flat.OFFER(d.catalogue, words);
  if (v === 'COUNTER_OFFER') return flat.COUNTER_OFFER(d.catalogue, words);
  if (v === 'GIVE') return flat.GIVE(goods, words);
  if (v === 'SIGNAL') return flat.SIGNAL(Object.keys(d.signals));
  return flat[v];
}

export type Built = { ok: true; npc: NpcDefinition; draft: NpcDraft } | { ok: false; errors: string[] };

// The places a draft names that aren't on the village map, each as one readable line.
function offMap(d: Pick<NpcDraft, 'location' | 'schedule'>, places: readonly string[]): string[] {
  const missing = [...new Set([d.location, ...d.schedule.map((e) => e.place)])].filter((p) => !places.includes(p));
  return missing.map((p) => `there's no place called '${p}' on the village map (places: ${places.join(', ')})`);
}

// Every problem as one readable line, for the editor. `places` are the named places on the village map;
// null skips that check (files at start, see `toNpc`).
export function buildNpc(input: unknown, places: readonly string[] | null = PLACE_NAMES, vocabulary?: Vocabulary): Built {
  const parsed = NpcDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'npc'}: ${i.message}`) };
  const d = parsed.data;
  const missing = places ? offMap(d, places) : [];
  if (missing.length > 0) return { ok: false, errors: missing };
  // Passing news on cites an event id, which only the memories block tells it.
  const tells = d.verbs.filter((v) => v === 'TELL' || v === 'RETELL' || v === 'ANNOUNCE');
  if (tells.length > 0 && !d.facts.includes('memories')) return { ok: false, errors: [`${tells.join(', ')} needs the "News it knows" facts, or it can't know an event id to pass on`] };
  // A signal's name alone doesn't say what it does; the model learns that from its facts.
  if (d.model_verbs.includes('SIGNAL') && !d.facts.includes('signals')) return { ok: false, errors: ['SIGNAL needs the "What it can ask the game for" facts, or it can\'t know what its signals mean'] };
  try {
    // What it calls each thing, the same in its schema, its facts and its history. Throws if two things share a word.
    const label = vocabulary?.labelOf ?? labelsFor(d.labels);
    const goods = goodsOf(d);
    const words = flat.wordsFor([...goods, ...Object.keys(d.catalogue.made_to_order?.items ?? {})], label);
    const npc = defineNpc({
      id: d.id,
      name: d.name,
      prompt: d.persona,
      verbs: d.verbs.map((v) => LEDGER[v]),
      location: d.location,
      schedule: d.schedule,
      sprite: d.sprite,
      art: d.art,
      catalogue: d.catalogue,
      start: d.start,
      labels: d.labels,
      signals: d.signals,
      modelVerbs: d.model_verbs.map((v) => modelVerb(v, d, goods, words)),
      perception_radius: d.perception_radius,
      model: d.model,
      effort: d.effort,
      facts: factsFor(d.id, d.facts, d.catalogue, label, d.signals, vocabulary),
      history: historyFor(d.id, d.name, label, vocabulary?.nameOf),
      triggers: d.triggers,
      cue: d.cue,
      fallbacks: d.fallbacks,
    });
    return { ok: true, npc, draft: d };
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
}

// Parse into owned data before constructing the local vocabulary and every closure/schema. This also
// rebuilds registry NPCs, so a world never retains their nested configuration or village resolvers.
export function buildCast(inputs: readonly NpcDraft[], places: readonly string[] | null = PLACE_NAMES): { ok: true; cast: NpcDefinition[] } | { ok: false; errors: string[] } {
  const drafts: NpcDraft[] = [];
  const errors: string[] = [];
  inputs.forEach((input, i) => {
    const parsed = NpcDraftSchema.safeParse(input);
    if (parsed.success) drafts.push(parsed.data);
    else errors.push(...parsed.error.issues.map((e) => `definitions.${i}.${e.path.join('.')}: ${e.message}`));
  });
  if (errors.length) return { ok: false, errors };
  try {
    const vocabulary = vocabularyFor(drafts);
    const cast: NpcDefinition[] = [];
    drafts.forEach((d, i) => {
      const built = buildNpc(d, places, vocabulary);
      if (built.ok) cast.push(built.npc);
      else errors.push(...built.errors.map((e) => `definitions.${i}: ${e}`));
    });
    return errors.length ? { ok: false, errors } : { ok: true, cast };
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
}

// A file that doesn't build stops the server at start, loudly, rather than leaving an NPC out. A place that isn't on
// the map only warns: files from before the map could name any place, and the NPC still works (the village shows it
// where the player starts). The editor won't save a draft like that, so it's fixed by picking a place there.
export function toNpc(draft: NpcDraft): NpcDefinition {
  for (const line of offMap(draft, PLACE_NAMES)) console.warn(`npcs/${draft.id}.json: ${line}`);
  const built = buildNpc(draft, null);
  if (!built.ok) throw new Error(`npcs/${draft.id}.json: ${built.errors.join('; ')}`);
  return built.npc;
}

const artDir = (dirs: NpcDirs) => new URL('art/', dirs.npcs);
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// A file names its pictures; a draft carries them. The draft check then holds the pictures to the same limits.
export function readDraft(id: string, dirs: NpcDirs = NPC_DIRS): NpcDraft {
  const file = NpcFileSchema.parse(JSON.parse(readFileSync(new URL(`${id}.json`, dirs.npcs), 'utf8')));
  if (file.id !== id) throw new Error(`npcs/${id}.json has id '${file.id}'`);
  const references = file.art.references.map((name) => {
    if (!name.startsWith(`${id}-`)) throw new Error(`npcs/${id}.json: reference '${name}' belongs to another NPC`);
    const bytes = readFileSync(new URL(name, artDir(dirs)));
    return `data:${MIME[name.slice(name.lastIndexOf('.') + 1)]};base64,${bytes.toString('base64')}`;
  });
  const persona = readFileSync(new URL(`${id}.md`, dirs.prompts), 'utf8');
  const checked = NpcDraftSchema.parse({ ...file, art: { ...file.art, references }, persona });
  return { ...checked, persona }; // as written: the check trims it
}

// Writes the draft's pictures as npcs/art/<id>-1.png… and removes the ones it no longer has. Returns their names.
function writeArt(id: string, art: NpcArt, dirs: NpcDirs): string[] {
  const dir = artDir(dirs);
  mkdirSync(dir, { recursive: true });
  const names = art.references.map((url, i) => {
    const comma = url.indexOf(',');
    const name = `${id}-${i + 1}.${EXT[url.slice('data:'.length, url.indexOf(';'))]}`;
    writeAtomic(new URL(name, dir), Buffer.from(url.slice(comma + 1), 'base64'));
    return name;
  });
  const old = new RegExp(`^${id}-[1-3]\\.(png|jpg|webp)$`);
  for (const f of readdirSync(dir)) if (old.test(f) && !names.includes(f)) rmSync(new URL(f, dir));
  return names;
}

export function npcIds(dirs: NpcDirs = NPC_DIRS): string[] {
  return readdirSync(dirs.npcs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

// Write beside, then rename: a crash mid-save never leaves half a file for the next start to choke on.
function writeAtomic(url: URL, data: string | Buffer) {
  const path = fileURLToPath(url);
  writeFileSync(`${path}.tmp`, data);
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
      const { persona, art, ...rest } = draft;
      // The persona and pictures first: a settings file is what makes an NPC, so it never appears without them.
      writeAtomic(new URL(`${draft.id}.md`, dirs.prompts), persona.endsWith('\n') ? persona : `${persona}\n`);
      const file = { ...rest, art: { style: art.style, references: writeArt(draft.id, art, dirs) } };
      writeAtomic(new URL(`${draft.id}.json`, dirs.npcs), `${JSON.stringify(file, null, 2)}\n`);
      drafts.set(draft.id, draft);
    },
  };
}
