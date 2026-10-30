import { MAX_EMOTE_LENGTH, MAX_NEWS_LENGTH, MAX_SAY_LENGTH, type Catalogue, type MadeToOrder, type OfferKind, type Verb } from '@blacksmith/shared';

// Meta's strict mode forbids a root anyOf, so a model answers in one flat object: the verb, the spoken line,
// and the union of the fields its verbs use (nullable). Each verb here says which fields it reads and how
// they map onto its action. An NPC's schema is generated from its verb list (flatSchema).

export type FlatOutput = { action: unknown; say: string } & Record<string, unknown>;

export type FlatVerb = {
  verb: Verb;
  fields: Record<string, Record<string, unknown>>; // JSON schema per field; made nullable in the combined schema
  toAction(out: FlatOutput): unknown;
};

const int = { type: 'integer' };
const str = { type: 'string' };
const kind = (k: OfferKind) => ({ type: 'string', enum: [k] });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

// What the NPC calls each thing (its label, or the name itself) and back again: the model's enums and facts are in its
// words, the action the ledger checks is in the world's names (a game's own item ids). A word it doesn't know passes
// through as it is, for the ledger to refuse. Two things one word would make an answer ambiguous, so that is an error.
export type Words = { word(name: string): string; name(word: string): string };
export const PLAIN: Words = { word: (n) => n, name: (w) => w };
export function wordsFor(names: readonly string[], label: (name: string) => string): Words {
  const back = new Map<string, string>();
  for (const n of new Set(names)) {
    const w = label(n);
    const taken = back.get(w);
    if (taken !== undefined) throw new Error(`two things are called "${w}": '${taken}' and '${n}'`);
    back.set(w, n);
  }
  return { word: label, name: (w) => back.get(w) ?? w };
}
const enumOf = (names: readonly string[], words: Words) => ({ type: 'string', enum: names.map(words.word) });

// Enums come from the seller's catalogue, so the model can't name an item type, material or good it doesn't sell.
const madeToOrder = (mto: MadeToOrder, words: Words) =>
  object({
    kind: kind('made_to_order'),
    item_name: str,
    item_type: enumOf(Object.keys(mto.items), words),
    description: str,
    stats: object({ damage: int, weight: int, durability: int }),
    materials: { type: 'array', items: object({ material: enumOf(Object.keys(mto.materials), words), qty: int }) },
    price: int,
    delivery_ticks: int,
    remarks: str,
  });

const inStock = (goods: Record<string, unknown>, words: Words) =>
  object({ kind: kind('in_stock'), good: enumOf(Object.keys(goods), words), qty: int, price: int, remarks: str });

function kindsOf(catalogue: Catalogue): OfferKind[] {
  return [...(catalogue.made_to_order ? ['made_to_order' as const] : []), ...(catalogue.in_stock ? ['in_stock' as const] : [])];
}

// One shape per kind the seller offers. Nested anyOf is fine in strict mode; only the root may not be one.
function offerField(catalogue: Catalogue, words: Words): Record<string, unknown> {
  const shapes = [
    ...(catalogue.made_to_order ? [madeToOrder(catalogue.made_to_order, words)] : []),
    ...(catalogue.in_stock ? [inStock(catalogue.in_stock, words)] : []),
  ];
  if (shapes.length === 0) throw new Error('OFFER and COUNTER_OFFER need a catalogue with something to sell');
  return shapes.length === 1 ? shapes[0] : { anyOf: shapes };
}
const contractId = () => ({ type: 'string' });

// The flat offer becomes the action's `terms`, with the NPC's words turned back into names. A made-to-order materials
// list becomes materials_used; fromEntries makes own keys, so '__proto__' stays a plain (invalid) name. A seller with
// one kind may leave `kind` out.
function terms(offer: unknown, kinds: OfferKind[], words: Words): Record<string, unknown> {
  if (!offer || typeof offer !== 'object') return {};
  const { materials, ...rest } = offer as Record<string, unknown>;
  const k = rest.kind ?? (kinds.length === 1 ? kinds[0] : undefined);
  const named = (v: unknown) => (typeof v === 'string' ? words.name(v) : v);
  if (k !== 'made_to_order') return { ...rest, kind: k, ...('good' in rest && { good: named(rest.good) }) };
  const totals = new Map<string, number>();
  if (Array.isArray(materials)) {
    for (const m of materials as { material?: unknown; qty?: unknown }[]) {
      if (typeof m?.material === 'string' && typeof m.qty === 'number') {
        const name = words.name(m.material);
        totals.set(name, (totals.get(name) ?? 0) + m.qty);
      }
    }
  }
  return { ...rest, kind: k, ...('item_type' in rest && { item_type: named(rest.item_type) }), materials_used: Object.fromEntries(totals) };
}

export const SAY: FlatVerb = {
  verb: 'SAY',
  fields: {},
  toAction: (out) => ({ action: 'SAY', text: out.say.slice(0, MAX_SAY_LENGTH) }),
};

