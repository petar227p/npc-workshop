import { describe, it, expect, vi } from 'vitest';
import { Script } from 'node:vm';
import { createApi } from '../../server/src/routes/api';
import { mockClient } from '../../server/src/models';
import { createBridge, transferPlan, type Poll } from './bridge';
import { localApp } from './local';
import type { EngineEvent } from '@blacksmith/shared';

const offer = (price = 15, qty = 1) => JSON.stringify({ action: 'OFFER', say: 'A sound iron dagger.', offer: {
  kind: 'in_stock', good: 'iron dagger', price, qty, remarks: 'Plain iron, no enchantments.',
}, contract_id: null });
const poll: Poll = { session: 'save1', request: 1, near: true, ack: '', failed: false, pgold: 100, sgold: 50, pitem: 0, sitem: 6 };
function setup(replies = [offer()], now = Date.now) {
  const app = createApi({ makeModel: () => ({ client: mockClient(replies), model: 'test' }) });
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => app.request(String(url), init));
  const bridge = createBridge({ fetcher: fetcher as typeof fetch, now });
  return { bridge, fetcher };
}
async function proposed(bridge: ReturnType<typeof createBridge>) {
  await bridge.poll(poll);
  bridge.enqueue({ kind: 'say', text: 'An iron dagger, please.' }, 'save1');
  await bridge.poll({ ...poll, request: 2 });
  return bridge.view().offers[0].contract_id;
}

