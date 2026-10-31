import type { NpcDraft } from './npc-info';

// Stable identity for the complete normalized configuration, independent of JSON key order.
// Callers hash this UTF-8 string with SHA-256 (Node crypto / browser SubtleCrypto).
export function draftKey(draft: NpcDraft): string {
  const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, ordered(v)]))
    : value;
  return JSON.stringify(ordered(draft));
}

export type ApiConnection = {
  world_id: string;
  busy: boolean;
  calls_left: number;
  npcs: {
    id: string;
    name: string;
    snapshot: string; // sha256:<hex>, complete draft before runtime start overrides
    first_reply: { event_id: string; at: string } | null;
    last_say: 'reply' | 'unavailable' | 'fallback' | 'no_reply' | null;
  }[];
};
