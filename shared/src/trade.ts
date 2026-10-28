import { z } from 'zod';

// What can be sold and on what terms. A seller's catalogue lives in its NPC file; the OFFER rule checks terms against it.

export const STATS = ['damage', 'weight', 'durability'] as const;

export const StatsSchema = z.object({
  damage: z.number().int(),
  weight: z.number().int(),
  durability: z.number().int(),
});

// Terms of an offer, as the model proposes them. Contract ids are assigned by code, never by the model.
// Unknown extra fields are stripped, so they can't smuggle anything in.
export const MadeToOrderTermsSchema = z.object({
  kind: z.literal('made_to_order'),
  item_name: z.string().min(1).max(60),
  item_type: z.string(),
  description: z.string().max(400),
  stats: StatsSchema,
  materials_used: z.record(z.string(), z.number().int().positive()),
  price: z.number().int().nonnegative(),
  delivery_ticks: z.number().int().positive(),
  remarks: z.string().max(400),
});

export const InStockTermsSchema = z.object({
  kind: z.literal('in_stock'),
  good: z.string(),
  qty: z.number().int().positive(),
  price: z.number().int().nonnegative(), // for the whole lot
  remarks: z.string().max(400),
});

export const TermsSchema = z.discriminatedUnion('kind', [MadeToOrderTermsSchema, InStockTermsSchema]);
export type Terms = z.infer<typeof TermsSchema>;
export type MadeToOrderTerms = z.infer<typeof MadeToOrderTermsSchema>;
export type InStockTerms = z.infer<typeof InStockTermsSchema>;
export type OfferKind = Terms['kind'];

export type Contract = Terms & { contract_id: string };

// Something handed over for nothing: gold, goods from its stock, or a made-to-order item it owns.
export const GiftSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gold'), amount: z.number().int().positive() }),
  z.object({ kind: z.literal('good'), good: z.string(), qty: z.number().int().positive() }),
  z.object({ kind: z.literal('item'), item_id: z.string() }),
]);
export type Gift = z.infer<typeof GiftSchema>;

// Names in a catalogue or stock list: they become enums in the model's schema and keys in the world.
const NAME = /^[a-z][a-z0-9_]{0,40}$/;
const name = z.string().regex(NAME, 'names are lowercase letters, digits and _, starting with a letter');
const count = z.number().int().min(0).max(1_000_000);
const notEmpty = (r: Record<string, unknown>) => Object.keys(r).length > 0;

const RangeSchema = z
  .object({ min: count, max: count })
  .strict()
  .refine((r) => r.min <= r.max, 'min is above max');

export const ItemTypeSchema = z
  .object({ damage: RangeSchema, weight: RangeSchema, durability: RangeSchema, base_ticks: z.number().int().min(1).max(1000) })
  .strict();

export const MadeToOrderSchema = z
  .object({
    items: z.record(name, ItemTypeSchema).refine(notEmpty, 'list at least one item type'),
    materials: z.record(name, count).refine(notEmpty, 'list at least one material'), // cost per unit
    min_margin: z.number().min(0).max(10), // price must cover material cost plus this share
    workload_per_job: z.number().min(0).max(10), // each job in hand adds this share of base_ticks
  })
  .strict();

export const CatalogueSchema = z
  .object({
    made_to_order: MadeToOrderSchema.optional(),
    in_stock: z.record(name, z.object({ min_price: count }).strict()).refine(notEmpty, 'list at least one good').optional(),
  })
  .strict();

export type ItemTypeDef = z.infer<typeof ItemTypeSchema>;
export type MadeToOrder = z.infer<typeof MadeToOrderSchema>;
export type Catalogue = z.infer<typeof CatalogueSchema>;

// What an actor has in a new world.
export const StartSchema = z.object({ gold: count, stock: z.record(name, count) }).strict();
export type Start = z.infer<typeof StartSchema>;
