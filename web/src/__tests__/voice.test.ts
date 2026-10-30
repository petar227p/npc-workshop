import { describe, expect, it } from 'vitest';
import { readWav } from '../../../server/src/models/voice';
import { downsample, toWav } from '../voice';

describe('the mic clip', () => {
  it('is a WAV the server takes: 48 kHz in, 16 kHz mono 16-bit out, same length in time', () => {
    const tone = Float32Array.from({ length: 48_000 }, (_, i) => Math.sin((i / 48_000) * 2 * Math.PI * 220));
    const wav = toWav(downsample(tone, 48_000, 16_000), 16_000);
    expect(readWav(wav)).toEqual({ rate: 16_000, channels: 1, bits: 16, ms: 1000 });
  });

  it('clips loud samples instead of wrapping them', () => {
    const wav = toWav(Float32Array.from([2, -2]), 16_000);
    const v = new DataView(wav.buffer);
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([0x7fff, -0x8000]);
  });
});
