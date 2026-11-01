import { NpcDraftSchema } from '@blacksmith/shared';

// Only a vanilla base item: no generated stats, dynamic forms or load-order-dependent IDs.
export const ITEM = { good: 'iron_dagger', plugin: 'Skyrim.esm', localId: 0x1397e, label: 'iron dagger' } as const;
export const brann = NpcDraftSchema.parse({
  id: 'whiterun_smith', name: 'Brann',
  persona: 'You are Brann, a visiting blacksmith at Warmaidens in Whiterun, Skyrim. Speak briefly in character. Negotiate the iron daggers physically in your stock. Prices are total gold for the lot. Never promise custom stats, enchantments, materials, timed work or unmapped items. You can discuss your craft and refuse unreasonable requests.',
  verbs: ['SAY', 'OFFER', 'COUNTER_OFFER', 'REFUSE'],
  model_verbs: ['SAY', 'OFFER', 'COUNTER_OFFER', 'REFUSE'],
  facts: ['clock', 'purse', 'stock', 'catalogue', 'price_floor', 'open_offers'],
  perception_radius: 4, model: 'muse_spark', effort: 'low',
  location: 'forge', schedule: [], sprite: 86,
  art: { style: '', references: [] }, start: { gold: 50, stock: { iron_dagger: 6 } },
  catalogue: { in_stock: { iron_dagger: { min_price: 10 } } },
  labels: { iron_dagger: 'iron dagger' }, signals: {}, triggers: [{ kind: 'on_spoken_to' }],
  cue: "Reply to the customer's last words.",
  fallbacks: { rejected: 'Let me consider that again.', unavailable: 'The forge needs my attention. Try again shortly.' },
});
