import type { BenchAttempt, BenchResponse, EngineEvent, NpcDraft, PreviewResponse, StateView } from '@blacksmith/shared';
// The zod-free modules, so the schemas stay out of the bundle.
import { MAX_LABEL_LENGTH, MAX_SAY_LENGTH, MAX_SIGNAL_TEXT, MAX_SIGNALS } from '@blacksmith/shared/src/limits';
import {
  DEFAULT_SPRITE,
  EFFORT_CHOICES,
  EFFORT_INFO,
  FACT_BLOCKS,
  FACT_INFO,
  LEDGER_VERBS,
  MAX_PERSONA_LENGTH,
  MAX_REFERENCES,
  MAX_TRIGGER_HOURS,
  MODEL_CHOICES,
  MODEL_INFO,
  MODEL_VERBS,
  NPC_SPRITES,
  VERB_INFO,
  type LedgerVerb,
  type ModelVerb,
  type ScheduleEntry,
  type Trigger,
} from '@blacksmith/shared/src/npc-info';
import { benchIdeas } from '@blacksmith/shared/src/handoff';
import { buildSetup, freshNpcId, ROLE_CARDS, SETUP_ROLES, TELLER_INFO, TELLERS, type SetupResult, type SetupRole, type Teller } from '@blacksmith/shared/src/setup';
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { clockText, editorApi } from './api';
import { outcomeText } from './benchVerdict';
import { controlledExplanations, modelExplanations, type ActionExplanation } from './actionExplanation';
import { ArtForm } from './ArtForm';
import { CatalogueForm } from './CatalogueForm';
import { Questionnaire } from './Questionnaire';
import { readPersonality, writePersonality } from './personality';
import { validationHelp, type ValidationHelp } from './validationHelp';
import { GuidedSetup } from './GuidedSetup';
import { ContractCard, gaveText, speechFirst } from './Chat';
import { ImportNpcButton } from './ImportNpcButton';
import { GameConnection } from './GameConnection';
import { draftKey, hasCheckedModelAction, type HandoffSnapshot } from './gameHandoff';
import { editorIdentity } from './editorPresentation';

// The NPC workshop: edit a definition on the left, try it on the test bench on the right.
// The draft lives in this browser; the server checks it on every preview and bench turn.

const STORAGE_KEY = 'bs_npc_draft';

const BLANK: NpcDraft = {
  id: 'new_npc',
  name: 'New NPC',
  persona: 'You voice an NPC in a game.\n\nReply only with JSON matching the schema. `say` is what you say aloud: one or two short sentences, first person.',
  verbs: ['SAY'],
  model_verbs: ['SAY'],
  facts: ['clock'],
  perception_radius: 4,
  model: 'muse_spark_open',
  effort: 'low',
  location: 'square',
  schedule: [],
  sprite: DEFAULT_SPRITE,
  art: { style: '', references: [] },
  start: { gold: 0, stock: {} },
  catalogue: {},
  labels: {},
  signals: {},
  triggers: [{ kind: 'on_spoken_to' }],
  cue: "Reply to the customer's last words.",
  fallbacks: { rejected: 'Hm. Ask me again.', unavailable: "I'm busy. Come back in a moment." },
};

const DEFAULT_TIMER: Extract<Trigger, { kind: 'every_hours' }> = { kind: 'every_hours', hours: 6, cue: 'Nobody has spoken to you for a while. Do what you would do now, unasked.' };

// Only trigger shapes the editor knows; anything else in a stored draft is dropped. Drafts from before triggers answered when spoken to.
function readTriggers(x: unknown): Trigger[] {
  if (!Array.isArray(x)) return BLANK.triggers;
  const out: Trigger[] = [];
  for (const t of x as Record<string, unknown>[]) {
    if (t?.kind === 'on_spoken_to') out.push({ kind: 'on_spoken_to' });
    if (t?.kind === 'every_hours' && typeof t.hours === 'number' && typeof t.cue === 'string') out.push({ kind: 'every_hours', hours: t.hours, cue: t.cue });
    if ((t?.kind === 'on_meet' || t?.kind === 'on_new_memory') && typeof t.cue === 'string') out.push({ kind: t.kind, cue: t.cue });
  }
  return out;
}


const isRecord = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const everyValue = (x: unknown, ok: (v: unknown) => boolean) => isRecord(x) && Object.values(x).every(ok);
const range = (x: unknown) => isRecord(x) && num(x.min) && num(x.max);
const SHAPE = {
  start: (x: unknown) => isRecord(x) && num(x.gold) && everyValue(x.stock, num),
  catalogue: (x: unknown) => {
    if (!isRecord(x)) return false;
    const { in_stock: goods, made_to_order: mto } = x;
    if (goods !== undefined && !everyValue(goods, (g) => isRecord(g) && num(g.min_price))) return false;
    if (mto === undefined) return true;
    return (
      isRecord(mto) &&
      num(mto.min_margin) &&
      num(mto.workload_per_job) &&
      everyValue(mto.materials, num) &&
      everyValue(mto.items, (it) => isRecord(it) && range(it.damage) && range(it.weight) && range(it.durability) && num(it.base_ticks))
    );
  },
};

// A stored draft may come from an older build or be hand-edited. The form reads every field, so anything that
// isn't the right shape falls back to the blank NPC's value; the server still checks the values themselves.
function loadStored(): NpcDraft | null {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const text = <K extends 'id' | 'name' | 'persona' | 'cue'>(k: K) => (typeof v[k] === 'string' ? (v[k] as string) : BLANK[k]);
  const list = <T extends string>(x: unknown, allowed: readonly T[], fallback: T[]) =>
    Array.isArray(x) ? (x.filter((i) => (allowed as readonly unknown[]).includes(i)) as T[]) : fallback;
  const fb = (v.fallbacks && typeof v.fallbacks === 'object' ? v.fallbacks : {}) as Record<string, unknown>;
  // The form reads these field by field, so a catalogue or start of the wrong shape (an item type without its ranges, a
  // price that isn't a number) would crash it; one that isn't shaped right is replaced whole.
  const object = <K extends 'start' | 'catalogue'>(k: K) => (SHAPE[k](v[k]) ? (v[k] as NpcDraft[K]) : BLANK[k]);
  const verbs = list(v.verbs, LEDGER_VERBS, BLANK.verbs);
  return {
    id: text('id'),
    name: text('name'),
    persona: text('persona'),
    verbs: verbs.includes('SAY') ? verbs : ['SAY', ...verbs],
    model_verbs: list(v.model_verbs, MODEL_VERBS, BLANK.model_verbs).filter((m) => verbs.includes(m)),
    facts: list(v.facts, FACT_BLOCKS, BLANK.facts),
    perception_radius: typeof v.perception_radius === 'number' && Number.isFinite(v.perception_radius) ? v.perception_radius : BLANK.perception_radius,
    location: typeof v.location === 'string' ? v.location : BLANK.location,
    // Drafts from before schedules stayed at their place all day, and looked like the default villager.
    schedule: Array.isArray(v.schedule)
      ? (v.schedule as Record<string, unknown>[]).filter((e) => typeof e?.from === 'number' && typeof e.place === 'string').map((e) => ({ from: e.from as number, place: e.place as string }))
      : BLANK.schedule,
    sprite: (NPC_SPRITES as readonly unknown[]).includes(v.sprite) ? (v.sprite as number) : BLANK.sprite,
    art: readArt(v.art),
    // Drafts from before the picker were all on Muse Spark.
    model: (MODEL_CHOICES as readonly unknown[]).includes(v.model) ? (v.model as NpcDraft['model']) : 'muse_spark',
    effort: (EFFORT_CHOICES as readonly unknown[]).includes(v.effort) ? (v.effort as NpcDraft['effort']) : 'low',
    start: object('start'),
    catalogue: object('catalogue'),
    // Drafts from before labels went by their names.
    labels: everyValue(v.labels, (l) => typeof l === 'string') ? (v.labels as Record<string, string>) : BLANK.labels,
    // Drafts from before signals asked the game for nothing.
    signals: everyValue(v.signals, (m) => typeof m === 'string') ? (v.signals as Record<string, string>) : BLANK.signals,
    triggers: readTriggers(v.triggers),
    cue: text('cue'),
    fallbacks: {
      rejected: typeof fb.rejected === 'string' ? fb.rejected : BLANK.fallbacks.rejected,
      unavailable: typeof fb.unavailable === 'string' ? fb.unavailable : BLANK.fallbacks.unavailable,
    },
  };
}

