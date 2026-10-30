// A WAV of `ms` of silence, with an optional chunk before `fmt ` (macOS `say` writes a JUNK one).
export function wav(ms: number, { rate = 16_000, channels = 1, bits = 16, junk = 0 } = {}): Uint8Array<ArrayBuffer> {
  const data = Math.round((rate * ms) / 1000) * channels * (bits / 8);
  const pad = junk ? 8 + junk : 0;
  const out = new Uint8Array(12 + pad + 24 + 8 + data);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) => [...s].forEach((ch, i) => (out[at + i] = ch.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, out.length - 8, true);
  tag(8, 'WAVE');
  let at = 12;
  if (junk) {
    tag(at, 'JUNK');
    v.setUint32(at + 4, junk, true);
    at += pad;
  }
  tag(at, 'fmt ');
  v.setUint32(at + 4, 16, true);
  v.setUint16(at + 8, 1, true);
  v.setUint16(at + 10, channels, true);
  v.setUint32(at + 12, rate, true);
  v.setUint32(at + 16, rate * channels * (bits / 8), true);
  v.setUint16(at + 20, channels * (bits / 8), true);
  v.setUint16(at + 22, bits, true);
  tag(at + 24, 'data');
  v.setUint32(at + 28, data, true);
  return out;
}
