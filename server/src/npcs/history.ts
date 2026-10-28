import type { Gift } from '@blacksmith/shared';
import type { World } from '../engine';
import { describe } from './facts';

const gift = (g: Gift, itemName: string | null) =>
  g.kind === 'gold' ? `${g.amount} gold` : g.kind === 'good' ? `${g.qty} × ${g.good}` : `${JSON.stringify(itemName ?? g.item_id)} (${g.item_id})`;

const HISTORY_EVENTS = 24;

// The conversation between one NPC and one customer, rebuilt from the event log rather than kept as chat state.
export function historyFor(npcId: string, name: string): (world: World, customer: string) => string {
  return (world, customer) => {
    // Accepts, work and deliveries are about a contract; only this NPC's own sales belong in its history.
    const sold = (id: string) => world.contracts[id]?.seller === npcId;
    const lines: string[] = [];
    for (const e of world.events) {
      switch (e.type) {
        case 'SAID': {
          // Only this NPC and this customer, to each other: another villager's line must not read as the customer's
          // words, and what the customer said to another seller isn't this NPC's business. (No target: said to nobody in particular.)
          const speaker =
            e.actor === npcId && (e.target === customer || e.target === null)
              ? name
              : e.actor === customer && (e.target === npcId || e.target === null)
                ? 'Customer'
                : null;
          // JSON-quoted, so a customer's quotes and newlines can't forge ledger lines or the NPC's words.
          if (speaker) lines.push(`${speaker}: ${JSON.stringify(e.data.text)}`);
          break;
        }
        case 'EMOTED':
          if (e.actor === npcId && (e.target === customer || e.target === null)) lines.push(`[${name} ${JSON.stringify(e.data.text)}]`);
          break;
        case 'GIVEN':
          if (e.actor === npcId && e.target === customer) lines.push(`[${name} gave the customer ${gift(e.data.gift, e.data.item_name)}]`);
          if (e.actor === customer && e.target === npcId) lines.push(`[Customer gave ${name} ${gift(e.data.gift, e.data.item_name)}]`);
          break;
        case 'CONTRACT_PROPOSED':
          if (e.actor === npcId && e.data.customer === customer) {
            lines.push(
              `[${name} offered ${e.data.contract.contract_id}${e.data.replaces ? ` (replacing ${e.data.replaces})` : ''}: ${describe(e.data.contract)}]`,
            );
          }
          break;
        case 'CONTRACT_REFUSED':
          if (e.actor === npcId && e.target === customer) lines.push(`[${name} refused${e.data.contract_id ? ` and withdrew ${e.data.contract_id}` : ' the request'}]`);
          break;
        case 'CONTRACT_ACCEPTED':
          if (e.actor === customer && sold(e.data.contract_id)) lines.push(`[Customer accepted ${e.data.contract_id} and paid ${e.data.price} gold]`);
          break;
        case 'WORK_STARTED':
          if (e.target === customer && sold(e.data.contract_id)) lines.push(`[Work began on ${e.data.contract_id}, ready at hour ${e.data.due_tick}]`);
          break;
        case 'ITEM_DELIVERED':
          if (e.target === customer && sold(e.data.contract_id)) lines.push(`[${e.data.item.item_name} (${e.data.contract_id}) was handed to the customer at hour ${e.tick}]`);
          break;
        case 'GOODS_DELIVERED':
          if (e.target === customer && sold(e.data.contract_id)) lines.push(`[${e.data.qty} × ${e.data.good} (${e.data.contract_id}) handed to the customer]`);
          break;
      }
    }
    return lines.slice(-HISTORY_EVENTS).join('\n') || '(nothing yet)';
  };
}
