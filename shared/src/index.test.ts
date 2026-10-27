import { describe, expect, it } from 'vitest';
import { ContractSchema, VerbSchema } from './index';

const handoffContract = {
  contract_id: 'c_001',
  item_name: 'Hammerhead Blade',
  item_type: 'sword',
  description: 'A broad blade shaped like a hammerhead shark',
  stats: { damage: 14, weight: 6, durability: 70 },
  materials_used: { iron: 3, sharkskin_leather: 1 },
  price: 120,
  delivery_ticks: 8,
  smith_remarks: "Heavy at the head. You'll feel it on the backswing.",
};

describe('ContractSchema', () => {
  it('accepts the handoff example', () => {
    expect(ContractSchema.safeParse(handoffContract).success).toBe(true);
  });

  it('rejects a contract with missing stats', () => {
    const { stats: _, ...noStats } = handoffContract;
    expect(ContractSchema.safeParse(noStats).success).toBe(false);
  });

  it('rejects a negative price', () => {
    expect(ContractSchema.safeParse({ ...handoffContract, price: -1 }).success).toBe(false);
  });
});

describe('VerbSchema', () => {
  it('rejects verbs outside the vocabulary', () => {
    expect(VerbSchema.safeParse('GIVE_FREE_SWORD').success).toBe(false);
    expect(VerbSchema.safeParse('PROPOSE_CONTRACT').success).toBe(true);
  });
});
