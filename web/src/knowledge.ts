import type { EngineEvent, KnowerView, StateView } from '@blacksmith/shared';

// How a villager came to know an event, traced back through the log the view carries. Every step is a recorded
// telling, picked by the engine's own rule (engine/memory.ts memoriesOf): someone knows an event the surest way they
// learned it, seeing beats hearing, a surer telling beats a vaguer one, the first of equals stands. Nothing is inferred
// from confidence numbers on their own.
//
// The view holds only the newest part of the log. Every telling of an event comes after the event, so if the event
// itself is in the view, so is every telling of it and the chain is whole. If it isn't, only the immediate source the
// news view names can be shown, and the rest is said to be missing rather than guessed.

type PassedOn = Extract<EngineEvent, { type: 'TOLD' | 'RETOLD' | 'ANNOUNCED' }>;
const isPassedOn = (e: EngineEvent): e is PassedOn => e.type === 'TOLD' || e.type === 'RETOLD' || e.type === 'ANNOUNCED';
const heard = (e: PassedOn, id: string) => e.actor !== id && (e.type === 'TOLD' ? e.target === id : e.witnesses.includes(id));
// Only events someone remembers are news at all, so the event's own people are the ones who saw it.
const saw = (e: EngineEvent, id: string) => e.actor === id || e.target === id || e.witnesses.includes(id);

export type Step =
  | { kind: 'saw'; who: string } // `who` saw it (or took part)
  | { kind: 'told'; who: string; by: string; tick: number | null; words: string; confidence: number; others: string[] }; // tick: null when the telling isn't in the view's log; others: anyone else who'd told `who` by then

export type Chain = {
  steps: Step[]; // from the knower back toward the event, the knower's own step first
  whole: boolean; // false: the event is older than the log the view carries, so earlier steps aren't known
};

// The knower's telling of `eventId`, as the engine picked it from tellings up to log position `before`: the surest,
// the first of equals. Others: the other people who'd told them by then.
function bestTelling(events: EngineEvent[], eventId: string, id: string, before: number) {
  let best: { e: PassedOn; i: number } | null = null;
  const tellers = new Set<string>();
  for (let i = 0; i < before; i++) {
    const e = events[i];
    if (!isPassedOn(e) || e.data.event_id !== eventId || !heard(e, id)) continue;
    tellers.add(e.actor);
    if (!best || e.data.confidence > best.e.data.confidence) best = { e, i };
  }
  if (!best) return null;
  const by = best.e.actor;
  return { ...best, others: [...tellers].filter((t) => t !== by) };
}

export function sourceChain(view: StateView, eventId: string, knower: KnowerView): Chain {
  const name = (id: string) => view.people.find((p) => p.id === id)?.name ?? id;
  if (knower.how === 'witnessed') return { steps: [{ kind: 'saw', who: knower.name }], whole: true };
  const at = view.events.findIndex((e) => e.id === eventId);
  // The event is older than the view's log: only what the news view itself says.
  const partial: Chain = {
    steps: [
      { kind: 'told', who: knower.name, by: knower.told_by ?? 'someone', tick: null, words: knower.claim ?? '', confidence: knower.confidence, others: [] },
    ],
    whole: false,
  };
  if (at < 0) return partial;
  const event = view.events[at];

  const steps: Step[] = [];
  let id = knower.id;
  let before = view.events.length;
  for (let hops = 0; hops < 50; hops++) {
    if (saw(event, id)) {
      steps.push({ kind: 'saw', who: name(id) });
      return { steps, whole: true };
    }
    const t = bestTelling(view.events, eventId, id, before);
    if (!t) return steps.length ? { steps, whole: false } : partial;
    steps.push({
      kind: 'told',
      who: name(id),
      by: name(t.e.actor),
      tick: t.e.tick,
      words: t.e.data.summary,
      confidence: t.e.data.confidence,
      others: t.others.map(name),
    });
    // The knower's own step must be the one the news view names; if not, trust the news view and stop there.
    if (hops === 0 && name(t.e.actor) !== knower.told_by) return partial;
    id = t.e.actor;
    before = t.i;
  }
  return { steps, whole: false };
}
