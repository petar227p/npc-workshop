import { describe, expect, it } from 'vitest';
import { ACTION_SCHEMAS, CatalogueSchema, TermsSchema, VerbSchema } from './index';

const handoffTerms = {
  kind: 'made_to_order',
  item_name: 'Hammerhead Blade',
  item_type: 'sword',
  description: 'A broad blade shaped like a hammerhead shark',
  stats: { damage: 14, weight: 6, durability: 70 },
  materials_used: { iron: 3, sharkskin_leather: 1 },
  price: 120,
  delivery_ticks: 8,
  remarks: "Heavy at the head. You'll feel it on the backswing.",
};

describe('TermsSchema', () => {
  it('accepts the handoff example and an in-stock sale', () => {
    expect(TermsSchema.safeParse(handoffTerms).success).toBe(true);
    expect(TermsSchema.safeParse({ kind: 'in_stock', good: 'torch', qty: 2, price: 6, remarks: 'Burns an hour each.' }).success).toBe(true);
  });

  it('rejects terms with missing stats, a negative price or no kind', () => {
    const { stats: _, ...noStats } = handoffTerms;
    expect(TermsSchema.safeParse(noStats).success).toBe(false);
    expect(TermsSchema.safeParse({ ...handoffTerms, price: -1 }).success).toBe(false);
    const { kind: _k, ...noKind } = handoffTerms;
    expect(TermsSchema.safeParse(noKind).success).toBe(false);
  });

  it('an offer carries its terms under `terms`', () => {
    expect(ACTION_SCHEMAS.OFFER.safeParse({ action: 'OFFER', terms: handoffTerms }).success).toBe(true);
    expect(ACTION_SCHEMAS.OFFER.safeParse({ action: 'OFFER', ...handoffTerms }).success).toBe(false);
  });
});

describe('CatalogueSchema', () => {
  it('checks names and ranges', () => {
    expect(CatalogueSchema.safeParse({ in_stock: { torch: { min_price: 3 } } }).success).toBe(true);
    expect(CatalogueSchema.safeParse({ in_stock: { Torch: { min_price: 3 } } }).success).toBe(false);
    expect(CatalogueSchema.safeParse({ in_stock: {} }).success).toBe(false);
    const range = { min: 5, max: 2 };
    const items = { sword: { damage: range, weight: { min: 1, max: 2 }, durability: { min: 1, max: 2 }, base_ticks: 1 } };
    expect(CatalogueSchema.safeParse({ made_to_order: { items, materials: { iron: 1 }, min_margin: 0, workload_per_job: 0 } }).success).toBe(false);
  });
});

describe('VerbSchema', () => {
  it('rejects verbs outside the vocabulary', () => {
    expect(VerbSchema.safeParse('GIVE_FREE_SWORD').success).toBe(false);
    expect(VerbSchema.safeParse('OFFER').success).toBe(true);
  });
});
