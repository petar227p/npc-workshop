import { describe, expect, it } from 'vitest';
import { NpcBundleSchema, parseNpcBundle, worldCreationSchema } from './integration';
import { MAX_NPC_BUNDLE_BYTES, MAX_WORLD_CREATE_BYTES, MAX_WORLD_DEFINITIONS } from './limits';
import { MAX_REFERENCE_BYTES, RESERVED_IDS } from './npc-info';
import { buildSetup, supportedSetups } from './setup';

const draft = () => buildSetup({ role: 'guard', name: 'Ada', news: 'tells' }).draft;
const bundle = () => ({ format: 'npc-workshop', version: 1, npc: draft() });
const reference = `data:image/png;base64,${'A'.repeat((MAX_REFERENCE_BYTES * 4) / 3)}`;
const schema = worldCreationSchema(2);

describe('portable NPC contract', () => {
  it('round-trips every supported setup through JSON without dropping configuration', () => {
    for (const setup of supportedSetups()) {
      const npc = buildSetup(setup).draft;
      const result = parseNpcBundle(JSON.stringify({ format: 'npc-workshop', version: 1, npc }));
      expect(result).toEqual({ ok: true, bundle: { format: 'npc-workshop', version: 1, npc } });
    }
  });

  it('preserves the persona, abilities, labels, signals, schedules and embedded artwork', () => {
    const input = bundle();
    input.npc.art = { style: 'Hand painted', references: ['data:image/png;base64,AA=='] };
    input.npc.schedule = [{ from: 7, place: 'gate' }, { from: 19, place: 'tavern' }];
    expect(parseNpcBundle(JSON.stringify(input))).toEqual({ ok: true, bundle: input });
  });

  it('accepts three maximum-sized reference pictures within the file budget', () => {
    const input = bundle();
    input.npc.art.references = [reference, reference, reference];
    expect(parseNpcBundle(JSON.stringify(input)).ok).toBe(true);
  });

  it('rejects malformed JSON and a raw draft with actionable errors', () => {
    expect(parseNpcBundle('{')).toEqual({ ok: false, errors: [expect.stringMatching(/Invalid JSON/)] });
    expect(parseNpcBundle(JSON.stringify(draft()))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringMatching(/^format:/)]) });
  });

  it.each([0, 2, '1', null, undefined])('rejects unsupported or missing version %s', (version) => {
    expect(parseNpcBundle(JSON.stringify({ ...bundle(), version }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringMatching(/version: Unsupported NPC bundle version.*version 1/)]),
    });
  });

  it('rejects other formats and world state or credentials in the envelope', () => {
    expect(NpcBundleSchema.safeParse({ ...bundle(), format: 'save-game' }).success).toBe(false);
    for (const field of ['token', 'world', 'events', 'inventory']) {
      expect(NpcBundleSchema.safeParse({ ...bundle(), [field]: 'not configuration' }).success).toBe(false);
      const input = bundle();
      expect(NpcBundleSchema.safeParse({ ...input, npc: { ...input.npc, [field]: 'not configuration' } }).success).toBe(false);
    }
  });

  it('rejects invalid configurations with the field path', () => {
    const input = bundle();
    input.npc.start.gold = -1;
    expect(parseNpcBundle(JSON.stringify(input))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringMatching(/^npc.start.gold:/)]) });
  });

  it('requires embedded reference pictures, rather than local or remote dependencies', () => {
    for (const ref of ['ada-1.png', '/tmp/ada.png', 'https://example.com/ada.png']) {
      const input = bundle();
      input.npc.art.references = [ref];
      expect(parseNpcBundle(JSON.stringify(input))).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringMatching(/^npc.art.references.0:/)]) });
    }
  });

  it('checks raw UTF-8 bytes before parsing, including whitespace and multibyte characters', () => {
    const valid = JSON.stringify(bundle());
    expect(parseNpcBundle(valid.padEnd(MAX_NPC_BUNDLE_BYTES, ' ')).ok).toBe(true);
    expect(parseNpcBundle(valid.padEnd(MAX_NPC_BUNDLE_BYTES + 1, ' '))).toMatchObject({ ok: false, errors: [expect.stringMatching(/UTF-8 bytes/)] });
    const input = JSON.stringify({ ignored: 'é'.repeat(MAX_NPC_BUNDLE_BYTES / 2) });
    expect(input.length).toBeLessThan(MAX_NPC_BUNDLE_BYTES);
    expect(parseNpcBundle(input)).toMatchObject({ ok: false, errors: [expect.stringMatching(/UTF-8 bytes/)] });
  });

  it('bounds normalized configuration too, for callers validating objects directly', () => {
    const input = bundle();
    input.npc.art.references = [reference, reference, reference];
    input.npc.start.stock = Object.fromEntries(Array.from({ length: 25_000 }, (_, i) => [`${'a'.repeat(35)}${i}`, 1]));
    expect(JSON.stringify(input).length).toBeGreaterThan(MAX_NPC_BUNDLE_BYTES);
    const parsed = NpcBundleSchema.safeParse(input);
    expect(!parsed.success && parsed.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['npc'], message: expect.stringMatching(/NPC configuration.*UTF-8 bytes/) })]));
    expect(schema.safeParse({ definitions: [input.npc] }).success).toBe(false);
  });
});

