import { describe, expect, it } from 'vitest';
import { createEngine, createWorld, DECAY, hasNews, meeting, memoriesOf, memoryOf, replay, senses, triggerFired, commit, verbs, type Actor, type World } from '../index';
import { hammerhead, player, smith } from './fixtures';

// A tiny map: the forge and the square are close, the tavern a little further, the farm far off.
const D: Record<string, number> = { 'forge|square': 5, 'square|tavern': 6, 'forge|tavern': 9 };
const distance = (a: string, b: string) => (a === b ? 0 : (D[`${a}|${b}`] ?? D[`${b}|${a}`] ?? 30));

const talk = [verbs.SAY, verbs.TELL];
const start = { gold: 5, stock: {} };
// Tick 0 is 08:00. The farmer is at the square in the morning, the farm from noon; the keeper comes to the square at 10:00.
const farmer: Actor = { id: 'farmer', verbs: talk, location: 'farm', schedule: [{ from: 8, place: 'square' }, { from: 12, place: 'farm' }], start, perception_radius: 6 };
const keeper: Actor = { id: 'keeper', verbs: talk, location: 'farm', schedule: [{ from: 6, place: 'farm' }, { from: 10, place: 'square' }], start, perception_radius: 6 };
const bard: Actor = { id: 'bard', verbs: [verbs.SAY, verbs.RETELL], location: 'tavern', start, perception_radius: 5 }; // the square is 6 away: out of earshot
const crier: Actor = { id: 'crier', verbs: [verbs.SAY, verbs.ANNOUNCE], location: 'square', schedule: [{ from: 8, place: 'square' }, { from: 20, place: 'farm' }], start, perception_radius: 3 };
const forge: Actor = { ...smith, perception_radius: 2 };
const ACTORS = [forge, player, farmer, keeper, bard, crier];
const sense = senses(ACTORS, distance);
const { act } = createEngine(ACTORS, { sense });

// Brann sells the Hammerhead Blade at the forge at 08:00: a deed worth talking about.
function sold(): { world: World; id: string } {
  const offered = act(createWorld(ACTORS), 'smith', hammerhead).world;
  const r = act(offered, 'player', { action: 'ACCEPT', contract_id: 'c_001' });
  return { world: r.world, id: r.events[0].id };
}
const tell = (world: World, who: string, to: string, eventId: string, summary = 'Brann sold a sword.') =>
  act(world, who, { action: 'TELL', to, event_id: eventId, summary });
const later = (world: World, ticks: number) => ({ ...world, tick: world.tick + ticks });

describe('perception', () => {
  it('only those near the event at its tick witness it; someone at the farm learns nothing', () => {
    const { world, id } = sold();
    const accepted = world.events.find((e) => e.id === id)!;
    expect(accepted).toMatchObject({ type: 'CONTRACT_ACCEPTED', location: 'forge' });
    expect(accepted.witnesses.sort()).toEqual(['farmer', 'smith']); // farmer at the square, 5 away; Brann is paid at his forge
    expect(memoryOf(world, 'farmer', id)).toMatchObject({ how_learned: 'witnessed', confidence: 1, told_by: null });
    expect(memoryOf(world, 'keeper', id)).toBeNull(); // at the farm until 10:00
    expect(memoryOf(world, 'crier', id)).toBeNull(); // at the square too, but sees only 3 tiles
  });

  it('talk and bookkeeping are not news, and a rejected action has no witnesses', () => {
    const w = act(createWorld(ACTORS), 'smith', { action: 'SAY', text: 'Morning.' }).world;
    expect(memoriesOf(w, 'farmer')).toEqual([]);
    const rejected = act(w, 'smith', { action: 'DELIVER', contract_id: 'c_001' });
    expect(rejected.events[0]).toMatchObject({ type: 'ACTION_REJECTED', witnesses: [] });
  });

  it('the log keeps who saw what: replaying it gives the same witnesses without sensing again', () => {
    const { world } = sold();
    expect(replay(world.events, createWorld(ACTORS))).toEqual(world);
  });
});

