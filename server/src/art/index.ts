import { randomUUID } from 'node:crypto';
import type { Contract, ItemArt } from '@blacksmith/shared';
import type { ImageClient, ImageStrength } from '../models/image';
import { KENNEY_PALETTE } from './palette';
import { artPrompt } from './prompt';
import { toSprite } from './sprite';

export { artPrompt } from './prompt';
export { toSprite, type SpriteOptions } from './sprite';

// Item pictures sit beside the ledger, never in it: the engine stays pure and a failed render changes nothing
// but the picture. A render starts when work starts and runs in the background; the sprite is kept in memory.
// Each picture gets its own id in its URL, so a new game's c_001 never shows the old game's cached sword.

export type ArtEntry = { id: string; status: ItemArt['status']; png: Buffer | null };
export type Gallery = Map<string, ArtEntry>; // by contract id, one per session (replaced on a new game)
// The render count lives on the session, not the gallery, so starting a new game doesn't reset the cap.
export type ArtOwner = { art: Gallery; artRenders: number };

export type StudioLimits = { perSession?: number; perMinute?: number; strength?: ImageStrength; now?: () => number };

export function createStudio(limits: StudioLimits = {}) {
  const { perSession = 12, perMinute = 60, strength = 'high', now = Date.now } = limits;
  let recent: number[] = []; // renders started in the last minute, across all visitors

  return {
    // Starts the picture for a made-to-order contract unless it has one, or the caps say no (then it stays a placeholder).
    // Goods from stock get no picture. Returns the render so tests can wait for it; routes don't.
    start(owner: ArtOwner, contract: Contract, client: ImageClient | null): Promise<void> | null {
      if (contract.kind !== 'made_to_order') return null;
      const gallery = owner.art;
      if (gallery.has(contract.contract_id)) return null;
      const entry: ArtEntry = { id: randomUUID(), status: 'unavailable', png: null };
      gallery.set(contract.contract_id, entry);
      const t = now();
      recent = recent.filter((at) => t - at < 60_000);
      if (!client || owner.artRenders >= perSession || recent.length >= perMinute) return null;

      recent.push(t);
      owner.artRenders += 1;
      entry.status = 'rendering';
      return client
        .generate({ prompt: artPrompt(contract), strength })
        .then(({ png }) => {
          entry.png = toSprite(png, { palette: KENNEY_PALETTE });
          entry.status = 'ready';
        })
        .catch((err: Error) => {
          console.error(`item picture for ${contract.contract_id} failed: ${err.message}`);
          entry.status = 'unavailable';
        });
    },
  };
}

export const artUrl = (e: ArtEntry) => `/api/art/${e.id}.png`;

export function artView(gallery: Gallery): Record<string, ItemArt> {
  return Object.fromEntries([...gallery].map(([contractId, e]) => [contractId, { status: e.status, url: e.status === 'ready' ? artUrl(e) : null }]));
}
