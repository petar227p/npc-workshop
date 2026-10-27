import type { Contract } from '@blacksmith/shared';

// The picture is of the contract the ledger accepted, not of what anyone said: the prompt is built by code from
// its terms. The style words make Muse Image draw pixel art on a plain background, which the sprite step needs.
const STYLE =
  'Pixel art game item sprite, 16-bit retro style, bright clear colours with highlights, thick dark outline, flat shading, ' +
  'limited palette. One item only, centered on a plain white background, the whole item visible, no text, no hands.';

export function artPrompt(c: Pick<Contract, 'item_name' | 'item_type' | 'description' | 'materials_used'>): string {
  const materials = Object.keys(c.materials_used).map((m) => m.replace(/_/g, ' '));
  const made = materials.length ? ` Made of ${materials.join(', ')}.` : '';
  return `${STYLE}\n\nThe item: a fantasy ${c.item_type} called "${c.item_name}". ${c.description.slice(0, 400)}${made}`;
}
