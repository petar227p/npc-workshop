# Workshop and demo redesign — Task 8: phones and intermediate widths

Recorded 2026-11-03. Plan: [workshop-demo-redesign-plan.md](../workshop-demo-redesign-plan.md). Previous step: [Task 7](../workshop-demo-redesign-task-7/README.md). **This completes the demo milestone (tasks 1–8).**

## What changed

- **Bottom sheet on narrow widths (≤ 860 px, the same breakpoint as the stacked layout).** `.drawer.slot` becomes a fixed sheet from the bottom with rounded top corners, at most 85 % of the dynamic viewport height. Its body scrolls and its Close button stays in view. It also pads for the bottom safe area.
- **It is modal for real.** `Drawer` gained a `modal` prop; `VillagePage` sets it from `useNarrow()`, a `matchMedia` hook on the same breakpoint.
  - Everything outside the sheet (the siblings of the sheet and of each of its ancestors) gets `inert`, so it is out of reach of Tab, taps and screen readers.
  - The page behind doesn't scroll (`overflow: hidden` on `<html>`).
  - A dimmed backdrop closes the sheet when tapped, and Escape still closes it.
  - The sheet has `aria-modal="true"`.
  - The `inert` effect is declared before the focus effect, so its cleanup runs first: the page is live again before focus returns to the opener.
- **Desktop and 1024 px are unchanged.** There, the drawer is still the non-modal slot over the left of the village, with no backdrop and nothing inert.
- **Dynamic viewport units, with `vh` fallbacks.** On phones the scene is `45dvh` (minimum 200 px) and the conversation panel is `80dvh` (minimum 320 px), so a scrolled-to conversation shows its head, transcript and composer in one screen.
  - The viewport meta now includes `interactive-widget=resizes-content`. With it, Chrome on Android shrinks the layout for the on-screen keyboard, so `dvh` sizes leave room above the keyboard. iOS ignores this setting and scrolls the focused field into view itself.
- **Touch targets of at least 44 px on narrow widths.** This covers:
  - the demo header links and the toolbar buttons and menu items;
  - the drawer Close button and the Inspect tabs;
  - the NPC picker, the stock button, the composer input, mic and Send;
  - Wait until ready and the forge rows, the Accept buttons, the hint buttons, the log filters;
  - every button, select and input inside a sheet.

  The small round `?` help buttons keep their look and get an invisible hit area 13 px wider on every side (`::after`), which makes 44 to 50 px.

## Checked in the browser

Run against the offline mock. No model calls. The phone and tablet sizes used touch emulation.

- [x] **390×844 (portrait phone):** no horizontal overflow. Every visible control is at least 44 px; the only exception is the `?`, which is 24×32 visually with a 50 px hit area. → [demo-390-default.jpg](demo-390-default.jpg)
- [x] **The Inspect sheet at 390:**
  - `aria-modal="true"`, the backdrop shows, focus moves into the sheet, and `<html>` gets `overflow: hidden`.
  - The utility bar, the composer and the header are all inert; the sheet is not.
  - No focusable element outside the sheet is reachable. 25 real Tab presses stayed inside it.
  - Close is 51×44.
  - → [demo-390-sheet-sandbox.jpg](demo-390-sheet-sandbox.jpg)
- [x] **Persistence and closing:**
  - An unsent sandbox note and the Sandbox tab survived Escape and reopening.
  - Escape and a backdrop tap both returned focus to `inspect-button`, left no `inert` attributes and restored scrolling.
- [x] **Long content:** with 2,000 px injected, the sheet capped at 717 px (85 % of 844). The body scrolled (2,327 in 647) and Close stayed visible at y = 140.
- [x] **844×390 (landscape phone):**
  - No overflow, and the Bag sheet is modal with Close visible.
  - The scene is 200 px (its minimum).
  - The conversation panel is 320 px with the composer inside, so it fits the 390 px viewport when scrolled to.
- [x] **768×1024 (tablet):** stacked layout, Rumours opens as a modal sheet, no overflow, and closing clears `inert`. → [demo-768-sheet-rumours.jpg](demo-768-sheet-rumours.jpg)
- [x] **1024×768:** the Bag is the non-modal left slot (420 px wide, no `aria-modal`, no backdrop, nothing inert). The chat stays usable and the page is 768 px.
- [x] **1440×900:** page 900 px, composer at y = 850, toolbar buttons still 32 px, so the touch sizing applies only at narrow widths.
- [x] `npm test` (642), `npm run typecheck` and `npm run build --workspace web` all pass.

## Not verified

- **A real on-screen keyboard.** The browser emulation has none. The keyboard behaviour above relies on `dvh`, `interactive-widget=resizes-content` and the browser's own scroll-into-view. It should be checked on a real Android phone and iPhone in Task 12.
- **VoiceOver or TalkBack** reading of the sheet, beyond the `aria-modal` and `inert` attributes checked above.

## Next

Task 9 starts the workshop: simplifying the navigation.
