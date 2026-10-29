import type { MadeToOrderTerms, NpcArt } from '@blacksmith/shared';

// The picture is of the contract the ledger accepted, not of what anyone said: the prompt is built by code from
// its terms. The style words make Muse Image draw pixel art on a plain background, which the sprite step needs.
const STYLE =
  'Pixel art game item sprite, 16-bit retro style, bright clear colours with highlights, thick dark outline, flat shading, ' +
  'limited palette. One item only, centered on a plain white background, the whole item visible, no text, no hands.';

export function artPrompt(c: Pick<MadeToOrderTerms, 'item_name' | 'item_type' | 'description' | 'materials_used'>, art?: NpcArt): string {
  const materials = Object.keys(c.materials_used).map((m) => m.replace(/_/g, ' '));
  const made = materials.length ? ` Made of ${materials.join(', ')}.` : '';
  return drawPrompt(`a fantasy ${c.item_type} called "${c.item_name}". ${c.description.slice(0, 400)}${made}`, art);
}

// The NPC's art goes between the fixed rules and the item: it changes how the item looks, and the item is still the
// last word. References get a line of their own, or the render tends to redraw what is in them.
export function drawPrompt(item: string, art?: NpcArt): string {
  const style = art?.style ? `\n\nArt direction: ${art.style}` : '';
  const n = art?.references.length ?? 0;
  const refs = n > 0
    ? `\n\nMatch the look of the reference picture${n > 1 ? 's' : ''}: palette, shading, outlines and level of detail. Draw only the item below, nothing else from ${n > 1 ? 'them' : 'it'}.`
    : '';
  return `${STYLE}${style}${refs}\n\nThe item: ${item}`;
}
