// Writes the village map as a Tiled export: web/public/assets/village.tmj. Run once with `npm run make-map`;
// after that the .tmj is the source (open it in Tiled to change it). Running this again overwrites hand edits.
//
// Layers: `ground` (grass, dirt, paths), `solid` (buildings, trees, fences), `props` (forge gear, well, crates),
// and the `places` object layer: one rectangle per named place NPCs can be at, plus the player's `spawn` point.
// Anything on `solid` or `props` blocks walking.
import { writeFileSync } from 'node:fs';

const W = 30;
const H = 20;
const TILE = 16;
const TOWN = 1; // first gid of each tileset
const DUNGEON = 133;

// Tiny Town frame indices (row * 12 + col in tilemap_packed.png)
const T = {
  grass: 0,
  grassFlowers: [1, 2],
  dirt: [12, 13, 14, 24, 25, 26, 36, 37, 38],
  stonePath: 43,
  trees: [4, 16, 28, 3, 15],
  roof: {
    blue: { l: 48, m: 49, r: 50, l2: 60, m2: 61, r2: 62, gable: 63, chimney: 51 },
    red: { l: 52, m: 53, r: 54, l2: 64, m2: 65, r2: 66, gable: 67, chimney: 55 },
  },
  wood: { l: 72, m: 73, r: 75, window: 84, door: 85 },
  stone: { l: 76, m: 77, r: 79, window: 88, door: 89 },
  tower: { top: [99, 100, 102], mid: [126, 125, 126], bottom: [126, 103, 126] },
  fence: { l: 80, m: 81, r: 82 },
};

// Named places, in tiles. Whoever stands at a place takes its walkable tiles in row order, so the first is the
// owner's usual spot (Brann below the anvil, Mira at her stall).
const PLACES = [
  { name: 'forge', x: 7, y: 7, w: 3, h: 2 },
  { name: 'market', x: 12, y: 8, w: 3, h: 2 },
  { name: 'notice_board', x: 16, y: 8, w: 2, h: 1 },
  { name: 'square', x: 13, y: 11, w: 5, h: 2 },
  { name: 'tavern', x: 22, y: 5, w: 3, h: 2 },
  { name: 'cottage', x: 4, y: 15, w: 2, h: 2 },
  { name: 'gate', x: 22, y: 15, w: 3, h: 2 },
];
const SPAWN = { x: 13, y: 11 };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Grid = number[][]; // gids, 0 = empty
const grid = (): Grid => Array.from({ length: H }, () => Array<number>(W).fill(0));

