import { readFileSync } from 'node:fs';
import { readVillage, type TiledMap, type Village } from '@blacksmith/shared';
import { REPO_ROOT } from './config/env';

// The village map the browser draws (a Tiled export). The server reads it for the named places NPCs can be at.
export const VILLAGE_MAP = `${REPO_ROOT}web/public/assets/village.tmj`;

export const VILLAGE: Village = readVillage(JSON.parse(readFileSync(VILLAGE_MAP, 'utf8')) as TiledMap);

export const PLACE_NAMES: readonly string[] = VILLAGE.places.map((p) => p.name);
