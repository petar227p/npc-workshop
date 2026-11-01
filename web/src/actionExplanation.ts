import type { BenchResponse, ControlledResponse, EngineEvent, NpcDraft } from '@blacksmith/shared';

export type ActionExplanation = {
  eventId: string;
  source: string;
  proposal: string;
  rule: string;
  accepted: boolean;
  state: string;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const short = (value: unknown) => String(value ?? '').slice(0, 180);
const word = (value: unknown) => short(value).replace(/_/g, ' ');
function parsed(content: string): Record<string, unknown> {
  try { return record(JSON.parse(content)); } catch { return {}; }
}

function proposalText(raw: Record<string, unknown>, event: EngineEvent, draft: NpcDraft): string {
  const name = (id: unknown) => draft.labels[short(id)] ?? word(id);
  const verb = short(raw.action) || (event.type === 'CONTRACT_PROPOSED' ? event.data.replaces ? 'COUNTER_OFFER' : 'OFFER' : Object.entries(eventFor).find(([, types]) => types.includes(event.type))?.[0]) || 'Invalid action';
  const terms = record(event.type === 'CONTRACT_PROPOSED' ? event.data.contract : raw.terms ?? raw.offer);
  if (verb === 'OFFER' || verb === 'COUNTER_OFFER') {
    const item = terms.kind === 'in_stock' ? `${short(terms.qty)} × ${name(terms.good)}` : name(terms.item_name ?? terms.item_type);
    const stats = record(terms.stats);
    // Put the rejected stat beside the proposal, rather than requiring a JSON inspection.
    const stat = event.type === 'ACTION_REJECTED' && /^(damage|weight|durability)\b/.exec(event.data.reason)?.[1];
    return `${verb === 'COUNTER_OFFER' ? 'Counter-offer' : 'Offer'}: ${item || 'unspecified item'} · ${short(terms.price)} gold${stat ? ` · ${stat} ${short(stats[stat])}` : ''}${terms.kind === 'made_to_order' ? ` · ${short(terms.delivery_ticks)} h` : ''}`;
  }
  if (verb === 'GIVE') {
    const gift = record(event.type === 'GIVEN' || event.type === 'GIFT_REFUSED' ? event.data.gift : raw.gift);
    return `Give: ${gift.kind === 'gold' ? `${short(gift.amount)} gold` : gift.kind === 'good' ? `${short(gift.qty)} × ${name(gift.good)}` : short(gift.item_id)}`;
  }
  if (verb === 'SIGNAL') return `Signal: ${short(event.type === 'SIGNALED' ? event.data.signal : raw.signal)}`;
  if (['TELL', 'RETELL', 'ANNOUNCE'].includes(verb)) return `${verb}: event ${short(raw.event_id)}`;
  if (verb === 'SAY' || verb === 'EMOTE') return `${verb}: “${short(event.type === 'SAID' || event.type === 'EMOTED' ? event.data.text : raw.text ?? raw.say ?? raw.emote)}”`;
  return `${verb}${raw.contract_id ? `: ${short(raw.contract_id)}` : ''}`;
}

function acceptedRule(event: EngineEvent, draft: NpcDraft): string {
  switch (event.type) {
    case 'CONTRACT_PROPOSED': {
      const t = event.data.contract;
      const minimum = t.kind === 'in_stock' ? draft.catalogue.in_stock?.[t.good]?.min_price : undefined;
      return minimum === undefined ? 'Allowed ability; catalogue limits, materials, price and delivery checks passed.' : `Minimum: ${minimum * (t.kind === 'in_stock' ? t.qty : 1)} gold total; quantity must fit available stock.`;
    }
    case 'SAID': return 'SAY allowed; spoken text must fit the action schema.';
    case 'EMOTED': return 'EMOTE allowed; gesture text must fit the action schema.';
    case 'SIGNALED': return `Signal must be declared: ${event.data.signal}.`;
    case 'GIVEN': return 'GIVE allowed; giver must own the gift and recipient must accept it.';
    case 'GIFT_REFUSED': return event.data.reason;
    case 'CONTRACT_REFUSED': return 'REFUSE allowed; withdrawing an offer requires an open offer owned by this NPC.';
    case 'WORK_STARTED': return 'Work requires an accepted made-to-order contract owned by this NPC.';
    case 'CONTRACT_ACCEPTED': return 'Open offer for this customer; enough gold and unreserved stock.';
    case 'TOLD': case 'RETOLD': case 'ANNOUNCED': return 'News must cite an event the NPC saw or was told; audience and location checks passed.';
    default: return 'Allowed ability; action schema and ledger rules passed.';
  }
}

function resultingState(event: EngineEvent): string {
  switch (event.type) {
    case 'ACTION_REJECTED': return 'Gold, stock and contracts unchanged.';
    case 'CONTRACT_PROPOSED': return `Offer ${event.data.contract.contract_id} ${event.data.replaces ? `replaces ${event.data.replaces}` : 'created'}; gold and stock unchanged until accepted.`;
    case 'SAID': return 'Speech logged; gold and stock unchanged.';
    case 'EMOTED': return 'Gesture logged; gold and stock unchanged.';
    case 'SIGNALED': return 'Signal logged; gold and stock unchanged. Your game decides what happens next.';
    case 'GIFT_REFUSED': return 'Recipient refused the gift; gold, stock and item ownership unchanged.';
    case 'GIVEN': {
      const g = event.data.gift;
      return `${g.kind === 'gold' ? `${g.amount} gold` : g.kind === 'good' ? `${g.qty} × ${word(g.good)}` : event.data.item_name ?? g.item_id} transferred to ${event.target}; no contract created.`;
    }
    case 'CONTRACT_REFUSED': return event.data.contract_id ? `Offer ${event.data.contract_id} withdrawn; gold and stock unchanged.` : 'Refusal logged; gold, stock and contracts unchanged.';
    case 'WORK_STARTED': return `${event.data.contract_id} in progress; due at tick ${event.data.due_tick}.`;
    case 'CONTRACT_ACCEPTED': return `${event.data.contract_id} accepted; ${event.data.price} gold paid to the seller.`;
    case 'TOLD': case 'RETOLD': case 'ANNOUNCED': return `Telling of ${event.data.event_id} logged; gold and stock unchanged.`;
    default: return 'Accepted event logged.';
  }
}

function explain(draft: NpcDraft, raw: Record<string, unknown>, event: EngineEvent, source: string): ActionExplanation {
  const accepted = event.type !== 'ACTION_REJECTED';
  return { eventId: event.id, source, proposal: proposalText(raw, event, draft), rule: accepted ? acceptedRule(event, draft) : event.data.reason, accepted, state: resultingState(event) };
}

const eventFor: Record<string, EngineEvent['type'][]> = {
  SAY: ['SAID'], EMOTE: ['EMOTED'], OFFER: ['CONTRACT_PROPOSED'], COUNTER_OFFER: ['CONTRACT_PROPOSED'],
  GIVE: ['GIVEN', 'GIFT_REFUSED'], SIGNAL: ['SIGNALED'], REFUSE: ['CONTRACT_REFUSED'], ACCEPT: ['CONTRACT_ACCEPTED'],
  START_WORK: ['WORK_STARTED'], TELL: ['TOLD'], RETELL: ['RETOLD'], ANNOUNCE: ['ANNOUNCED'],
};

// Save explanations when the response arrives. Later draft edits and retries must not rewrite earlier checks.
export function modelExplanations(draft: NpcDraft, response: Pick<BenchResponse, 'attempts' | 'events'>): ActionExplanation[] {
  let cursor = 0;
  return response.attempts.flatMap((attempt, i) => {
    const raw = parsed(attempt.content);
    const index = response.events.findIndex((e, j) => j >= cursor && (e.actor === draft.id || e.type === 'GIFT_REFUSED' && e.target === draft.id) &&
      (attempt.ok ? (eventFor[short(raw.action)] ?? Object.values(eventFor).flat()).includes(e.type) : e.type === 'ACTION_REJECTED'));
    if (index < 0) return [];
    cursor = index + 1;
    const event = response.events[index];
    return [explain(draft, event.type === 'ACTION_REJECTED' ? record(event.data.proposed) : raw, event, `Model proposal · attempt ${i + 1} of ${response.attempts.length}`)];
  });
}

export function controlledExplanations(draft: NpcDraft, response: Pick<ControlledResponse, 'proposal' | 'events'>): ActionExplanation[] {
  const event = response.events.find((e) => e.type === 'ACTION_REJECTED') ?? response.events[0];
  return event ? [explain(draft, record(response.proposal), event, 'Controlled proposal · workshop · no model')] : [];
}
