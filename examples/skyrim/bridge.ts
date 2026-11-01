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
  z.object({ kind: z.literal('accept'), contract: z.string().regex(/^c_\d+$/), revision: z.number().int().positive().optional() }).strict(),
]);
const commandId = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/);
const NativeCommandBody = z.discriminatedUnion('kind', [
  z.object({ id: commandId, kind: z.literal('say'), text: z.string().trim().min(1).max(500) }).strict(),
  z.object({ id: commandId, kind: z.literal('accept'), contract: z.string().regex(/^c_\d+$/), revision: z.number().int().positive() }).strict(),
]);
// Papyrus BSFixedString pooling can change the casing of a literal such as "say".
// Normalize only the machine enum; preserve message text, command IDs and contract IDs.
export const NativeCommand = z.preprocess(raw => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'kind' in raw && typeof raw.kind === 'string') {
    return { ...raw, kind: raw.kind.toLowerCase() };
  }
  return raw;
}, NativeCommandBody);
export const NativePoll = Poll.extend({ version: z.literal(2), request: z.number().int().positive().max(2_147_483_647), generation: z.number().int().positive().max(2_147_483_647), command: NativeCommand.optional() }).strict();
type NativePoll = z.infer<typeof NativePoll>;
type NativeCommand = z.infer<typeof NativeCommand>;
type Receipt = { id: string; state: 'queued' | 'executing' | 'completed' | 'rejected' | 'uncertain'; code: string };
type Status = keyof typeof statuses;
const statuses = {
  connecting: 'Connecting', ready: 'Ready', sending: 'Sending', thinking: 'Brann is thinking',
  model_unavailable: 'Brann cannot reply right now.', offer_rejected: 'The offer or action was rejected.',
  transfer_pending: 'Applying trade', delivery_confirmed: 'Trade complete', out_of_range: 'Out of range',
  service_unavailable: 'Service unavailable', recovery_required: 'Recovery required. Reload a known save.',
} as const;
type Command = z.infer<typeof Command>;
type Plan = { id: string; before: Inventory; after: Inventory; events: string[] };
type Session = {
  id: string; world: string; token: string; state: ApiState; busy: boolean; lastSeen: number;
  pending?: Plan; queued?: Command; fault?: string; messages: string[]; seen: Set<string>;
  lines: { id: string; role: 'player' | 'brann' | 'system'; text: string }[]; lineSerial: number;
  receipts: Map<string, { fingerprint: string; receipt: Receipt }>; queuedId?: string; lastCommand?: Receipt;
  offerSerial: number; offers: Map<string, { fingerprint: string; revision: number }>;
  status: Status; nativeRequest: number; generation: number; observedGold: number;
  uiRevision: number; uiFingerprint: string;
};
function line(s: Session, text: string, role: 'player' | 'brann' | 'system' = 'system', nativeText = text) {
  s.messages.push(text);
  s.lines.push({ id: `m_${++s.lineSerial}`, role, text: nativeText.slice(0, 900) });
  s.messages = s.messages.slice(-80); s.lines = s.lines.slice(-32);
}
function refreshOffers(s: Session) {
  const next: Session['offers'] = new Map();
  for (const c of s.state.contracts.filter(c => c.status === 'proposed')) {
    const fingerprint = JSON.stringify(c);
    const old = s.offers.get(c.contract_id);
    next.set(c.contract_id, old?.fingerprint === fingerprint ? old : { fingerprint, revision: ++s.offerSerial });
  }
  s.offers = next;
}
function currentOffer(s: Session, command: Extract<Command, { kind: 'accept' }>) {
  const c = s.state.contracts.find(c => c.contract_id === command.contract && c.status === 'proposed');
  return c && c.kind === 'in_stock' && c.good === ITEM.good && c.seller === brann.id &&
    (command.revision === undefined || s.offers.get(c.contract_id)?.revision === command.revision);
}
function nativeSnapshot(s?: Session, override?: Status, receipt?: Receipt) {
  const status: Status = override ?? (s?.fault ? 'recovery_required' : s?.busy ? 'thinking' : s?.pending ? 'transfer_pending' : s?.queued ? 'sending' :
    receipt?.state === 'rejected' && receipt.code === 'stale_offer' ? 'offer_rejected' : s?.status ?? 'connecting');
  const value = {
    status, status_text: statuses[status], support_code: status === 'recovery_required' ? 'NW_RECOVERY' : status === 'service_unavailable' ? 'NW_SERVICE' : '',
    busy: !!(s?.busy || s?.pending || s?.queued), gold: s?.observedGold ?? 0,
    messages: s?.lines ?? [],
    offers: s ? s.state.contracts.filter(c => c.kind === 'in_stock').filter(c => c.status === 'proposed' && c.good === ITEM.good && c.seller === brann.id)
      .slice(0, 8).map(c => ({ contract: c.contract_id, revision: s.offers.get(c.contract_id)!.revision,
        item: ITEM.label, quantity: c.qty, unit_price: c.price / c.qty, total_price: c.price })) : [],
    command: receipt ?? s?.lastCommand ?? { id: '', state: 'none', code: 'none' },
  };
  const fingerprint = JSON.stringify(value);
  if (s && fingerprint !== s.uiFingerprint) { s.uiFingerprint = fingerprint; s.uiRevision++; }
  return { revision: s?.uiRevision ?? 0, ...value };
}
const wireInt = z.number().int().min(0).max(2_147_483_647);
export const NativeReply = z.object({
  version: z.literal(2), bridge: z.literal('npc-workshop'), session: commandId.or(z.literal('')),
  request: wireInt, generation: wireInt, reset: z.boolean(), plan: z.string().max(100), message: z.string().max(200),
  before_pgold: count.optional(), before_sgold: count.optional(), before_pitem: count.optional(), before_sitem: count.optional(),
  after_pgold: count.optional(), after_sgold: count.optional(), after_pitem: count.optional(), after_sitem: count.optional(),
  ui: z.object({
    revision: wireInt, status: z.enum(Object.keys(statuses) as [Status, ...Status[]]), status_text: z.string().max(200), support_code: z.string().max(40),
    busy: z.boolean(), gold: count,
    messages: z.array(z.object({ id: commandId, role: z.enum(['player', 'brann', 'system']), text: z.string().max(900) }).strict()).max(32),
    offers: z.array(z.object({ contract: z.string().regex(/^c_\d+$/), revision: wireInt.min(1), item: z.literal(ITEM.label),
      quantity: count.min(1), unit_price: z.number().finite().nonnegative(), total_price: count }).strict()).max(8),
    command: z.object({ id: commandId.or(z.literal('')), state: z.enum(['none', 'queued', 'executing', 'completed', 'rejected', 'uncertain']), code: z.string().max(40) }).strict(),
  }).strict(),
}).strict();

