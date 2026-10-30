import type { TranscribeResponse } from '@blacksmith/shared';
import { describe, expect, it } from 'vitest';
import { mockClient, mockTranscriber } from '../../models';
import { ModelError } from '../../models/types';
import { wav } from '../../models/__tests__/wav';
import { createApi, type ApiDeps } from '../api';

function setup(deps: Partial<ApiDeps> = {}) {
  return createApi({ makeModel: () => ({ client: mockClient([]), model: 'test' }), ...deps });
}

// A browser posting raw WAV, keeping its session cookie.
function mic(app: ReturnType<typeof createApi>) {
  let cookie = '';
  return async (clip: Uint8Array) => {
    const res = await app.request('/api/transcribe', { method: 'POST', headers: { 'content-type': 'audio/wav', ...(cookie && { cookie }) }, body: clip });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, json: (await res.json()) as TranscribeResponse & { error?: string } };
  };
}

describe('POST /api/transcribe', () => {
  it('turns a clip into text for the chat box, and logs nothing', async () => {
    const voice = mockTranscriber(['I want a light sword.']);
    const app = setup({ makeVoice: () => voice });
    const send = mic(app);
    expect(await send(wav(1500))).toEqual({ status: 200, json: { text: 'I want a light sword.' } });
    expect(voice.clips).toHaveLength(1);
  });

  it('refuses junk and over-long clips before any call', async () => {
    const voice = mockTranscriber([]);
    const send = mic(setup({ makeVoice: () => voice }));
    expect((await send(new TextEncoder().encode('not audio'))).status).toBe(400);
    expect((await send(wav(1000, { rate: 44_100 }))).json.error).toMatch(/16 or 24 kHz/);
    expect((await send(wav(31_000))).status).toBe(400);
    expect((await send(wav(40_000, { rate: 24_000 }))).status).toBe(413); // past the body cap
    expect(voice.clips).toHaveLength(0);
  });

  it('caps clips per session and per minute', async () => {
    let t = 0;
    const voice = mockTranscriber(Array(10).fill('hello'));
    const app = setup({ makeVoice: () => voice, voice: { perSession: 2, perMinute: 3, now: () => t } });
    const a = mic(app);
    expect((await a(wav(100))).status).toBe(200);
    expect((await a(wav(100))).status).toBe(200);
    expect((await a(wav(100))).status).toBe(429); // this visit's lines are used up
    const b = mic(app);
    expect((await b(wav(100))).status).toBe(200);
    expect((await b(wav(100))).status).toBe(429); // three in a minute across everyone
    t = 61_000;
    expect((await b(wav(100))).status).toBe(200);
  });

  it('no key is a 503, a failed call a 502; neither breaks the session', async () => {
    const none = mic(setup({ makeVoice: () => { throw new Error('MODEL_API_KEY is not set'); } }));
    expect((await none(wav(100))).status).toBe(503);
    const failing = mic(setup({ makeVoice: () => mockTranscriber([new ModelError('transcribe 500', 500), 'second try']) }));
    expect((await failing(wav(100))).status).toBe(502);
    expect(await failing(wav(100))).toEqual({ status: 200, json: { text: 'second try' } });
  });
});
