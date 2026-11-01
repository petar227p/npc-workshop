import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../../server/src/routes/api';
import { mockClient } from '../../server/src/models';
import { createBridge, NativeReply } from './bridge';
import { localApp } from './local';

const poll = { version: 2, session: 'native-save', request: 1, generation: 1, near: true,
  ack: '', failed: false, pgold: 100, sgold: 50, pitem: 0, sitem: 6 };
const say = { id: 'cmd-1', kind: 'say', text: 'Two daggers, please.' };
const offer = JSON.stringify({ action: 'OFFER', say: 'Thirty gold for two.',
  offer: { kind: 'in_stock', good: 'iron_dagger', qty: 2, price: 30, remarks: '' }, contract_id: null });
function setup(replies = [offer]) {
  const api = createApi({ makeModel: () => ({ model: 'test', client: mockClient(replies) }) });
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => api.request(String(url), init));
  const bridge = createBridge({ fetcher: fetcher as typeof fetch });
  const calls = (action: string) => fetcher.mock.calls.filter(([url]) => String(url).endsWith(`/${action}`)).length;
  const send = (request: number, extra = {}) => bridge.pollV2({ ...poll, request, ...extra });
  return { bridge, fetcher, calls, send };
}

describe('native UI protocol v2 with the real API and ledger', () => {
  it('accepts Papyrus-pooled enum casing without changing message text or bypassing deduplication', async () => {
    const { send, calls } = setup();
    await send(1);
    const text = 'MiXeD CASE čćžšđ';
    const reply = await send(2, { command: { ...say, kind: 'SAY', text } });
    expect(reply.ui.command.state).toBe('completed');
    expect(reply.ui.messages.some(m => m.role === 'player' && m.text === text)).toBe(true);
    await send(3, { command: { ...say, kind: 'Say', text } });
    expect(calls('say')).toBe(1);
    const o = reply.ui.offers[0];
    expect((await send(4, { command: { id: 'buy-case', kind: 'AcCePt', contract: o.contract, revision: o.revision } })).plan).not.toBe('');
    expect(calls('accept')).toBe(1);
    await expect(send(5, { command: { ...say, id: 'bad-kind', kind: 'RunConsole' } })).rejects.toThrow();
  });
  it('deduplicates commands and keeps snapshot/message/offer revisions stable on unchanged polls', async () => {
    const { send, calls } = setup();
    await send(1);
    const first = await send(2, { command: say });
    const duplicate = await send(3, { generation: 2, command: say });
    expect(first.ui.command).toEqual({ id: say.id, state: 'completed', code: 'completed' });
    expect(duplicate.ui).toEqual(first.ui);
    expect(calls('say')).toBe(1);
    expect(first.ui.offers).toMatchObject([{ item: 'iron dagger', quantity: 2, unit_price: 15, total_price: 30 }]);
    expect(first.ui.messages.some(m => m.role === 'player' && m.text === say.text)).toBe(true);
    expect(new Set(first.ui.messages.map(m => m.id)).size).toBe(first.ui.messages.length);
    const conflict = await send(4, { command: { ...say, text: 'Different intent.' } });
    expect(conflict.ui.command.code).toBe('command_id_conflict');
    expect(calls('say')).toBe(1);
  });

  it('rejects stale terms before API mutation and confirms delivery only after matching inventory acknowledgement', async () => {
    const { send, calls } = setup();
    await send(1);
    const proposal = await send(2, { command: say });
    const o = proposal.ui.offers[0];
    const stale = await send(3, { command: { id: 'stale', kind: 'accept', contract: o.contract, revision: o.revision + 1 } });
    expect(stale.ui).toMatchObject({ status: 'offer_rejected', command: { state: 'rejected', code: 'stale_offer' } });
    expect(calls('accept')).toBe(0);
    const accept = { id: 'buy', kind: 'accept', contract: o.contract, revision: o.revision };
    const trade = await send(4, { command: accept });
    expect(trade.ui).toMatchObject({ status: 'transfer_pending', busy: true, gold: 100 });
    expect(trade).toMatchObject({ after_pgold: 70, after_sgold: 80, after_pitem: 2, after_sitem: 4 });
    const duplicate = await send(5, { generation: 2, command: accept });
    expect(duplicate.plan).toBe(trade.plan);
    const ack = await send(6, { generation: 2, ack: trade.plan, pgold: 70, sgold: 80, pitem: 2, sitem: 4 });
    expect(ack.ui).toMatchObject({ status: 'delivery_confirmed', busy: false, gold: 70 });
    expect((await send(7, { command: accept, pgold: 70, sgold: 80, pitem: 2, sitem: 4 })).plan).toBe('');
    expect(calls('accept')).toBe(1);
  });

  it('rejects a superseded contract and shares offer revisions with the browser', async () => {
    const counter = JSON.stringify({ action: 'COUNTER_OFFER', say: 'Twenty-four, then.',
      offer: { kind: 'in_stock', good: 'iron_dagger', qty: 2, price: 24, remarks: '' }, contract_id: 'c_001' });
    const { bridge, send, calls } = setup([offer, counter]);
    await send(1);
    const old = (await send(2, { command: say })).ui.offers[0];
    const current = await send(3, { command: { ...say, id: 'negotiate', text: 'Twenty-four?' } });
    expect(current.ui.offers[0].revision).toBeGreaterThan(old.revision);
    expect(bridge.view().offers[0].revision).toBe(current.ui.offers[0].revision);
    expect(() => bridge.enqueue({ kind: 'accept', contract: old.contract, revision: old.revision }, poll.session)).toThrow('stale');
    expect((await send(4, { command: { id: 'buy-old', kind: 'accept', contract: old.contract, revision: old.revision } })).ui.command.code).toBe('stale_offer');
    expect(calls('accept')).toBe(0);
  });

  it('serializes browser and native intents while returning a correlated executing receipt for duplicates', async () => {
    const { bridge, send, fetcher, calls } = setup();
    await send(1);
    const original = fetcher.getMockImplementation()!;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/say')) { entered(); await gate; }
      return original(url, init);
    });
    const pending = send(2, { command: say });
    await started;
    try {
      expect((await send(3, { command: say })).ui).toMatchObject({ status: 'thinking', command: { id: say.id, state: 'executing' } });
      expect((await send(4, { command: { ...say, id: 'busy-id' } })).ui.command.code).toBe('busy');
      expect(() => bridge.enqueue({ kind: 'say', text: 'browser' }, poll.session)).toThrow('busy');
    } finally { release(); }
    await pending;
    expect((await send(5, { command: { ...say, id: 'busy-id' } })).ui.command).toMatchObject({ state: 'rejected', code: 'busy' });
    expect(calls('say')).toBe(1);
  });

  it('does not displace a browser-admitted command', async () => {
    const { bridge, send, calls } = setup();
    await send(1);
    bridge.enqueue({ kind: 'say', text: 'Browser message' }, poll.session);
    expect((await send(2, { command: say })).ui.command.code).toBe('busy');
    expect(bridge.view().messages.join('\n')).toContain('Browser message');
    expect(calls('say')).toBe(1);
  });

  it('restores history after reopening during a reply and supports a second turn without replaying the first', async () => {
    const { send, fetcher, calls } = setup([offer, offer]);
    await send(1);
    const original = fetcher.getMockImplementation()!;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/say')) { entered(); await gate; }
      return original(url, init);
    });
    const pending = send(2, { command: say });
    await started;
    try { expect((await send(3, { generation: 3 })).ui.status).toBe('thinking'); }
    finally { release(); }
    await pending;
    const reopened = await send(4, { generation: 3 });
    expect(reopened.ui.messages.filter(m => m.role === 'player')).toHaveLength(1);
    expect(reopened.ui.messages.some(m => m.role === 'brann')).toBe(true);
    const second = await send(5, { generation: 3, command: { ...say, id: 'turn-2', text: 'What about one dagger?' } });
    expect(second.ui.messages.filter(m => m.role === 'player')).toHaveLength(2);
    expect(calls('say')).toBe(2);
  });

  it('rejects stale request/menu/session commands and never exports a newer session snapshot to an old caller', async () => {
    const { send, calls } = setup();
    await send(1);
    await send(10, { generation: 3 });
    expect((await send(9, { command: say })).ui.command.code).toBe('stale_request');
    expect((await send(11, { command: say })).ui.command.code).toBe('stale_request');
    expect((await send(12, { generation: 2, command: { ...say, id: 'old-menu' } })).ui.command.code).toBe('stale_menu');
    await send(1, { session: 'new-save' });
    const old = await send(13, { command: { ...say, id: 'old-save' } });
    expect(old).toMatchObject({ reset: true, ui: { messages: [], offers: [], command: { code: 'stale_session' } } });
    expect(calls('say')).toBe(0);
  });

  it('rejects commands in the initial handshake or out of range', async () => {
    const { send, calls } = setup();
    expect((await send(1, { command: say })).ui.command.code).toBe('session_connecting');
    expect((await send(2, { command: say })).ui.command.code).toBe('session_connecting');
    expect((await send(3, { near: false, command: { ...say, id: 'far' } })).ui).toMatchObject({ status: 'out_of_range', command: { code: 'out_of_range' } });
    expect(calls('say')).toBe(0);
  });

  it('redacts an ambiguous committed mutation failure and never repeats it', async () => {
    const { send, fetcher, calls } = setup();
    await send(1);
    const o = (await send(2, { command: say })).ui.offers[0];
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) => {
      const response = await original(url, init);
      if (String(url).endsWith('/accept')) throw new Error('SECRET_TOKEN raw stack trace endpoint');
      return response;
    });
    const command = { id: 'lost', kind: 'accept', contract: o.contract, revision: o.revision };
    const lost = await send(3, { command });
    expect(lost.ui).toMatchObject({ status: 'recovery_required', support_code: 'NW_RECOVERY', command: { state: 'uncertain', code: 'outcome_unknown' } });
    expect(JSON.stringify(lost)).not.toMatch(/SECRET_TOKEN|raw stack|world_id|authorization|Bearer/);
    expect((await send(4, { command })).ui.command.state).toBe('uncertain');
    expect(calls('accept')).toBe(1);
  });

  it('distinguishes model unavailability and ledger rejection from a successful reply', async () => {
    const unavailable = setup([]);
    await unavailable.send(1);
    expect((await unavailable.send(2, { command: say })).ui.status).toBe('model_unavailable');
    const rejected = setup([offer.replace('30', '0'), offer.replace('30', '0')]);
    await rejected.send(1);
    const result = await rejected.send(2, { command: say });
    expect(result.ui.status).toBe('offer_rejected');
    expect(result.ui.offers).toEqual([]);
  });

  it('bounds transcript history without recycling message IDs', async () => {
    const { send } = setup(Array(20).fill(offer));
    await send(1);
    let result = await send(2, { command: say });
    const firstIds = result.ui.messages.map(m => m.id);
    for (let i = 3; i <= 21; i++) result = await send(i, { command: { ...say, id: `turn-${i}` } });
    expect(result.ui.messages).toHaveLength(32);
    expect(result.ui.messages.some(m => firstIds.includes(m.id))).toBe(false);
    expect(NativeReply.safeParse(result).success).toBe(true);
  });

  it('retains deduplication records when the session command limit is reached', async () => {
    const { send, calls } = setup();
    await send(1);
    await send(2, { command: say });
    for (let i = 3; i <= 1025; i++) await send(i, { near: false, command: { ...say, id: `rejected-${i}` } });
    const limit = await send(1026, { command: { ...say, id: 'over-limit' } });
    expect(limit.ui.command.code).toBe('command_limit');
    expect((await send(1027, { command: say })).ui.command.state).toBe('completed');
    expect(calls('say')).toBe(1);
  });

  it('keeps an inventory mismatch in recovery and rejects further commands', async () => {
    const { send, calls } = setup();
    await send(1);
    const o = (await send(2, { command: say })).ui.offers[0];
    const trade = await send(3, { command: { id: 'buy', kind: 'accept', contract: o.contract, revision: o.revision } });
    const failed = await send(4, { ack: trade.plan, pgold: 70 }); // only gold changed, not stock
    expect(failed).toMatchObject({ reset: true, ui: { status: 'recovery_required' } });
    expect((await send(5, { command: { ...say, id: 'after-failure' } })).ui.command.code).toBe('recovery_required');
    expect(calls('accept')).toBe(1);
    expect(calls('say')).toBe(1);
  });

  it('accepts session-matching delivery acknowledgement from a retired menu without admitting its new commands', async () => {
    const { send, calls } = setup();
    await send(1);
    const o = (await send(2, { command: say })).ui.offers[0];
    const trade = await send(3, { command: { id: 'buy', kind: 'accept', contract: o.contract, revision: o.revision } });
    expect((await send(4, { generation: 5 })).plan).toBe(trade.plan);
    const delivered = { ack: trade.plan, pgold: 70, sgold: 80, pitem: 2, sitem: 4 };
    const oldMenuAck = await send(5, { generation: 1, ...delivered, command: { ...say, id: 'late-old-menu' } });
    expect(oldMenuAck.plan).toBe('');
    expect(oldMenuAck.ui).toMatchObject({ status: 'delivery_confirmed', gold: 70, command: { state: 'rejected', code: 'stale_menu' } });
    expect(calls('accept')).toBe(1); expect(calls('say')).toBe(1);
  });

  it('retires a delayed old-save reply before the next session can receive its transcript or transfer', async () => {
    const { send, fetcher, calls } = setup();
    await send(1);
    const original = fetcher.getMockImplementation()!;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/say')) { entered(); await gate; }
      return original(url, init);
    });
    const oldReply = send(2, { command: say });
    await started;
    try {
      const connecting = await send(1, { session: 'loaded-new-save', pgold: 42 });
      expect(connecting.ui).toMatchObject({ status: 'connecting', messages: [], offers: [] });
    } finally { release(); }
    expect((await oldReply).session).toBe(poll.session);
    const current = await send(2, { session: 'loaded-new-save', pgold: 42 });
    expect(current.ui).toMatchObject({ status: 'ready', gold: 42, offers: [] });
    expect(current.ui.messages.some(m => m.role === 'player')).toBe(false);
    const late = await send(3, { command: say });
    expect(late).toMatchObject({ reset: true, plan: '', ui: { messages: [], offers: [] } });
    expect(calls('say')).toBe(1);
  });

  it('requires recovery after a range/combat interruption prevents physical delivery and never repeats acceptance', async () => {
    const { send, calls } = setup();
    await send(1);
    const o = (await send(2, { command: say })).ui.offers[0];
    const accept = { id: 'buy-interrupted', kind: 'accept', contract: o.contract, revision: o.revision };
    const trade = await send(3, { command: accept });
    expect(trade.ui.status).toBe('transfer_pending');
    const stopped = await send(4, { near: false, failed: true });
    expect(stopped).toMatchObject({ reset: true, plan: '', ui: { status: 'recovery_required', gold: 100 } });
    const repeated = await send(5, { command: accept });
    expect(repeated).toMatchObject({ reset: true, plan: '', ui: { status: 'recovery_required' } });
    expect(calls('accept')).toBe(1);
  });
});

describe('v2 native HTTP boundary', () => {
  it('enforces native JSON and emits correlated, schema-valid recovery packets for invalid input', async () => {
    const { bridge } = setup();
    const app = localApp(bridge);
    const request = (body: unknown, headers = {}) => app.request('http://127.0.0.1:8788/skyrim/v2/poll', {
      method: 'POST', headers: { host: '127.0.0.1:8788', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    expect((await request(poll, { origin: 'http://127.0.0.1:8788' })).status).toBe(403);
    expect((await request(poll, { host: 'evil.example:8788' })).status).toBe(403);
    for (const body of [null, { ...poll, injected: 'SECRET' }, { ...poll, command: { id: 'bad', kind: 'accept', contract: 'c_001' } }]) {
      const response = await request(body);
      expect(response.status).toBe(200);
      const reply = await response.json();
      expect(NativeReply.safeParse(reply).success).toBe(true);
      expect(reply.reset).toBe(true);
      expect(JSON.stringify(reply)).not.toContain('SECRET');
    }
    const response = await request(poll);
    expect(await response.json()).toMatchObject({ version: 2, session: poll.session, generation: 1, ui: { status: 'ready' } });
  });
});
