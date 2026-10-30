import { ModelError } from './types';

// Muse Voice Transcribe: a spoken line to text, for the chat box. Push-to-talk, one clip per call, no retries:
// a failed clip only means the player types instead.

export type Transcript = { text: string; audio_ms: number; latency_ms: number };

export interface Transcriber {
  readonly model: string;
  transcribe(wav: Uint8Array<ArrayBuffer>): Promise<Transcript>;
}

export type TranscriberOptions = { baseURL: string; apiKey: string; model: string; timeoutMs?: number; fetch?: typeof fetch };

export function createTranscriber(opts: TranscriberOptions): Transcriber {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const base = opts.baseURL.replace(/\/$/, '');
  return {
    model: opts.model,
    async transcribe(wav) {
      const started = Date.now();
      const form = new FormData();
      form.append('request', JSON.stringify({ model: opts.model, mode: 'PUSH_TO_TALK', audioEncoding: 'WAV' }));
      form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'line.wav');
      let res: Response;
      try {
        res = await doFetch(`${base}/asr/transcribe`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        });
      } catch (err) {
        throw new ModelError(`transcribe request failed: ${(err as Error).message}`, null);
      }
      if (!res.ok) throw new ModelError(`transcribe ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
      const body = (await res.json()) as { transcript?: unknown; audioDurationMs?: unknown };
      if (typeof body.transcript !== 'string') throw new ModelError('transcribe response had no transcript', res.status);
      return { text: body.transcript.trim(), audio_ms: typeof body.audioDurationMs === 'number' ? body.audioDurationMs : 0, latency_ms: Date.now() - started };
    },
  };
}

export type WavInfo = { rate: number; channels: number; bits: number; ms: number };

// What the endpoint takes: PCM, mono, 16-bit, 16 or 24 kHz. Checked here so junk is refused before it costs a call.
// Walks the chunks, since a header isn't always 44 bytes (macOS `say` puts a JUNK chunk before `fmt `).
export function readWav(bytes: Uint8Array): WavInfo | string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return 'not a WAV file';
  let fmt: Omit<WavInfo, 'ms'> | null = null;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (tag(at) === 'fmt ' && size >= 16 && body + 16 <= bytes.length) {
      if (view.getUint16(body, true) !== 1) return 'the WAV must be plain PCM';
      fmt = { channels: view.getUint16(body + 2, true), rate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
      if (fmt.channels !== 1 || fmt.bits !== 16 || (fmt.rate !== 16_000 && fmt.rate !== 24_000)) return 'the WAV must be mono, 16-bit, 16 or 24 kHz';
    } else if (tag(at) === 'data') {
      if (!fmt) return 'the WAV has no format before its sound';
      const length = Math.min(size, bytes.length - body);
      return { ...fmt, ms: Math.round((length / 2 / fmt.rate) * 1000) };
    }
    at = body + size + (size % 2); // chunks are padded to an even length
  }
  return 'the WAV has no sound in it';
}

// For tests: hands back the given lines in order (an Error is thrown), and counts the clips.
export function mockTranscriber(replies: (string | Error)[]): Transcriber & { clips: Uint8Array<ArrayBuffer>[] } {
  const clips: Uint8Array<ArrayBuffer>[] = [];
  return {
    model: 'mock-voice',
    clips,
    async transcribe(wav) {
      clips.push(wav);
      const next = replies[clips.length - 1];
      if (next === undefined) throw new ModelError('mock transcriber has no more lines', null);
      if (next instanceof Error) throw next;
      return { text: next, audio_ms: 0, latency_ms: 0 };
    },
  };
}
