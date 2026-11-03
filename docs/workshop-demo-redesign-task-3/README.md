# Workshop and demo redesign — Task 3: compact village utility bar

Recorded 2026-11-03. Plan: [workshop-demo-redesign-plan.md](../workshop-demo-redesign-plan.md). Baseline: [../workshop-demo-redesign-baseline-2026-11-03/](../workshop-demo-redesign-baseline-2026-11-03/README.md).

## What changed

- The three expandable tool columns under the map are gone. A utility bar sits on the village's bottom edge instead, with **Bag** (item count), **Rumours** (the existing **new** cue) and **Inspect village**. Each button has `aria-expanded` and `aria-controls`, is 44 px tall and shows the accent focus outline.
- Until the Task 4 drawers arrive, the open panel shows in one region directly under the bar. Every panel body stays mounted while hidden. Inspect village has a temporary **Activity / Sandbox** switch (`aria-pressed`), which Task 4 replaces with real tabs.
- **Bag moved out of the conversation column.** The "Your gear" disclosure under the forge is gone (the plan scheduled this for Task 6), and the Bag panel shows `InventoryContent`. The unused `Inventory` wrapper was removed. After the forge's last job, `keepFocus` now lands on `#bag-button` instead of `#gear`.
- On phones the bar sits right under the village, above the conversation, and its buttons share the width equally.

## Checked in the browser

Run against the offline mock (`offline-api.ts` in the baseline folder). No model calls.

- [x] 1440×900 default: no tool columns. The page height is 900, so it no longer overflows (it was 935). → [demo-1440-default.jpg](demo-1440-default.jpg)
- [x] Keyboard: Tab moves from Bag to Rumours to Inspect village, Enter opens the panel, and `aria-expanded` and the outline are visible. → [demo-1440-inspect-keyboard.jpg](demo-1440-inspect-keyboard.jpg)
- [x] The Deals filter, the Sandbox section and an unsent note survived switching to Rumours and back.
- [x] Order → accept → Wait until ready: the count goes from 0 to "1 thing". The Bag opens because nothing else was open, and focus lands on the Bag button. **Show it** focuses `item-i_c_001`. → [demo-1440-bag-open.jpg](demo-1440-bag-open.jpg)
- [x] 1024×768: the page fits in 768 (it was 897). → [demo-1024.jpg](demo-1024.jpg)
- [x] 390×844: no horizontal overflow, buttons are about 130×44, and the bar sits under the village. → [demo-390.jpg](demo-390.jpg)
- [x] `npm test` (643), `npm run typecheck` and `npm run build --workspace web` all pass.

## Known and left for later tasks

- With no panel open, there is empty space below the bar on desktop (about 64 px at 1440, about 65 px at 1024). The game height still uses the old fixed `150px` allowance. Task 5 sizes the stage to fill the space.
- An open panel grows the page below the bar until the Task 4 drawers arrive.
- Movement-key protection inside panels belongs to Task 4. The bar buttons are ordinary buttons, as the tool buttons were before.
