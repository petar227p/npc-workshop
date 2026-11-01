import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ApiResult, ApiState, ApiWorldCreated, EngineEvent } from '@blacksmith/shared';
import { brann, ITEM } from './npc';

const count = z.number().int().min(0).max(1_000_000);
export const Inventory = z.object({ pgold: count, sgold: count, pitem: count, sitem: count }).strict();
export type Inventory = z.infer<typeof Inventory>;
export const Poll = Inventory.extend({
  session: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/), request: z.number().int().positive(),
  near: z.boolean(), ack: z.string().max(100), failed: z.boolean(),
}).strict();
export type Poll = z.infer<typeof Poll>;
export const Command = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('say'), text: z.string().trim().min(1).max(500) }).strict(),
  z.object({ kind: z.literal('accept'), contract: z.string().regex(/^c_\d+$/) }).strict(),
]);
type Command = z.infer<typeof Command>;
type Plan = { id: string; before: Inventory; after: Inventory; events: string[] };
type Session = {
  id: string; world: string; token: string; state: ApiState; busy: boolean; lastSeen: number;
  pending?: Plan; queued?: Command; fault?: string; messages: string[]; seen: Set<string>;
};
const snapshot = (p: Inventory): Inventory => ({ pgold: p.pgold, sgold: p.sgold, pitem: p.pitem, sitem: p.sitem });
const equal = (a: Inventory, b: Inventory) => Object.keys(a).every(k => a[k as keyof Inventory] === b[k as keyof Inventory]);

/** Derive only allowlisted physical effects from checked events, never dialogue or model JSON. */
export function transferPlan(events: EngineEvent[], before: Inventory, seen: Set<string>): Plan | undefined {
  const after = { ...before };
  const ids: string[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    if (e.type === 'CONTRACT_ACCEPTED') {
      if (e.actor !== 'player' || e.target !== brann.id) throw new Error('Unexpected trade parties');
      after.pgold -= e.data.price; after.sgold += e.data.price; ids.push(e.id);
    } else if (e.type === 'GOODS_DELIVERED') {
      if (e.actor !== brann.id || e.target !== 'player' || e.data.good !== ITEM.good) throw new Error('Unmapped delivery');
      after.pitem += e.data.qty; after.sitem -= e.data.qty; ids.push(e.id);
    } else if (['ITEM_DELIVERED', 'GIVEN', 'WORK_STARTED'].includes(e.type)) throw new Error('Unsupported physical effect');
  }
  Inventory.parse(after);
  if (!ids.length) return;
  if (!events.some(e => e.type === 'CONTRACT_ACCEPTED') || !events.some(e => e.type === 'GOODS_DELIVERED')) throw new Error('Incomplete stock sale');
  return { id: randomUUID(), before, after, events: ids };
}

