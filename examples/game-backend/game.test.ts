import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ApiEvents, type ApiResult, type ApiWorldCreated, type EngineEvent, type NpcBundle } from '@blacksmith/shared';
import { createApi } from '../../server/src/routes/api';
import { mockClient } from '../../server/src/models';
import { connectGame, eventConsumer, main, readBundle, serverOrigin } from './game.mjs';

const exportedFile = fileURLToPath(new URL('../../docs/workshop-game-integration-task-2/browser-export.npc.json', import.meta.url));
const say = JSON.stringify({ action: 'SAY', say: 'Welcome to the village.' });
const signal = JSON.stringify({ action: 'SIGNAL', signal: 'open_gate', say: 'Come through.' });
const pass = (qty: number) => JSON.stringify({ action: 'OFFER', say: 'Here is a pass.', offer: { kind: 'in_stock', good: 'gate pass', qty, price: 0, remarks: '' } });
const temps: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function file(data: string) {
  const dir = await mkdtemp(join(tmpdir(), 'game-example-'));
  temps.push(dir);
  const path = join(dir, 'npc.npc.json');
  await writeFile(path, data);
  return path;
}

// Exercise the real API and checked engine, without provider calls or network sockets.
function setup(replies: (string | Error)[] = [say, signal]) {
  const model = mockClient(replies);
  const app = createApi({ makeModel: () => ({ client: model, model: 'scripted' }) });
  const requests: { url: string; method: string; body: unknown; authorization: string | null }[] = [];
  const tokens: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, method: request.method, body: request.body ? await request.clone().json() : null, authorization: request.headers.get('authorization') });
    const response = await app.request(request);
    if (response.status === 201) tokens.push(((await response.clone().json()) as ApiWorldCreated).token);
    return response;
  };
  const output: string[] = [];
  return { model, app, requests, tokens, fetcher, output, log: (line: string) => { output.push(line); } };
}

