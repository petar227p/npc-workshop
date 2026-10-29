import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { mockImageClient } from '../../models/image';
import { artPrompt, artView, createStudio, drawPrompt, toSprite, type ArtOwner } from '..';
import { KENNEY_PALETTE, OUTLINE } from '../palette';

// A render like Muse Image's: an off-white background with a cross-shaped "sword" in the middle, a light
// highlight inside the blade (must survive), and a light patch touching nothing (background, must go).
function render(size = 200): Buffer {
  const png = new PNG({ width: size, height: size });
  const paint = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) png.data.set([...c, 255], (y * size + x) * 4);
  };
  paint(0, 0, size, size, [237, 236, 231]);
  paint(90, 20, 110, 150, [140, 150, 170]); // blade
  paint(93, 40, 107, 130, [236, 236, 236]); // highlight, background-coloured but inside the blade (wider than a cell)
  paint(60, 150, 140, 160, [120, 70, 50]); // guard
  paint(95, 160, 105, 190, [90, 50, 40]); // grip
  return PNG.sync.write(png);
}

const pixels = (buf: Buffer) => {
  const { width, height, data } = PNG.sync.read(buf);
  const at = (x: number, y: number) => [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];
  return { width, height, at, all: Array.from({ length: width * height }, (_, p) => at(p % width, Math.floor(p / width))) };
};

describe('toSprite', () => {
  it('trims, shrinks to the grid, clears the background and outlines the item', () => {
    const s = pixels(toSprite(render(), { size: 32 }));
    expect([s.width, s.height]).toEqual([32, 32]);
    expect(s.at(0, 16)[3]).toBe(0); // left of the item: transparent
    expect(s.at(16, 0)).toEqual([...OUTLINE, 255]); // the item fills the height, so its top edge is outline
    const solid = s.all.filter((p) => p[3] === 255);
    expect(solid.length).toBeGreaterThan(40);
    // The item touches the outline everywhere: no solid colour borders a transparent pixel.
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const p = s.at(x, y);
        if (p[3] === 0 || p.slice(0, 3).join() === OUTLINE.join()) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = x + dx >= 0 && x + dx < 32 && y + dy >= 0 && y + dy < 32 ? s.at(x + dx, y + dy) : [0, 0, 0, 0];
          expect(n[3]).toBe(255);
        }
      }
    }
  });

  it('keeps light pixels inside the item', () => {
    const s = pixels(toSprite(render(), { size: 32, colors: 6 }));
    const lightest = Math.max(...s.all.filter((p) => p[3] === 255).map((p) => p[0] + p[1] + p[2]));
    expect(lightest).toBeGreaterThan(600); // the highlight stayed, it wasn't flood-filled away
  });

  it('uses at most the asked number of colours plus the outline, all from the palette when given', () => {
    const s = pixels(toSprite(render(), { size: 32, colors: 4, palette: KENNEY_PALETTE }));
    const used = new Set(s.all.filter((p) => p[3] === 255).map((p) => p.slice(0, 3).join()));
    expect(used.size).toBeLessThanOrEqual(5);
    const allowed = new Set(KENNEY_PALETTE.map((c) => c.join()));
    for (const c of used) expect(allowed.has(c)).toBe(true);
  });

  it('refuses a picture with nothing in it', () => {
    const blank = new PNG({ width: 50, height: 50 });
    blank.data.fill(240);
    expect(() => toSprite(PNG.sync.write(blank))).toThrow(/no item/);
  });
});

describe('artPrompt', () => {
  it("describes the accepted contract's item in pixel-art style", () => {
    const p = artPrompt({ item_name: 'Hammerhead Blade', item_type: 'sword', description: 'A broad blade.', materials_used: { iron: 3, sharkskin_leather: 1 } });
    expect(p).toMatch(/pixel art/i);
    expect(p).toMatch(/plain white background/);
    expect(p).toContain('a fantasy sword called "Hammerhead Blade". A broad blade. Made of iron, sharkskin leather.');
    expect(p).not.toMatch(/Art direction|reference/);
  });

  it("adds the seller's art between the fixed rules and the item", () => {
    const p = drawPrompt('a lantern', { style: 'soot-black iron, ember glow', references: ['data:image/png;base64,AA==', 'data:image/png;base64,AA=='] });
    expect(p).toMatch(/no hands\.\n\nArt direction: soot-black iron, ember glow\n\nMatch the look of the reference pictures: .* nothing else from them\.\n\nThe item: a lantern$/);
  });
});

describe('studio', () => {
  const contract = { kind: 'made_to_order' as const, contract_id: 'c_001', item_name: 'Hammerhead Blade', item_type: 'sword', description: 'A broad blade.', stats: { damage: 14, weight: 6, durability: 70 }, materials_used: { iron: 3 }, price: 120, delivery_ticks: 8, remarks: '' };
  const owner = (): ArtOwner => ({ art: new Map(), artRenders: 0 });

  it('renders once per contract and reports rendering, then ready', async () => {
    const client = mockImageClient([render()]);
    const o = owner();
    const studio = createStudio();
    const job = studio.start(o, contract, client);
    expect(artView(o.art)).toEqual({ c_001: { status: 'rendering', url: null } });
    expect(studio.start(o, contract, client)).toBeNull(); // already has one
    await job;
    expect(artView(o.art).c_001).toEqual({ status: 'ready', url: expect.stringMatching(/^\/api\/art\/[0-9a-f-]{36}\.png$/) });
    expect(client.prompts).toHaveLength(1);
    expect(client.prompts[0].strength).toBe('high');
  });

  it("draws in the seller's art, with its references", async () => {
    const client = mockImageClient([render()]);
    await createStudio().start(owner(), contract, client, { style: 'ember glow', references: ['data:image/png;base64,AA=='] });
    expect(client.prompts[0].prompt).toContain('Art direction: ember glow');
    expect(client.prompts[0].references).toEqual(['data:image/png;base64,AA==']);
  });

  it('a failed render leaves the placeholder', async () => {
    const o = owner();
    await createStudio().start(o, contract, mockImageClient([new Error('content_policy_violation')]));
    expect(artView(o.art).c_001).toEqual({ status: 'unavailable', url: null });
  });

  it('no client or a used-up cap means no render, and a new gallery keeps the count', () => {
    const studio = createStudio({ perSession: 1 });
    const o = owner();
    expect(studio.start(o, contract, null)).toBeNull();
    expect(artView(o.art).c_001.status).toBe('unavailable');

    const p = owner();
    expect(studio.start(p, contract, mockImageClient([render()]))).not.toBeNull();
    p.art = new Map(); // a new game
    expect(studio.start(p, contract, mockImageClient([render()]))).toBeNull();
    expect(p.artRenders).toBe(1);
  });

  it('caps renders per minute across everyone', () => {
    let t = 0;
    const studio = createStudio({ perMinute: 2, now: () => t });
    const c = (id: string) => ({ ...contract, contract_id: id });
    const o = owner();
    const client = mockImageClient([render(), render(), render()]);
    expect(studio.start(o, c('a'), client)).not.toBeNull();
    expect(studio.start(o, c('b'), client)).not.toBeNull();
    expect(studio.start(o, c('c'), client)).toBeNull();
    t = 61_000;
    expect(studio.start(o, c('d'), client)).not.toBeNull();
  });
});
