import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPO_ROOT } from '../../config/env';
import { createClient, createImageClient, createModel, createModels, mockClient, readLog, replayClient, withRecorder, type ChatRequest } from '../index';

const req: ChatRequest = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
  reasoning_effort: 'low',
  json_schema: { name: 'S', schema: { type: 'object' } },
};

const okBody = {
  model: 'm',
  choices: [{ finish_reason: 'stop', message: { content: '{"a":1}', reasoning_content: 'thinking' } }],
  usage: { prompt_tokens: 5, completion_tokens: 9, completion_tokens_details: { reasoning_tokens: 7 } },
};

function fakeFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[calls.length - 1];
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('createClient', () => {
  it('Meta: bearer auth, max_completion_tokens, strict json_schema; parses content, reasoning and usage', async () => {
    const f = fakeFetch([json(200, okBody)]);
    const client = createClient({ provider: 'meta', baseURL: 'https://api.meta.ai/v1/', apiKey: 'k', fetch: f.fn });
    const res = await client.chat(req);

    expect(f.calls[0].url).toBe('https://api.meta.ai/v1/chat/completions');
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const sent = JSON.parse(f.calls[0].init.body as string);
    expect(sent.max_completion_tokens).toBe(4096);
    expect(sent.max_tokens).toBeUndefined();
    expect(sent.reasoning_effort).toBe('low');
    expect(sent.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'S', strict: true, schema: { type: 'object' } } });
    expect(res).toMatchObject({ content: '{"a":1}', reasoning: 'thinking', usage: { reasoning_tokens: 7, completion_tokens: 9 } });
  });

  it('Baseten: max_tokens instead', async () => {
    const f = fakeFetch([json(200, okBody)]);
    await createClient({ provider: 'baseten', baseURL: 'https://b/v1', apiKey: 'k', fetch: f.fn }).chat(req);
    const sent = JSON.parse(f.calls[0].init.body as string);
    expect(sent.max_tokens).toBe(4096);
    expect(sent.max_completion_tokens).toBeUndefined();
  });

  it('retries 429 honouring Retry-After, then succeeds', async () => {
    const slept: number[] = [];
    const f = fakeFetch([json(429, { error: 'slow down' }, { 'retry-after': '2' }), json(200, okBody)]);
    const client = createClient({ provider: 'meta', baseURL: 'x', apiKey: 'k', fetch: f.fn, sleep: async (ms) => void slept.push(ms) });
    expect((await client.chat(req)).content).toBe('{"a":1}');
    expect(slept).toEqual([2000]);
  });

  it('a Retry-After over the limit fails at once instead of hanging the turn', async () => {
    const slept: number[] = [];
    const f = fakeFetch([json(429, { error: 'slow down' }, { 'retry-after': '3600' })]);
    const client = createClient({ provider: 'meta', baseURL: 'x', apiKey: 'k', fetch: f.fn, sleep: async (ms) => void slept.push(ms) });
    const err = await client.chat(req).catch((e) => e);
    expect(err).toMatchObject({ name: 'ModelError', status: 429 });
    expect(err.message).toMatch(/asked to wait 3600 s, over the 10 s limit/);
    expect(slept).toEqual([]);
    expect(f.calls).toHaveLength(1);
  });

  it("doesn't retry a 400, and the error carries the status but not the key", async () => {
    const f = fakeFetch([json(400, { error: 'bad reasoning_effort' })]);
    const client = createClient({ provider: 'meta', baseURL: 'x', apiKey: 'secret-key', fetch: f.fn, sleep: async () => {} });
    const err = await client.chat(req).catch((e) => e);
    expect(err).toMatchObject({ name: 'ModelError', status: 400 });
    expect(err.message).toMatch(/bad reasoning_effort/);
    expect(err.message).not.toMatch(/secret-key/);
    expect(f.calls).toHaveLength(1);
  });

  it('gives up after maxAttempts network failures', async () => {
    const f = fakeFetch([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')]);
    const client = createClient({ provider: 'baseten', baseURL: 'x', apiKey: 'k', fetch: f.fn, sleep: async () => {} });
    await expect(client.chat(req)).rejects.toThrow(/baseten request failed: ECONNRESET/);
    expect(f.calls).toHaveLength(3);
  });
});

