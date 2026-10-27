import { PNG } from 'pngjs';
import { OUTLINE, type Rgb } from './palette';

// Muse Image render → a small sprite in the village's style: background removed, trimmed, averaged down to a
// pixel grid, a few flat colours (snapped to the palette when given) and a 1 px dark outline like Kenney's.

export type SpriteOptions = { size?: number; colors?: number; palette?: readonly Rgb[] };

const BG_DISTANCE = 40; // summed RGB difference from the corner colour that still counts as background
const KMEANS_ROUNDS = 12;

type Color = [number, number, number];
const dist2 = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const nearestIndex = (c: Rgb, among: readonly Rgb[]) => among.reduce((best, m, k) => (dist2(c, m) < dist2(c, among[best]) ? k : best), 0);
const luma = (c: Rgb) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

export function toSprite(input: Buffer, opts: SpriteOptions = {}): Buffer {
  const { size = 32, colors = 8, palette } = opts;
  const { width: W, height: H, data: px } = PNG.sync.read(input);

  // 1. Background: flood fill from the border over pixels close to the corner colour (or transparent ones), so
  //    light patches inside the item survive.
  const bg: Rgb = [px[0], px[1], px[2]];
  const isBgLike = (p: number) => px[p * 4 + 3] < 128 || Math.abs(px[p * 4] - bg[0]) + Math.abs(px[p * 4 + 1] - bg[1]) + Math.abs(px[p * 4 + 2] - bg[2]) < BG_DISTANCE;
  const isBg = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (isBg[p] || !isBgLike(p)) continue;
    isBg[p] = 1;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }

  // 2. Trim to the item, square, with a pixel of room on each side for the outline.
  let [x0, y0, x1, y1] = [W, H, -1, -1];
  for (let p = 0; p < W * H; p++) {
    if (isBg[p]) continue;
    const x = p % W;
    const y = (p - x) / W;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 < 0) throw new Error('no item found in the picture');
  const side = (Math.max(x1 - x0, y1 - y0) + 1) * (size / (size - 2));
  const left = (x0 + x1 + 1) / 2 - side / 2;
  const top = (y0 + y1 + 1) / 2 - side / 2;
  const cell = side / size;

  // 3. Average the item's pixels in each cell; a cell is solid when the item covers at least half of it.
  const cells: (Color | null)[] = [];
  for (let sy = 0; sy < size; sy++) {
    for (let sx = 0; sx < size; sx++) {
      let r = 0, g = 0, b = 0, n = 0, all = 0;
      for (let y = Math.floor(top + sy * cell); y < top + (sy + 1) * cell; y++) {
        for (let x = Math.floor(left + sx * cell); x < left + (sx + 1) * cell; x++) {
          all++;
          if (x < 0 || y < 0 || x >= W || y >= H || isBg[y * W + x]) continue;
          const i = (y * W + x) * 4;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
          n++;
        }
      }
      cells.push(n * 2 >= all && n > 0 ? [r / n, g / n, b / n] : null);
    }
  }

  // 4. A few flat colours: k-means seeded across the brightness range, then snapped to the palette if there is one.
  const solid = cells.filter((c): c is Color => c !== null);
  const byLuma = [...solid].sort((a, b) => luma(a) - luma(b));
  let centers: Color[] = Array.from({ length: Math.min(colors, solid.length) }, (_, k) => [...byLuma[Math.floor(((k + 0.5) * byLuma.length) / colors)]] as Color);
  for (let round = 0; round < KMEANS_ROUNDS; round++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const c of solid) {
      const s = sums[nearestIndex(c, centers)];
      s[0] += c[0];
      s[1] += c[1];
      s[2] += c[2];
      s[3]++;
    }
    centers = sums.map((s, k) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[k]));
  }
  const fit = palette?.filter((c) => dist2(c, OUTLINE) > 0); // the outline colour is kept for the outline
  const shades: Rgb[] = centers.map((c) => (fit?.length ? fit[nearestIndex(c, fit)] : (c.map(Math.round) as Color)));
  const flat = cells.map((c) => (c ? shades[nearestIndex(c, centers)] : null));

  // 5. Outline: every empty pixel beside the item.
  const out = new PNG({ width: size, height: size });
  for (let p = 0; p < size * size; p++) {
    const x = p % size;
    const y = (p - x) / size;
    const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < size && ny < size && flat[ny * size + nx] !== null;
    });
    const c = flat[p] ?? (beside ? OUTLINE : null);
    if (c) out.data.set([c[0], c[1], c[2], 255], p * 4); // the rest stays transparent (zeroed)
  }
  return PNG.sync.write(out);
}
