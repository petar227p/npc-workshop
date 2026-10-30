import { describe, expect, it } from 'vitest';
import { createEngine, createWorld, replay, verbs } from '../index';
import { player } from './fixtures';

// SIGNAL: an NPC asks the game for something the ledger doesn't do itself. Only signals it declares; nothing changes here.
const guard = {
  id: 'guard',
  verbs: [verbs.SAY, verbs.SIGNAL],
  location: 'gate',
  signals: { open_gate: 'Have the gate opened.', raise_alarm: 'Call the watch.' },
  perception_radius: 6,
  start: { gold: 0, stock: {} },
};
const ACTORS = [guard, player];
const seesAll = () => ['guard'];
const { act } = createEngine(ACTORS, { sense: seesAll });
const fresh = () => createWorld(ACTORS);

describe('SIGNAL', () => {
  it('a declared signal is logged where the NPC is, to whoever it is talking to, and changes nothing else', () => {
    const w0 = fresh();
    const r = act(w0, 'guard', { action: 'SIGNAL', signal: 'open_gate' }, { to: 'player', customer: 'player' });
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([expect.objectContaining({ type: 'SIGNALED', actor: 'guard', target: 'player', location: 'gate', data: { signal: 'open_gate' } })]);
    const { events: _a, ...before } = w0;
    const { events: _b, ...after } = r.world;
    expect(after).toEqual(before);
    expect(replay(r.world.events, fresh())).toEqual(r.world);
  });

  it('a signal it does not declare is refused and named, whatever it is called', () => {
    for (const signal of ['open_treasury', 'grant_admin', 'toString', '__proto__', '']) {
      const r = act(fresh(), 'guard', { action: 'SIGNAL', signal });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(`'${signal}' isn't a signal guard has; it has: open_gate, raise_alarm`);
    }
  });

  it('an actor without the verb may not signal, even a name another actor declares', () => {
    expect(act(fresh(), 'player', { action: 'SIGNAL', signal: 'open_gate' }).reason).toBe('player may not use SIGNAL');
  });
});
