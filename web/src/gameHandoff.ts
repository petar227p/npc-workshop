import type { BenchResponse, NpcDraft } from '@blacksmith/shared';

export { draftKey } from '@blacksmith/shared/src/snapshot';

export type HandoffSnapshot = { npc: NpcDraft; filename: string; sourceKey: string };

// A direct bench conversation must contain an accepted model answer and an NPC spoken line.
// Only the /say handler uses this; configuration checks, controlled tests and timers cannot earn it.
export function hasModelReply(result: BenchResponse, npcId: string): boolean {
  return result.ok && result.outcome === 'acted' && result.attempts.some((attempt) => attempt.ok)
    && result.events.some((event) => event.type === 'SAID' && event.actor === npcId && event.target === 'player');
}

// Commands are copied into a terminal. Quote every argument as data, including user-entered paths.
const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
export function gameExampleCommand(server: string, file: string): { ok: true; command: string } | { ok: false; error: string } {
  let url: URL;
  try { url = new URL(server); } catch { return { ok: false, error: 'Enter a full server URL, such as http://localhost:8787.' }; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    return { ok: false, error: 'Use the server origin only, without /api/v1, credentials, a query or fragment.' };
  }
  if (!file.trim() || /[\r\n\0]/.test(file)) return { ok: false, error: 'Enter the path to your downloaded NPC JSON file on one line.' };
  return { ok: true, command: `npm run game-example -- --server ${quote(url.origin)} --bundle ${quote(file.trim())} --interactive` };
}
