import { describe, expect, it } from 'vitest';
import { createEngine, createWorld, advance, commit, memoryOf, type World } from '../../engine';
import { mockClient } from '../../models';
import { buildNpc, player, type NpcDefinition } from '../../npcs';
import { dueNpcs, runTriggers } from '..';

const say = (text: string) => JSON.stringify({ action: 'SAY', say: text });

const draftOf = (id: string) => ({
  id,
  name: id,
  persona: `You voice ${id}.`,
  verbs: ['SAY'],
  model_verbs: ['SAY'],
  facts: ['clock'],
  perception_radius: 3,
  model: 'muse_spark_open',
  effort: 'low',
  location: 'square',
  start: { gold: 0, stock: {} },
  catalogue: {},
  triggers: [{ kind: 'on_spoken_to' }],
  cue: 'Reply.',
  fallbacks: { rejected: 'Eh?', unavailable: 'Later.' },
});

function npc(id: string, hours: number | null): NpcDefinition {
  const built = buildNpc({
    id,
    name: id,
    persona: `You voice ${id}.`,
    verbs: ['SAY'],
    model_verbs: ['SAY'],
    facts: ['clock'],
    perception_radius: 3,
    model: 'muse_spark_open',
    effort: 'low',
    location: 'square',
    start: { gold: 0, stock: {} },
    catalogue: {},
    triggers: hours === null ? [{ kind: 'on_spoken_to' }] : [{ kind: 'every_hours', hours, cue: `${id}: call out.` }],
    cue: 'Reply.',
    fallbacks: { rejected: 'Eh?', unavailable: 'Later.' },
  });
  if (!built.ok) throw new Error(built.errors.join('; '));
  return built.npc;
}

const crier = npc('crier', 6);
const bard = npc('bard', 6);
const piper = npc('piper', 6);
const smith = npc('quiet', null);
const town = [crier, bard, piper, smith];
const { act } = createEngine([player, ...town]);
const fresh = () => createWorld([player, ...town]);

async function pass(world: World, ticks: number, replies: string[], cap?: number) {
  const client = mockClient(replies);
  const moved = advance(world, ticks);
  const r = await runTriggers(moved.world, world.tick, town, { act, modelFor: () => ({ client, model: 'test' }), cap });
  return { ...r, client };
}

describe('town triggers', () => {
  it('an NPC on a timer acts on its own with its timer cue, said to nobody in particular', async () => {
    const { world, events, client } = await pass(fresh(), 6, [say('Hear ye!')], 1);
    expect(events.map((e) => [e.type, e.actor, e.target])).toEqual([
      ['TRIGGER_FIRED', 'crier', null],
      ['SAID', 'crier', null],
    ]);
    expect(events[0].data).toMatchObject({ trigger: { kind: 'every_hours', hours: 6 } });
    expect(client.requests[0].messages.at(-1)?.content).toMatch(/crier: call out\.$/);
    expect(world.tick).toBe(6);
  });

  it('never more turns per tick than the cap; who waited longest goes first next time', async () => {
    const first = await pass(fresh(), 6, [say('a'), say('b'), say('c')], 2);
    expect(first.turns).toBe(2);
    expect(first.client.requests).toHaveLength(2);
    expect(first.events.filter((e) => e.type === 'TRIGGER_FIRED').map((e) => e.actor)).toEqual(['crier', 'bard']);

    expect(dueNpcs(advance(first.world, 6).world, 6, town).map((d) => d.npc.id)).toEqual(['piper', 'crier', 'bard']);
    const second = await pass(first.world, 6, [say('a'), say('b')], 2);
    expect(second.events.filter((e) => e.type === 'TRIGGER_FIRED').map((e) => e.actor)).toEqual(['piper', 'crier']);
  });

  it('nothing due, or no model for it, means no turn and no call', async () => {
    const quiet = await pass(fresh(), 5, []);
    expect(quiet.events).toEqual([]);
    const moved = advance(fresh(), 6);
    const none = await runTriggers(moved.world, 0, town, { act, modelFor: () => null });
    expect(none).toMatchObject({ turns: 0, events: [] });
  });

  it('meeting someone with news: the turn talks to them, and the cue names them and what they have not heard', async () => {
    const make = (id: string, extra: Record<string, unknown>): NpcDefinition => {
      const built = buildNpc({ ...draftOf(id), ...extra });
      if (!built.ok) throw new Error(built.errors.join('; '));
      return built.npc;
    };
    const teller = make('teller', { verbs: ['SAY', 'TELL'], model_verbs: ['SAY', 'TELL'], facts: ['clock', 'memories'], triggers: [{ kind: 'on_meet', cue: 'Gossip.' }] });
    const comer = make('comer', { location: 'farm', schedule: [{ from: 6, place: 'farm' }, { from: 10, place: 'square' }] });
    const people = [teller, comer];
    const engine = createEngine([player, ...people]);
    // The teller saw the stranger hand it a coin at the square, at 08:00.
    const seed = commit(createWorld([player, ...people]), [
      { type: 'GIVEN', tick: 0, actor: 'player', target: 'teller', location: 'square', witnesses: [], data: { gift: { kind: 'gold', amount: 1 }, item_name: null } },
    ]).world;
    const moved = advance(seed, 2).world; // 10:00: the comer arrives at the square
    const client = mockClient([JSON.stringify({ action: 'TELL', say: 'A stranger tipped me a coin!', event_id: 'e_0001' })]);
    const r = await runTriggers(moved, 0, people, { act: engine.act, modelFor: () => ({ client, model: 'test' }) });
    expect(r.events.map((e) => [e.type, e.actor, e.target])).toEqual([
      ['TRIGGER_FIRED', 'teller', null],
      ['TOLD', 'teller', 'comer'],
      ['SAID', 'teller', 'comer'],
    ]);
    expect(client.requests[0].messages.at(-1)?.content).toMatch(/Gossip\.\n\nYou have just run into comer\. They haven't heard about: e_0001\.$/);
    expect(memoryOf(r.world, 'comer', 'e_0001')).toMatchObject({ told_by: 'teller', confidence: 0.7, claim: 'A stranger tipped me a coin!' });
    // Next hour they are still together and the comer has heard it: nothing more to say, so no call.
    expect(dueNpcs(advance(r.world, 1).world, r.world.tick, people)).toEqual([]);
  });
});
