import { describe, expect, it } from 'vitest';
import { createEngine, createWorld, advance, type World } from '../../engine';
import { mockClient } from '../../models';
import { buildNpc, player, type NpcDefinition } from '../../npcs';
import { dueNpcs, runTriggers } from '..';

const say = (text: string) => JSON.stringify({ action: 'SAY', say: text });

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
});