// Always use a fixed, redacted recovery packet for malformed/failed native requests.
export function nativeFailure(raw: unknown) {
  const p = NativePoll.safeParse(raw);
  const envelope = Poll.omit({ near: true, ack: true, failed: true, pgold: true, sgold: true, pitem: true, sitem: true }).passthrough().safeParse(raw);
  const data = envelope.success ? envelope.data : undefined;
  return NativeReply.parse({ version: 2, bridge: 'npc-workshop', session: data?.session ?? '', request: Math.min(data?.request ?? 0, 2_147_483_647),
    generation: p.success ? p.data.generation : (typeof data?.generation === 'number' && Number.isSafeInteger(data.generation) && data.generation > 0 ? Math.min(data.generation, 2_147_483_647) : 0),
    reset: true, plan: '', message: statuses.recovery_required, ui: nativeSnapshot(undefined, 'recovery_required') });
}
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
    fault: active.fault ?? '', messages: active.messages, offers: active.state.contracts.filter(c => c.status === 'proposed').map(c => ({ ...c, revision: active!.offers.get(c.contract_id)!.revision })),
    gold: active.state.gold, fresh: now() - active.lastSeen < 5000,
  } : { connected: false, messages: ['Load the demo save and stand near Brann.'], offers: [], busy: false };
  function enqueue(raw: unknown, session: string) {
    const command = Command.parse(raw);
    const s = active;
    // Skyrim normally pauses while the player types in the browser. Queue only;
    // the next native poll checks session, proximity and actual inventory before execution.
    if (!s || s.id !== session || s.busy || s.queued || s.pending || s.fault) throw new Error('Game unavailable, changed save, busy, or recovery required');
    if (command.kind === 'accept' && !currentOffer(s, command)) throw new Error('Offer missing, stale or unmapped');
    s.queued = command;
  }
  function admitNative(s: Session, p: NativePoll, connecting: boolean): Receipt | undefined {
    const command = p.command;
    if (!command) return;
    const fingerprint = JSON.stringify(command);
    const old = s.receipts.get(command.id);
    if (old) return old.fingerprint === fingerprint ? old.receipt : { id: command.id, state: 'rejected', code: 'command_id_conflict' };
    const code = connecting ? 'session_connecting' : p.generation < s.generation ? 'stale_menu' : p.failed || s.fault ? 'recovery_required' :
      !p.near ? 'out_of_range' : s.busy || s.queued || s.pending ? 'busy' :
      command.kind === 'accept' && !currentOffer(s, command) ? 'stale_offer' : s.receipts.size >= 1024 ? 'command_limit' : '';
    const receipt: Receipt = { id: command.id, state: code ? 'rejected' : 'queued', code: code || 'admitted' };
    // Never evict an old ID and accidentally re-admit it within this loaded session.
    if (s.receipts.size < 1024) s.receipts.set(command.id, { fingerprint, receipt });
    s.lastCommand = receipt;
    if (!code) {
      const { id, ...intent } = command;
      enqueue(intent, s.id);
      s.queuedId = id;
    }
    return receipt;
  }
  async function poll(raw: unknown, native?: { p: NativePoll; receipt?: Receipt; status?: Status }) {
    const p = Poll.parse(raw);
    let connectedNow = false;
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
          messages: [], seen: new Set(), lastSeen: now(), lines: [], lineSerial: 0,
          receipts: new Map(), offers: new Map(), offerSerial: 0, status: 'ready', nativeRequest: 0, generation: 0,
          observedGold: p.pgold, uiRevision: 0, uiFingerprint: '' };
        line(active, 'Brann is ready. Each save load starts a fresh conversation and discards old offers.');
        refreshOffers(active);
        connectedNow = true;
        reply.message = 'Brann connected. Open http://127.0.0.1:8788 to chat, then return to Skyrim.';
      } finally { opening = false; }
    }
    const s = active;
    if (native) {
      if (p.request <= s.nativeRequest) {
        const old = native.p.command && s.receipts.get(native.p.command.id);
        native.receipt = old && old.fingerprint === JSON.stringify(native.p.command) ? old.receipt :
          native.p.command ? { id: native.p.command.id, state: 'rejected', code: old ? 'command_id_conflict' : 'stale_request' } : undefined;
        if (native.p.command && !old && s.receipts.size < 1024) {
          s.receipts.set(native.p.command.id, { fingerprint: JSON.stringify(native.p.command), receipt: native.receipt! });
        }
        return reply;
      }
      s.nativeRequest = p.request;
      native.receipt = admitNative(s, native.p, connectedNow);
      s.generation = Math.max(s.generation, native.p.generation);
    }
    s.observedGold = p.pgold;
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
        line(s, 'Skyrim confirmed the gold and item transfer.');
        s.status = 'delivery_confirmed';
        reply.message = 'Skyrim confirmed the gold and item transfer.';
      } else if (equal(snapshot(p), s.pending.before) && !p.ack) {
        return { ...reply, ...packet(s.pending), message: 'Apply checked trade.' };
      } else {
        s.fault = 'Transfer acknowledgement/count mismatch. Reload a known save before trading.';
        return { ...reply, message: s.fault, reset: true };
      }
    }
    if (!p.near) {
      if (s.queuedId) Object.assign(s.receipts.get(s.queuedId)!.receipt, { state: 'rejected', code: 'out_of_range' });
      s.queued = undefined; s.queuedId = undefined; s.status = 'out_of_range';
      return { ...reply, message: 'Stand near Brann; queued action cancelled.' };
    }
    if (s.status === 'out_of_range') s.status = 'ready';
    const command = s.queued;
    if (!command) return reply;
    s.queued = undefined; s.busy = true;
    const receipt = s.queuedId ? s.receipts.get(s.queuedId)!.receipt : undefined;
    s.queuedId = undefined;
    if (receipt) Object.assign(receipt, { state: 'executing', code: 'executing' });
    try {
      // Sync external Skyrim loot/spending/theft only when no ledger transfer is outstanding.
      for (const [actor, gold, qty] of [['player', p.pgold, p.pitem], [brann.id, p.sgold, p.sitem]] as const) {
        const synced = await call(s, 'sync', { actor, gold, stock: { [ITEM.good]: qty }, reason: 'Skyrim pre-action inventory snapshot' });
        if (!synced.ok) throw new Error('Inventory synchronization refused');
      }
      if (command.kind === 'accept') {
        if (!currentOffer(s, command)) {
          if (receipt) Object.assign(receipt, { state: 'rejected', code: 'stale_offer' });
          s.status = 'offer_rejected';
          return reply;
        }
      }
      const result = command.kind === 'say' ? await call(s, 'say', { npc: brann.id, text: command.text }) : await call(s, 'accept', { contract_id: command.contract });
      s.state = result.state;
      refreshOffers(s);
      for (const event of result.events) {
        if (event.type === 'SAID') line(s, `${event.actor === 'player' ? 'You' : 'Brann'}: ${event.data.text}`, event.actor === 'player' ? 'player' : 'brann', event.data.text);
        if (event.type === 'ACTION_REJECTED') line(s, `Ledger rejected: ${event.data.reason}`, 'system', 'The ledger rejected the proposed action.');
      }
      if (!result.ok) line(s, `Refused: ${result.reason}`, 'system', 'The action was refused.');
      if (result.outcome === 'unavailable' || result.outcome === 'fallback') line(s, `Model outcome: ${result.outcome}; this is not proof of a successful model reply.`);
      s.pending = transferPlan(result.events, snapshot(p), s.seen);
      s.status = s.pending ? 'transfer_pending' : !result.ok || result.events.some(e => e.type === 'ACTION_REJECTED' || e.type === 'CONTRACT_REFUSED') ? 'offer_rejected' :
        result.outcome === 'unavailable' || result.outcome === 'fallback' ? 'model_unavailable' : 'ready';
      if (receipt) Object.assign(receipt, { state: 'completed', code: result.ok ? 'completed' : 'action_rejected' });
      return s.pending ? { ...reply, ...packet(s.pending), message: 'Apply checked trade.' } : { ...reply, message: result.said.map(x => x.text).join(' ').slice(0, 900) };
    } catch (e) {
      // Any ambiguous API outcome stops the session: a POST may have committed before timeout.
      s.fault = e instanceof Error ? e.message : 'Bridge failed';
      line(s, 'Service request failed; its outcome may be unknown. Reload a known save.');
      if (receipt) Object.assign(receipt, { state: 'uncertain', code: 'outcome_unknown' });
      return { ...reply, reset: true, message: s.fault };
    } finally { s.busy = false; }
  }
  async function pollV2(raw: unknown) {
    const p = NativePoll.parse(raw);
    const { version, generation, command, ...base } = p;
    const native: { p: NativePoll; receipt?: Receipt; status?: Status } = { p };
    const result = await poll(base, native);
    const s = active?.id === p.session ? active : undefined;
    const receipt = native.receipt ?? (!s && command ? { id: command.id, state: 'rejected' as const, code: result.reset ? 'stale_session' : !p.near ? 'out_of_range' : 'session_connecting' } : undefined);
    const ui = nativeSnapshot(s, result.reset ? 'recovery_required' : !s ? (!p.near ? 'out_of_range' : 'connecting') : undefined, receipt);
    // Legacy diagnostic replies may carry raw exception text; the v2 boundary never does.
    return NativeReply.parse({ ...result, version, generation, message: ui.status_text, ui });
  }
  return { poll, pollV2, enqueue, view };
}

function packet(plan: Plan) {
  return { plan: plan.id, ...Object.fromEntries(Object.entries(plan.before).map(([k, v]) => [`before_${k}`, v])),
    ...Object.fromEntries(Object.entries(plan.after).map(([k, v]) => [`after_${k}`, v])) };
}
