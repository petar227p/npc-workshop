import { readFileSync } from 'node:fs';
import { centreOf, placeNamed, readVillage, type TiledMap, type Village } from '@blacksmith/shared';
import { REPO_ROOT } from './config/env';

// The village map the browser draws (a Tiled export). The server reads it for the named places NPCs can be at.
export const VILLAGE_MAP = `${REPO_ROOT}web/public/assets/village.tmj`;

export const VILLAGE: Village = readVillage(JSON.parse(readFileSync(VILLAGE_MAP, 'utf8')) as TiledMap);

export const PLACE_NAMES: readonly string[] = VILLAGE.places.map((p) => p.name);

// Tiles between the middles of two places; Infinity when either isn't on the map ('village': the player, the clock).
export function placeDistance(a: string, b: string): number {
  const p = placeNamed(VILLAGE, a);
  const q = placeNamed(VILLAGE, b);
  if (!p || !q) return Infinity;
  const [c, d] = [centreOf(p), centreOf(q)];
  return Math.hypot(c.x - d.x, c.y - d.y);
}
