import { z } from 'zod';
import { Poll, type createBridge } from './bridge';

// Diagnostic only. No new command admission or API mutation path; v2 is milestone 2.
export const SpikePoll = Poll.extend({
  menu: z.literal('npc-workshop-menu-spike'),
  generation: z.number().int().positive(),
  probe_text: z.string().max(500),
}).strict();

export async function spikePoll(bridge: ReturnType<typeof createBridge>, raw: unknown) {
  const { menu, generation, probe_text, ...poll } = SpikePoll.parse(raw);
  const reply = await bridge.poll(poll);
  return { ...reply, menu, generation, probe: {
    echo: probe_text,
    strings: [probe_text, 'quotes: " / newline:\n / Unicode: čćžšđ'],
    nested: { label: 'nested-ok' },
    rows: [{ id: 1, text: probe_text }, { id: 2, text: 'row-ok' }],
  } };
}
