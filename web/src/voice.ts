// The zod-free module, so the schemas stay out of the bundle.
import { MAX_VOICE_SECONDS } from '@blacksmith/shared/src/limits';

// The mic for the chat box. Muse Voice Transcribe takes only 16-bit PCM mono WAV at 16 or 24 kHz, and the browser's
// MediaRecorder gives webm/opus, so the samples are taken straight from the mic, brought down to 16 kHz and written
// as WAV here: no ffmpeg, no codec. The clip is small (32 KB a second).

const RATE = 16_000;

export type Recording = { stop: () => Promise<Uint8Array<ArrayBuffer>>; cancel: () => void };

// Starts listening at once (the browser asks for the mic the first time). It stops itself at the length the server
// takes and calls onLimit, so the caller can send what it has.
export async function record(onLimit: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  // The mic's own rate: a context at 16 kHz fed by a 48 kHz mic fails in Firefox, so the resampling is ours.
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but runs everywhere with no worklet file to serve; one clip at a time is light.
  const tap = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let length = 0;
  const limit = MAX_VOICE_SECONDS * ctx.sampleRate;
  let done = false;
  tap.onaudioprocess = (e) => {
    if (done) return;
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    length += input.length;
    if (length >= limit) {
      done = true;
      onLimit();
    }
  };
  source.connect(tap);
  tap.connect(ctx.destination); // a ScriptProcessor only runs while connected; it writes silence

  const close = () => {
    done = true;
    source.disconnect();
    tap.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
  return {
    stop: async () => {
      close();
      const all = new Float32Array(Math.min(length, limit));
      let at = 0;
      for (const c of chunks) {
        const part = c.subarray(0, all.length - at);
        all.set(part, at);
        at += part.length;
      }
      return toWav(downsample(all, ctx.sampleRate, RATE), RATE);
    },
    cancel: close,
  };
}

// Averages each output sample's window of input, which also filters out what 16 kHz can't hold.
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

// 16-bit PCM mono WAV with the plain 44-byte header.
export function toWav(samples: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

// Whether this browser can record at all (plain http on another host has no mic).
export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined';
