import { describe, expect, it } from 'vitest';
import { createTranscriber, readWav } from '../voice';
import { wav } from './wav';

describe('readWav', () => {
  it('reads the format and length, past chunks before the format', () => {
    expect(readWav(wav(2000))).toEqual({ rate: 16_000, channels: 1, bits: 16, ms: 2000 });
    expect(readWav(wav(500, { rate: 24_000, junk: 28 }))).toEqual({ rate: 24_000, channels: 1, bits: 16, ms: 500 });
  });

  it('refuses what the endpoint would', () => {
    expect(readWav(new TextEncoder().encode('hello, not a wav at all'))).toBe('not a WAV file');
    expect(readWav(wav(100, { channels: 2 }))).toMatch(/mono/);
    expect(readWav(wav(100, { rate: 44_100 }))).toMatch(/16 or 24 kHz/);
    expect(readWav(wav(100, { bits: 8 }))).toMatch(/16-bit/);
    expect(readWav(wav(100).subarray(0, 36))).toBe('the WAV has no sound in it');
  });
});

describe('createTranscriber', () => {
  it('sends the clip as multipart with the push-to-talk request, and trims the transcript', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ sessionId: 's', transcript: ' A light sword, please. ', audioDurationMs: 1800, turns: [] });
    }) as unknown as typeof globalThis.fetch;
    const client = createTranscriber({ baseURL: 'https://asr.test/v1/', apiKey: 'k', model: 'muse-voice-transcribe-1.0', fetch });
    const r = await client.transcribe(wav(1800));
    expect(r).toMatchObject({ text: 'A light sword, please.', audio_ms: 1800 });
    expect(calls[0].url).toBe('https://asr.test/v1/asr/transcribe');
    expect(calls[0].init.headers).toEqual({ Authorization: 'Bearer k' });
    const form = calls[0].init.body as FormData;
    expect(JSON.parse(form.get('request') as string)).toEqual({ model: 'muse-voice-transcribe-1.0', mode: 'PUSH_TO_TALK', audioEncoding: 'WAV' });
    expect((form.get('audio') as Blob).size).toBe(wav(1800).length);
  });

  it('a failed call is a ModelError with the status', async () => {
    const fetch = (async () => new Response('bad audio', { status: 400 })) as unknown as typeof globalThis.fetch;
    const client = createTranscriber({ baseURL: 'https://asr.test/v1', apiKey: 'k', model: 'm', fetch });
    await expect(client.transcribe(wav(100))).rejects.toMatchObject({ status: 400 });
  });
});
