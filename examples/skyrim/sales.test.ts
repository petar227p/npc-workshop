import { describe, expect, it, vi } from 'vitest';
import { createApi } from '../../server/src/routes/api';
import { mockClient } from '../../server/src/models';
import { createBridge } from './bridge';

const sword = { form: '12345', name: 'Steel sword', count: 2, player_count: 1, weight: 10, value: 45, saleable: true };
const inventory = { gold: 50, total: 1, items: [sword] };
const base = { version: 2, session: 'sales-save', request: 1, generation: 1, near: true, ack: '', failed: false, pgold: 100, sgold: 50, pitem: 0, sitem: 6, inventory };
const offer = (name = 'Steel sword [12345]', qty = 1, price = 45) => JSON.stringify({ action: 'OFFER', say: 'Yours for the right price.', offer: { kind: 'in_stock', good: name, qty, price, remarks: '' }, contract_id: null });
function setup(replies = [offer()]) {
  const client = mockClient(replies); const chat = vi.fn(client.chat);
  const api = createApi({ makeModel: () => ({ model: 'test', client: { ...client, chat } }) });
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => api.request(String(url), init));
  const bridge = createBridge({ fetcher: fetcher as typeof fetch });
  const poll = (request: number, extra: object = {}) => bridge.pollV2({ ...base, request, ...extra });
  const say = (id = 'ask') => ({ id, kind: 'say', text: 'Can I buy your sword?' });
  return { api, chat, fetcher, bridge, poll, say };
}

describe('checked purchases from actual Skyrim carried inventory', () => {
  it('offers a non-dagger item, transfers the selected form and confirms only exact physical acknowledgement', async () => {
    const { poll, say, fetcher, chat } = setup(); await poll(1);
    const proposed = await poll(2, { command: say() });
    expect(proposed.ui.offers[0]).toMatchObject({ item: 'Steel sword [12345]', quantity: 1, total_price: 45 });
    expect(JSON.stringify(chat.mock.calls[0][0].json_schema)).toContain('Steel sword [12345]');
    const o = proposed.ui.offers[0]; const buy = { id: 'buy', kind: 'accept', contract: o.contract, revision: o.revision };
    const trade = await poll(3, { command: buy });
    expect(trade).toMatchObject({ item_form: 12345, item_before_player: 1, item_before_seller: 2, item_after_player: 2, item_after_seller: 1, after_pgold: 55, after_sgold: 95, after_pitem: 0, after_sitem: 6 });
    expect((await poll(4, { command: buy })).plan).toBe(trade.plan);
    const done = await poll(5, { ack: trade.plan, pgold: 55, sgold: 95, inventory: undefined, ack_item: { form: sword.form, player: 2, seller: 1 } });
    expect(done.ui.status).toBe('delivery_confirmed');
    expect(fetcher.mock.calls.filter(([u]) => String(u).endsWith('/accept'))).toHaveLength(1);
  });

  it('does not confirm mismatched or missing item acknowledgements even if gold matches', async () => {
    for (const ack_item of [undefined, { form: sword.form, player: 1, seller: 1 }, { form: '999', player: 2, seller: 1 }]) {
      const { poll, say } = setup(); await poll(1);
      const o = (await poll(2, { command: say() })).ui.offers[0];
      const trade = await poll(3, { command: { id: 'buy', kind: 'accept', contract: o.contract, revision: o.revision } });
      const result = await poll(4, { ack: trade.plan, pgold: 55, sgold: 95, inventory: undefined, ack_item });
      expect(result.reset).toBe(true); expect(result.ui.status).toBe('recovery_required');
    }
  });

  it('refuses newly equipped/removed stock and insufficient player funds without a physical plan', async () => {
    for (const extra of [{ inventory: { ...inventory, items: [{ ...sword, saleable: false }] } },
      { inventory: { ...inventory, total: 0, items: [] } }, { pgold: 2 }]) {
      const { poll, say } = setup(); await poll(1);
      const o = (await poll(2, { command: say() })).ui.offers[0];
      const result = await poll(3, { ...extra, command: { id: 'buy', kind: 'accept', contract: o.contract, revision: o.revision } });
      expect(result.plan).toBe(''); expect(result.reset).toBe(false);
    }
  });

  it('rejects underpriced model offers and excludes protected items from its offer schema', async () => {
    const { poll, say, chat } = setup([offer(undefined, 1, 1), offer(undefined, 1, 1)]); await poll(1);
    expect((await poll(2, { command: say() })).ui.offers).toEqual([]);
    const protectedItem = setup(); await protectedItem.poll(1);
    await protectedItem.poll(2, { inventory: { ...inventory, items: [{ ...sword, saleable: false }] }, command: protectedItem.say() });
    expect(JSON.stringify(protectedItem.chat.mock.calls[0][0].json_schema)).not.toContain('Steel sword');
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('adds newly discovered goods mid-conversation and distinguishes duplicate display names by form', async () => {
    const { poll, say } = setup([offer(), offer('Steel sword [67890]')]); await poll(1, { inventory: undefined });
    await poll(2, { command: say() });
    const added = { ...inventory, total: 2, items: [sword, { ...sword, form: '67890' }] };
    const result = await poll(3, { inventory: added, command: say('second') });
    expect(result.reset).toBe(false);
    expect(result.ui.offers.some(o => o.item === 'Steel sword [67890]')).toBe(true);
  });
});
