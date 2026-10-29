// Writes the village map as a Tiled export: web/public/assets/village.tmj. Run once with `npm run make-map`;
// after that the .tmj is the source (open it in Tiled to change it). Running this again overwrites hand edits.
//
// Layers: `ground` (grass, dirt, paths), `solid` (buildings, trees, fences), `props` (forge gear, well, crates),
// and the `places` object layer: one rectangle per named place NPCs can be at, plus the player's `spawn` point.
// Anything on `solid` or `props` blocks walking.
//
// Layout: the town centre in the middle (forge, market, notice board, tavern, the square with its well), and four
// small quarters in the corners, each in its own clearing, joined to the centre by stone roads:
// the farm (north-west), the chapel and graveyard (north-east), the cottages (south-west) and the town gate
// (south-east, where the road leaves the map). Woods fill the space between.
import { writeFileSync } from 'node:fs';

const W = 56;
const H = 40;
const TILE = 16;
const TOWN = 1; // first gid of each tileset
const DUNGEON = 133;

// Tiny Town frame indices (row * 12 + col in tilemap_packed.png)
const T = {
  grass: 0,
  grassFlowers: [1, 2],
  dirt: [12, 13, 14, 24, 25, 26, 36, 37, 38],
  stonePath: 43,
  // Tall trees are two tiles, top over trunk; small trees and the bush are one. (The 3×3 forest blocks at frames 6–11
  // are a repeating fill, not a stamp: placed alone they show cut-off trees.)
  tallTrees: [{ top: 3, trunk: 15 }, { top: 4, trunk: 16 }],
  smallTrees: [27, 28, 5],
  roof: {
    blue: { l: 48, m: 49, r: 50, l2: 60, m2: 61, r2: 62, gable: 63, chimney: 51 },
    red: { l: 52, m: 53, r: 54, l2: 64, m2: 65, r2: 66, gable: 67, chimney: 55 },
  },
  wood: { l: 72, m: 73, r: 75, window: 84, door: 85 },
  stone: { l: 76, m: 77, r: 79, window: 88, door: 89 },
  tower: { top: [99, 100, 102], mid: [126, 125, 126], bottom: [126, 103, 126] },
  fence: { l: 80, m: 81, r: 82 },
  sign: 83,
  beehive: 94,
  target: 95,
  well: { top: 92, bottom: 104 },
  sack: 106,
  bucket: 107,
  waterBucket: 131,
};
// Tiny Dungeon frame indices
const D = { furnace: 29, cage: 82, weapons: [104, 117], table: 72, barrel: 66, chest: 89, grave: 65, ironFence: { l: 76, m: 77, r: 78 }, anvil: 74 };

// Named places, in tiles. Whoever stands at a place takes its walkable tiles in row order, so the first is the
// owner's usual spot (Brann below the anvil, Mira at her stall).
const PLACES = [
  // the centre
  { name: 'forge', x: 23, y: 16, w: 3, h: 2 },
  { name: 'market', x: 20, y: 23, w: 3, h: 2 },
  { name: 'notice_board', x: 34, y: 20, w: 2, h: 1 },
  { name: 'square', x: 24, y: 21, w: 7, h: 2 }, // round the well, in the middle of the plaza
  { name: 'tavern', x: 32, y: 15, w: 3, h: 2 },
  // the quarters
  { name: 'farm', x: 8, y: 7, w: 4, h: 2 },
  { name: 'chapel', x: 41, y: 6, w: 4, h: 2 },
  { name: 'cottage', x: 5, y: 33, w: 4, h: 2 },
  { name: 'gate', x: 50, y: 32, w: 3, h: 2 },
];
const SPAWN = { x: 26, y: 22 };

