import { createEngine, createWorld, senses, type World } from '../engine';
import { placeDistance } from '../village';
import { npcFiles, toNpc } from './load';
import { registerNames } from './news';
import { player } from './player';

// Every actor in the village: the player plus each npcs/<id>.json. Adding an NPC is one file (and its persona).
export const NPC_FILES = npcFiles();
export const NPCS = NPC_FILES.list().map(toNpc);
export const ACTORS = [player, ...NPCS];

registerNames(NPCS);

// Who witnesses what: each NPC's perception radius on the village map.
export const sense = senses(ACTORS, placeDistance);
export const { act } = createEngine(ACTORS, { sense });

// A fresh village world: every actor's starting purse and stock.
export const newVillage = (): World => createWorld(ACTORS);
// Display names by actor id, for views.
export const NAMES: Record<string, string> = Object.fromEntries(NPCS.map((n) => [n.id, n.name]));

const found = NPCS.find((n) => n.id === 'smith');
if (!found) throw new Error('npcs/smith.json is missing');
export const smith = found;

export { player };
export { buildNpc, npcFiles, readDraft, type Built, type NpcDirs, type NpcFiles } from './load';
export { memoriesText, nameOf, summarize } from './news';
export { defineNpc, type NpcDefinition, type NpcSpec } from './types';