describe('passing news on', () => {
  it('TELL gives the listener a secondhand memory, less sure each retelling, in the teller\'s words', () => {
    const { world, id } = sold();
    const atTen = later(world, 2); // the keeper has come to the square
    const told = tell(atTen, 'farmer', 'keeper', id, 'Brann sold a stranger a blade as long as a shark!');
    expect(told.ok).toBe(true);
    expect(told.events[0]).toMatchObject({ type: 'TOLD', actor: 'farmer', target: 'keeper', data: { event_id: id, confidence: DECAY } });
    expect(memoryOf(told.world, 'keeper', id)).toMatchObject({
      how_learned: 'told_by',
      told_by: 'farmer',
      confidence: 0.7,
      claim: 'Brann sold a stranger a blade as long as a shark!',
    });
    // The keeper passes it to the crier, at the square too: 0.7 × 0.7.
    const again = tell(told.world, 'keeper', 'crier', id);
    expect(again.ok).toBe(true);
    expect(memoryOf(again.world, 'crier', id)?.confidence).toBe(0.49);
    // Being told again, less surely, never lowers what someone saw for themselves.
    const back = tell(again.world, 'keeper', 'farmer', id);
    expect(memoryOf(back.world, 'farmer', id)).toMatchObject({ how_learned: 'witnessed', confidence: 1 });
  });

  it("nobody can TELL, RETELL or ANNOUNCE an event they don't know, or one that never happened", () => {
    const { world, id } = sold();
    const atTen = later(world, 2);
    expect(tell(atTen, 'keeper', 'farmer', id).reason).toBe(`keeper knows of no event ${id}; it can only pass on what it saw or was told`);
    expect(tell(atTen, 'farmer', 'keeper', 'e_9999').ok).toBe(false);
    expect(act(atTen, 'bard', { action: 'RETELL', event_id: id, summary: 'A tale!' }).reason).toMatch(/^bard knows of no event/);
    expect(act(atTen, 'crier', { action: 'ANNOUNCE', event_id: id, summary: 'Hear ye!' }).reason).toMatch(/^crier knows of no event/);
    // A refused proposal isn't something that happened: it can't be passed on either.
    const rejectedId = act(atTen, 'smith', { action: 'DELIVER', contract_id: 'c_001' }).events[0].id;
    expect(tell(atTen, 'farmer', 'keeper', rejectedId).ok).toBe(false);
  });

  it('TELL needs a listener who is here; the player is with whoever it talks to', () => {
    const { world, id } = sold();
    expect(tell(world, 'farmer', 'keeper', id).reason).toBe('keeper is at the farm, not here at the square'); // 08:00
    expect(act(world, 'farmer', { action: 'TELL', to: null, event_id: id, summary: 'x' }).reason).toMatch(/talking to nobody in particular/);
    expect(act(world, 'farmer', { action: 'TELL', to: null, event_id: id, summary: 'x' }, { to: 'player' }).ok).toBe(true);
    expect(tell(world, 'farmer', 'farmer', id).ok).toBe(false);
  });

  it('RETELL and ANNOUNCE reach everyone in range; the crier only cries from its own place', () => {
    const { world, id } = sold();
    const toCrier = tell(later(world, 2), 'farmer', 'crier', id).world; // 10:00, both at the square
    const cried = act(toCrier, 'crier', { action: 'ANNOUNCE', event_id: id, summary: 'Hear ye! The smith has sold a mighty blade!' });
    expect(cried.ok).toBe(true);
    expect(cried.events[0]).toMatchObject({ type: 'ANNOUNCED', location: 'square', target: null });
    expect(cried.events[0].witnesses.sort()).toEqual(['farmer', 'keeper']);
    expect(memoryOf(cried.world, 'keeper', id)).toMatchObject({ told_by: 'crier', confidence: 0.49 });
    // At 20:00 the crier has gone home: no announcing from the farm.
    const night = later(toCrier, 10);
    expect(act(night, 'crier', { action: 'ANNOUNCE', event_id: id, summary: 'Hear ye!' }).reason).toBe('crier announces only at its own place, the square; it is at the farm');
    // The bard has heard nothing, so has nothing to sing.
    expect(memoriesOf(cried.world, 'bard')).toEqual([]);
  });
});

describe('gossip triggers', () => {
  it('on meeting: someone who just came along and hasn\'t heard what it knows; nobody it was already with', () => {
    const { world, id } = sold(); // 08:00: the farmer saw it at the square
    const atTen = later(world, 2); // the keeper arrives at the square
    expect(meeting(atTen, farmer, ACTORS, 1)).toEqual({ with: 'keeper', news: [id] });
    expect(meeting(atTen, farmer, ACTORS, 2)).toBeNull(); // from 10:00 to 10:00: they were together already
    expect(meeting(atTen, keeper, ACTORS, 1)).toBeNull(); // she has nothing to tell him
    const told = tell(atTen, 'farmer', 'keeper', id).world;
    expect(meeting(told, farmer, ACTORS, 1)).toBeNull(); // she's heard it now
  });

  it('on new memory: only once it has learned something since it last acted on its own, and at its own place', () => {
    const { world, id } = sold();
    const atTen = later(world, 2);
    expect(hasNews(atTen, crier)).toBe(false);
    const told = tell(atTen, 'farmer', 'crier', id).world;
    expect(hasNews(told, crier)).toBe(true);
    const fired = commit(told, [triggerFired(told, crier, { kind: 'on_new_memory', cue: 'Cry it.' })]).world;
    expect(hasNews(fired, crier)).toBe(false); // it has acted on it
    expect(hasNews(later(told, 10), crier)).toBe(false); // 20:00, away from the board
  });
});