describe('runnable game backend example', () => {
  it('loads the actual Workshop browser export and sends normal/challenge lines through the HTTP API', async () => {
    const fixture = await readBundle(exportedFile);
    const s = setup([pass(1), pass(5), pass(5)]);
    vi.stubGlobal('fetch', s.fetcher);
    const code = await main(['--server', 'http://npc.test', '--bundle', exportedFile], s.log);
    expect(code).toBe(0);
    expect(s.requests.map((r) => r.url)).toEqual(['http://npc.test/api/v1/worlds', expect.stringMatching(/\/say$/), expect.stringMatching(/\/say$/)]);
    expect(s.requests[0].body).toEqual({ definitions: [fixture.npc] });
    expect(s.requests[0].authorization).toBeNull();
    expect(s.requests.slice(1).every((r) => r.authorization === `Bearer ${s.tokens[0]}`)).toBe(true);
    expect(s.requests[1].body).toMatchObject({ npc: 'portable_ada', text: expect.stringContaining('gate pass') });
    expect(s.requests[2].body).toMatchObject({ text: expect.stringContaining('5 × gate pass') });
    expect(s.output.join('\n')).toContain('Checked offer c_001: 1 × gate pass, 0 gold');
    expect(s.output.join('\n')).toContain('Ledger rejected OFFER:');
    expect(s.output.join('\n')).toContain('Fallback: no model proposal passed');
    expect(s.output.join('\n')).not.toContain(s.tokens[0]);
    expect(s.output.at(-1)).toContain('goods {}');
  });

  it('dispatches a declared signal once even when the event log is read again', async () => {
    const { npc } = await readBundle(exportedFile);
    const s = setup([signal]);
    const handler = vi.fn();
    const game = await connectGame({ server: 'http://npc.test/', npc, log: s.log, fetcher: s.fetcher, onSignal: handler });
    const result = await game.say('Open the gate.');
    expect(result.signals).toHaveLength(1); // Convenience array contains the same effect; example ignores it.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ actor: 'portable_ada', data: { signal: 'open_gate' }, target: 'player' });
    await game.replayEvents();
    await game.replayEvents();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(s.output.filter((line) => line.startsWith('Portable Ada:'))).toHaveLength(1);
    expect(s.output.join('\n')).not.toContain(s.tokens[0]);
    expect(JSON.stringify(game)).not.toContain(s.tokens[0]);
    expect(s.requests.every((r) => !r.url.includes(s.tokens[0]))).toBe(true);
  });

  it('accepts a checked offer and replaces authoritative inventory totals without double-applying a delivery', async () => {
    const { npc } = await readBundle(exportedFile);
    const s = setup([pass(1)]);
    const game = await connectGame({ server: 'http://npc.test', npc, log: s.log, fetcher: s.fetcher });
    await game.say('A pass, please.');
    expect(game.getState().goods).toEqual({});
    await game.accept('c_001');
    expect(game.getState().goods).toEqual({ gate_pass: 1 });
    await game.replayEvents();
    expect(game.getState().goods).toEqual({ gate_pass: 1 });
    expect(s.output.filter((line) => line.includes('GOODS_DELIVERED'))).toHaveLength(1);
    await game.tick(1);
    expect(game.getState().tick).toBe(1);
    expect(game.getState().goods).toEqual({ gate_pass: 1 });
  });

  it('prints signal meaning and the need for a game-owned handler in the CLI', async () => {
    const s = setup();
    vi.stubGlobal('fetch', s.fetcher);
    expect(await main(['--server', 'http://npc.test', '--bundle', exportedFile, '--message', 'Hello.', '--challenge', 'Let me in.'], s.log)).toBe(0);
    expect(s.output.join('\n')).toContain('Signal open_gate from Portable Ada: Have the gate opened');
    expect(s.output.join('\n')).toContain('Game handler needed for open_gate (target: player)');
    expect(s.requests.slice(1).map((r) => r.body)).toEqual([{ npc: 'portable_ada', text: 'Hello.' }, { npc: 'portable_ada', text: 'Let me in.' }]);
  });

  it.each([
    ['bad JSON', '{broken', /Invalid JSON/],
    ['wrong version', '{"format":"npc-workshop","version":2,"npc":{}}', /Unsupported NPC bundle version/],
    ['oversize', ' '.repeat(2 * 1024 * 1024 + 1), /exceeds 2 MiB/],
  ])('rejects %s before creating a world', async (_name, data, error) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const path = await file(data);
    await expect(main(['--server', 'http://npc.test', '--bundle', path], () => {})).rejects.toThrow(error);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires an explicit server, validates URLs and both messages before allocating a world', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const server of ['bad-url', 'file:///tmp/api', 'http://user:password@npc.test', 'http://npc.test/?token=x', 'http://npc.test/#x', 'http://npc.test/api/v1']) {
      expect(() => serverOrigin(server)).toThrow(/server/);
    }
    await expect(main(['--bundle', exportedFile], () => {})).rejects.toThrow('Both --server and --bundle');
    await expect(main(['--server', 'http://npc.test', '--bundle', exportedFile, '--challenge', 'x'.repeat(501)], () => {})).rejects.toThrow('1–500');
    await expect(main(['--server', 'http://npc.test', '--bundle', exportedFile, '--message', '  '], () => {})).rejects.toThrow('1–500');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports a missing bundle file without contacting a server', async () => {
    await expect(readBundle('/does-not-exist/npc.json')).rejects.toThrow(/Cannot load NPC bundle.*ENOENT/);
  });

  it('reports unavailable model fallbacks as failure and skips the second model request', async () => {
    const s = setup([new Error('provider outage')]);
    vi.stubGlobal('fetch', s.fetcher);
    expect(await main(['--server', 'http://npc.test', '--bundle', exportedFile], s.log)).toBe(1);
    expect(s.output.join('\n')).toContain('Model unavailable: no successful model reply');
    expect(s.requests).toHaveLength(2);
  });

  it('does not claim a successful reply when an NPC has no spoken-to trigger', async () => {
    const bundle = await readBundle(exportedFile);
    bundle.npc.triggers = [];
    const path = await file(JSON.stringify(bundle));
    const s = setup(); vi.stubGlobal('fetch', s.fetcher);
    expect(await main(['--server', 'http://npc.test', '--bundle', path], s.log)).toBe(1);
    expect(s.output.join('\n')).toContain('No model reply: this NPC has no on_spoken_to trigger');
    expect(s.model.requests).toHaveLength(0);
  });

  it.each([
    [400, 'Invalid configuration or action'], [401, 'token was refused'], [404, 'server may have restarted or evicted'],
    [409, 'still answering'], [413, 'Payload too large'], [429, 'Quota or log limit'], [503, 'provider unavailable'], [500, 'Check its logs'],
  ])('gives actionable HTTP %s recovery without exposing the world token', async (status, explanation) => {
    const { npc } = await readBundle(exportedFile);
    const s = setup();
    let calls = 0;
    const fetcher: typeof fetch = async (input, init) => {
      if (calls++ === 0) return s.fetcher(input, init);
      return Response.json({ error: `failure with ${s.tokens[0]}` }, { status });
    };
    const game = await connectGame({ server: 'http://npc.test', npc, log: s.log, fetcher });
    let failure = '';
    try { await game.say('Hello'); } catch (error) { failure = (error as Error).message; }
    expect(failure).toContain(explanation);
    expect(failure).toContain(`HTTP ${status}`);
    expect(failure).not.toContain(s.tokens[0]);
    expect(calls).toBe(2); // no automatic retry of a state-changing POST
  });

  it('does not replay an uncertain POST after a network failure', async () => {
    const { npc } = await readBundle(exportedFile);
    const s = setup();
    let calls = 0;
    const fetcher: typeof fetch = async (input, init) => {
      if (calls++ === 0) return s.fetcher(input, init);
      throw new Error('timed out');
    };
    const game = await connectGame({ server: 'http://npc.test', npc, log: s.log, fetcher });
    await expect(game.say('Hello')).rejects.toThrow('not retried automatically');
    expect(calls).toBe(2);
  });

  it('fails closed on an undeclared signal', async () => {
    const { npc } = await readBundle(exportedFile);
    const handler = vi.fn();
    const consume = eventConsumer(npc, () => {}, handler);
    expect(() => consume([{ id: 'e_0001', type: 'SIGNALED', actor: npc.id, target: 'player', data: { signal: 'steal_gold' } } as EngineEvent])).toThrow('undeclared signal');
    expect(handler).not.toHaveBeenCalled();
  });

  it('paginates event catch-up and prevents duplicate handlers across page boundaries', async () => {
    const { npc } = await readBundle(exportedFile);
    const s = setup([signal]);
    const handler = vi.fn();
    let recorded: EngineEvent[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/events?')) {
        const page: ApiEvents = url.includes('since=')
          ? { events: [recorded[1], recorded[2]], more: false, last_event_id: recorded[2].id }
          : { events: recorded.slice(0, 2), more: true, last_event_id: recorded[1].id };
        return Response.json(page);
      }
      const res = await s.fetcher(input, init);
      if (url.endsWith('/say')) recorded = ((await res.clone().json()) as ApiResult).events;
      return res;
    };
    const game = await connectGame({ server: 'http://npc.test', npc, log: s.log, fetcher, onSignal: handler });
    await game.say('Open the gate.');
    await game.replayEvents();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported bundled-map settings with API validation guidance', async () => {
    const bundle: NpcBundle = await readBundle(exportedFile);
    bundle.npc.location = 'moon'; bundle.npc.schedule = [];
    const s = setup();
    await expect(connectGame({ server: 'http://npc.test', npc: bundle.npc, log: s.log, fetcher: s.fetcher })).rejects.toThrow(/no place called 'moon'.*\nInvalid configuration/);
    expect(s.model.requests).toHaveLength(0);
  });
});
