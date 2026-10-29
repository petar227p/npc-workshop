import type { EngineEvent, EventType, News } from '@blacksmith/shared';
import type { World } from './state';

// What an NPC knows, read straight from the log: nothing is stored apart from it, so a memory can't be planted.
// It knows an event it took part in or witnessed (sure), or one somebody passed on to it (less sure each retelling).

// What is worth talking about. Talk itself isn't: news is about deeds (sales, deliveries, gifts, refusals).
// A sale from stock is one piece of news: its GOODS_DELIVERED always comes with the CONTRACT_ACCEPTED that already
// says what was bought, so it isn't news twice.
export const MEMORABLE = new Set<EventType>(['CONTRACT_ACCEPTED', 'ITEM_DELIVERED', 'GIVEN', 'GIFT_REFUSED', 'CONTRACT_REFUSED']);

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

// What it has in mind: its newest memories, newest first. Its facts list these and a meeting offers only these, so a
// cue never names news the model can't read.
export const IN_MIND = 8;
export const inMind = (world: World, npcId: string): Memory[] =>
  memoriesOf(world, npcId)
    .sort((a, b) => b.learned - a.learned)
    .slice(0, IN_MIND);

// The events it has passed on itself (told, retold or announced), whenever and however it was asked.
export const passedOnBy = (world: World, npcId: string) =>
  new Set(
    world.events
      .filter(isPassedOn)
      .filter((e) => e.actor === npcId)
      .map((e) => e.data.event_id),
  );

// Events `teller` has in mind and `listener` doesn't know, newest first: what there is to tell when they meet.
export function newsFor(world: World, teller: string, listener: string): string[] {
  const theirs = new Set(memoriesOf(world, listener).map((m) => m.event_id));
  return inMind(world, teller)
    .map((m) => m.event_id)
    .filter((id) => !theirs.has(id));
}
