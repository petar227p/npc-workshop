import type { ApiConnection, NpcDraft } from '@blacksmith/shared';
import { draftKey } from '@blacksmith/shared/src/snapshot';

export type Verification = { state: 'not_connected' | 'created' | 'reply' | 'unavailable' | 'mismatch'; message: string };
export const NOT_CONNECTED: Verification = { state: 'not_connected', message: 'Enter the world ID and token from the example’s local verification page.' };

export async function snapshotHash(npc: NpcDraft): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(draftKey(npc)));
  return `sha256:${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function connectionState(data: ApiConnection, npc: string, expected: string): Verification {
  const matched = data.npcs.find((n) => n.id === npc);
  if (!matched || matched.snapshot !== expected) return { state: 'mismatch', message: 'This world uses a different character configuration. Download this copy and run the example again, then enter the new world ID and token. Existing worlds keep their original settings.' };
  if (matched.first_reply) return { state: 'reply', message: `Your game connected. A matching character received an external reply (${matched.first_reply.event_id}).${matched.last_say === 'unavailable' ? ' The latest request was unavailable; check the provider or quota before continuing.' : ''}` };
  if (matched.last_say === 'unavailable') return { state: 'unavailable', message: 'World found, but the model could not reply. Check the provider key, provider availability and call quota, then send a message in the example again.' };
  if (data.calls_left === 0) return { state: 'unavailable', message: 'This world has no model calls left. Run the example again to create a fresh world, then enter its new credentials.' };
  return { state: 'created', message: data.busy ? 'Matching world found; waiting for its reply.' : matched.last_say === 'fallback'
    ? 'Matching world found, but the proposals were rejected. A fallback does not count. Send another message in the example.'
    : 'Matching world found. Send a message in the example and wait for a successful spoken reply. Workshop tests and timer activity do not count.' };
}

export class VerificationError extends Error {
  constructor(public status: number) { super('Connection check failed'); }
}
export function verificationFailure(error: unknown): Verification {
  const status = error instanceof VerificationError ? error.status : 0;
  return { state: 'unavailable', message: status === 401
    ? 'The world ID or token was refused. Copy both from the same example’s local verification page and retry.'
    : status === 404 ? 'World unavailable or expired. A restart or eviction removes it. Run the example again with your NPC file and enter the new credentials; old conversations and inventory are not restored.'
    : status === 429 ? 'The server is at its request limit. Wait a minute, then retry.'
    : 'Cannot check this world. Check the server URL, server availability and network, then retry. Your Workshop draft and conversation are kept.' };
}

export async function readConnection(server: string, id: string, token: string, signal: AbortSignal): Promise<ApiConnection> {
  const res = await fetch(`${server}/api/v1/worlds/${encodeURIComponent(id)}/connection`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
  });
  if (!res.ok) throw new VerificationError(res.status);
  const data: ApiConnection = await res.json();
  if (data.world_id !== id || !Array.isArray(data.npcs) || !data.npcs.every((n) => typeof n.id === 'string' && typeof n.snapshot === 'string'
    && (n.first_reply === null || (typeof n.first_reply?.event_id === 'string' && typeof n.first_reply?.at === 'string')))) throw new Error('Invalid status');
  return data;
}

// One immediate read plus five bounded follow-ups. Cleanup aborts an in-flight request and all timers.
export function pollConnection(read: (signal: AbortSignal) => Promise<Verification>, update: (result: Verification, done: boolean) => void): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  const run = async () => {
    let result: Verification;
    let terminal = false;
    try { result = await read(controller.signal); terminal = result.state === 'mismatch'; }
    catch (error) {
      result = verificationFailure(error);
      terminal = error instanceof VerificationError && [401, 404].includes(error.status);
    }
    if (controller.signal.aborted) return;
    const done = terminal || ++attempts >= 6;
    update(result, done);
    if (!done) timer = setTimeout(() => void run(), 3000);
  };
  void run();
  return () => { controller.abort(); clearTimeout(timer); };
}