export function createBridge({ server = 'http://127.0.0.1:8787', fetcher = fetch, now = Date.now } = {}) {
  const origin = new URL(server);
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Use a local HTTP API origin');
  let active: Session | undefined;
  let opening = false;
  const retired = new Set<string>();
  let creatingId = '';
  const retire = (id: string) => { retired.add(id); if (retired.size > 256) retired.delete(retired.values().next().value!); };
  async function api(path: string, body?: unknown, token?: string) {
    const r = await fetcher(`${origin.origin}/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`NPC API HTTP ${r.status}. No automatic mutation retry; reload your save to start a fresh conversation.`);
    return r.json();
  }
  const call = (s: Session, action: string, body: unknown): Promise<ApiResult> => api(`/worlds/${s.world}/${action}`, body, s.token);
  const view = () => active ? {
    connected: true, session: active.id, busy: active.busy || !!active.queued || !!active.pending,
    fault: active.fault ?? '', messages: active.messages, offers: active.state.contracts.filter(c => c.status === 'proposed'),
    gold: active.state.gold, fresh: now() - active.lastSeen < 5000,
  } : { connected: false, messages: ['Load the demo save and stand near Brann.'], offers: [], busy: false };
  function enqueue(raw: unknown, session: string) {
    const command = Command.parse(raw);
    const s = active;
    // Skyrim normally pauses while the player types in the browser. Queue only;
    // the next native poll checks session, proximity and actual inventory before execution.
    if (!s || s.id !== session || s.busy || s.queued || s.pending || s.fault) throw new Error('Game unavailable, changed save, busy, or recovery required');
    s.queued = command;
  }
  async function poll(raw: unknown) {
    const p = Poll.parse(raw);
    const reply = { bridge: 'npc-workshop', session: p.session, request: p.request, plan: '', message: '', reset: false };
    if (retired.has(p.session)) return { ...reply, reset: true, message: 'Old save session ignored.' };
    if (!active || active.id !== p.session) {
      if (opening || active?.busy) return { ...reply, message: 'Previous request is finishing. Wait.' };
      if (p.ack) return { ...reply, reset: true, message: 'Adapter restarted during a transfer. Reload your save.' };
      if (!p.near) return { ...reply, message: 'Stand near Brann in Whiterun.' };
      opening = true; creatingId = p.session;
      try {
        const made: ApiWorldCreated = await api('/worlds', { definitions: [brann], start: {
          player: { gold: p.pgold, stock: { [ITEM.good]: p.pitem } },
          [brann.id]: { gold: p.sgold, stock: { [ITEM.good]: p.sitem } },
        } });
        if (active) retire(active.id);
        active = { id: creatingId, world: made.world_id, token: made.token, state: made.state, busy: false,
          messages: ['Brann is ready. Each save load starts a fresh conversation and discards old offers.'], seen: new Set(), lastSeen: now() };
        reply.message = 'Brann connected. Open http://127.0.0.1:8788 to chat, then return to Skyrim.';
      } finally { opening = false; }
    }
    const s = active;
    s.lastSeen = now();
    if (s.busy) return { ...reply, message: 'Brann is thinking.' };
    if (s.fault) return { ...reply, message: s.fault, reset: true };
    if (p.failed) {
      s.fault = 'Inventory transfer interrupted or counts changed. Stop trading and reload a known save; no automatic repair.';
      return { ...reply, message: s.fault, reset: true };
    }
    if (s.pending) {
      if (p.ack === s.pending.id && equal(snapshot(p), s.pending.after)) {
        s.pending.events.forEach(id => s.seen.add(id)); s.pending = undefined;
        s.messages.push('Skyrim confirmed the gold and item transfer.');
      } else if (equal(snapshot(p), s.pending.before) && !p.ack) {
        return { ...reply, ...packet(s.pending), message: 'Apply checked trade.' };
      } else {
        s.fault = 'Transfer acknowledgement/count mismatch. Reload a known save before trading.';
        return { ...reply, message: s.fault, reset: true };
      }
    }
    if (!p.near) { s.queued = undefined; return { ...reply, message: 'Stand near Brann; queued action cancelled.' }; }
    const command = s.queued;
    if (!command) return reply;
    s.queued = undefined; s.busy = true;
    try {
      // Sync external Skyrim loot/spending/theft only when no ledger transfer is outstanding.
      for (const [actor, gold, qty] of [['player', p.pgold, p.pitem], [brann.id, p.sgold, p.sitem]] as const) {
        const synced = await call(s, 'sync', { actor, gold, stock: { [ITEM.good]: qty }, reason: 'Skyrim pre-action inventory snapshot' });
        if (!synced.ok) throw new Error('Inventory synchronization refused');
      }
      if (command.kind === 'accept') {
        const c = s.state.contracts.find(c => c.contract_id === command.contract && c.status === 'proposed');
        if (!c || c.kind !== 'in_stock' || c.good !== ITEM.good || c.seller !== brann.id) throw new Error('Offer missing, stale or unmapped');
      }
      const result = command.kind === 'say' ? await call(s, 'say', { npc: brann.id, text: command.text }) : await call(s, 'accept', { contract_id: command.contract });
      s.state = result.state;
      for (const event of result.events) {
        if (event.type === 'SAID') s.messages.push(`${event.actor === 'player' ? 'You' : 'Brann'}: ${event.data.text}`);
        if (event.type === 'ACTION_REJECTED') s.messages.push(`Ledger rejected: ${event.data.reason}`);
      }
      if (!result.ok) s.messages.push(`Refused: ${result.reason}`);
      if (result.outcome === 'unavailable' || result.outcome === 'fallback') s.messages.push(`Model outcome: ${result.outcome}; this is not proof of a successful model reply.`);
      s.pending = transferPlan(result.events, snapshot(p), s.seen);
      s.messages = s.messages.slice(-80);
      return s.pending ? { ...reply, ...packet(s.pending), message: 'Apply checked trade.' } : { ...reply, message: result.said.map(x => x.text).join(' ').slice(0, 900) };
    } catch (e) {
      // Any ambiguous API outcome stops the session: a POST may have committed before timeout.
      s.fault = e instanceof Error ? e.message : 'Bridge failed';
      s.messages.push(s.fault);
      return { ...reply, reset: true, message: s.fault };
    } finally { s.busy = false; }
  }
  return { poll, enqueue, view };
}

function packet(plan: Plan) {
  return { plan: plan.id, ...Object.fromEntries(Object.entries(plan.before).map(([k, v]) => [`before_${k}`, v])),
    ...Object.fromEntries(Object.entries(plan.after).map(([k, v]) => [`after_${k}`, v])) };
}
