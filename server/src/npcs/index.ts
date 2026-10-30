import { createEngine, createWorld, senses, type World } from '../engine';
import { PLACE_NAMES, placeDistance } from '../village';
import { npcFiles, toNpc } from './load';
import { registerLabels, registerNames } from './news';
import { player } from './player';

// Every actor in the village: the player plus each npcs/<id>.json. Adding an NPC is one file (and its persona).
export const NPC_FILES = npcFiles();
// Labels first: an NPC's words for things another file labels are built with them.
registerLabels(NPC_FILES.list());
export const NPCS = NPC_FILES.list().map(toNpc);
export const ACTORS = [player, ...NPCS];

registerNames(NPCS);

// Who witnesses what: each NPC's perception radius on the village map. Reported world events happen at its places.
export const sense = senses(ACTORS, placeDistance);
export const { act, report } = createEngine(ACTORS, { sense, places: PLACE_NAMES });

// A fresh village world: every actor's starting purse and stock.
export const newVillage = (): World => createWorld(ACTORS);
// Display names by actor id, for views.
export const NAMES: Record<string, string> = Object.fromEntries(NPCS.map((n) => [n.id, n.name]));

const found = NPCS.find((n) => n.id === 'smith');
if (!found) throw new Error('npcs/smith.json is missing');
export const smith = found;

export { player };
export { buildNpc, npcFiles, readDraft, type Built, type NpcDirs, type NpcFiles } from './load';
export { labelOf, memoriesText, nameOf, summarize } from './news';
export { defineNpc, type NpcDefinition, type NpcSpec } from './types';
