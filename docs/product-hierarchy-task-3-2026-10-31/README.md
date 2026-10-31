# Product hierarchy — Task 3

Completed 2026-10-31. Scope: global navigation and page identity from [the Step 1 plan](../workshop-product-hierarchy-plan.md). Tasks 4–7 remain pending.

## Changes

- `web/src/main.tsx`: navigation now reads **Workshop**, then **Demo**. The demo still uses `#/village`; the brand still links to `#/`.
- Page titles are **NPC Workshop**, **Workshop · NPC Workshop**, and **Blacksmith demo · NPC Workshop**.
- `web/src/style.css`: the active navigation link is underlined as well as bordered, so selection is visible without relying on color. Existing `aria-current="page"` and keyboard focus outlines remain.
- Route parsing, hash destinations, unknown-hash replacement, history handling, focus management and scroll reset were preserved. Existing unrelated working-tree changes were retained.

## Verification

- `npm run typecheck`: passed.
- `npm run build --workspace web`: passed; existing large-chunk warning remains (Village JS 1,493.75 kB, gzip 342.85 kB).
- Browser: direct workshop load and refresh, demo deep-link refresh, and home refresh show the expected pages and titles.
- Back/Forward between workshop and demo updates the title and active link. Scrolling the phone demo to 434.5 px, then going Back/Forward, resets each destination to scroll position 0 and focuses `.page`.
- Brand returns home. Unknown hash becomes `#/`; Back skips the unknown hash and Forward returns to the normalized home URL.
- On workshop/demo, link order is Workshop → Demo, with exactly one `aria-current="page"`. Home retains its existing header-free introduction.
- Keyboard: Tab after the brand reaches Workshop, next Tab reaches Demo, and Enter opens the demo. Visible focus is captured separately from the active-page underline.
- Desktop 1280 × 820 and phone 375 × 812: header and links fit, with no horizontal overflow. Active underlines are visible in screenshots.
- `git diff --check`: passed.

[route-checks.json](route-checks.json) records 14 browser observations including URL, title, navigation order/current state, focus, scroll position and viewport width.

Checked against the existing local Vite server on port 5180 and offline API configured on 8790. No model, image or transcription calls, gameplay actions, file saves, commits, pushes or deployment. No new tests were added for this label/style change. Full regression/gameplay and human validation remain part of Task 7 and subsequent user testing.

## Screenshots

| View | Desktop | Phone |
| --- | --- | --- |
| Workshop | [workshop-desktop.jpg](workshop-desktop.jpg) | [workshop-phone.jpg](workshop-phone.jpg) |
| Demo | [demo-desktop.jpg](demo-desktop.jpg) | [demo-phone.jpg](demo-phone.jpg) |

[Keyboard focus on Demo while Workshop is active](demo-link-keyboard-focus.jpg).

Next: Task 4, workshop onboarding and context copy.
