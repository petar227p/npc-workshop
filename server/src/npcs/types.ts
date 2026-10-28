import { NPC_ID_PATTERN, type EffortChoice, type ModelChoice, type Trigger } from '@blacksmith/shared';
import type { Actor, World } from '../engine';
import { flatSchema, type FlatVerb } from '../agents/flat';

// An NPC is one definition: who it is, what the ledger lets it do, and what it gets told each turn.
// The engine only sees `id` and `verbs`; the agent turn (agents/npc.ts) uses the rest.
export type NpcSpec = Actor & {
  name: string;
  prompt: string; // persona and reply rules, sent first so it stays cacheable
  modelVerbs: readonly FlatVerb[]; // what the model may choose; any other entry in `verbs` is issued by code only
  model: ModelChoice; // which model voices it; the route picks the client from this
  effort: EffortChoice; // how hard that model thinks each turn
  perception_radius: number; // in tiles: who witnesses this NPC's events (used by perception from Oct 30)
  facts(world: World, customer: string): string; // code-owned numbers it may quote
  history(world: World, customer: string): string; // the conversation with this customer, rebuilt from the event log
  triggers?: readonly Trigger[]; // when it takes a turn; being spoken to if not given
  cue: string; // the instruction after the history
  fallbacks: { rejected: string; unavailable: string };
};

// The model's answer schema is built once here, so a clashing field shows up when the NPC is defined, not on its first turn.
export type NpcDefinition = NpcSpec & { schema: Record<string, unknown>; triggers: readonly Trigger[] };

// The id names the model's schema, which the API limits to letters, digits, '_' and '-'.
const ID = new RegExp(NPC_ID_PATTERN);

export function defineNpc(spec: NpcSpec): NpcDefinition {
  if (!ID.test(spec.id)) throw new Error(`npc id '${spec.id}' must be lowercase letters, digits and '_'`);
  const allowed = new Set<string>(spec.verbs.map((v) => v.verb));
  // Every turn voices its line, and both fallbacks, through SAY.
  if (!allowed.has('SAY')) throw new Error(`${spec.id}: an NPC must be allowed SAY`);
  // A verb ships only with the state its rule checks: no offers without something to sell, no made-to-order
  // catalogue without a way to start the work.
  const sells = Boolean(spec.catalogue?.made_to_order || spec.catalogue?.in_stock);
  for (const v of ['OFFER', 'COUNTER_OFFER']) {
    if (allowed.has(v) && !sells) throw new Error(`${spec.id}: ${v} needs a catalogue with something to sell`);
  }
  // Giving is for quest givers and gift-givers. A seller who could give would let a customer talk its stock out of it
  // for free, around every price floor in its catalogue.
  if (allowed.has('GIVE') && sells) throw new Error(`${spec.id}: GIVE is for NPCs who give (quest givers, gifts), not sellers: a seller could be talked into giving its stock away`);
  if (spec.catalogue?.made_to_order && !allowed.has('START_WORK')) {
    throw new Error(`${spec.id}: a made-to-order catalogue needs START_WORK, or accepted work never starts`);
  }
  for (const v of spec.modelVerbs) {
    if (!allowed.has(v.verb)) throw new Error(`${spec.id}: model verb ${v.verb} isn't in its allowed verbs`);
  }
  return { ...spec, triggers: spec.triggers ?? [{ kind: 'on_spoken_to' }], schema: flatSchema(spec.modelVerbs) };
}
