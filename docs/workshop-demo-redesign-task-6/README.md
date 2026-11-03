# Workshop and demo redesign — Task 6: conversation and order area

Recorded 2026-11-03. Plan: [workshop-demo-redesign-plan.md](../workshop-demo-redesign-plan.md). Previous step: [Task 5](../workshop-demo-redesign-task-5/README.md).

## What changed

- **The composer stays anchored.** `.messages` already had `flex: 1; overflow-y: auto`. In the demo it now also gets `min-height: 120px`, which replaces the flex default of content height, so the transcript scrolls instead of growing. The chat panel is `flex: 1 1 0; min-height: 0`.
- **Errors and forge work sit inside the conversation**, between the transcript and the message box. This uses a new optional `Chat` prop, `beforeComposer`; only the demo uses `Chat`. Previously they came after the composer, so several orders pushed past the panel.
- **The forge is a set of compact rows** (`Side.tsx` `Forge`). The heading shows "Forge · N orders" with **Wait until ready** next to it, so the button is always in view. Each order is a `<details>` row: name, a 72 px progress bar plus screen-reader-only "N% done", and the ready time. Opening a row shows the picture, description, stats, price, materials, start time, hours of work and contract id. The list is capped at 168 px and scrolls. The timing (`nextDue`, max 48 h) is unchanged.
- **Focus recovery** (`keepFocus`) now records where the button was *before* the action. After an accepted offer, React detaches the Accept button together with its wrapper, so the old `closest()` check found nothing and focus fell back to +1 hour.
  - After **Accept**, focus goes to **Wait until ready**, or to the message box for goods handed over at once.
  - After the **last forge order**, focus goes to the Bag button.
  - Otherwise it falls back to +1 hour, as before.
- **Fixed a Task 5 regression.** The transcript's screen-reader-only spans are `position: absolute`. When Task 5 removed `position: sticky` from the talk column, they started positioning against the page, which grew to 1,781 px or more in a long chat. `.messages` and `.talk-col` are now positioned containers.
- Inventory was already removed from under the conversation in Task 3.
- **Mock change:** `offline-api.ts` now offers only when the customer's latest line asks for a sword. Each further offer is a new blade that takes 6 h longer, and the price is 40, so three orders can be placed in one world.

## Checked in the browser

Run against the offline mock. No model calls.

- [x] **Long conversation at 1440×900:** after 12 long lines plus replies, the transcript content is 1,772 px inside a 703 px box. The composer stays at y = 849–887 and the page stays 900 px.
- [x] **Three orders:** "Forge · 3 orders" with Hammerhead Blade (ready 16:00), Blade No. 2 (22:00) and Blade No. 3 (Day 2 · 04:00). The composer is still at y = 849 and the page is 900. Opening a row shows its details, and the list scrolls inside its cap (186 px in 168). → [demo-1440-three-orders.jpg](demo-1440-three-orders.jpg)
- [x] **Focus after Accept:** it landed on Wait until ready all three times.
- [x] **Wait until ready ×3:**
  - The clock went 16:00 → 22:00 → Day 2 · 04:00, and the Bag count went 1 → 2 → 3.
  - The progress bars moved (57% and 40%, then 70%).
  - Focus stayed on Wait until ready while orders remained, then moved to the Bag button.
- [x] **Error:** giving 9,999 gold showed "player has 80 gold; it can't give 9999" directly above the composer. The page stayed 900 px. → [demo-1440-error-above-composer.jpg](demo-1440-error-above-composer.jpg)
- [x] **1024×768:** the composer is at y = 718–756, the page is 768 px and nothing scrolls sideways.
- [x] **390×844:** no horizontal overflow, and the composer is inside the chat panel.
- [x] `npm test` (642), `npm run typecheck` and `npm run build --workspace web` all pass.

**Capture note:** the browser pane was hidden, which throttles animation frames. The smooth scroll to the newest line read `scrollTop` 0 straight after sending, then reached the bottom (2,193 of 2,232) a few seconds later.

## Left for later tasks

- Selection marker in the scene and the Bag arrival cue: Task 7.
- Phone sheet, dynamic viewport and keyboard handling: Task 8.
