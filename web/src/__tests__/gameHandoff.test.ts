import type { BenchResponse, NpcDraft } from '@blacksmith/shared';
import { buildSetup } from '@blacksmith/shared/src/setup';
import { describe, expect, it } from 'vitest';
import { draftKey, gameExampleCommand, hasCheckedModelAction, hasModelReply } from '../gameHandoff';
import { createNpcDownload } from '../npcTransfer';

const npc = (): NpcDraft => buildSetup({ role: 'guard', name: 'Portable Ada', news: 'tells' }).draft;
const reply = (): BenchResponse => ({
  ok: true, errors: [], outcome: 'acted', attempts: [{ content: '{"action":"SAY","say":"Hello."}', ok: true, reason: null, latency_ms: 1 }],
  events: [{ id: 'e_0002', tick: 0, actor: 'ada', target: 'player', location: 'gate', witnesses: [], type: 'SAID', data: { text: 'Hello.' } }],
  view: {} as BenchResponse['view'],
});

describe('Workshop game handoff', () => {
  it('recognizes an accepted nonverbal model action as a successful test', () => {
    const result = reply();
    result.attempts[0].content = '{"action":"EMOTE","emote":"nods"}';
    result.events = [{ ...result.events[0], type: 'EMOTED', data: { text: 'nods' } }];
    expect(hasCheckedModelAction(result, 'ada')).toBe(true);
    expect(hasModelReply(result, 'ada')).toBe(false);
  });

  it('does not count controlled tests, fallback lines, outages or a silent trigger as checked model actions', () => {
    const result = reply();
    expect(hasCheckedModelAction(result, 'ada')).toBe(true);
    expect(hasCheckedModelAction({ ...result, attempts: [] }, 'ada')).toBe(false);
    expect(hasCheckedModelAction({ ...result, outcome: 'fallback' }, 'ada')).toBe(false);
    expect(hasCheckedModelAction({ ...result, outcome: 'unavailable' }, 'ada')).toBe(false);
    expect(hasCheckedModelAction({ ...result, events: [] }, 'ada')).toBe(false);
    expect(hasCheckedModelAction(result, 'another_npc')).toBe(false);
  });

  it('requires an accepted model answer with a direct NPC spoken reply', () => {
    expect(hasModelReply(reply(), 'ada')).toBe(true);
    const repaired = reply();
    repaired.attempts.unshift({ content: 'bad', ok: false, reason: 'bad action', latency_ms: 1 });
    expect(hasModelReply(repaired, 'ada')).toBe(true);
  });

  it.each([
    ['configuration failure', (r: BenchResponse) => { r.ok = false; }],
    ['no model call', (r: BenchResponse) => { r.attempts = []; r.outcome = null; }],
    ['rejected proposals', (r: BenchResponse) => { r.outcome = 'fallback'; }],
    ['provider unavailable', (r: BenchResponse) => { r.outcome = 'unavailable'; }],
    ['controlled test', (r: BenchResponse) => { r.attempts = []; r.outcome = null; r.events = []; }],
    ['unaccepted model answer', (r: BenchResponse) => { r.attempts[0].ok = false; }],
    ['action with no spoken reply', (r: BenchResponse) => { r.events = []; }],
    ['only player speech', (r: BenchResponse) => { r.events[0].actor = 'player'; }],
    ['another NPC speech', (r: BenchResponse) => { r.events[0].actor = 'someone_else'; }],
    ['broadcast from a timer', (r: BenchResponse) => { r.events[0].target = null; }],
  ])('does not highlight a successful conversation for %s', (_label, change) => {
    const r = reply(); change(r);
    expect(hasModelReply(r, 'ada')).toBe(false);
  });

  it('tracks every supported setting, including nested configuration, separately from the exported copy', () => {
    const source = npc();
    source.art.references = ['data:image/png;base64,AAAA'];
    const exported = createNpcDownload(source);
    if (!exported.ok) throw new Error(exported.errors.join('; '));
    const key = draftKey(source);
    const snapshotKey = draftKey(exported.npc);
    for (const change of [
      (d: NpcDraft) => { d.persona += '\nBe patient.'; },
      (d: NpcDraft) => { d.name = 'Edited Ada'; },
      (d: NpcDraft) => { d.id = 'different_ada'; },
      (d: NpcDraft) => { d.catalogue.in_stock!.gate_pass.min_price = 3; },
      (d: NpcDraft) => { d.start.stock.gate_pass = 99; },
      (d: NpcDraft) => { d.labels.gate_pass = 'new pass'; },
      (d: NpcDraft) => { d.signals.open_gate = 'Open something else.'; },
      (d: NpcDraft) => { d.art.references[0] = 'data:image/png;base64,BBBB'; },
      (d: NpcDraft) => { d.schedule.push({ from: 7, place: 'square' }); },
      (d: NpcDraft) => { d.fallbacks.unavailable = 'Later.'; },
      (d: NpcDraft) => { d.effort = 'high'; },
      (d: NpcDraft) => { d.triggers = []; },
      (d: NpcDraft) => { d.verbs.push('EMOTE'); },
      (d: NpcDraft) => { d.model_verbs.push('EMOTE'); },
      (d: NpcDraft) => { d.facts.push('purse'); },
      (d: NpcDraft) => { d.perception_radius = 0; },
    ]) {
      const edited = structuredClone(source); change(edited);
      expect(draftKey(edited)).not.toBe(key);
      expect(draftKey(exported.npc)).toBe(snapshotKey);
    }
    expect(JSON.parse(exported.text).npc).toEqual(exported.npc);
    const reverted = structuredClone(source);
    reverted.name = 'Edited'; reverted.name = source.name;
    expect(draftKey(reverted)).toBe(key);
  });

  it('ignores object key ordering when comparing complete configurations', () => {
    const original = npc();
    const reordered = Object.fromEntries(Object.entries(original).reverse()) as NpcDraft;
    reordered.signals = Object.fromEntries(Object.entries(original.signals).reverse());
    expect(draftKey(reordered)).toBe(draftKey(original));
  });

  it('builds the runnable command with an explicit server, current filename and quoted arguments', () => {
    expect(gameExampleCommand('http://localhost:8787/', 'ada.npc.json')).toEqual({ ok: true,
      command: "npm run game-example -- --server 'http://localhost:8787' --bundle 'ada.npc.json' --interactive" });
    const quoted = gameExampleCommand('http://localhost:8787', "/tmp/Ada's NPC $(touch /tmp/wrong)`whoami`.npc.json");
    expect(quoted.ok && quoted.command).toContain("'/tmp/Ada'\\''s NPC $(touch /tmp/wrong)`whoami`.npc.json'");
  });

  it.each(['invalid', 'file:///tmp/npc', 'http://user:secret@host', 'http://host/api/v1', 'http://host/?token=secret', 'http://host/#token'])('rejects an unsupported or credential-bearing server URL: %s', (server) => {
    expect(gameExampleCommand(server, 'ada.npc.json').ok).toBe(false);
  });

  it.each(['', '  ', 'ada\nnext-line', 'ada\0file'])('requires a single-line file path', (path) => {
    expect(gameExampleCommand('http://localhost:8787', path).ok).toBe(false);
  });
});
