import { describe, expect, it, vi } from 'vitest';
import { MAX_NPC_BUNDLE_BYTES } from '@blacksmith/shared/src/limits';
import { buildSetup, supportedSetups } from '@blacksmith/shared/src/setup';
import type { NpcDraft, PreviewResponse } from '@blacksmith/shared';
import { createNpcDownload, prepareNpcImport } from '../npcTransfer';

const draft = () => buildSetup({ role: 'guard', name: 'Portable Ada', news: 'tells' }).draft;
const valid: PreviewResponse = { ok: true, errors: [], facts: '', schema: {} };
const file = (text: string) => ({ size: new TextEncoder().encode(text).byteLength, text: vi.fn(async () => text) });
const bundle = (npc: NpcDraft = draft()) => JSON.stringify({ format: 'npc-workshop', version: 1, npc });

describe('Workshop NPC files', () => {
  it('exports useful filenames and round-trips every supported setup through import validation', async () => {
    for (const setup of supportedSetups()) {
      const npc = buildSetup(setup).draft;
      const download = createNpcDownload(npc);
      expect(download.ok).toBe(true);
      if (!download.ok) throw new Error(download.errors.join('; '));
      expect(download.filename).toBe(`${npc.id}.npc.json`);
      const preview = vi.fn(async () => valid);
      expect(await prepareNpcImport(file(download.text), preview)).toEqual({ ok: true, draft: npc });
      expect(preview).toHaveBeenCalledExactlyOnceWith(npc);
    }
  });

  it('keeps nested configuration and embedded references intact, with an independent parsed copy', async () => {
    const npc = draft();
    npc.art = { style: 'Ink and wash', references: ['data:image/png;base64,AA=='] };
    npc.schedule = [{ from: 8, place: 'gate' }, { from: 19, place: 'tavern' }];
    const before = structuredClone(npc);
    const download = createNpcDownload(npc);
    if (!download.ok) throw new Error(download.errors.join('; '));
    const imported = await prepareNpcImport(file(download.text), async () => valid);
    expect(imported).toEqual({ ok: true, draft: before });
    if (!imported.ok) throw new Error(imported.errors.join('; '));
    imported.draft.signals.open_gate = 'A different meaning';
    imported.draft.start.stock.gate_pass = 100;
    expect(npc).toEqual(before);
    expect(JSON.parse(download.text)).toEqual({ format: 'npc-workshop', version: 1, npc: before });
  });

  it('refuses oversized files without reading them or calling the server', async () => {
    const text = vi.fn(async () => '');
    const preview = vi.fn(async () => valid);
    expect(await prepareNpcImport({ size: MAX_NPC_BUNDLE_BYTES + 1, text }, preview)).toEqual({ ok: false, errors: [expect.stringMatching(/up to 2 MiB/)] });
    expect(text).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{', /Invalid JSON/],
    ['unsupported version', JSON.stringify({ format: 'npc-workshop', version: 99, npc: draft() }), /Unsupported NPC bundle version/],
    ['a raw NPC draft', JSON.stringify(draft()), /format:/],
    ['invalid settings', bundle({ ...draft(), perception_radius: 99 }), /npc.perception_radius:/],
    ['local artwork', bundle({ ...draft(), art: { style: '', references: ['ada-1.png'] } }), /npc.art.references.0:/],
    ['remote artwork', bundle({ ...draft(), art: { style: '', references: ['https://example.com/ada.png'] } }), /npc.art.references.0:/],
  ])('rejects %s before server validation', async (_label, text, error) => {
    const preview = vi.fn(async () => valid);
    expect(await prepareNpcImport(file(text), preview)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringMatching(error)]) });
    expect(preview).not.toHaveBeenCalled();
  });

  it('reports read failures without contacting the server', async () => {
    const preview = vi.fn(async () => valid);
    const unreadable = { size: 20, text: async () => { throw new Error('unreadable'); } };
    expect(await prepareNpcImport(unreadable, preview)).toMatchObject({ ok: false, errors: [expect.stringMatching(/could not be read/)] });
    expect(preview).not.toHaveBeenCalled();
  });

  it('requires normal server build validation before returning an importable draft', async () => {
    const preview = vi.fn(async () => ({ ok: false as const, errors: ["there's no place called 'moon' on the village map"] }));
    const npc = { ...draft(), location: 'moon' };
    expect(await prepareNpcImport(file(bundle(npc)), preview)).toEqual({ ok: false, errors: ["there's no place called 'moon' on the village map"] });
    expect(preview).toHaveBeenCalledExactlyOnceWith(npc);
  });

  it('reports unavailable server validation and does not return a partially checked draft', async () => {
    const preview = vi.fn(async (): Promise<PreviewResponse> => { throw new Error('Server offline'); });
    expect(await prepareNpcImport(file(bundle()), preview)).toMatchObject({ ok: false, errors: [expect.stringMatching(/draft and test session are unchanged.*Server offline/)] });
  });

  it('refuses export of invalid or non-portable settings', () => {
    expect(createNpcDownload({ ...draft(), id: 'player' }).ok).toBe(false);
    expect(createNpcDownload({ ...draft(), art: { style: '', references: ['/tmp/picture.png'] } }).ok).toBe(false);
  });

  it('checks the final formatted file size, rather than just compact configuration', () => {
    const npc = draft();
    // Compact JSON fits the contract; pretty-printing adds enough whitespace to exceed the file limit.
    npc.start.stock = Object.fromEntries(Array.from({ length: 41_000 }, (_, i) => [`${'a'.repeat(35)}${i}`, 1]));
    expect(file(bundle(npc)).size).toBeLessThan(MAX_NPC_BUNDLE_BYTES);
    const download = createNpcDownload(npc);
    expect(download.ok).toBe(false);
    if (!download.ok) expect(download.errors).toEqual([expect.stringMatching(/up to 2 MiB/)]);
  });
});
