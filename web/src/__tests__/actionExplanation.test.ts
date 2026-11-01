import type { BenchResponse, ControlledResponse, NpcDraft } from '@blacksmith/shared';
import { buildSetup, SETUP_ROLES } from '@blacksmith/shared/src/setup';
import { describe, expect, it } from 'vitest';
import { createApi } from '../../../server/src/routes/api';
import { mockClient } from '../../../server/src/models';
import { controlledExplanations, modelExplanations } from '../actionExplanation';

async function bench<T>(draft: NpcDraft, replies: string[], action = 'say'): Promise<T> {
  const app = createApi({ makeModel: () => ({ client: mockClient(replies), model: 'test' }) });
  const response = await app.request(`/api/editor/bench/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ npc: draft, text: 'Hello' }),
  });
  expect(response.status).toBe(200);
  return await response.json() as T;
}

describe('checked action explanations', () => {
  it('shows the proposed price, actual minimum, rejection and unchanged state for a controlled test', async () => {
    const draft = buildSetup({ role: 'merchant' }).draft;
    draft.catalogue.in_stock!.candle.min_price = 20;
    const response = await bench<ControlledResponse>(draft, [], 'controlled');
    expect(controlledExplanations(draft, response)).toEqual([expect.objectContaining({
      source: 'Controlled proposal · workshop · no model', proposal: 'Offer: 1 × candle · 19 gold',
      rule: 'price 19 is below the minimum of 20 (1 × 20)', accepted: false, state: 'Gold, stock and contracts unchanged.',
    })]);
  });

  it.each(SETUP_ROLES)('explains the real controlled rejection for a %s', async (role) => {
    const draft = buildSetup({ role }).draft;
    const response = await bench<ControlledResponse>(draft, [], 'controlled');
    const [check] = controlledExplanations(draft, response);
    expect(check.accepted).toBe(false);
    expect(check.rule).toBe(response.reason);
    expect(check.proposal.length).toBeGreaterThan(5);
    if (role === 'craftsperson') expect(check.proposal).toContain('damage 9');
  });

  it('keeps the rejected attempt and accepted repair separate, and never calls an offer a sale', async () => {
    const draft = buildSetup({ role: 'merchant' }).draft;
    draft.labels.candle = 'wax light';
    const offer = (price: number) => JSON.stringify({ action: 'OFFER', say: 'A deal.', offer: { kind: 'in_stock', good: 'wax light', qty: 2, price, remarks: '' } });
    const response = await bench<BenchResponse>(draft, [offer(0), offer(2)]);
    const checks = modelExplanations(draft, response);
    expect(checks).toHaveLength(2);
    expect(checks[0]).toMatchObject({ source: 'Model proposal · attempt 1 of 2', accepted: false });
    expect(checks[1]).toMatchObject({ source: 'Model proposal · attempt 2 of 2', proposal: 'Offer: 2 × wax light · 2 gold', accepted: true });
    expect(checks[1].rule).toContain('Minimum: 2 gold total');
    expect(checks[1].state).toContain('gold and stock unchanged until accepted');
    draft.catalogue.in_stock!.candle.min_price = 99;
    expect(checks[1].rule).toContain('Minimum: 2 gold total');
  });

  it('explains malformed answers without treating fallback speech as an accepted model proposal', async () => {
    const draft = buildSetup({ role: 'villager' }).draft;
    const response = await bench<BenchResponse>(draft, ['broken JSON', 'still broken']);
    const checks = modelExplanations(draft, response);
    expect(checks).toHaveLength(2);
    expect(checks.every((check) => !check.accepted)).toBe(true);
    expect(checks[0].proposal).toBe('Invalid action');
    expect(modelExplanations(draft, { attempts: [], events: response.events })).toEqual([]);
  });

  it('describes a signal as a request for game code, with no invented game outcome', async () => {
    const draft = buildSetup({ role: 'guard' }).draft;
    const signal = Object.keys(draft.signals)[0];
    const response = await bench<BenchResponse>(draft, [JSON.stringify({ action: 'SIGNAL', signal, say: 'Request sent.' })]);
    const [check] = modelExplanations(draft, response);
    expect(check.accepted).toBe(true);
    expect(check.rule).toContain(signal);
    expect(check.state).toBe('Signal logged; gold and stock unchanged. Your game decides what happens next.');
  });
});
