import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { draftKey, parseNpcBundle, type ApiConnection } from '@blacksmith/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionState, pollConnection, readConnection, SecureContextError, snapshotHash, VerificationError, verificationFailure } from '../connectionStatus';

const parsed = parseNpcBundle(readFileSync(new URL('../../../docs/workshop-game-integration-task-2/browser-export.npc.json', import.meta.url), 'utf8'));
if (!parsed.ok) throw new Error('Invalid fixture');
const npc = parsed.bundle.npc;
const data = (): ApiConnection => ({ world_id: 'w_123', busy: false, calls_left: 150, npcs: [{ id: npc.id, name: npc.name, snapshot: 'hash', first_reply: null, last_say: null }] });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('connection verification and bounded polling', () => {
  it('matches browser and server SHA-256 for the complete normalized bundle', async () => {
    expect(await snapshotHash(npc)).toBe(`sha256:${createHash('sha256').update(draftKey(npc)).digest('hex')}`);
    const changed = structuredClone(npc); changed.persona += 'Changed';
    expect(await snapshotHash(changed)).not.toBe(await snapshotHash(npc));
  });
  it('explains the secure-context requirement and stops polling when hashing is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    await expect(snapshotHash(npc)).rejects.toBeInstanceOf(SecureContextError);
    expect(verificationFailure(new SecureContextError()).message).toContain('localhost or over HTTPS');
    vi.useFakeTimers();
    const read = vi.fn(() => snapshotHash(npc).then(() => connectionState(data(), npc.id, 'hash')));
    const stop = pollConnection(read, vi.fn());
    await vi.runAllTimersAsync();
    expect(read).toHaveBeenCalledTimes(1);
    stop();
  });
  it('requires both matching NPC identity and matching snapshot before awarding a real reply', () => {
    const d = data();
    expect(connectionState(d, npc.id, 'hash').state).toBe('created');
    d.npcs[0].first_reply = { event_id: 'e_001', at: new Date().toISOString() };
    expect(connectionState(d, npc.id, 'hash')).toMatchObject({ state: 'reply', message: expect.stringContaining('Your game connected') });
    expect(connectionState(d, npc.id, 'other').state).toBe('mismatch');
    expect(connectionState(d, 'other', 'hash').state).toBe('mismatch');
  });
  it('distinguishes provider, quota, fallback, busy and historical reply evidence', () => {
    const d = data();
    d.npcs[0].last_say = 'unavailable'; expect(connectionState(d, npc.id, 'hash').state).toBe('unavailable');
    d.npcs[0].last_say = 'fallback'; expect(connectionState(d, npc.id, 'hash').message).toContain('fallback does not count');
    d.calls_left = 0; expect(connectionState(d, npc.id, 'hash').message).toContain('no model calls left');
    d.calls_left = 1; d.busy = true; expect(connectionState(d, npc.id, 'hash').message).toContain('waiting');
    d.npcs[0].first_reply = { event_id: 'e_001', at: 'now' }; d.npcs[0].last_say = 'unavailable';
    expect(connectionState(d, npc.id, 'hash')).toMatchObject({ state: 'reply', message: expect.stringContaining('latest request was unavailable') });
  });
  it.each([[401, 'refused'], [404, 'not restored'], [429, 'Wait a minute'], [503, 'server availability'], [0, 'network']])('has actionable %s recovery', (status, text) => {
    expect(verificationFailure(new VerificationError(status))).toMatchObject({ state: 'unavailable', message: expect.stringContaining(text) });
  });
  it('keeps credentials out of URLs/body/referrers, disables caches and redirects, and sends only bearer auth', async () => {
    const fetcher = vi.fn(async () => Response.json(data())); vi.stubGlobal('fetch', fetcher);
    await readConnection('http://localhost:8787', 'w_123', 'private_token', new AbortController().signal);
    expect(fetcher.mock.calls[0]).toMatchObject(['http://localhost:8787/api/v1/worlds/w_123/connection', { headers: { Authorization: 'Bearer private_token' }, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' }]);
  });
  it('never displays a server error body that could echo credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'private_token' }, { status: 401 })));
    await expect(readConnection('http://localhost', 'w_123', 'private_token', new AbortController().signal)).rejects.toMatchObject({ status: 401, message: 'Connection check failed' });
  });
  it('fails closed for wrong-world and malformed status responses', async () => {
    for (const body of [{ ...data(), world_id: 'other' }, { ...data(), npcs: [{}] }]) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
      await expect(readConnection('http://localhost', 'w_123', 'secret', new AbortController().signal)).rejects.toThrow();
    }
  });
  it('bounds retrying all active states at six checks and allows a new manual retry', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => connectionState(data(), npc.id, 'hash')); const update = vi.fn();
    const stop = pollConnection(read, update);
    await vi.runAllTimersAsync();
    expect(read).toHaveBeenCalledTimes(6); expect(update.mock.calls.at(-1)?.[1]).toBe(true);
    stop(); const retry = pollConnection(read, update); await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(7); retry();
  });
  it.each([401, 404])('stops automatically on HTTP %s', async (code) => {
    vi.useFakeTimers(); const read = vi.fn(async () => { throw new VerificationError(code); });
    const stop = pollConnection(read, vi.fn()); await vi.runAllTimersAsync();
    expect(read).toHaveBeenCalledTimes(1); stop();
  });
  it('bounds transient failures and stops immediately for mismatches', async () => {
    vi.useFakeTimers(); const update = vi.fn();
    const read = vi.fn(async () => { throw new Error('offline'); });
    const stop = pollConnection(read, update); await vi.runAllTimersAsync(); expect(read).toHaveBeenCalledTimes(6); stop();
    const mismatch = vi.fn(async () => connectionState(data(), npc.id, 'different'));
    const cancel = pollConnection(mismatch, update); await vi.runAllTimersAsync(); expect(mismatch).toHaveBeenCalledTimes(1); cancel();
  });
  it('aborts pending reads on leaving/reset and suppresses stale updates', async () => {
    vi.useFakeTimers(); const update = vi.fn();
    let finish!: (value: ReturnType<typeof connectionState>) => void;
    let signal!: AbortSignal;
    const stop = pollConnection((s) => { signal = s; return new Promise((resolve) => { finish = resolve; }); }, update);
    stop(); expect(signal.aborted).toBe(true);
    finish(connectionState(data(), npc.id, 'hash')); await vi.runAllTimersAsync(); expect(update).not.toHaveBeenCalled();
  });
});