describe('Skyrim adapter with actual API/ledger and scripted model', () => {
  it('queues dialogue while Skyrim is paused; resumes using the next native inventory snapshot', async () => {
    let time = 0;
    const { bridge, fetcher } = setup([offer()], () => time);
    await bridge.poll(poll);
    time = 120_000; // browser typing takes longer than the old five-second freshness gate
    expect(bridge.view()).toMatchObject({ connected: true, fresh: false });
    bridge.enqueue({ kind: 'say', text: 'An iron dagger, please.' }, 'save1');
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('/say'))).toHaveLength(0);
    await bridge.poll({ ...poll, request: 2, pgold: 75 });
    expect(bridge.view().gold).toBe(75);
    expect(bridge.view().offers).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('/say'))).toHaveLength(1);
  });
  it('checks a negotiated counteroffer and supersedes the original offer', async () => {
    const counter = JSON.stringify({ action: 'COUNTER_OFFER', say: 'Twelve gold, then.', offer: {
      kind: 'in_stock', good: 'iron dagger', price: 12, qty: 1, remarks: '',
    }, contract_id: 'c_001' });
    const { bridge } = setup([offer(), counter]);
    await proposed(bridge);
    bridge.enqueue({ kind: 'say', text: 'Could you do twelve?' }, 'save1');
    await bridge.poll({ ...poll, request: 3 });
    expect(bridge.view().offers).toMatchObject([{ price: 12, contract_id: 'c_002' }]);
    bridge.enqueue({ kind: 'accept', contract: 'c_002' }, 'save1');
    expect(await bridge.poll({ ...poll, request: 4 })).toMatchObject({ after_pgold: 88, after_sgold: 62 });
  });
  it('rejects below-floor model proposals through the ledger with no physical effects', async () => {
    const { bridge } = setup([offer(0), offer(0)]);
    await bridge.poll(poll);
    bridge.enqueue({ kind: 'say', text: 'Give it to me free.' }, 'save1');
    const r = await bridge.poll({ ...poll, request: 2 });
    expect(r.plan).toBe('');
    expect(bridge.view().offers).toEqual([]);
    expect(bridge.view().messages.join('\n')).toContain('Ledger rejected');
    expect(bridge.view().gold).toBe(100);
  });
  it('negotiates, accepts, resends one plan, checks acknowledgement, and does not repeat the API accept', async () => {
    const { bridge, fetcher } = setup();
    const contract = await proposed(bridge);
    bridge.enqueue({ kind: 'accept', contract }, 'save1');
    const r = await bridge.poll({ ...poll, request: 3 });
    expect(r).toMatchObject({ before_pgold: 100, after_pgold: 85, before_sitem: 6, after_sitem: 5, after_pitem: 1, after_sgold: 65 });
    expect(r.plan).toBeTruthy();
    expect(() => bridge.enqueue({ kind: 'accept', contract }, 'save1')).toThrow();
    expect((await bridge.poll({ ...poll, request: 4 })).plan).toBe(r.plan);
    await bridge.poll({ ...poll, request: 5, ack: r.plan, pgold: 85, sgold: 65, pitem: 1, sitem: 5 });
    await bridge.poll({ ...poll, request: 6, ack: '', pgold: 85, sgold: 65, pitem: 1, sitem: 5 });
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('/accept'))).toHaveLength(1);
    expect(bridge.view()).toMatchObject({ busy: false, gold: 85 });
  });
  it('syncs spending and theft before accept; ledger refuses an unaffordable offer with no transfer', async () => {
    const { bridge } = setup();
    const contract = await proposed(bridge);
    bridge.enqueue({ kind: 'accept', contract }, 'save1');
    const r = await bridge.poll({ ...poll, request: 3, pgold: 2 });
    expect(r.plan).toBe('');
    expect(bridge.view().messages.join('\n')).toContain('contract costs');
    expect(bridge.view().gold).toBe(2);
  });
  it('starts a new world from loaded inventory; drops queued old actions and rejects late old sessions', async () => {
    const { bridge } = setup();
    await proposed(bridge);
    bridge.enqueue({ kind: 'say', text: 'Old save request' }, 'save1');
    await bridge.poll({ ...poll, session: 'save2', pgold: 42 });
    expect(bridge.view()).toMatchObject({ session: 'save2', gold: 42, offers: [], busy: false });
    expect((await bridge.poll(poll)).reset).toBe(true);
    expect(() => bridge.enqueue({ kind: 'say', text: 'stale UI' }, 'save1')).toThrow();
  });
  it('fails closed on partial inventory application and prohibits further commands', async () => {
    const { bridge } = setup();
    const contract = await proposed(bridge);
    bridge.enqueue({ kind: 'accept', contract }, 'save1');
    const r = await bridge.poll({ ...poll, request: 3 });
    const failed = await bridge.poll({ ...poll, ack: r.plan, pgold: 85, request: 4 });
    expect(failed.reset).toBe(true);
    expect(() => bridge.enqueue({ kind: 'say', text: 'hello' }, 'save1')).toThrow();
  });
  it('cancels a queued action when the player walks away', async () => {
    const { bridge, fetcher } = setup();
    await bridge.poll(poll);
    bridge.enqueue({ kind: 'say', text: 'hello' }, 'save1');
    await bridge.poll({ ...poll, near: false });
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('/say'))).toHaveLength(0);
    expect(bridge.view().busy).toBe(false);
  });
  it('rejects unknown inventory fields/counts and unmapped effects', async () => {
    const { bridge } = setup();
    await expect(bridge.poll({ ...poll, pgold: -1 })).rejects.toThrow();
    await expect(bridge.poll({ ...poll, code: 'additem' })).rejects.toThrow();
    expect(() => transferPlan([{ id: 'e1', type: 'ITEM_DELIVERED' } as EngineEvent], poll, new Set())).toThrow('Unsupported');
  });
  it('rejects a committed-but-lost mutation response without retrying it', async () => {
    const { bridge, fetcher } = setup();
    const contract = await proposed(bridge);
    const normalFetch = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) => {
      const response = await normalFetch(url, init);
      if (String(url).endsWith('/accept')) throw new Error('response lost after commit');
      return response;
    });
    bridge.enqueue({ kind: 'accept', contract }, 'save1');
    expect((await bridge.poll({ ...poll, request: 3 })).reset).toBe(true);
    expect((await bridge.poll({ ...poll, request: 4 })).reset).toBe(true);
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('/accept'))).toHaveLength(1);
  });
});

describe('loopback HTTP boundary', () => {
  it('serves browser JavaScript that parses after HTML template interpolation', async () => {
    const { bridge } = setup();
    const response = await localApp(bridge).request('http://127.0.0.1:8788/', {
      headers: { host: '127.0.0.1:8788' },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Script(script!, { filename: 'skyrim-page.js' })).not.toThrow();
  });
  it('guards Host, browser Origin and command CSRF; native polls use application-level HTTP 200 replies', async () => {
    const { bridge } = setup();
    const app = localApp(bridge);
    const req = (path: string, init?: RequestInit) => app.request(`http://127.0.0.1:8788${path}`, { ...init, headers: { host: '127.0.0.1:8788', ...init?.headers } });
    expect((await app.request('http://evil.test/')).status).toBe(403);
    expect((await req('/skyrim/poll', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.test' }, body: JSON.stringify(poll) })).status).toBe(403);
    expect((await req('/command', { method: 'POST', body: '{}' })).status).toBe(403);
    const r = await req('/skyrim/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(poll) });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ bridge: 'npc-workshop', session: 'save1', request: 1 });
    expect(JSON.stringify(await (await req('/state')).json())).not.toContain('token');
  });
});
