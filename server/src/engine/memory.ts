import type { EngineEvent, EventType, News } from '@blacksmith/shared';
import type { World } from './state';

// What an NPC knows, read straight from the log: nothing is stored apart from it, so a memory can't be planted.
// It knows an event it took part in or witnessed (sure), or one somebody passed on to it (less sure each retelling).

// What is worth talking about. Talk itself isn't: news is about deeds (sales, deliveries, gifts, refusals).
export const MEMORABLE = new Set<EventType>(['CONTRACT_ACCEPTED', 'ITEM_DELIVERED', 'GOODS_DELIVERED', 'GIVEN', 'GIFT_REFUSED', 'CONTRACT_REFUSED']);

// Each retelling keeps this share of the teller's confidence.
export const DECAY = 0.7;
export const decayed = (confidence: number) => Math.round(confidence * DECAY * 100) / 100;

type PassedOn = Extract<EngineEvent, { data: News }>;
export const isPassedOn = (e: EngineEvent): e is PassedOn => e.type === 'TOLD' || e.type === 'RETOLD' || e.type === 'ANNOUNCED';

export type Memory = {
  event_id: string;
  how_learned: 'witnessed' | 'told_by';
  told_by: string | null;
  confidence: number;
  claim: string | null; // the words it was told it in; null when it saw it itself
  learned: number; // where in the log it learned it, so "new since" can be asked
};

// Who heard news passed on: the one told, or, for news spoken to everyone around, whoever witnessed the telling.
const heard = (e: PassedOn, npcId: string) => e.actor !== npcId && (e.type === 'TOLD' ? e.target === npcId : e.witnesses.includes(npcId));

const sawOrDid = (e: EngineEvent, npcId: string) => MEMORABLE.has(e.type) && (e.actor === npcId || e.target === npcId || e.witnesses.includes(npcId));

// One memory per event: the surest way it learned it (seeing beats hearing; a surer telling beats a vaguer one).
export function memoriesOf(world: World, npcId: string): Memory[] {
  const best = new Map<string, Memory>();
  world.events.forEach((e, i) => {
    let m: Memory | null = null;
    if (sawOrDid(e, npcId)) m = { event_id: e.id, how_learned: 'witnessed', told_by: null, confidence: 1, claim: null, learned: i };
    else if (isPassedOn(e) && heard(e, npcId)) {
      m = { event_id: e.data.event_id, how_learned: 'told_by', told_by: e.actor, confidence: e.data.confidence, claim: e.data.summary, learned: i };
    }
    if (!m) return;
    const had = best.get(m.event_id);
    if (!had || m.confidence > had.confidence) best.set(m.event_id, m);
  });
  return [...best.values()];
}

export const memoryOf = (world: World, npcId: string, eventId: string) => memoriesOf(world, npcId).find((m) => m.event_id === eventId) ?? null;

// Events `teller` knows and `listener` doesn't: what there is to tell when they meet.
export function newsFor(world: World, teller: string, listener: string): string[] {
  const theirs = new Set(memoriesOf(world, listener).map((m) => m.event_id));
  return memoriesOf(world, teller)
    .map((m) => m.event_id)
    .filter((id) => !theirs.has(id));
}
