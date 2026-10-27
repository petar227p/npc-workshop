import { MAX_SAY_LENGTH, type Verb } from '@blacksmith/shared';
import { ITEM_TYPES, MATERIALS } from '../config/world';

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

// Enums come from the world config, so the model can't name an item type or material that doesn't exist.
const contract = () => ({
  type: 'object',
  additionalProperties: false,
  required: ['item_name', 'item_type', 'description', 'stats', 'materials', 'price', 'delivery_ticks', 'smith_remarks'],
  properties: {
    item_name: { type: 'string' },
    item_type: { type: 'string', enum: Object.keys(ITEM_TYPES) },
    description: { type: 'string' },
    stats: {
      type: 'object',
      additionalProperties: false,
      required: ['damage', 'weight', 'durability'],
      properties: { damage: int, weight: int, durability: int },
    },
    materials: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['material', 'qty'],
        properties: { material: { type: 'string', enum: Object.keys(MATERIALS) }, qty: int },
      },
    },
    price: int,
    delivery_ticks: int,
    smith_remarks: { type: 'string' },
  },
});
const contractId = () => ({ type: 'string' });

// The materials list becomes materials_used. fromEntries makes own keys, so '__proto__' stays a plain (invalid) name.
function terms(contract: unknown): Record<string, unknown> {
  if (!contract || typeof contract !== 'object') return {};
  const { materials, ...rest } = contract as Record<string, unknown>;
  const totals = new Map<string, number>();
  if (Array.isArray(materials)) {
    for (const m of materials as { material?: unknown; qty?: unknown }[]) {
      if (typeof m?.material === 'string' && typeof m.qty === 'number') totals.set(m.material, (totals.get(m.material) ?? 0) + m.qty);
    }
  }
  return { ...rest, materials_used: Object.fromEntries(totals) };
}

export const SAY: FlatVerb = {
  verb: 'SAY',
  fields: {},
  toAction: (out) => ({ action: 'SAY', text: out.say.slice(0, MAX_SAY_LENGTH) }),
};

export const PROPOSE_CONTRACT: FlatVerb = {
  verb: 'PROPOSE_CONTRACT',
  fields: { contract: contract() },
  toAction: (out) => ({ ...terms(out.contract), action: 'PROPOSE_CONTRACT' }),
};

export const COUNTER_OFFER: FlatVerb = {
  verb: 'COUNTER_OFFER',
  fields: { contract: contract(), contract_id: contractId() },
  toAction: (out) => ({ ...terms(out.contract), action: 'COUNTER_OFFER', replaces: out.contract_id }),
};

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
  for (const [name, schema] of fields) properties[name] = { anyOf: [schema, { type: 'null' }] };
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
