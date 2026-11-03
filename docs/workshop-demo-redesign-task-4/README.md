# Workshop and demo redesign — Task 4: utility drawers and inspector

Recorded 2026-11-03. Plan: [workshop-demo-redesign-plan.md](../workshop-demo-redesign-plan.md). Previous step: [Task 3](../workshop-demo-redesign-task-3/README.md).

## What changed

- **`Drawer` can stay mounted** (`web/src/Drawer.tsx`). New props: `open` (default `true`, so existing uses are unchanged), `id` and `className`. When closed it is `hidden`. On open it takes focus. On close it returns focus to its opener if focus was inside the drawer or had dropped to the body. Escape handling and `data-overlay` are unchanged, so walking keys are ignored while focus is in a drawer (`VillageScene.ts` `typing()`).
- **One drawer slot inside the village** (`.drawer.slot`). It sits over the stage's left side at `min(420px, 100%)` wide and the full stage height. The body scrolls on its own, and the conversation is never covered. Bag, Rumours, Inspect village and **the stock list** all use this slot, and only one is visible at a time (`demoPanels`). The stock button now has `id="stock-button"` and `aria-controls="panel-stock"`.
- **Inspect village tabs** (`web/src/InspectTabs.tsx`): `tablist`, `tab` with `aria-selected` and `aria-controls`, and `tabpanel` with `aria-labelledby`. Focus moves with a roving `tabIndex`; ←/→/Home/End move and select. Both panels stay mounted.
- **Hint links** open the right drawer. After it renders, the item or rumour gets focus, and the target ids are unchanged.
- **Arrival no longer opens the Bag.** That Task 2 transition rule was harmless while the Bag was a panel under the bar, but as a drawer it opened an overlay and took focus. Now the Bag count goes up and the existing "…is ready. **Show it**" hint offers to open it. Task 7 adds the dedicated arrival cue. The `arrived` reducer action and its test were removed.

## Checked in the browser

Run against the offline mock (`offline-api.ts` in the baseline folder). No model calls.

- [x] Enter on **Inspect village** opens the drawer, and focus goes into it. Tab reaches Close, then the selected tab; → selects **Sandbox** and moves focus to it. Pressing D 15 times with a tab focused did not walk. → [demo-1440-inspect-sandbox.jpg](demo-1440-inspect-sandbox.jpg)
- [x] An unsent sandbox note survived switching tabs, Escape, opening Rumours, Bag and stock, and reopening Inspect. The **Deals** filter and the **Sandbox** tab were both still selected.
- [x] Escape returned focus to `inspect-button`. Close on the stock drawer returned it to `stock-button`. Only one drawer was ever visible; opening stock set Bag's `aria-expanded` to false.
- [x] Order → accept → Wait until ready: no drawer opened, the count went from 0 to 1, focus landed on the Bag button, and the hint read "Your Hammerhead Blade is ready." **Show it** opened Bag and focused `item-i_c_001`. → [demo-1440-bag-show-it.jpg](demo-1440-bag-show-it.jpg)
- [x] Stock opens in the same slot, and the conversation stays visible. → [demo-1440-stock.jpg](demo-1440-stock.jpg)
- [x] Long content: with 3,000 px injected into Rumours, the drawer stayed at the stage height (735 px). The body scrolled (3,370 px of content in 685 px) and the page stayed 900 px.
- [x] 1024×768: the page stays at 768 px and nothing scrolls sideways. → [demo-1024-inspect-activity.jpg](demo-1024-inspect-activity.jpg)
- [x] 390×844: the drawer covers the map (390×464), and the bar and conversation stay below it. No horizontal overflow. → [demo-390-inspect.jpg](demo-390-inspect.jpg)
- [x] `npm test` (642), `npm run typecheck` and `npm run build --workspace web` all pass.

## Left for later tasks

- Phone sheet presentation, modal semantics if it blocks the page, and 44 px Close targets: Task 8. At 390 the Close button is currently 51×25.
- The empty band below the bar on desktop and the HUD move: Task 5.
- The dedicated arrival cue on Bag: Task 7.