// Clearings: woods are scattered everywhere except inside these (the centre and each quarter), so the quarters read
// as small hamlets around the town. Roads stay clear on their own.
const CLEARINGS = [
  { x: 16, y: 9, w: 24, h: 19 }, // centre
  { x: 2, y: 2, w: 15, h: 9 }, // farm
  { x: 39, y: 2, w: 15, h: 12 }, // chapel
  { x: 2, y: 28, w: 15, h: 10 }, // cottages
  { x: 39, y: 27, w: 17, h: 11 }, // gate
];

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
const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function build() {
  const rnd = mulberry32(7);
  const pick = <V>(xs: V[]) => xs[Math.floor(rnd() * xs.length)];
  const ground = grid();
  const solid = grid();
  const props = grid();
  const town = (f: number) => TOWN + f;
  const dungeon = (f: number) => DUNGEON + f;
  const clear = Array.from({ length: H }, () => Array<boolean>(W).fill(false)); // no tree may grow here

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ground[y][x] = town(rnd() < 0.08 ? pick(T.grassFlowers) : T.grass);

  const dirtRect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const col = x === x0 ? 0 : x === x0 + w - 1 ? 2 : 1;
        const row = y === y0 ? 0 : y === y0 + h - 1 ? 2 : 1;
        ground[y][x] = town(T.dirt[row * 3 + col]);
      }
  };
  // Stone roads, kept clear of trees one tile either side.
  const path = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        ground[y][x] = town(T.stonePath);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (clear[y + dy]?.[x + dx] !== undefined) clear[y + dy][x + dx] = true;
      }
  };

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
  const tower = (x0: number, y0: number) => {
    T.tower.top.forEach((f, i) => (solid[y0][x0 + i] = town(f)));
    T.tower.mid.forEach((f, i) => (solid[y0 + 1][x0 + i] = town(f)));
    T.tower.bottom.forEach((f, i) => (solid[y0 + 2][x0 + i] = town(f)));
  };
  const fence = (x0: number, y: number, w: number, f: { l: number; m: number; r: number } = T.fence, gid = town) => {
    for (let i = 0; i < w; i++) solid[y][x0 + i] = gid(i === 0 ? f.l : i === w - 1 ? f.r : f.m);
  };
  const prop = (gid: number, x: number, y: number) => (props[y][x] = gid);

  // ── The centre ────────────────────────────────────────────────────────────
  dirtRect(17, 14, 21, 12); // odd width, so the well stands on the middle column
  // Forge (Tiny Dungeon has the anvil, furnace, barrels and weapons)
  house(19, 11, 5, 'red', 21, 'wood');
  prop(dungeon(D.furnace), 19, 14);
  prop(dungeon(D.cage), 20, 14);
  prop(town(T.sign), 22, 14);
  prop(dungeon(D.weapons[0]), 25, 14);
  prop(dungeon(D.weapons[1]), 26, 14);
  prop(town(T.waterBucket), 20, 15);
  prop(dungeon(D.anvil), 23, 15);
  // Tavern
  house(31, 11, 5, 'blue', 33, 'wood');
  prop(town(T.sack), 36, 14);
  prop(town(T.bucket), 37, 14);
  // Market stall: barrel, table, chest
  prop(dungeon(D.barrel), 19, 22);
  prop(dungeon(D.table), 20, 22);
  prop(dungeon(D.table), 21, 22);
  prop(dungeon(D.chest), 22, 22);
  // Notice board, and the well in the middle of the plaza (two tiles: roof over the water)
  prop(town(T.sign), 34, 19);
  prop(town(T.well.top), 27, 19);
  prop(town(T.well.bottom), 27, 20);

  // Roads out of the centre to each quarter
  path(10, 16, 16, 16); // west, north-west branch
  path(10, 9, 10, 16);
  path(10, 23, 16, 23); // west, south-west branch
  path(10, 23, 10, 32);
  path(38, 16, 45, 16); // east, north-east branch
  path(45, 8, 45, 16);
  path(38, 23, 45, 23); // east, south-east branch, on to the gate
  path(45, 23, 45, 33);
  path(45, 32, W - 1, 33);

  // ── North-west: the farm ──────────────────────────────────────────────────
  dirtRect(7, 6, 6, 4);
  house(3, 3, 4, 'red', 4, 'wood');
  house(12, 3, 4, 'blue', 14, 'wood');
  path(4, 6, 6, 6);
  path(13, 6, 14, 6);
  for (const x of [8, 9, 10]) prop(town(T.beehive), x, 4);
  prop(town(T.target), 3, 8); // the scarecrow
  fence(2, 10, 5);
  prop(town(T.sack), 14, 8);

  // ── North-east: the chapel and graveyard ──────────────────────────────────
  dirtRect(40, 6, 5, 2);
  house(40, 3, 5, 'blue', 42, 'stone');
  tower(45, 3); // bell tower
  for (const [x, y] of [[49, 4], [51, 4], [49, 6], [51, 6]]) prop(dungeon(D.grave), x, y);
  fence(48, 8, 5, D.ironFence, dungeon);
  house(49, 10, 4, 'red', 50, 'wood');
  path(46, 13, 50, 13);
  path(45, 7, 45, 8);

  // ── South-west: the cottages ──────────────────────────────────────────────
  dirtRect(4, 32, 11, 3);
  house(3, 29, 4, 'red', 5, 'stone');
  house(12, 29, 4, 'blue', 13, 'wood');
  fence(7, 31, 3);
  prop(town(T.beehive), 7, 30);
  prop(town(T.beehive), 8, 30);
  prop(town(T.waterBucket), 14, 35);

  // ── South-east: the town gate ─────────────────────────────────────────────
  tower(47, 28); // watchtower
  house(40, 29, 4, 'red', 41, 'wood');
  path(41, 32, 44, 32);
  prop(town(T.target), 49, 36); // the guards' practice targets
  prop(town(T.target), 50, 36);
  prop(dungeon(D.barrel), 51, 29);
  prop(dungeon(D.barrel), 52, 29);
  fence(51, 31, 3);
  fence(51, 34, 3);

  // ── Woods ─────────────────────────────────────────────────────────────────
  // A border of small trees, open where the road leaves through the gate. Between the clearings: tall trees (both
  // their tiles must be free), then small trees and bushes in the gaps.
  const road = (x: number, y: number) => ground[y][x] === town(T.stonePath);
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !solid[y][x] && !props[y][x] && !road(x, y);
  const wild = (x: number, y: number) => free(x, y) && !clear[y][x] && !CLEARINGS.some((c) => inRect(c, x, y));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && free(x, y)) solid[y][x] = town(pick(T.smallTrees.slice(0, 2)));
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (!wild(x, y) || !wild(x, y + 1) || rnd() >= 0.4) continue;
      const tree = pick(T.tallTrees);
      solid[y][x] = town(tree.top);
      solid[y + 1][x] = town(tree.trunk);
    }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (wild(x, y) && rnd() < 0.15) solid[y][x] = town(pick(T.smallTrees));

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
