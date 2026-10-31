import type { EngineEvent, KnowerView, StateView } from '@blacksmith/shared';
import { describe, expect, it } from 'vitest';
import { sourceChain } from '../knowledge';

const people = [
  ['smith', 'Brann'],
  ['crier', 'Osric'],
  ['keeper', 'Edda'],
  ['merchant', 'Mira'],
  ['bard', 'Pell'],
].map(([id, name]) => ({ id, name, sprite: 0, place: 'square', model: 'muse_spark' as const }));

const view = (events: EngineEvent[]): StateView =>
  ({ tick: 20, people, places: [], news: [], gold: 0, goods: {}, shops: [], contracts: [], items: [], events, busy: false, art: {} }) as StateView;

let n = 100;
const ev = (type: string, e: { actor?: string; target?: string | null; tick?: number; data?: unknown; witnesses?: string[] } = {}): EngineEvent =>
  ({ id: `e_${++n}`, tick: 10, type, actor: 'world', target: null, data: {}, location: 'forge', witnesses: [], ...e }) as EngineEvent;
const tell = (from: string, to: string, about: EngineEvent, confidence: number, words = 'the smith made a dagger', tick = 12) =>
  ev('TOLD', { actor: from, target: to, tick, data: { event_id: about.id, summary: words, confidence } });
const knower = (id: string, name: string, told_by: string, confidence: number): KnowerView => ({
  id,
  name,
  how: 'told_by',
  told_by,
  confidence,
  claim: 'the smith made a dagger',
});

// Osric saw Brann hand over the dagger.
const delivered = ev('ITEM_DELIVERED', { target: 'player', witnesses: ['smith', 'crier'], data: { contract_id: 'c_001', item: { item_name: 'Dagger' } } });

describe('where secondhand news came from', () => {
  it('follows recorded tellings back to someone who saw it', () => {
    const v = view([
      delivered,
      tell('crier', 'keeper', delivered, 0.7, 'Brann made a blade', 12),
      tell('keeper', 'merchant', delivered, 0.49, 'a dagger, I hear', 14),
    ]);
    const c = sourceChain(v, delivered.id, knower('merchant', 'Mira', 'Edda', 0.49));
    expect(c.whole).toBe(true);
    expect(c.steps).toEqual([
      { kind: 'told', who: 'Mira', by: 'Edda', tick: 14, words: 'a dagger, I hear', confidence: 0.49, others: [] },
      { kind: 'told', who: 'Edda', by: 'Osric', tick: 12, words: 'Brann made a blade', confidence: 0.7, others: [] },
      { kind: 'saw', who: 'Osric' },
    ]);
  });

  it('a teller heard only after passing it on is not their source', () => {
    // Edda told Mira first, and only later heard it again from Pell: the chain stops, it doesn't borrow the later telling.
    const v = view([delivered, tell('keeper', 'merchant', delivered, 0.49, 'a dagger', 12), tell('bard', 'keeper', delivered, 0.49, 'a song of a blade', 15)]);
    const c = sourceChain(v, delivered.id, knower('merchant', 'Mira', 'Edda', 0.49));
    expect(c.whole).toBe(false);
    expect(c.steps).toHaveLength(1);
  });

  it('with more than one telling, the engine’s pick stands and the others are named', () => {
    const v = view([delivered, tell('bard', 'merchant', delivered, 0.34, 'a song', 12), tell('crier', 'merchant', delivered, 0.7, 'Brann made a blade', 13)]);
    const c = sourceChain(v, delivered.id, knower('merchant', 'Mira', 'Osric', 0.7));
    expect(c.steps[0]).toMatchObject({ by: 'Osric', others: ['Pell'] });
    expect(c.steps[1]).toEqual({ kind: 'saw', who: 'Osric' });
  });

  it('news cried to everyone around reaches whoever witnessed the telling', () => {
    const cried = ev('ANNOUNCED', {
      actor: 'crier',
      tick: 13,
      witnesses: ['merchant', 'bard'],
      data: { event_id: delivered.id, summary: 'Hear ye!', confidence: 0.7 },
    });
    const c = sourceChain(view([delivered, cried]), delivered.id, knower('merchant', 'Mira', 'Osric', 0.7));
    expect(c).toMatchObject({
      whole: true,
      steps: [
        { by: 'Osric', words: 'Hear ye!' },
        { kind: 'saw', who: 'Osric' },
      ],
    });
  });

  it('an event older than the log the view carries: only the source the news view names, marked partial', () => {
    const c = sourceChain(view([tell('keeper', 'merchant', delivered, 0.49)]), delivered.id, knower('merchant', 'Mira', 'Edda', 0.49));
    expect(c).toEqual({
      whole: false,
      steps: [{ kind: 'told', who: 'Mira', by: 'Edda', tick: null, words: 'the smith made a dagger', confidence: 0.49, others: [] }],
    });
  });

  it('a log that disagrees with the news view yields to it rather than invent a path', () => {
    const v = view([delivered, tell('crier', 'merchant', delivered, 0.7)]);
    expect(sourceChain(v, delivered.id, knower('merchant', 'Mira', 'Pell', 0.7))).toMatchObject({ whole: false, steps: [{ by: 'Pell', tick: null }] });
  });

  it('a witness is just that', () => {
    const k: KnowerView = { id: 'crier', name: 'Osric', how: 'witnessed', told_by: null, confidence: 1, claim: null };
    expect(sourceChain(view([delivered]), delivered.id, k)).toEqual({ whole: true, steps: [{ kind: 'saw', who: 'Osric' }] });
  });
});