function build() {
  const rnd = mulberry32(7);
  const pick = <V>(xs: V[]) => xs[Math.floor(rnd() * xs.length)];
  const ground = grid();
  const solid = grid();
  const props = grid();
  const town = (f: number) => TOWN + f;
  const dungeon = (f: number) => DUNGEON + f;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ground[y][x] = town(rnd() < 0.08 ? pick(T.grassFlowers) : T.grass);

  // Town square
  const dirtRect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const col = x === x0 ? 0 : x === x0 + w - 1 ? 2 : 1;
        const row = y === y0 ? 0 : y === y0 + h - 1 ? 2 : 1;
        ground[y][x] = town(T.dirt[row * 3 + col]);
      }
  };
  dirtRect(11, 7, 8, 6);

  const path = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) ground[y][x] = town(T.stonePath);
  };
  path(5, 5, 5, 9);
  path(5, 9, 10, 9);
  path(23, 5, 23, 9);
  path(19, 9, 23, 9);
  path(5, 15, 5, 16);
  path(5, 16, 23, 16);
  path(12, 13, 12, 15);
  path(17, 13, 17, 15);

  const house = (x0: number, y0: number, w: number, color: 'blue' | 'red', doorX: number, walls: 'wood' | 'stone') => {
    const r = T.roof[color];
    const wl = T[walls];
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const edge = i === 0 ? 'l' : i === w - 1 ? 'r' : 'm';
      solid[y0][x] = town(i === w - 2 && w >= 4 ? r.chimney : r[edge]);
      solid[y0 + 1][x] = town(x === doorX ? r.gable : r[`${edge}2` as 'l2' | 'm2' | 'r2']);
      solid[y0 + 2][x] = town(x === doorX ? wl.door : i === 1 || i === w - 2 ? wl.window : wl[edge]);
    }
  };
  house(3, 2, 5, 'red', 5, 'wood'); // forge
  house(21, 2, 4, 'blue', 23, 'wood'); // tavern
  house(3, 12, 4, 'red', 5, 'stone'); // cottage

  // Watchtower by the gate
  T.tower.top.forEach((f, i) => (solid[12][22 + i] = town(f)));
  T.tower.mid.forEach((f, i) => (solid[13][22 + i] = town(f)));
  T.tower.bottom.forEach((f, i) => (solid[14][22 + i] = town(f)));

  const fence = (x0: number, y: number, w: number) => {
    for (let i = 0; i < w; i++) solid[y][x0 + i] = town(i === 0 ? T.fence.l : i === w - 1 ? T.fence.r : T.fence.m);
  };
  fence(25, 6, 4);
  fence(7, 15, 3);

  // Tree border and a few scattered trees
  for (let x = 0; x < W; x++) {
    solid[0][x] = town(pick(T.trees));
    solid[H - 1][x] = town(pick(T.trees));
  }
  for (let y = 0; y < H; y++) {
    solid[y][0] = town(pick(T.trees));
    solid[y][W - 1] = town(pick(T.trees));
  }
  for (const [x, y] of [[1, 1], [2, 1], [27, 1], [28, 2], [10, 3], [14, 2], [17, 4], [27, 9], [26, 11], [9, 12], [19, 18], [14, 18], [1, 17], [2, 18], [28, 17]])
    solid[y][x] = town(pick(T.trees));

  // Forge yard (Tiny Dungeon has the anvil, furnace, barrels and weapons)
  const prop = (gid: number, x: number, y: number) => (props[y][x] = gid);
  prop(dungeon(74), 7, 6); // anvil
  prop(dungeon(29), 3, 5); // furnace
  prop(dungeon(82), 4, 5);
  prop(dungeon(104), 9, 5);
  prop(dungeon(117), 10, 5);
  prop(town(131), 4, 6);
  prop(town(83), 6, 5); // forge sign
  // Square
  prop(town(104), 15, 10); // well
  prop(town(83), 16, 7); // notice board
  // Tavern yard
  prop(town(106), 25, 4);
  prop(town(107), 26, 4);
  // Cottage garden
  prop(town(94), 8, 13);
  prop(town(94), 9, 13);
  // Gate
  prop(town(95), 26, 15);
  prop(town(95), 27, 15);

  return { ground, solid, props };
}

function tilemap() {
  const { ground, solid, props } = build();
  const layer = (id: number, name: string, g: Grid) => ({ id, name, type: 'tilelayer' as const, x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: g.flat() });
  const sheet = (firstgid: number, name: string) => ({
    firstgid,
    name,
    image: `${name}/tilemap_packed.png`,
    imagewidth: 192,
    imageheight: 176,
    tilewidth: TILE,
    tileheight: TILE,
    tilecount: 132,
    columns: 12,
    margin: 0,
    spacing: 0,
  });
  const objects = [
    ...PLACES.map((p, i) => ({ id: i + 1, name: p.name, type: 'place', x: p.x * TILE, y: p.y * TILE, width: p.w * TILE, height: p.h * TILE, rotation: 0, visible: true })),
    { id: PLACES.length + 1, name: 'spawn', type: 'spawn', point: true, x: SPAWN.x * TILE + TILE / 2, y: SPAWN.y * TILE + TILE / 2, width: 0, height: 0, rotation: 0, visible: true },
  ];
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: W,
    height: H,
    tilewidth: TILE,
    tileheight: TILE,
    nextlayerid: 5,
    nextobjectid: objects.length + 1,
    tilesets: [sheet(TOWN, 'town'), sheet(DUNGEON, 'dungeon')],
    layers: [
      layer(1, 'ground', ground),
      layer(2, 'solid', solid),
      layer(3, 'props', props),
      { id: 4, name: 'places', type: 'objectgroup' as const, draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
    ],
  };
}

const out = new URL('../web/public/assets/village.tmj', import.meta.url);
writeFileSync(out, `${JSON.stringify(tilemap())}\n`);
console.log(`wrote ${out.pathname}`);
