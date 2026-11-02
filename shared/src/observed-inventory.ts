import { z } from 'zod';

// Game observations describe carried items; they do not add goods to a seller's catalogue.
export const MAX_OBSERVED_ITEMS = 128;
export const MAX_INVENTORY_BODY_BYTES = 128 * 1024;
const quantity = z.number().int().min(0).max(2_147_483_647);
export const ObservedInventorySchema = z.object({
  gold: quantity,
  total: quantity,
  items: z.array(z.object({
    form: z.string().regex(/^-?\d{1,10}$/),
    name: z.string().trim().min(1).max(120),
    count: quantity.min(1),
    weight: z.number().finite().nonnegative(),
    value: quantity,
    player_count: quantity.optional(),
    saleable: z.boolean().optional(),
  }).strict()).max(MAX_OBSERVED_ITEMS),
}).strict().superRefine((inventory, ctx) => {
  if (inventory.items.length > inventory.total) ctx.addIssue({ code: 'custom', message: 'more rows than inventory entries' });
  if (new Set(inventory.items.map(item => item.form)).size !== inventory.items.length) {
    ctx.addIssue({ code: 'custom', message: 'duplicate base forms' });
  }
});
export type ObservedInventory = z.infer<typeof ObservedInventorySchema>;