describe('draft world-creation contract', () => {
  it('preserves omitted selections and registry-based requests, including start overrides', () => {
    expect(schema.parse({})).toEqual({});
    const legacy = { npcs: ['smith', 'merchant'], start: { player: { gold: 30, stock: { rope: 1 } } } };
    expect(schema.parse(legacy)).toEqual(legacy);
    expect(schema.safeParse({ npcs: ['smith', 'smith'] }).success).toBe(false);
    expect(schema.safeParse({ npcs: ['a', 'b', 'c'] }).success).toBe(false);
  });

  it('accepts a custom cast independently of registry size and returns an owned copy', () => {
    const definitions = Array.from({ length: MAX_WORLD_DEFINITIONS }, (_, i) => ({ ...draft(), id: `custom_${i}` }));
    const parsed = schema.parse({ definitions });
    expect(parsed.definitions).toEqual(definitions);
    parsed.definitions![0].labels.gate_pass = 'changed';
    parsed.definitions![0].catalogue.in_stock!.gate_pass.min_price = 99;
    expect(definitions[0].labels.gate_pass).toBe('gate pass');
    expect(definitions[0].catalogue.in_stock!.gate_pass.min_price).toBe(0);
    expect(parsed.definitions![1].labels.gate_pass).toBe('gate pass');
    expect(schema.safeParse({ definitions: [...definitions, { ...draft(), id: 'one_too_many' }] }).success).toBe(false);
  });

  it('rejects mixed selections, empty selections, duplicates and reserved actor ids', () => {
    for (const body of [{ npcs: ['smith'], definitions: [draft()] }, { npcs: [] }, { definitions: [] }, { definitions: [draft(), draft()] }]) {
      expect(schema.safeParse(body).success).toBe(false);
    }
    const duplicate = schema.safeParse({ definitions: [draft(), draft()] });
    expect(!duplicate.success && duplicate.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['definitions', 1, 'id'], message: expect.stringMatching(/Duplicate NPC id/) })]));
    for (const id of RESERVED_IDS) expect(schema.safeParse({ definitions: [{ ...draft(), id }] }).success).toBe(false);
  });

  it('rejects malformed definitions, unsupported fields and invalid start inventories', () => {
    for (const body of [
      { definitions: [{ id: 'ada' }] },
      { definitions: [draft()], map: 'custom' },
      { definitions: [draft()], start: { player: { gold: -1, stock: {} } } },
    ]) expect(schema.safeParse(body).success).toBe(false);
  });

  it('bounds the total payload even when every individual draft fits', () => {
    const definitions = Array.from({ length: 4 }, (_, i) => ({ ...draft(), id: `custom_${i}`, art: { style: '', references: [reference, reference, reference] } }));
    for (const npc of definitions) expect(NpcBundleSchema.safeParse({ format: 'npc-workshop', version: 1, npc }).success).toBe(true);
    expect(JSON.stringify({ definitions }).length).toBeGreaterThan(MAX_WORLD_CREATE_BYTES);
    const parsed = schema.safeParse({ definitions });
    expect(!parsed.success && parsed.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/World creation.*UTF-8 bytes/) })]));
  });
});