export function OFFER(catalogue: Catalogue, words: Words = PLAIN): FlatVerb {
  const kinds = kindsOf(catalogue);
  return {
    verb: 'OFFER',
    fields: { offer: offerField(catalogue, words) },
    toAction: (out) => ({ action: 'OFFER', terms: terms(out.offer, kinds, words) }),
  };
}

export function COUNTER_OFFER(catalogue: Catalogue, words: Words = PLAIN): FlatVerb {
  const kinds = kindsOf(catalogue);
  return {
    verb: 'COUNTER_OFFER',
    fields: { offer: offerField(catalogue, words), contract_id: contractId() },
    toAction: (out) => ({ action: 'COUNTER_OFFER', replaces: out.contract_id, terms: terms(out.offer, kinds, words) }),
  };
}

// The gesture goes in its own field; `say` can still carry a line, spoken after it.
export const EMOTE: FlatVerb = {
  verb: 'EMOTE',
  fields: { emote: str },
  toAction: (out) => ({ action: 'EMOTE', text: typeof out.emote === 'string' ? out.emote.slice(0, MAX_EMOTE_LENGTH) : '' }),
};

// One shape per kind of gift; goods are an enum of what it may hold. A gift goes to whoever it's talking to: the model
// is never told anyone's id (the history says "Customer"), so a recipient field would only invite names the ledger refuses.
export function GIVE(goods: readonly string[], words: Words = PLAIN): FlatVerb {
  const shapes = [
    object({ kind: { type: 'string', enum: ['gold'] }, amount: int }),
    ...(goods.length ? [object({ kind: { type: 'string', enum: ['good'] }, good: enumOf(goods, words), qty: int })] : []),
    object({ kind: { type: 'string', enum: ['item'] }, item_id: str }),
  ];
  const named = (gift: unknown) => {
    const g = gift as { kind?: unknown; good?: unknown } | null;
    return g && typeof g === 'object' && g.kind === 'good' && typeof g.good === 'string' ? { ...g, good: words.name(g.good) } : gift;
  };
  return {
    verb: 'GIVE',
    fields: { gift: { anyOf: shapes } },
    toAction: (out) => ({ action: 'GIVE', to: null, gift: named(out.gift) }),
  };
}

// News: the model names the event it is passing on; its spoken line is its wording of it. A TELL goes to whoever it
// is talking to, for the same reason a gift does.
const news = (verb: 'TELL' | 'RETELL' | 'ANNOUNCE'): FlatVerb => ({
  verb,
  fields: { event_id: str },
  toAction: (out) => ({ action: verb, ...(verb === 'TELL' ? { to: null } : {}), event_id: out.event_id, summary: out.say.slice(0, MAX_NEWS_LENGTH) }),
});
export const TELL = news('TELL');
export const RETELL = news('RETELL');
export const ANNOUNCE = news('ANNOUNCE');

// The signal is one of the NPC's own names; its spoken line, if any, goes in `say`.
export function SIGNAL(signals: readonly string[]): FlatVerb {
  return {
    verb: 'SIGNAL',
    fields: { signal: { type: 'string', enum: [...signals] } },
    toAction: (out) => ({ action: 'SIGNAL', signal: out.signal }),
  };
}

export const REFUSE: FlatVerb = {
  verb: 'REFUSE',
  fields: { contract_id: contractId() },
  toAction: (out) => ({ action: 'REFUSE', contract_id: out.contract_id ?? null, reason: out.say.slice(0, 400) }),
};

function fieldsOf(verbs: readonly FlatVerb[]): Map<string, Record<string, unknown>> {
  const fields = new Map<string, Record<string, unknown>>();
  for (const v of verbs) {
    for (const [name, schema] of Object.entries(v.fields)) {
      const seen = fields.get(name);
      if (seen && JSON.stringify(seen) !== JSON.stringify(schema)) throw new Error(`field '${name}' has two shapes (${v.verb})`);
      fields.set(name, schema);
    }
  }
  return fields;
}

export function flatSchema(verbs: readonly FlatVerb[]): Record<string, unknown> {
  const fields = fieldsOf(verbs);
  const properties: Record<string, unknown> = {
    action: { type: 'string', enum: verbs.map((v) => v.verb) },
    say: { type: 'string' },
  };
  for (const [name, schema] of fields) {
    const shapes = Array.isArray(schema.anyOf) ? (schema.anyOf as unknown[]) : [schema];
    properties[name] = { anyOf: [...shapes, { type: 'null' }] };
  }
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

export function parseFlat(content: string): FlatOutput | null {
  try {
    const v = JSON.parse(content) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return { ...v, action: v.action, say: typeof v.say === 'string' ? v.say : '' };
  } catch {
    return null;
  }
}

// A verb outside the NPC's list (DELIVER, made-up ones) passes through whole: act() rejects it with a reason,
// and the ledger keeps everything the model sent (clipped if huge).
export function fromFlat(verbs: readonly FlatVerb[], out: FlatOutput): unknown {
  const v = verbs.find((f) => f.verb === out.action);
  return v ? v.toAction(out) : { ...out };
}
