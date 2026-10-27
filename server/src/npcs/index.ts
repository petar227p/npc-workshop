import { createEngine } from '../engine';
import { npcFiles, toNpc } from './load';
import { player } from './player';

// Every actor in the village: the player plus each npcs/<id>.json. Adding an NPC is one file (and its persona).
export const NPC_FILES = npcFiles();
export const NPCS = NPC_FILES.list().map(toNpc);
export const ACTORS = [player, ...NPCS];

export const { act } = createEngine(ACTORS);

const found = NPCS.find((n) => n.id === 'smith');
if (!found) throw new Error('npcs/smith.json is missing');
export const smith = found;

export { player };
export { buildNpc, npcFiles, readDraft, type Built, type NpcDirs, type NpcFiles } from './load';
export { defineNpc, type NpcDefinition, type NpcSpec } from './types';