describe('createModels', () => {
  const session = `test-limits-${process.pid}`;
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(`${REPO_ROOT}logs/${session}.jsonl`, { force: true });
  });

  it('the smith gives up after 2 attempts of 20 s each, not 3 of 60 s', async () => {
    vi.stubEnv('MODEL_API_KEY', 'k');
    vi.stubEnv('BASETEN_API_KEY', 'k');
    vi.stubEnv('REPLAY', '');
    const f = fakeFetch([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')]);
    vi.stubGlobal('fetch', f.fn);
    const timeout = vi.spyOn(AbortSignal, 'timeout');

    await expect(createModels(session).smith.client.chat(req)).rejects.toThrow(/meta request failed: ECONNRESET/);
    expect(f.calls).toHaveLength(2);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([20_000, 20_000]);
  });

  it('each model choice needs only its own key, and a Spark Open NPC gets the same turn limits', async () => {
    vi.stubEnv('MODEL_API_KEY', 'k');
    vi.stubEnv('BASETEN_API_KEY', '');
    vi.stubEnv('REPLAY', '');
    expect(createModel(session, 'muse_spark').model).toBeTruthy();
    expect(() => createModel(session, 'muse_spark_open')).toThrow(/BASETEN_API_KEY is not set/);

    vi.stubEnv('MODEL_API_KEY', '');
    vi.stubEnv('BASETEN_API_KEY', 'k');
    expect(() => createModel(session, 'muse_spark')).toThrow(/MODEL_API_KEY is not set/);
    const f = fakeFetch([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')]);
    vi.stubGlobal('fetch', f.fn);
    await expect(createModel(session, 'muse_spark_open').client.chat(req)).rejects.toThrow(/baseten request failed: ECONNRESET/);
    expect(f.calls).toHaveLength(2);
  });
});

describe('recorder and replay', () => {
  it('records every call as JSONL and replays it in order', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'smith-')), 'nested', 'session.jsonl');
    const recorded = withRecorder(mockClient(['one', 'two', new Error('boom')]), file);
    await recorded.chat(req);
    await recorded.chat(req);
    await expect(recorded.chat(req)).rejects.toThrow('boom');

    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(3);
    const log = readLog(file);
    expect(log.map((e) => e.error)).toEqual([null, null, 'boom']);
    expect(log[0].request.messages[0].content).toBe('hi');

    const replay = replayClient(log);
    expect((await replay.chat(req)).content).toBe('one');
    expect((await replay.chat(req)).content).toBe('two');
    await expect(replay.chat(req)).rejects.toThrow('boom');
    await expect(replay.chat(req)).rejects.toThrow(/exhausted after 3 calls/);
  });
});

describe('image client', () => {
  const answer = () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('png').toString('base64') }] }), { status: 200 });
  const sent = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map(([url, init]) => ({ url: url as string, body: JSON.parse((init as RequestInit).body as string) }));

  it('draws from the prompt alone on generations, or with references on edits (searches off)', async () => {
    const fetch = vi.fn(async () => answer());
    const client = createImageClient({ baseURL: 'https://img.test/v1/', apiKey: 'k', model: 'muse-image-1.0', fetch });
    expect((await client.generate({ prompt: 'a lantern' })).png.toString()).toBe('png');
    await client.generate({ prompt: 'a lantern', references: ['data:image/png;base64,AA=='] });
    const [plain, styled] = sent(fetch);
    expect(plain.url).toBe('https://img.test/v1/images/generations');
    expect(plain.body).not.toHaveProperty('images');
    expect(plain.body).not.toHaveProperty('tool_enablement');
    expect(styled.url).toBe('https://img.test/v1/images/edits');
    expect(styled.body).toMatchObject({
      prompt: 'a lantern',
      output_format: 'png',
      images: [{ image_url: 'data:image/png;base64,AA==' }],
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
    });
  });
});
