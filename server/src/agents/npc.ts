import { MAX_SAY_LENGTH } from '@blacksmith/shared';
import type { Act, EngineEvent, World } from '../engine';
import type { ChatClient, ChatMessage, ReasoningEffort, Usage } from '../models';
import { act as villageAct, type NpcDefinition } from '../npcs';
import { fromFlat, parseFlat } from './flat';

// One turn for any NPC: the model proposes; act() decides. One repair retry with the rejection reason, then a safe SAY.

const MAX_ATTEMPTS = 2;

export type Attempt = { content: string; ok: boolean; reason: string | null; usage: Usage | null; latency_ms: number };

export type TurnResult = {
  world: World;
  events: EngineEvent[];
  attempts: Attempt[];
  outcome: 'acted' | 'fallback' | 'unavailable';
};

export type NpcModel = { client: ChatClient; model: string };

// What the model sees on a turn: persona, the facts it may rely on, then the conversation and the cue.
export function turnMessages(npc: NpcDefinition, world: World, customer = 'player'): ChatMessage[] {
  return [
    { role: 'system', content: npc.prompt },
    { role: 'system', content: npc.facts(world, customer) },
    { role: 'user', content: `Conversation so far:\n${npc.history(world, customer)}\n\n${npc.cue}` },
  ];
}

// `act` is the engine the NPC is registered with; the village's by default.
export async function npcTurn(
  npc: NpcDefinition,
  world: World,
  model: NpcModel,
  opts: { customer?: string; effort?: ReasoningEffort; act?: Act } = {},
): Promise<TurnResult> {
  const customer = opts.customer ?? 'player';
  const act = opts.act ?? villageAct;
  const to = { customer, to: customer }; // every line and action of this turn is addressed to the customer
  const messages = turnMessages(npc, world, customer);
  const schema = { name: `${npc.id}_action`, schema: npc.schema };
  const attempts: Attempt[] = [];
  const events: EngineEvent[] = [];
  let w = world;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    let res;
    try {
      res = await model.client.chat({
        model: model.model,
        messages,
        reasoning_effort: opts.effort ?? 'low',
        max_tokens: 4096,
        json_schema: schema,
      });
    } catch {
      const said = act(w, npc.id, { action: 'SAY', text: npc.fallbacks.unavailable }, to);
      return { world: said.world, events: [...events, ...said.events], attempts, outcome: 'unavailable' };
    }

    const out = parseFlat(res.content);
    const r = act(w, npc.id, out ? fromFlat(npc.modelVerbs, out) : res.content, to);
    w = r.world;
    events.push(...r.events);
    attempts.push({ content: res.content, ok: r.ok, reason: r.reason, usage: res.usage, latency_ms: res.latency_ms });

    if (r.ok) {
      // The spoken line goes in after the action passes, so the NPC never announces something the ledger refused.
      // The action already stands; a line the ledger won't take is dropped rather than logged as a failed turn.
      if (out && out.action !== 'SAY' && out.say.trim()) {
        const said = act(w, npc.id, { action: 'SAY', text: out.say.slice(0, MAX_SAY_LENGTH) }, to);
        if (said.ok) {
          w = said.world;
          events.push(...said.events);
        }
      }
      return { world: w, events, attempts, outcome: 'acted' };
    }

    messages.push(
      { role: 'assistant', content: res.content },
      {
        role: 'user',
        content: `The ledger rejected that: ${r.reason}. Reply again with corrected JSON. If it can't be done, SAY so or REFUSE.`,
      },
    );
  }

  const said = act(w, npc.id, { action: 'SAY', text: npc.fallbacks.rejected }, to);
  return { world: said.world, events: [...events, ...said.events], attempts, outcome: 'fallback' };
}
