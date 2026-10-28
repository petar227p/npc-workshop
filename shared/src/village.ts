// The village map, read from its Tiled export (web/public/assets/village.tmj). The server reads it for the named
// places NPCs can be at; the browser draws it and walks people along it. Zod-free, so the browser can import it.

export type TiledLayer =
  | { type: 'tilelayer'; name: string; width: number; height: number; data: number[] }
  | { type: 'objectgroup'; name: string; objects: TiledObject[] };
export type TiledObject = { id: number; name: string; x: number; y: number; width: number; height: number; point?: boolean };
export type TiledMap = { width: number; height: number; tilewidth: number; tileheight: number; layers: TiledLayer[] };

// Places are rectangles in tiles. An NPC at a place stands on one of its walkable tiles.
export type Place = { name: string; x: number; y: number; w: number; h: number };
export type Tile = { x: number; y: number };
export type Village = {
  width: number;
  height: number;
  places: Place[];
  spawn: Tile; // where the player starts
  walkable: boolean[][]; // [y][x]: nothing solid on the tile
};

// Tile layers whose tiles block walking. Anything on them is a wall, a tree or a prop.
export const SOLID_LAYERS = ['solid', 'props'];

export function readVillage(map: TiledMap): Village {
  const tw = map.tilewidth;
  const th = map.tileheight;
  const walkable = Array.from({ length: map.height }, () => Array<boolean>(map.width).fill(true));
  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer' || !SOLID_LAYERS.includes(layer.name)) continue;
    layer.data.forEach((gid, i) => {
      if (gid !== 0) walkable[Math.floor(i / layer.width)][i % layer.width] = false;
    });
  }
  const objects = map.layers.find((l): l is Extract<TiledLayer, { type: 'objectgroup' }> => l.type === 'objectgroup' && l.name === 'places')?.objects ?? [];
  const places = objects
    .filter((o) => !o.point)
    .map((o) => ({ name: o.name, x: Math.round(o.x / tw), y: Math.round(o.y / th), w: Math.max(1, Math.round(o.width / tw)), h: Math.max(1, Math.round(o.height / th)) }));
  const spawn = objects.find((o) => o.point && o.name === 'spawn');
  if (!spawn) throw new Error('the village map has no spawn point in its places layer');
  return { width: map.width, height: map.height, places, spawn: { x: Math.floor(spawn.x / tw), y: Math.floor(spawn.y / th) }, walkable };
}

export const placeNamed = (v: Village, name: string) => v.places.find((p) => p.name === name);

export const isWalkable = (v: Village, t: Tile) => t.x >= 0 && t.y >= 0 && t.x < v.width && t.y < v.height && v.walkable[t.y][t.x];

// A place's walkable tiles, row by row. People at the same place take them in turn, so nobody stands on anyone.
export function spotsIn(v: Village, p: Place): Tile[] {
  const out: Tile[] = [];
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (isWalkable(v, { x, y })) out.push({ x, y });
  return out;
}

// The middle of a place in tiles: where its events happen, for who saw them.
export const centreOf = (p: Place) => ({ x: p.x + (p.w - 1) / 2, y: p.y + (p.h - 1) / 2 });

// Shortest walk between two tiles, 4 directions, both ends included. Null when there is no way through.
export function findPath(v: Village, from: Tile, to: Tile): Tile[] | null {
  const key = (t: Tile) => t.y * v.width + t.x;
  const prev = new Map<number, Tile | null>([[key(from), null]]);
  const queue: Tile[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    if (t.x === to.x && t.y === to.y) {
      const path: Tile[] = [];
      for (let at: Tile | null = t; at; at = prev.get(key(at)) ?? null) path.unshift(at);
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (!prev.has(key(n)) && isWalkable(v, n)) {
        prev.set(key(n), t);
        queue.push(n);
      }
    }
  }
  return null;
}
