import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../../server/src/routes/api';
import { mockClient } from '../../server/src/models';
import { createBridge } from './bridge';
import { localApp } from './local';
import { spikePoll } from './spike';

const poll = { session: 'spike-save', request: 1, near: true, ack: '', failed: false,
  pgold: 100, sgold: 50, pitem: 0, sitem: 6,
  menu: 'npc-workshop-menu-spike', generation: 1, probe_text: '' };
function setup() {
  const api = createApi({ makeModel: () => ({ model: 'test', client: mockClient([JSON.stringify({
    action: 'OFFER', say: 'Fifteen gold.', offer: { kind: 'in_stock', good: 'iron dagger', price: 15, qty: 1, remarks: '' }, contract_id: null,
  })]) }) });
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => api.request(String(url), init));
  const bridge = createBridge({ fetcher: fetcher as typeof fetch });
  return { bridge, fetcher, app: localApp(bridge) };
}

describe('menu feasibility transport', () => {
  it('preserves text as typed data and exposes nested dictionaries/arrays without world credentials', async () => {
    const { bridge, fetcher } = setup();
    const text = '"quoted"\nčćžšđ <b>plain text</b> | \\';
    const reply = await spikePoll(bridge, { ...poll, probe_text: text });
    expect(reply).toMatchObject({ bridge: 'npc-workshop', session: poll.session, request: 1, generation: 1,
      probe: { echo: text, strings: [text, expect.any(String)], nested: { label: 'nested-ok' }, rows: [{ id: 1, text }, { id: 2, text: 'row-ok' }] } });
    expect(JSON.stringify(reply)).not.toMatch(/token|authorization|world_id/);
    expect(fetcher).toHaveBeenCalledTimes(1); // creating the existing world, no say/accept
  });

  it('rejects command injection and oversized probe text before calling the API', async () => {
    const { bridge, fetcher } = setup();
    await expect(spikePoll(bridge, { ...poll, command: { kind: 'accept', contract: 'c_001' } })).rejects.toThrow();
    await expect(spikePoll(bridge, { ...poll, probe_text: 'a'.repeat(501) })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the existing checked plan and acknowledges one browser-admitted trade across menu generations', async () => {
    const { bridge, fetcher } = setup();
    await spikePoll(bridge, poll);
    bridge.enqueue({ kind: 'say', text: 'One dagger.' }, poll.session);
    await spikePoll(bridge, { ...poll, request: 2 });
    const contract = bridge.view().offers[0].contract_id;
    bridge.enqueue({ kind: 'accept', contract }, poll.session);
    const trade = await spikePoll(bridge, { ...poll, request: 3 });
    expect(trade).toMatchObject({ before_pgold: 100, after_pgold: 85, after_pitem: 1 });
    expect(trade.plan).not.toBe('');
    expect(bridge.view().messages).not.toContain('Skyrim confirmed the gold and item transfer.');
    const repeated = await spikePoll(bridge, { ...poll, generation: 2, request: 4 });
    expect(repeated.plan).toBe(trade.plan);
    const acknowledged = await spikePoll(bridge, { ...poll, generation: 2, request: 5, ack: trade.plan, pgold: 85, sgold: 65, pitem: 1, sitem: 5 });
    expect(acknowledged.message).toBe('Skyrim confirmed the gold and item transfer.');
    expect(bridge.view()).toMatchObject({ busy: false, gold: 85 });
    expect(bridge.view().messages).toContain('Skyrim confirmed the gold and item transfer.');
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/accept'))).toHaveLength(1);
  });

  it('keeps session retirement independent of menu generations', async () => {
    const { bridge } = setup();
    await spikePoll(bridge, poll);
    await spikePoll(bridge, { ...poll, session: 'new-save', generation: 8 });
    expect(await spikePoll(bridge, { ...poll, generation: 99 })).toMatchObject({ reset: true, session: poll.session, generation: 99 });
    expect(bridge.view()).toMatchObject({ session: 'new-save' });
  });

  it('restricts the probe route to native JSON and returns a correlated recovery reply on invalid input', async () => {
    const { app } = setup();
    const request = (body: unknown, headers = {}) => app.request('http://127.0.0.1:8788/skyrim/spike/poll', {
      method: 'POST', headers: { host: '127.0.0.1:8788', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    expect((await request(poll, { origin: 'http://127.0.0.1:8788' })).status).toBe(403);
    expect((await request(poll, { host: 'evil.example:8788' })).status).toBe(403);
    expect(await (await request({ ...poll, probe_text: 'a'.repeat(501) })).json()).toMatchObject({
      session: poll.session, request: 1, generation: 1, reset: true, plan: '',
    });
    expect(await (await request(poll)).json()).toMatchObject({ session: poll.session, generation: 1, probe: { echo: '' } });
  });
});
