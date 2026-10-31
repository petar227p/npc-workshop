# Product hierarchy — Task 2

Completed 2026-10-31. Scope: home hierarchy only, from [the Step 1 plan](../workshop-product-hierarchy-plan.md). Tasks 3–7 remain pending.

## Changes

- `web/src/Entrance.tsx`: NPC Workshop product identity, the specified headline/supporting copy, a dominant **Build an NPC** link and secondary **Try the blacksmith demo** link. Both retain their existing hash destinations.
- Added the three-part create → configure → test explanation. Brann is a subordinate playable example, with bargaining, checked offers, timed delivery and the example-village context explained.
- Replaced the Brann-specific workshop preview with a generic merchant configuration and example proposal/check. The entire preview is labeled **Illustrative configuration and test · no live results**. No preview controls, parsing, server requests or model calls were introduced.
- `web/src/style.css`: replaced the old entrance-card styles with scoped entrance styles using the existing palette, fonts and sprite sheet. Brann's pixel art appears only in the demo example. At 375 px the main containers run from x=16 to x=359, fixing the uneven card margins recorded in Task 1.
- Updated plan progress and the local ignored `HANDOVER.md`. Existing unrelated modifications and untracked work were preserved. No commits, pushes or deployment.

## Verification

- `npm run typecheck`: passed.
- `npm run build --workspace web`: passed. Existing large-chunk warning remains: Village JS 1,493.75 kB, gzip 342.85 kB.
- Browser at 1280 × 820, 375 × 812 and 640 × 410: readable layouts, no horizontal viewport overflow. Desktop uses a side-by-side introduction/preview; smaller widths stack them. Authoring and demo links are visible before the illustrative preview on phones.
- Keyboard: first Tab reaches **Build an NPC**, next Tab reaches **Try the blacksmith demo**. Focus outline is visible; Enter on the primary link opens the workshop.
- Fresh browser origin: primary link opens the existing **Create your first NPC** starter screen.
- Returning browser origin: primary link restores the existing **Baseline Merchant** draft; home → demo → home → workshop retains its name.
- Both the secondary hero link and the example-card link open `#/village`; the NPC picker selects `smith`, **Brann · blacksmith**. No world reset or gameplay action was requested.
- [home-network.jsonl](home-network.jsonl): home-only request trace, captured before following either destination. No `/api/*`, `/src/game/*` or Phaser request. `Entrance.tsx` has no API/storage dependencies; the existing lazy renderer and production chunk split remain intact.
- `git diff --check`: passed.

Browser checks used the existing local server on port 5180, configured to use the offline API on 8790. A temporary loopback proxy recorded method/path/status without bodies or cookies. No live model, image or transcription calls were made. The generic rejection shown on home is static illustrative copy, not a test result.

No new tests were added for this presentation-only change. The full suite/ledger baseline passed in Task 1; Task 7's complete regression run, gameplay rehearsal and human validation remain outstanding. Global navigation, workshop onboarding and village framing are intentionally left for their listed tasks.

## Screenshots

- [Desktop home, 1280 × 820](home-desktop.jpg)
- [Phone home, full page at 375 px](home-phone.jpg)
- [Desktop keyboard focus on the primary action](home-keyboard-focus.jpg)

Next: Task 3, global navigation and page identity.
