import { InventorySyncSchema, type Change } from '@blacksmith/shared';
import type { ZodError } from 'zod';
import type { EventDraft } from './events';
import { WORLD } from './happen';
import { placeAt } from './schedule';
import { reservedStock, type World } from './state';
import { own, type Actor } from './validator';

// The third door. When the world lives inside a game, the game's own code changes inventories the ledger never sees:
// the player loots a chest, a thief empties a stall, a crafting bench turns ore into bars. The game says what the
// actor holds now and the engine logs it, so replay still rebuilds the same world. No verb leads here, so no model can
// ask for it; it is the game's authority over what it does itself, as verbs are the ledger's over what NPCs do.
// Counts are totals, not changes: a sync sent twice, or one that changes nothing, logs nothing the second time.
// What is promised to an accepted job can't be synced away, or the job could never be delivered.

export type Synced = { ok: true; draft: EventDraft | null } | { ok: false; reason: string };

const parseReason = (error: ZodError) => error.issues.map((i) => `${i.path.join('.') || 'sync'}: ${i.message}`).join('; ');

export function synced(world: World, raw: unknown, actors: readonly Actor[]): Synced {
  const parsed = InventorySyncSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: parseReason(parsed.error) };
  const s = parsed.data;
  const byId = Object.fromEntries(actors.map((a) => [a.id, a]));
  const actor = own(byId, s.actor);
  if (!actor) return { ok: false, reason: `there's nobody called '${s.actor}' in this world` };

  const changes: Change[] = [];
  const gold = Object.hasOwn(world.gold, s.actor) ? world.gold[s.actor] : 0;
  if (s.gold !== undefined && s.gold !== gold) changes.push({ what: 'gold', from: gold, to: s.gold });
  const onHand = Object.hasOwn(world.stock, s.actor) ? world.stock[s.actor] : {};
  const promised = reservedStock(world, s.actor);
  for (const [good, to] of Object.entries(s.stock ?? {})) {
    const held = Object.hasOwn(onHand, good) ? onHand[good] : 0;
    const owed = Object.hasOwn(promised, good) ? promised[good] : 0;
    if (to < owed) return { ok: false, reason: `${s.actor} has ${owed} ${good} promised to accepted work; it can't hold fewer than that` };
    if (to !== held) changes.push({ what: good, from: held, to });
  }
  if (changes.length === 0) return { ok: true, draft: null };
  return {
    ok: true,
    draft: { type: 'SYNCED', tick: world.tick, actor: WORLD, target: s.actor, location: placeAt(actor, world.tick), witnesses: [], data: { changes, reason: s.reason } },
  };
}