// Drafts from before the art box had none. A reference that isn't a picture is dropped; the server checks the rest.
function readArt(x: unknown): NpcDraft['art'] {
  const a = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const references = Array.isArray(a.references) ? a.references.filter((r): r is string => typeof r === 'string' && r.startsWith('data:image/')) : [];
  return { style: typeof a.style === 'string' ? a.style : '', references: references.slice(0, MAX_REFERENCES) };
}

function store(draft: NpcDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // private window or storage off: the draft just isn't remembered
  }
}

// A bench turn: the model's answers to a line, or a proposal the workshop sent the ledger itself.
type Turn =
  | { kind: 'model'; text: string; attempts: BenchAttempt[]; outcome: BenchResponse['outcome'] }
  | { kind: 'controlled'; label: string; proposal: Record<string, unknown> | null; accepted: boolean; reason: string | null };

// The draft and its revision: every change counts up, so an answer from the server says which version it checked.
type Doc = { draft: NpcDraft | null; rev: number };
type Check = { rev: number } & ({ result: PreviewResponse } | { error: string });
type Status = 'checking' | 'ok' | 'invalid' | 'error';

export function Editor() {
  const [library, setLibrary] = useState<NpcDraft[]>([]);
  const [canSave, setCanSave] = useState(false);
  const [places, setPlaces] = useState<string[]>([]);
  // A draft from an earlier visit opens as it was. A first visit picks a starting point instead.
  const [doc, setDoc] = useState<Doc>(() => ({ draft: loadStored(), rev: 0 }));
  const [check, setCheck] = useState<Check | null>(null);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false); // the starting points, opened over a draft
  const [started, setStarted] = useState(0); // drafts started here; each gets a fresh bench and forms
  const [applying, setApplying] = useState(false);
  const [benchBusy, setBenchBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<{ title: string; errors: string[] } | null>(null);
  const transferLock = useRef(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<HandoffSnapshot | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [testedKey, setTestedKey] = useState<string | null>(null);
  const returnTo = useRef<{ element: HTMLElement | null; scroll: number }>({ element: null, scroll: 0 });
  const [section, setSection] = useState('character');
  // The draft as it was started or saved, to tell whether replacing it loses edits. A restored draft's start is
  // unknown, so it counts as edited.
  const baseline = useRef<string | null>(null);
  const latest = useRef(0);
  const advanced = useRef<HTMLDetailsElement>(null);
  const characterAdvanced = useRef<HTMLDetailsElement>(null);
  const moreMenu = useRef<HTMLDetailsElement>(null);
  const currentDoc = useRef(doc);
  currentDoc.current = doc;

  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      const menu = moreMenu.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      } else if (event instanceof PointerEvent && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, []);

  useEffect(() => {
    editorApi.library().then(
      (lib) => {
        setLibrary(lib.npcs);
        setCanSave(lib.can_save);
        setPlaces(lib.places);
      },
      (e: Error) => setNotice(e.message),
    );
  }, []);

  // Check the draft on the server shortly after each edit. An answer counts only for the revision it checked, so a slow
  // one for an older draft is never shown as this one's.
  useEffect(() => {
    latest.current = doc.rev;
    const { draft, rev } = doc;
    if (!draft) return;
    store(draft);
    const t = setTimeout(() => {
      editorApi.preview(draft).then(
        (result) => rev === latest.current && setCheck({ rev, result }),
        (e: Error) => rev === latest.current && setCheck({ rev, error: e.message }),
      );
    }, 350);
    return () => clearTimeout(t);
  }, [doc, retry]);

  const draft = doc.draft;
  const setDraft = (update: (d: NpcDraft) => NpcDraft) => setDoc((s) => (s.draft ? { draft: update(s.draft), rev: s.rev + 1 } : s));
  const set = <K extends keyof NpcDraft>(key: K, value: NpcDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const fresh = check?.rev === doc.rev ? check : null;
  const status: Status = !fresh ? 'checking' : 'error' in fresh ? 'error' : fresh.result.ok ? 'ok' : 'invalid';
  const valid = status === 'ok';
  const currentKey = draft ? draftKey(draft) : null;
  const tested = currentKey !== null && testedKey === currentKey;
  const identity = draft ? editorIdentity(draft) : null;
  const ready = fresh && 'result' in fresh && fresh.result.ok ? fresh.result : null;
  // This draft's problems. While a newer edit is being checked the last ones stay, dimmed.
  const problems = check && 'result' in check && !check.result.ok ? check.result.errors : [];
  const locked = applying || benchBusy || transferBusy;

  // Every new starting point (a template, a blank NPC, a file from the library) comes through here. The old
  // conversation belongs to another NPC, so the bench is cleared first and the draft switches only once it's gone; if
  // it can't be cleared, the draft and the conversation stay as they were.
  const applyDraft = async (next: NpcDraft, what: string, done: string, openTest = false) => {
    // Imports hold the transfer lock while using this same replacement path.
    if (applying || benchBusy) return;
    if (draft && JSON.stringify(draft) !== baseline.current) {
      if (!confirm(`${what}? It replaces “${draft.name}” in this browser, and your changes to it are lost. Saved files aren't touched.`)) return;
    }
    setApplying(true);
    setNotice(null);
    try {
      await editorApi.reset();
    } catch (e) {
      setNotice(`The test session couldn't be cleared, so your draft stays as it was: ${(e as Error).message}`);
      return;
    } finally {
      setApplying(false);
    }
    setConnectionOpen(false);
    setSnapshot(null);
    setDownloaded(false);
    setTestedKey(null);
    baseline.current = JSON.stringify(next);
    setTransferError(null);
    setCheck(null);
    setDoc((s) => ({ draft: next, rev: s.rev + 1 }));
    setStarted((n) => n + 1);
    setStarting(false);
    setNotice(done);
    setSection(openTest ? 'test' : 'character');
    if (openTest) {
      setSection('test');
      requestAnimationFrame(() => document.getElementById('test-heading')?.focus());
    }
  };

  const ids = library.map((n) => n.id);
  const fromTemplate = (role: SetupRole, teller?: Teller) => {
    const { draft: next, summary } = buildSetup({ role, teller }, ids);
    void applyDraft(
      next,
      `Start from the ${summary.role} template`,
      `Created ${next.name} from the ${summary.role} template. Make the character yours below.`,
    );
  };
  const fromAnswers = (r: SetupResult, openTest = false) =>
    void applyDraft(
      r.draft,
      'Use this setup',
      `Created ${r.draft.name}. ${openTest ? 'Try a conversation below.' : 'Make the character yours below.'}`,
      openTest,
    );
  const blank = () => void applyDraft({ ...BLANK, id: freshNpcId(BLANK.id, BLANK.id, ids) }, 'Start a blank NPC', 'Started a blank NPC in this browser.');
  const load = (n: NpcDraft) =>
    void applyDraft(n, `Load example ${n.name}`, `Editing a draft copy of ${n.name} from the example library (npcs/${n.id}.json). The example village keeps using its saved definition.`);

  const importNpc = async (file: File) => {
    if (locked || transferLock.current) return;
    transferLock.current = true;
    setTransferBusy(true);
    setTransferError(null);
    try {
      const { prepareNpcImport } = await import('./npcTransfer');
      const imported = await prepareNpcImport(file, editorApi.preview);
      if (!imported.ok) {
        setTransferError({ title: 'Couldn’t import NPC', errors: imported.errors });
        return;
      }
      // An already-running picture read can finish while validation is in flight. Never replace those edits
      // using a confirmation based on an older draft, even though the form is disabled during import.
      if (currentDoc.current.rev !== doc.rev) {
        setTransferError({ title: 'Import paused', errors: ['Your draft changed while the file was being checked. Import it again when your changes are ready.'] });
        return;
      }
      await applyDraft(imported.draft, `Import ${imported.draft.name}`, `Imported ${imported.draft.name}. A fresh test conversation is ready.`, true);
    } catch (e) {
      setTransferError({ title: 'Couldn’t import NPC', errors: [e instanceof Error ? e.message : 'Try choosing the file again.'] });
    } finally {
      transferLock.current = false;
      setTransferBusy(false);
    }
  };

  const downloadNpc = async () => {
    if (!draft || !valid || locked || transferLock.current) return;
    transferLock.current = true;
    setTransferBusy(true);
    setTransferError(null);
    let url: string | null = null;
    try {
      const { createNpcDownload } = await import('./npcTransfer');
      const download = createNpcDownload(draft);
      if (!download.ok) {
        setTransferError({ title: 'Couldn’t download NPC', errors: download.errors });
        return;
      }
      url = URL.createObjectURL(new Blob([download.text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = download.filename;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      setSnapshot({ npc: download.npc, filename: download.filename, sourceKey: draftKey(draft) });
      setDownloaded(true);
      setNotice(`Download requested: ${download.filename}. It contains ${draft.name}’s settings and embedded reference pictures. Conversations, world progress and generated item pictures are not included.`);
    } catch (e) {
      setTransferError({ title: 'Couldn’t download NPC', errors: [e instanceof Error ? e.message : 'Try downloading again.'] });
    } finally {
      // Allow the browser to begin reading the file before releasing the object URL.
      if (url) { const downloadedUrl = url; setTimeout(() => URL.revokeObjectURL(downloadedUrl), 1000); }
      transferLock.current = false;
      setTransferBusy(false);
    }
  };

  const openConnection = async () => {
    if (!draft || !valid || locked || transferLock.current) return;
    returnTo.current = { element: document.activeElement instanceof HTMLElement ? document.activeElement : null, scroll: window.scrollY };
    transferLock.current = true;
    setTransferBusy(true);
    setTransferError(null);
    try {
      // Preparing the handoff is entirely local: no model, world creation or test reset.
      const { createNpcDownload } = await import('./npcTransfer');
      const prepared = createNpcDownload(draft);
      if (!prepared.ok) { setTransferError({ title: 'Couldn’t prepare this NPC', errors: prepared.errors }); return; }
      if (currentDoc.current.rev !== doc.rev) { setTransferError({ title: 'Draft changed', errors: ['Wait for validation and open Use in your game again.'] }); return; }
      if (!snapshot || !downloaded) setSnapshot({ npc: prepared.npc, filename: prepared.filename, sourceKey: draftKey(draft) });
      setNotice(null);
      setConnectionOpen(true);
    } catch (e) {
      setTransferError({ title: 'Couldn’t prepare this NPC', errors: [e instanceof Error ? e.message : 'Try again.'] });
    } finally {
      transferLock.current = false;
      setTransferBusy(false);
    }
  };
  const closeConnection = () => {
    setConnectionOpen(false);
    requestAnimationFrame(() => {
      returnTo.current.element?.focus({ preventScroll: true });
      scrollTo(0, returnTo.current.scroll);
    });
  };

  const save = async () => {
    if (!draft) return;
    setNotice(null);
    try {
      let r = await editorApi.save(draft);
      // A draft loaded from the library keeps its id, so saving would replace its files: only on a clear yes.
      if (r.exists) {
        if (!confirm(`npcs/${draft.id}.json and prompts/${draft.id}.md already exist. Replace them with this draft?`)) {
          setNotice(`Not saved. Change the id to save it as a new NPC.`);
          return;
        }
        r = await editorApi.save(draft, true);
      }
      setNotice(r.ok ? `Saved npcs/${draft.id}.json and prompts/${draft.id}.md. Restart the server to use it in the example village.` : r.errors.join('; '));
      if (r.ok) {
        baseline.current = JSON.stringify(draft);
        setLibrary((lib) => [...lib.filter((n) => n.id !== draft.id), draft].sort((a, b) => a.id.localeCompare(b.id)));
      }
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  // The bench is beside the definition on a wide screen and below it on a narrow one: this takes the keys there.
  const test = () => {
    setSection('test');
    requestAnimationFrame(() => document.getElementById('test-heading')?.focus());
  };
  const edit = (id: string) => {
    setSection(id === 'world' || id === 'advanced' ? 'abilities' : id === 'appearance' ? 'character' : id);
    requestAnimationFrame(() => focusSetting(document.getElementById(`${id}-h`)));
  };
  const openPermissions = () => {
    setSection('abilities');
    if (advanced.current) advanced.current.open = true;
    requestAnimationFrame(() => document.getElementById('permissions')?.focus());
  };

  const goToProblem = (target: ValidationHelp['target'], error: string) => {
    if (!target) return;
    if (target === 'permissions') openPermissions();
    if (target === 'character-advanced') {
      setSection('character');
      if (characterAdvanced.current) characterAdvanced.current.open = true;
      requestAnimationFrame(() => focusSetting(fieldForError(error) ?? document.getElementById('character-settings')));
      return;
    }
    setSection(['character', 'appearance', 'artwork'].includes(target) ? 'character' : 'abilities');
    requestAnimationFrame(() => focusSetting(fieldForError(error) ?? document.getElementById(target === 'permissions' ? 'permissions' : target === 'catalogue' ? 'catalogue-h' : target === 'character' ? 'character-name' : `${target}-h`)));
  };
  const problemList = status === 'invalid' && problems.length > 0 && (
    <div className="errors" role="alert">
      <b>{problems.length === 1 ? 'One setting needs attention' : `${problems.length} settings need attention`}</b>
      <ul>{problems.map((error, index) => {
        const help = validationHelp(error);
        return <li key={`${error}-${index}`}>{help.message} {help.target && <button type="button" className="secondary small" onClick={() => goToProblem(help.target, error)}>{help.label}</button>}</li>;
      })}</ul>
    </div>
  );

  return (
    <>
    <div className="workshop" hidden={connectionOpen}>
      <section className="panel workshop-head" aria-labelledby="workshop-h">
        <div className="wh-top">
          <div className="wh-text">
            <h2 id="workshop-h">{draft ? <>{draft.name || 'Unnamed character'} <span className="workshop-role">· {identity?.role}</span></> : 'NPC Workshop'}</h2>
            {draft && <div className="workshop-status" role="status">
              {status === 'checking' && <span className="muted">Checking settings…</span>}
              {status === 'ok' && <span className="status-ok">✓ {tested ? 'Checked action completed' : 'Ready to test'}</span>}
              {status === 'invalid' && <button type="button" className="text-button status-bad" onClick={() => goToProblem(validationHelp(problems[0]).target, problems[0])}>✕ {problems.length === 1 ? '1 setting' : `${problems.length} settings`} to fix</button>}
              {status === 'error' && <button type="button" className="text-button status-bad" onClick={() => setRetry((n) => n + 1)}>Couldn’t check settings · Retry</button>}
            </div>}
          </div>
          {draft && (
            <div className="wh-actions">
              <button type="button" disabled={locked || (tested && !valid)} onClick={tested ? () => void openConnection() : test}>{tested ? 'Use in your game' : `Test ${draft.name || 'your NPC'}`} →</button>
              <details className="workshop-more" ref={moreMenu}>
                <summary>More…</summary>
                <div className="workshop-more-actions">
                  <button type="button" className="secondary" disabled={locked} aria-expanded={starting} aria-controls="starters" onClick={() => { setStarting((s) => !s); if (moreMenu.current) moreMenu.current.open = false; }}>{starting ? 'Close starting points' : 'New NPC…'}</button>
                  <ImportNpcButton disabled={locked} onImport={(file) => { if (moreMenu.current) moreMenu.current.open = false; void importNpc(file); }} />
                  <button type="button" className="secondary" disabled={!valid || locked} onClick={() => { if (moreMenu.current) moreMenu.current.open = false; void downloadNpc(); }}>Download NPC</button>
                  {canSave && <button type="button" className="secondary" onClick={() => { if (moreMenu.current) moreMenu.current.open = false; void save(); }} disabled={!valid || locked}>Save to files — development only</button>}
                </div>
              </details>
            </div>
          )}
        </div>
        <p className="muted small workshop-intro">Create a character, set its rules, then try a conversation.</p>
        <details className="workshop-file-help">
          <summary>How saving works</summary>
          <p className="muted small">Your draft stays in this browser. Download its settings from More… or Use in your game to keep a copy you can import later. Reference pictures are embedded; conversations, world progress and generated pictures are not included.</p>
          {!canSave && <p className="muted small">File saving is not enabled on this server.</p>}
          <p className="muted small">
            Save to files writes <code>npcs/&lt;id&gt;.json</code> and <code>prompts/&lt;id&gt;.md</code> on a development server with file saving enabled.
            Existing files require overwrite confirmation. Restart that server to load the saved definitions into the example village.
          </p>
          <p className="muted small">Browser drafts and test sessions are separate from these files. Saving a draft does not update a running village.</p>
        </details>
      </section>

      {notice && (
        <div className="note-box" role="status">
          {notice}
        </div>
      )}
      {transferBusy && <div className="note-box" role="status">Preparing the NPC file…</div>}
      {transferError && <div className="errors" role="alert"><b>{transferError.title}</b><ul>{transferError.errors.map((error, i) => <li key={i}>{error}</li>)}</ul><p>Your current draft and test conversation have been kept.</p></div>}
      {(!draft || starting) && <Starters first={!draft} library={library} locked={locked} onTemplate={fromTemplate} onAnswers={fromAnswers} onBlank={blank} onLoad={load} onImport={(file) => void importNpc(file)} />}

      {draft && (
        <fieldset className="workshop-editor" aria-label="NPC editor and test session" disabled={applying || transferBusy}>
          <nav className="editor-nav" aria-label="Workshop sections">
            {([['character', 'Character'], ['abilities', 'Abilities & rules'], ['test', 'Test']] as const).map(([id, label]) => (
              <button key={id} type="button" className="secondary" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>
            ))}
          </nav>
          <section className="panel definition" aria-label="Definition" hidden={section === 'test'}>
            {problemList}

            <Section active={section === 'character'} id="character" title="Character" intro="Give your character a name and a personality.">
              <div>
                <Field label="Name">
                  <input id="character-name" data-field="name" value={draft.name} maxLength={40} onChange={(e) => set('name', e.target.value)} />
                </Field>
              </div>
              <Field label="Personality" hint="Describe their traits and how they speak.">
                <textarea rows={3} maxLength={300} value={readPersonality(draft.persona)} placeholder="e.g. Friendly, proud of her work, and wary of strangers." onChange={(e) => {
                  const persona = writePersonality(draft.persona, e.target.value);
                  if (persona.length <= MAX_PERSONA_LENGTH) set('persona', persona);
                }} />
              </Field>
              <div className="character-abilities">
                <span className="field-label">Abilities summary</span>
                <p>{identity?.abilities}</p>
                <button type="button" className="text-button" onClick={() => edit('abilities')}>Edit abilities →</button>
              </div>
              <details className="editor-disclosure">
                <summary id="appearance-h">Appearance</summary>
                <Field label="Character sprite" hint="Used in the example village."><SpritePicker value={draft.sprite} onChange={(s) => set('sprite', s)} /></Field>
              </details>
              {(draft.catalogue.in_stock || draft.catalogue.made_to_order || problems.some((problem) => /^art[.:]/.test(problem))) && <details className="editor-disclosure">
                <summary id="artwork-h">Generated item artwork</summary>
                <p className="muted small">Set the art direction for pictures of items this character sells or makes.</p>
                <ArtForm key={started} draft={draft} valid={valid} onChange={(art) => set('art', art)} />
              </details>}
              <details className="character-advanced" ref={characterAdvanced}>
                <summary id="character-settings">Advanced character settings</summary>
                <Field label="Id" hint="its file name: lowercase, digits, _">
                  <input data-field="id" value={draft.id} maxLength={41} onChange={(e) => set('id', e.target.value)} />
                </Field>
              <Field label="Full persona" hint={`${draft.persona.length} / ${MAX_PERSONA_LENGTH} · sent first, as the system prompt`}>
                <textarea data-field="persona" className="persona" value={draft.persona} maxLength={MAX_PERSONA_LENGTH} onChange={(e) => set('persona', e.target.value)} />
              </Field>
              <div className="row2">
                <Field label="Voiced by" hint={MODEL_INFO[draft.model].description}>
                  <select data-field="model" value={draft.model} onChange={(e) => set('model', e.target.value as NpcDraft['model'])}>
                    {MODEL_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {MODEL_INFO[m].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Thinking" hint={EFFORT_INFO[draft.effort].description}>
                  <select data-field="effort" value={draft.effort} onChange={(e) => set('effort', e.target.value as NpcDraft['effort'])}>
                    {EFFORT_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {EFFORT_INFO[m].label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <h4>If something goes wrong</h4>
              <div className="row2">
                <Field label="If the ledger rejects it twice">
                  <input data-field="fallbacks.rejected" value={draft.fallbacks.rejected} maxLength={MAX_SAY_LENGTH} onChange={(e) => set('fallbacks', { ...draft.fallbacks, rejected: e.target.value })} />
                </Field>
                <Field label="If the model is down">
                  <input
                    data-field="fallbacks.unavailable"
                    value={draft.fallbacks.unavailable}
                    maxLength={MAX_SAY_LENGTH}
                    onChange={(e) => set('fallbacks', { ...draft.fallbacks, unavailable: e.target.value })}
                  />
                </Field>
              </div>
              </details>
            </Section>

            <Section active={section === 'abilities'} id="abilities" title="Abilities & rules" intro={identity?.abilities ?? 'Set the actions and limits for this character.'}>
              <h4 id="catalogue-h" tabIndex={-1}>What it sells or makes</h4>
              <p className="muted small">Set up goods for sale or items made to order. Leave both options off for a character that only talks.</p>
              {(draft.catalogue.in_stock || draft.catalogue.made_to_order) && !draft.model_verbs.includes('OFFER') && (
                <div className="catalogue-warning" role="alert">
                  <span className="catalogue-warning-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>This character cannot offer its listed items</strong>
                    <p>Enable OFFER under Advanced, or turn off both catalogue options below.</p>
                    <button type="button" className="secondary small" onClick={openPermissions}>Review OFFER permissions →</button>
                  </div>
                </div>
              )}
              <CatalogueForm value={draft} onChange={({ catalogue, start }) => setDraft((d) => ({ ...d, catalogue, start }))} />
              {draft.verbs.includes('SIGNAL') && <>
                <h4 id="signals-h" tabIndex={-1}>What it can ask the game for</h4>
                <Signals value={draft.signals} onChange={(signals) => set('signals', signals)} />
              </>}
            </Section>

            <details className="editor-disclosure" hidden={section !== 'abilities'}>
              <summary id="world-h">Example village settings</summary>
              <p className="muted small">Location, schedule and perception use the bundled village map.</p>
              <div className="row2">
                <Field label="Default location" hint="Place on the bundled village map when no other stop is scheduled.">
                  <PlacePicker field="location" places={places} value={draft.location} onChange={(p) => set('location', p)} />
                </Field>
                <Field label="Perception radius" hint="Distance in tiles on the bundled village map.">
                  <input
                    data-field="perception_radius"
                    type="number"
                    min={0}
                    max={20}
                    value={draft.perception_radius}
                    onChange={(e) => set('perception_radius', Number.parseInt(e.target.value || '0', 10))}
                  />
                </Field>
              </div>
              <Schedule places={places} home={draft.location} value={draft.schedule} onChange={(s) => set('schedule', s)} />
              <h4>When it acts</h4>
              <Triggers triggers={draft.triggers} onChange={(triggers) => set('triggers', triggers)} />
              <Field label="Instruction when spoken to" hint="Tells the character how to respond to a conversation.">
                <input data-field="cue" value={draft.cue} maxLength={300} onChange={(e) => set('cue', e.target.value)} />
              </Field>
            </details>

            <details className="ed-section advanced" ref={advanced} hidden={section !== 'abilities'}>
              <summary>
                Advanced <span className="muted small">permissions, facts, labels and what the model gets</span>
              </summary>
              <h4 id="permissions" tabIndex={-1}>
                What it may do
              </h4>
              <p className="muted small">
                The ledger only accepts the verbs ticked on the left. Of those, the model may choose the ones ticked on the right; the rest are
                issued by code. What each verb checks is fixed in code. The ledger refuses an offer verb with nothing in the catalogue, a
                made-to-order catalogue without START_WORK, and GIVE on an NPC that sells.
              </p>
              <VerbTable draft={draft} onChange={(verbs, model_verbs) => setDraft((d) => ({ ...d, verbs, model_verbs }))} />
              <h4>What it knows</h4>
              <div className="facts">
                {FACT_BLOCKS.map((b) => (
                  <label key={b} className="check">
                    <input
                      type="checkbox"
                      data-field={`facts.${draft.facts.indexOf(b)}`}
                      checked={draft.facts.includes(b)}
                      onChange={(e) => set('facts', e.target.checked ? [...draft.facts, b] : draft.facts.filter((f) => f !== b))}
                    />
                    <span>
                      <b>{FACT_INFO[b].label}</b> <span className="muted">{FACT_INFO[b].description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <h4>Names and labels</h4>
              <Labels draft={draft} onChange={(labels) => set('labels', labels)} />
              <h4>What the model gets</h4>
              {ready ? (
                <>
                  <details open>
                    <summary>Facts in a fresh world</summary>
                    <pre className="code">{ready.facts}</pre>
                  </details>
                  <details>
                    <summary>Answer schema (generated from its verbs)</summary>
                    <pre className="code">{JSON.stringify(ready.schema, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p className="muted small">{status === 'checking' ? 'Checking the draft…' : 'Fix the definition to see it.'}</p>
              )}
            </details>
            <div className="editor-next">
              {section === 'character' && <button type="button" onClick={() => edit('abilities')}>Continue to abilities →</button>}
              {section === 'abilities' && <button type="button" onClick={test}>Test {draft.name || 'your NPC'} →</button>}
            </div>
          </section>

          <aside className="side-col bench-col" aria-label="Isolated test session" hidden={section !== 'test'}>
            <h2 id="test-heading" className="sr-only" tabIndex={-1}>Test your NPC</h2>
            {status === 'checking' && <p className="note-box" role="status">Checking your draft before testing…</p>}
            {status === 'invalid' && problemList}
            {status === 'error' && <div className="note-box" role="alert">Couldn’t check this draft. <button type="button" className="secondary small" onClick={() => setRetry(n => n + 1)}>Check again</button></div>}
            <Bench key={started} draft={draft} valid={valid} onBusy={setBenchBusy} tested={tested} onCheckedAction={(npc) => setTestedKey(draftKey(npc))} onReset={() => setTestedKey(null)} onUseInGame={() => void openConnection()} onEditCharacter={() => edit('character')} />
          </aside>
        </fieldset>
      )}
    </div>
    {connectionOpen && snapshot && draft && <GameConnection snapshot={snapshot} downloaded={downloaded} stale={snapshot.sourceKey !== currentKey} valid={valid} busy={locked} currentName={draft.name} notice={notice} errors={transferError} onBack={closeConnection} onDownload={() => void downloadNpc()} onImport={(file) => void importNpc(file)} />}
    </>
  );
}

// A starting point: a template (a new draft with example settings), the answers to a few questions, a blank NPC, or a
// copy of one from the village.
function Starters({
  first,
  library,
  locked,
  onTemplate,
  onAnswers,
  onBlank,
  onLoad,
  onImport,
}: {
  first: boolean;
  library: NpcDraft[];
  locked: boolean;
  onTemplate: (role: SetupRole, teller?: Teller) => void;
  onAnswers: (r: SetupResult, openTest?: boolean) => void;
  onBlank: () => void;
  onLoad: (n: NpcDraft) => void;
  onImport: (file: File) => void;
}) {
  const [pick, setPick] = useState('');
  const [asking, setAsking] = useState(false);
  const [guiding, setGuiding] = useState(false);
  const chosen = library.find((n) => n.id === pick);
  if (guiding) return <GuidedSetup taken={library.map((n) => n.id)} locked={locked} onUse={(result) => onAnswers(result, true)} onCancel={() => setGuiding(false)} />;
  if (asking) return <Questionnaire taken={library.map((n) => n.id)} locked={locked} onUse={onAnswers} onCancel={() => setAsking(false)} />;
  return (
    <section className="panel starters" id="starters" aria-labelledby="starters-h">
      <h3 id="starters-h">{first ? 'Create your first NPC' : 'Start a new NPC'}</h3>
      <p>Choose a role, give your character a personality, and try a conversation.</p>
      <div className="starter-transfer"><button type="button" disabled={locked} onClick={() => setGuiding(true)}>Create your NPC</button><ImportNpcButton disabled={locked} onImport={onImport} /></div>
      <details className="starter-alternatives"><summary>Other starting points</summary>
      <p className="muted small">A template is a new draft with example settings, ready to test and change. It doesn&apos;t touch the village or its NPCs.</p>
      <div className="starter-ask">
        <button type="button" className="secondary" disabled={locked} onClick={() => setAsking(true)}>
          Help me choose
        </button>
        <span className="muted small">Not sure which? Answer up to four questions, then check the proposal before it replaces anything.</span>
      </div>
      <h4>Role templates</h4>
      <ul className="cards">
        {SETUP_ROLES.map((role) => (
          <li key={role} className="card">
            <b className="card-title">{ROLE_CARDS[role].label}</b>
            <p className="muted small">{ROLE_CARDS[role].blurb}</p>
            <div className="card-actions">
              {role === 'storyteller' ? (
                TELLERS.map((t) => (
                  <button key={t} type="button" disabled={locked} title={TELLER_INFO[t].description} aria-label={`Use the ${TELLER_INFO[t].label} template`} onClick={() => onTemplate(role, t)}>
                    {TELLER_INFO[t].label}
                  </button>
                ))
              ) : (
                <button type="button" disabled={locked} aria-label={`Use the ${ROLE_CARDS[role].label} template`} onClick={() => onTemplate(role)}>
                  Use template
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="starter-other">
        <button type="button" className="secondary" disabled={locked} onClick={onBlank}>
          Blank NPC
        </button>
      </div>
      <div className="starter-library">
        <h4>Example NPCs</h4>
        <p className="muted small">Load an editable draft copy of a named NPC from the example village. Role templates above start independent characters.</p>
        <span className="inline">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Example NPC from the library" disabled={locked}>
            <option value="">Choose…</option>
            {library.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.id}) · example
              </option>
            ))}
          </select>
          <button type="button" className="secondary" disabled={locked || !chosen} onClick={() => chosen && onLoad(chosen)}>
            Load example
          </button>
        </span>
      </div>
      </details>
      {locked && <p className="muted small">Waiting for the test session to finish…</p>}
    </section>
  );
}

// Open any collapsed settings around a validation target before moving keyboard focus.
function fieldForError(error: string): HTMLElement | null {
  const path = CSS.escape(error.split(':', 1)[0]);
  return document.querySelector<HTMLElement>(`[data-field="${path}"]`) ?? document.querySelector<HTMLElement>(`[data-field^="${path}."]`);
}

function focusSetting(element: HTMLElement | null) {
  if (!element) return;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  element.focus();
}

function Section({ id, title, intro, children, active }: { id: string; title: string; intro: string; children: ReactNode; active: boolean }) {
  return (
    <section className="ed-section" hidden={!active} aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} tabIndex={-1}>
        {title}
      </h3>
      <p className="muted small">{intro}</p>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label} {hint && <span className="muted">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

const placeLabel = (p: string) => p.replace(/_/g, ' ');

// The named places on the village map. A value that isn't one (a hand-edited draft) stays listed, and the
// server's check says what's wrong with it.
function PlacePicker({ places, value, onChange, field }: { places: string[]; value: string; onChange: (p: string) => void; field?: string }) {
  const options = places.includes(value) ? places : [value, ...places];
  return (
    <select data-field={field} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((p) => (
        <option key={p} value={p}>
          {placeLabel(p)}
        </option>
      ))}
    </select>
  );
}

// Tiny Dungeon character frames, drawn from the sheet at 2x.
export const spriteStyle = (frame: number) => ({ backgroundPosition: `-${(frame % 12) * 32}px -${Math.floor(frame / 12) * 32}px` });

function SpritePicker({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  return (
    <div data-field="sprite" tabIndex={-1} className="sprites" role="radiogroup" aria-label="Example village sprite">
      {NPC_SPRITES.map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={value === f}
          aria-label={`Character ${f}`}
          className={`sprite${value === f ? ' on' : ''}`}
          style={spriteStyle(f)}
          onClick={() => onChange(f)}
        />
      ))}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourText = (h: number) => `${String(h).padStart(2, '0')}:00`;

// Its day: from an hour it goes to a place, until the next entry. With no entries it stays at its place.
function Schedule({ places, home, value, onChange }: { places: string[]; home: string; value: ScheduleEntry[]; onChange: (s: ScheduleEntry[]) => void }) {
  const sorted = [...value].sort((a, b) => a.from - b.from);
  const replace = (i: number, e: ScheduleEntry) => onChange(sorted.map((x, j) => (j === i ? e : x)));
  const free = HOURS.find((h) => !value.some((e) => e.from === h));
  return (
    <div className="field">
      <span className="field-label">
        Daily schedule <span className="muted">· places on the bundled village map</span>
      </span>
      {sorted.length === 0 && <span className="muted small">At the {placeLabel(home)} all day.</span>}
      {sorted.map((e, i) => (
        <div key={i} className="inline">
          <span className="muted small">from</span>
          <select data-field={`schedule.${value.indexOf(e)}.from`} value={e.from} onChange={(ev) => replace(i, { ...e, from: Number(ev.target.value) })} aria-label="From hour">
            {HOURS.filter((h) => h === e.from || !value.some((x) => x.from === h)).map((h) => (
              <option key={h} value={h}>
                {hourText(h)}
              </option>
            ))}
          </select>
          <span className="muted small">at the</span>
          <PlacePicker field={`schedule.${value.indexOf(e)}.place`} places={places} value={e.place} onChange={(p) => replace(i, { ...e, place: p })} />
          <button type="button" className="secondary small" onClick={() => onChange(sorted.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      {free !== undefined && (
        <div>
          <button type="button" className="secondary small" onClick={() => onChange([...sorted, { from: sorted.length ? free : 8, place: home }])}>
            Add a stop
          </button>
        </div>
      )}
    </div>
  );
}

// What the model and players call each thing it deals in. Only needed when a name isn't a word, such as a game's own
// item id: the NPC then says "iron sword" while the ledger, the log and the dev API keep the id. A name with no label
// left in the box is dropped.
function Labels({ draft, onChange }: { draft: NpcDraft; onChange: (labels: Record<string, string>) => void }) {
  const { start, catalogue, labels } = draft;
  const names = [
    ...new Set([
      ...Object.keys(catalogue.made_to_order?.items ?? {}),
      ...Object.keys(catalogue.made_to_order?.materials ?? {}),
      ...Object.keys(catalogue.in_stock ?? {}),
      ...Object.keys(start.stock),
      ...Object.keys(labels),
    ]),
  ];
  const [extra, setExtra] = useState('');
  const put = (name: string, label: string) => {
    const { [name]: _old, ...rest } = labels;
    onChange(label.trim() ? { ...rest, [name]: label } : rest);
  };
  return (
    <div className="field">
      <span className="field-label">
        What it calls things <span className="muted">· only for names that aren't words, like a game's item ids; the ledger keeps the name</span>
      </span>
      {names.length === 0 && <span className="muted small">It deals in nothing yet.</span>}
      {names.map((n) => (
        <div key={n} className="inline">
          <code className="small">{n}</code>
          <input data-field={`labels.${n}`} value={labels[n] ?? ''} placeholder={n} maxLength={MAX_LABEL_LENGTH} onChange={(e) => put(n, e.target.value)} aria-label={`What it calls ${n}`} />
        </div>
      ))}
      <div className="inline">
        <input value={extra} placeholder="another name it may get (itm_wolf_pelt)" onChange={(e) => setExtra(e.target.value.trim())} aria-label="Another name" />
        <button type="button" className="secondary small" disabled={!/^[a-z][a-z0-9_]{0,40}$/.test(extra) || names.includes(extra)} onClick={() => (put(extra, extra.replace(/_/g, ' ')), setExtra(''))}>
          Add
        </button>
      </div>
    </div>
  );
}

// What it may ask the game to do (SIGNAL): a name the game's code listens for, and what it means, which is what the
// model is told. The ledger only checks it is one of these; the game decides whether it happens.
function Signals({ value, onChange }: { value: Record<string, string>; onChange: (signals: Record<string, string>) => void }) {
  const rows = Object.entries(value);
  const [name, setName] = useState('');
  const valid = /^[a-z][a-z0-9_]{0,40}$/.test(name) && !Object.hasOwn(value, name) && rows.length < MAX_SIGNALS;
  return (
    <div className="field">
      <span className="field-label">
        What it can ask the game for <span className="muted">· your game's code listens for these names and decides whether they happen</span>
      </span>
      {rows.length === 0 && <span className="muted small">No signals yet. Add one, such as open_gate or follow_player.</span>}
      {rows.map(([n, meaning]) => (
        <div key={n} className="inline">
          <code className="small">{n}</code>
          <input
            data-field={`signals.${n}`}
            value={meaning}
            placeholder="what it means, as the NPC is told"
            maxLength={MAX_SIGNAL_TEXT}
            onChange={(e) => onChange({ ...value, [n]: e.target.value })}
            aria-label={`What ${n} means`}
          />
          <button type="button" className="secondary small" onClick={() => onChange(Object.fromEntries(rows.filter(([x]) => x !== n)))}>
            Remove
          </button>
        </div>
      ))}
      <div className="inline">
        <input value={name} placeholder="a name (open_gate)" onChange={(e) => setName(e.target.value.trim())} aria-label="New signal name" />
        <button type="button" className="secondary small" disabled={!valid} onClick={() => (onChange({ ...value, [name]: '' }), setName(''))}>
          Add a signal
        </button>
      </div>
    </div>
  );
}

const TRIGGER_LABELS = {
  on_spoken_to: { label: 'When someone speaks to them', description: 'Reply to conversations. Turn this on if the character should answer players.' },
  every_hours: { label: 'At regular intervals', description: 'Act on their own after a set number of in-game hours.' },
  on_meet: { label: 'When meeting someone', description: 'Share known news when arriving near someone who has not heard it.' },
  on_new_memory: { label: 'After learning news', description: 'Share new information with nearby characters when at their own location.' },
};

type CueTrigger = Extract<Trigger, { kind: 'on_meet' | 'on_new_memory' }>;
const DEFAULT_CUE: Record<CueTrigger['kind'], string> = {
  on_meet: "Someone has just come by. Pass on one piece of news they haven't heard (TELL).",
  on_new_memory: "You've heard news since you last acted on your own. Share it with everyone around (RETELL or ANNOUNCE).",
};

function Triggers({ triggers, onChange }: { triggers: Trigger[]; onChange: (t: Trigger[]) => void }) {
  const spoken = triggers.some((t) => t.kind === 'on_spoken_to');
  const timer = triggers.find((t): t is Extract<Trigger, { kind: 'every_hours' }> => t.kind === 'every_hours');
  const meet = triggers.find((t): t is Extract<Trigger, { kind: 'on_meet' }> => t.kind === 'on_meet');
  const heard = triggers.find((t): t is Extract<Trigger, { kind: 'on_new_memory' }> => t.kind === 'on_new_memory');
  const now = { spoken, timer, meet, heard };
  // Always in the same order (spoken to, the timer, meeting, news), so saved files don't churn.
  const emit = (n: typeof now) =>
    onChange([...(n.spoken ? [{ kind: 'on_spoken_to' } as const] : []), ...(n.timer ? [n.timer] : []), ...(n.meet ? [n.meet] : []), ...(n.heard ? [n.heard] : [])]);
  // Unticking a trigger keeps its settings here, so ticking it again brings them back.
  const last = useRef({ timer: timer ?? DEFAULT_TIMER, on_meet: meet ?? { kind: 'on_meet' as const, cue: DEFAULT_CUE.on_meet }, on_new_memory: heard ?? { kind: 'on_new_memory' as const, cue: DEFAULT_CUE.on_new_memory } });
  if (timer) last.current.timer = timer;
  if (meet) last.current.on_meet = meet;
  if (heard) last.current.on_new_memory = heard;
  // The hours as typed: a box being edited may be empty or out of range; only a usable number reaches the draft,
  // and leaving the box shows the draft's value again.
  const [hoursText, setHoursText] = useState<string | null>(null);
  const typeHours = (text: string) => {
    setHoursText(text);
    const n = Number(text);
    if (timer && Number.isInteger(n) && n >= 1 && n <= MAX_TRIGGER_HOURS) emit({ ...now, timer: { ...timer, hours: n } });
  };
  const cued = (kind: CueTrigger['kind'], t: CueTrigger | undefined, set: (t: CueTrigger | undefined) => typeof now) => (
    <>
      <label className="check">
        <input type="checkbox" checked={t !== undefined} onChange={(e) => emit(set(e.target.checked ? last.current[kind] : undefined))} />
        <span>
          <b>{TRIGGER_LABELS[kind].label}</b> <span className="muted">{TRIGGER_LABELS[kind].description}</span>
        </span>
      </label>
      {t && (
        <Field label={`Instruction ${kind === 'on_meet' ? 'when meeting someone' : 'when hearing news'}`} hint="What the character should do.">
          <input data-field={`triggers.${triggers.indexOf(t)}.cue`} value={t.cue} maxLength={300} onChange={(e) => emit(set({ ...t, cue: e.target.value }))} />
        </Field>
      )}
    </>
  );
  return (
    <div className="facts">
      <label className="check">
        <input type="checkbox" checked={spoken} onChange={(e) => emit({ ...now, spoken: e.target.checked })} />
        <span>
          <b>{TRIGGER_LABELS.on_spoken_to.label}</b> <span className="muted">{TRIGGER_LABELS.on_spoken_to.description}</span>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={timer !== undefined} onChange={(e) => emit({ ...now, timer: e.target.checked ? last.current.timer : undefined })} />
        <span>
          <b>{TRIGGER_LABELS.every_hours.label}</b> <span className="muted">{TRIGGER_LABELS.every_hours.description}</span>
        </span>
      </label>
      {timer && (
        <div className="row2 timer">
          <Field label="Every" hint={`hours, 1–${MAX_TRIGGER_HOURS}`}>
            <input
              type="number"
              data-field={`triggers.${triggers.indexOf(timer)}.hours`}
              min={1}
              max={MAX_TRIGGER_HOURS}
              value={hoursText ?? timer.hours}
              onChange={(e) => typeHours(e.target.value)}
              onBlur={() => setHoursText(null)}
            />
          </Field>
          <Field label="Instruction on the timer" hint="What the character should do on its own.">
            <input data-field={`triggers.${triggers.indexOf(timer)}.cue`} value={timer.cue} maxLength={300} onChange={(e) => emit({ ...now, timer: { ...timer, cue: e.target.value } })} />
          </Field>
        </div>
      )}
      {cued('on_meet', meet, (t) => ({ ...now, meet: t as typeof meet }))}
      {cued('on_new_memory', heard, (t) => ({ ...now, heard: t as typeof heard }))}
      {triggers.length === 0 && (
        <div className="note bad" role="alert">
          Choose at least one option if you want this character to act. Without one, it will not reply or act on its own.
        </div>
      )}
    </div>
  );
}

function VerbTable({ draft, onChange }: { draft: NpcDraft; onChange: (verbs: LedgerVerb[], model: ModelVerb[]) => void }) {
  const choosable = (v: LedgerVerb): v is ModelVerb => (MODEL_VERBS as readonly string[]).includes(v);
  // Keep both lists in library order, so the files don't churn.
  const order = <T extends string>(list: T[]) => LEDGER_VERBS.filter((v) => (list as string[]).includes(v)) as T[];

  const toggleLedger = (v: LedgerVerb, on: boolean) => {
    const verbs = on ? order([...draft.verbs, v]) : draft.verbs.filter((x) => x !== v);
    onChange(verbs, draft.model_verbs.filter((m) => verbs.includes(m)));
  };
  const toggleModel = (v: ModelVerb, on: boolean) => onChange(draft.verbs, on ? order([...draft.model_verbs, v]) : draft.model_verbs.filter((x) => x !== v));

  return (
    <table className="verbs">
      <thead>
        <tr>
          <th>Verb</th>
          <th>Ledger allows</th>
          <th>Model may choose</th>
        </tr>
      </thead>
      <tbody>
        {LEDGER_VERBS.map((v) => {
          const allowed = draft.verbs.includes(v);
          return (
            <tr key={v}>
              <td>
                <code>{v}</code>
                <div className="muted small">{VERB_INFO[v]}</div>
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Ledger allows ${v}`}
                  checked={allowed}
                  disabled={v === 'SAY'}
                  onChange={(e) => toggleLedger(v, e.target.checked)}
                />
              </td>
              <td>
                {choosable(v) ? (
                  <input
                    type="checkbox"
                    aria-label={`Model may choose ${v}`}
                    checked={draft.model_verbs.includes(v)}
                    disabled={!allowed || v === 'SAY'}
                    onChange={(e) => toggleModel(v, e.target.checked)}
                  />
                ) : (
                  <span className="muted small">code only</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Bench({ draft, valid, onBusy, tested, onCheckedAction, onReset, onUseInGame, onEditCharacter }: {
  draft: NpcDraft; valid: boolean; onBusy: (busy: boolean) => void; tested: boolean;
  onCheckedAction: (draft: NpcDraft) => void; onReset: () => void; onUseInGame: () => void; onEditCharacter: () => void;
}) {
  const [view, setView] = useState<StateView | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [passing, setPassing] = useState(false); // the bench clock is moving
  const [testing, setTesting] = useState(false); // a controlled proposal is on its way
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unsent, setUnsent] = useState<string | null>(null); // a line that didn't get through, to send again
  const [controlled, setControlled] = useState<Set<string>>(() => new Set()); // ids of events the workshop proposed, not the model
  const [explanations, setExplanations] = useState<Record<string, ActionExplanation>>({});
  const box = useRef<HTMLDivElement>(null);
  const viewKey = useRef<string | null>(null);
  const key = JSON.stringify([draft.id, draft.start]);
  const showView = (next: StateView, checks: ActionExplanation[] = []) => {
    const sameWorld = viewKey.current === key;
    if (!sameWorld) setControlled(new Set());
    setExplanations((previous) => ({ ...(sameWorld ? previous : {}), ...Object.fromEntries(checks.map((check) => [check.eventId, check])) }));
    viewKey.current = key;
    setView(next);
  };
  const busy = pending !== null || passing || testing;
  // While anything is under way the editor won't swap the draft: the answer belongs to this one.
  useEffect(() => onBusy(busy), [busy, onBusy]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' });
  }, [view?.events.length, pending]);

  const timed = draft.triggers.some((t) => t.kind === 'every_hours');
  const ideas = benchIdeas(draft, view && viewKey.current === key ? (view.shops.find((shop) => shop.id === draft.id)?.stock ?? {}) : undefined);

  const send = async (line: string) => {
    if (busy || !valid) return;
    setError(null);
    setUnsent(null);
    setPending(line);
    try {
      const r = await editorApi.say(draft, line);
      showView(r.view, modelExplanations(draft, r));
      if (!r.ok) setError(r.errors.join('; '));
      else {
        setTurns((t) => [...t, { kind: 'model', text: line, attempts: r.attempts, outcome: r.outcome }]);
        if (hasCheckedModelAction(r, draft.id)) onCheckedAction(draft);
      }
    } catch (e) {
      setError((e as Error).message);
      setUnsent(line);
    } finally {
      setPending(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    void send(t);
  };

  // The bench clock: a draft on a timer acts here when its hours come round.
  const pass = async (ticks: number) => {
    if (busy || !valid) return;
    setError(null);
    setPassing(true);
    try {
      const r = await editorApi.tick(draft, ticks);
      showView(r.view, modelExplanations(draft, r));
      if (!r.ok) setError(r.errors.join('; '));
      else if (r.attempts.length) {
        setTurns((t) => [...t, { kind: 'model', text: `(${ticks} h passed)`, attempts: r.attempts, outcome: r.outcome }]);
        if (hasCheckedModelAction(r, draft.id)) onCheckedAction(draft);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPassing(false);
    }
  };

  // A rule-breaking proposal straight to the ledger, without the model, so the rejection always shows the rule itself.
  const test = async () => {
    if (busy || !valid) return;
    setError(null);
    setTesting(true);
    try {
      const r = await editorApi.controlled(draft);
      showView(r.view, controlledExplanations(draft, r));
      if (!r.ok) setError(r.errors.join('; '));
      else {
        setControlled((ids) => new Set([...ids, ...r.events.map((e) => e.id)]));
        setTurns((t) => [...t, { kind: 'controlled', label: r.label ?? ideas.controlled.label, proposal: r.proposal, accepted: r.accepted, reason: r.reason }]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const reset = async () => {
    setError(null);
    setUnsent(null);
    try {
      await editorApi.reset();
      viewKey.current = null;
      setView(null);
      setTurns([]);
      setControlled(new Set());
      setExplanations({});
      onReset();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const last = turns.at(-1);
  const short = (line: string) => (line.length > 34 ? `${line.slice(0, 32)}…` : line);
  const isControlled = (event: EngineEvent) => controlled.has(event.id) || event.type === 'ACTION_REJECTED' && event.data.source === 'workshop-controlled';
  const conversation = speechFirst(view?.events.filter((event) => !isControlled(event)) ?? []);

  return (
    <>
      <section className="panel bench">
        <div className="def-top">
          <h2>Talk to {draft.name || 'your NPC'}</h2>
          <button className="secondary small" onClick={reset} disabled={busy}>
            Reset test session
          </button>
        </div>
        <p className="muted small">Try a normal request, then challenge a rule. Each proposed action is checked in this isolated session.</p>
        <div className="messages bench-messages" ref={box}>
          {conversation.length === 0 && pending === null && <div className="note">Say something to {draft.name || 'the NPC'}.</div>}
          {view &&
            conversation.map((e) => <Fragment key={e.id}>
              {!(explanations[e.id] && e.type === 'ACTION_REJECTED') && <BenchEntry event={e} view={view} npcName={draft.name} controlled={controlled.has(e.id) || (e.type === 'ACTION_REJECTED' && e.data.source === 'workshop-controlled')} />}
              {explanations[e.id] && <ActionCheck check={explanations[e.id]} />}
            </Fragment>)}
          {pending !== null && (
            <>
              <div className="msg you">{pending}</div>
              <div className="msg npc thinking" aria-live="polite">
                {draft.name || 'The NPC'} is thinking<span className="dots" />
              </div>
            </>
          )}
          {passing && (
            <div className="note" aria-live="polite">
              Time passes<span className="dots" />
            </div>
          )}
        </div>
        <form className="chat-form" onSubmit={submit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_SAY_LENGTH}
            id="bench-input"
            placeholder={valid ? 'Talk to the draft…' : 'Waiting for a valid draft'}
            aria-label="Message to the draft NPC"
            disabled={!valid}
          />
          <button disabled={busy || !valid || !text.trim()}>Send</button>
        </form>
        <div className="bench-suggestions" aria-label="Suggested messages">
          <button type="button" className="secondary" disabled={busy || !valid} onClick={() => void send(ideas.normal)}><span>Normal request</span>{ideas.normal}</button>
          <button type="button" className="secondary" disabled={busy || !valid} onClick={() => void send(ideas.challenges[0])}><span>Rule challenge</span>{ideas.challenges[0]}</button>
        </div>
        {last?.kind === 'model' && <p className="bench-verdict" role="status">{outcomeText(last)}</p>}
        <div className={`bench-handoff${tested ? ' ready' : ''}`}>
          {tested ? <p role="status"><b>{draft.name} completed a checked action.</b></p>
            : <p>{valid ? 'You can use this character in your game before running a model test.' : 'Fix the character’s settings before using it in your game.'}</p>}
          <div className="actions"><button type="button" className={tested ? undefined : 'secondary'} disabled={busy || !valid} onClick={onUseInGame}>Use {draft.name || 'this NPC'} in your game →</button>
          <button type="button" className="text-button" disabled={busy} onClick={onEditCharacter}>Edit character</button></div>
        </div>
        <details className="bench-tools">
          <summary>Controlled tests · no model</summary>
          <p className="muted small">The workshop sends a rule-breaking proposal straight to the ledger. This checks the rule without asking the model.</p>
          <button type="button" className="secondary small" disabled={busy || !valid} onClick={() => void test()}>{ideas.controlled.label}</button>
          <div className="controlled-results">{view?.events.filter(isControlled).map((event) => explanations[event.id]
            ? <ActionCheck key={event.id} check={explanations[event.id]} />
            : <BenchEntry key={event.id} event={event} view={view} npcName={draft.name} controlled />)}</div>
        </details>
        <details className="bench-tools">
          <summary>More test options</summary>
        <div className="attacks">
          <span className="muted small">
            {view ? clockText(view.tick) : clockText(0)}
            {timed ? ' · pass time to see its timer' : ''}:
          </span>
          {[1, 6, 24].map((h) => (
            <button key={h} className="secondary small" disabled={busy || !valid} onClick={() => void pass(h)}>
              +{h} h
            </button>
          ))}
        </div>
        <div className="attacks">
          <span className="muted small">Try to cheat it:</span>
          {ideas.challenges.slice(1).map((a) => (
            <button key={a} className="secondary small" disabled={busy || !valid} onClick={() => void send(a)} title={a}>
              {short(a)}
            </button>
          ))}
        </div>
        <p className="muted small bench-hint">
          The model may refuse in words or propose an action. A rule challenge won&apos;t always produce a rejected proposal.
        </p>
        </details>
        {error && (
          <div className="error" role="alert">
            {error}
            {unsent !== null && (
              <div className="actions">
                <button className="secondary small" onClick={() => void send(unsent)} disabled={busy || !valid}>
                  Send it again
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <details className="panel bench-details">
        <summary>View technical details</summary>
        {!last && <p className="muted">Each model answer and the ledger's verdict on it show up here.</p>}
        {last?.kind === 'controlled' && (
          <>
            <p className="muted small">Last: a controlled proposal the workshop sent straight to the ledger. No model was asked.</p>
            <div className={`attempt ${last.accepted ? 'ok' : 'bad'}`}>
              <div className="attempt-head">
                <b>{last.accepted ? '✓ Ledger accepted' : '✗ Ledger rejected'}</b>
                <span className="tag">controlled · no model</span>
              </div>
              <div className="small">{last.label}</div>
              {last.reason && <div className="reason">{last.reason}</div>}
              <pre className="code">{JSON.stringify(last.proposal, null, 2)}</pre>
            </div>
          </>
        )}
        {last?.kind === 'model' && (
          <>
            <p className="muted small">
              Last turn: {last.attempts.length} {last.attempts.length === 1 ? 'answer' : 'answers'} from the model. {outcomeText(last)}
            </p>
            {last.attempts.map((a, i) => (
              <div key={i} className={`attempt ${a.ok ? 'ok' : 'bad'}`}>
                <div className="attempt-head">
                  <b>{a.ok ? '✓ Ledger accepted' : '✗ Ledger rejected'}</b>
                  <span className="tag">
                    model answer {i + 1} · {(a.latency_ms / 1000).toFixed(1)} s
                  </span>
                </div>
                {a.reason && <div className="reason">{a.reason}</div>}
                <pre className="code">{pretty(a.content)}</pre>
              </div>
            ))}
          </>
        )}
      </details>
    </>
  );
}

function pretty(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function ActionCheck({ check }: { check: ActionExplanation }) {
  return <section className={`action-check ${check.accepted ? 'accepted' : 'rejected'}`} aria-label={check.source}>
    <p className="action-check-source">{check.source}</p>
    <dl className="action-check-flow">
      <div><dt>Proposal</dt><dd>{check.proposal}</dd></div>
      <div><dt>Applicable rule</dt><dd>{check.rule}</dd></div>
      <div className="action-check-verdict"><dt>Verdict</dt><dd>{check.accepted ? '✓ Accepted' : '✕ Rejected'}</dd></div>
      <div><dt>Resulting state</dt><dd>{check.state}</dd></div>
    </dl>
  </section>;
}

function BenchEntry({ event: e, view, npcName, controlled }: { event: EngineEvent; view: StateView; npcName: string; controlled: boolean }) {
  switch (e.type) {
    case 'SAID':
      return <div className={`msg ${e.actor === 'player' ? 'you' : 'npc'}`}>{e.data.text}</div>;
    case 'CONTRACT_PROPOSED': {
      const c = view.contracts.find((x) => x.contract_id === e.data.contract.contract_id);
      return c ? <ContractCard c={c} gold={view.gold} disabled /> : null;
    }
    case 'EMOTED':
      return (
        <div className="msg npc emote">
          <i>{e.data.text}</i>
        </div>
      );
    case 'GIVEN':
      return <div className="note ok">{gaveText(e, view)}</div>;
    case 'TRIGGER_FIRED':
      return <div className="note">{clockText(e.tick)}: {npcName} acts on their own.</div>;
    case 'SIGNALED':
      return (
        <div className="note ok">
          {npcName} signals <code>{e.data.signal}</code>: your game&apos;s code would act on it.
        </div>
      );
    case 'CONTRACT_REFUSED':
      return <div className="note">{e.data.contract_id ? `${npcName} withdrew offer ${e.data.contract_id}.` : `${npcName} refused.`}</div>;
    case 'ACTION_REJECTED':
      return (
        <div className="note bad">
          {controlled ? 'Controlled test, sent by the workshop, not the model. Ledger rejected' : "Ledger rejected the model's"} {e.data.verb ?? 'answer'}:{' '}
          {e.data.reason}
        </div>
      );
    default:
      return null;
  }
}
