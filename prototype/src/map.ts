// Village layout built in code for the prototype. The real game would load a Tiled map instead.
export const W = 30;
export const H = 20;
export const TILE = 16;

export type Sheet = 'town' | 'dungeon';
export type Prop = { sheet: Sheet; frame: number; x: number; y: number; solid?: boolean; name?: string };

type Grid = number[][];
const grid = (fill: number): Grid => Array.from({ length: H }, () => Array<number>(W).fill(fill));

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

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMap() {
  const rnd = mulberry32(7);
  const pick = <V>(xs: V[]) => xs[Math.floor(rnd() * xs.length)];
  const ground = grid(T.grass);
  const solid = grid(-1);
  const props: Prop[] = [];

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (rnd() < 0.08) ground[y][x] = pick(T.grassFlowers);

  // Town square
  const dirtRect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const col = x === x0 ? 0 : x === x0 + w - 1 ? 2 : 1;
        const row = y === y0 ? 0 : y === y0 + h - 1 ? 2 : 1;
        ground[y][x] = T.dirt[row * 3 + col];
      }
  };
  dirtRect(11, 7, 8, 6);

  const path = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) ground[y][x] = T.stonePath;
  };
  path(5, 5, 5, 9);
  path(5, 9, 10, 9);
  path(23, 5, 23, 9);
  path(19, 9, 23, 9);
  path(5, 15, 5, 16);
  path(5, 16, 23, 16);
  path(12, 13, 12, 15);
  path(17, 13, 17, 15);
  path(23, 15, 23, 15);

  const house = (x0: number, y0: number, w: number, color: 'blue' | 'red', doorX: number, walls: 'wood' | 'stone') => {
    const r = T.roof[color];
    const wl = T[walls];
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const edge = i === 0 ? 'l' : i === w - 1 ? 'r' : 'm';
      solid[y0][x] = i === w - 2 && w >= 4 ? r.chimney : r[edge];
      solid[y0 + 1][x] = x === doorX ? r.gable : r[`${edge}2` as 'l2' | 'm2' | 'r2'];
      solid[y0 + 2][x] = x === doorX ? wl.door : i === 1 || i === w - 2 ? wl.window : wl[edge];
    }
  };
  house(3, 2, 5, 'red', 5, 'wood'); // forge
  house(21, 2, 4, 'blue', 23, 'wood'); // mill
  house(3, 12, 4, 'red', 5, 'stone'); // herbalist

  // Guard tower
  T.tower.top.forEach((f, i) => (solid[12][22 + i] = f));
  T.tower.mid.forEach((f, i) => (solid[13][22 + i] = f));
  T.tower.bottom.forEach((f, i) => (solid[14][22 + i] = f));

  const fence = (x0: number, y: number, w: number) => {
    for (let i = 0; i < w; i++) solid[y][x0 + i] = i === 0 ? T.fence.l : i === w - 1 ? T.fence.r : T.fence.m;
  };
  fence(25, 6, 4);
  fence(7, 15, 3);

  // Tree border and a few scattered trees
  for (let x = 0; x < W; x++) {
    solid[0][x] = pick(T.trees);
    solid[H - 1][x] = pick(T.trees);
  }
  for (let y = 0; y < H; y++) {
    solid[y][0] = pick(T.trees);
    solid[y][W - 1] = pick(T.trees);
  }
  for (const [x, y] of [[1, 1], [2, 1], [27, 1], [28, 2], [10, 3], [14, 2], [17, 4], [27, 9], [26, 11], [9, 12], [19, 18], [14, 18], [1, 17], [2, 18], [28, 17]])
    solid[y][x] = pick(T.trees);

  // Forge yard (Tiny Dungeon has the anvil, furnace, barrels and weapons)
  props.push(
    { sheet: 'dungeon', frame: 74, x: 7, y: 6, solid: true, name: 'anvil' },
    { sheet: 'dungeon', frame: 29, x: 3, y: 5, solid: true, name: 'furnace' },
    { sheet: 'dungeon', frame: 82, x: 4, y: 5, solid: true },
    { sheet: 'dungeon', frame: 104, x: 9, y: 5, solid: true },
    { sheet: 'dungeon', frame: 117, x: 10, y: 5, solid: true },
    { sheet: 'town', frame: 131, x: 4, y: 6, solid: true },
    { sheet: 'town', frame: 83, x: 6, y: 5, solid: true, name: 'forge sign' },
    // Square
    { sheet: 'town', frame: 104, x: 15, y: 10, solid: true, name: 'well' },
    { sheet: 'town', frame: 83, x: 16, y: 7, solid: true, name: 'notice board' },
    // Mill
    { sheet: 'town', frame: 106, x: 25, y: 4, solid: true },
    { sheet: 'town', frame: 107, x: 26, y: 4, solid: true },
    // Herbalist
    { sheet: 'town', frame: 94, x: 8, y: 13, solid: true },
    { sheet: 'town', frame: 94, x: 9, y: 13, solid: true },
    // Guard
    { sheet: 'town', frame: 95, x: 26, y: 15, solid: true },
    { sheet: 'town', frame: 95, x: 27, y: 15, solid: true },
  );

  return { ground, solid, props };
}
