# Product hierarchy — Task 5

Completed 2026-10-31. Scope: frame the existing playable demo from [the Step 1 plan](../workshop-product-hierarchy-plan.md). Tasks 6–7 remain pending.

## Changes

- `web/src/VillagePage.tsx`: adds the specified **Blacksmith demo — built with NPC Workshop** introduction and negotiation/checked-offer/delivery explanation above the experience.
- **Build your own NPC** is an ordinary `#/workshop` link. It opens the existing editor/starter path without loading Brann into a draft or resetting the village. The introduction and authoring link also remain available while village state is loading or unavailable.
- Scoped `.demo-*` CSS keeps the introduction compact. Desktop canvas/chat flex to use the remaining viewport space; phone canvas sizing stays unchanged. Existing village state, selection, hints, movement, chat, forge, inventory and tools retain their handlers.
- Updated plan progress and the local ignored handover. Preserved all existing work, including the untracked `npcs/corwin.json` and `prompts/corwin.md` present before this task. Hashes of all 19 existing NPC/persona/art files are unchanged.

## Verification

- `npm run typecheck`: passed.
- `npm run build --workspace web`: passed. Existing large village-chunk warning remains (1,493.75 kB JS; 342.85 kB gzip).
- `git diff --check`: passed.
- Desktop 1280 × 820: intro about 64 px high; canvas about 284 px high; chat Send control ends at y≈789 and the page fits the viewport.
- Phone 375 × 812: intro about 130 px high; canvas remains 406 px. No horizontal overflow. A 640 × 410 viewport also has no horizontal overflow.
- Initial NPC remains `smith`, **Brann · blacksmith**. Other NPCs remain in the picker; Mira's stock drawer opens. Inspect events and Who knows what drawers open.
- Fresh storage: Enter on **Build your own NPC** opens **Create your first NPC**.
- Existing draft: created a merchant named **Demo Return Draft**, with personality **Brisk and practical.** The new link restores both values after a demo visit.
- Scripted order flow using the real engine: dagger offer → accept 35 gold → Wait until ready → delivery at Day 1, 11:00. Gold is 165 and gear contains one item. Follow the authoring link, then return through Demo: the same server world ID, tick, gold and delivered item remain. No `/api/reset` or file-save request occurs.
- Tab after the Demo navigation link reaches **Build your own NPC**, with a visible focus outline. Enter follows the normal workshop route.
- A scripted village-state 503 still shows the introduction and authoring link. Following the link restores the draft while the village service is unavailable.

Browser checks used an isolated loopback server on port 5186, the real `createApi`/engine/ledger and scripted NPC responses; Vite assets came from port 5180. File saving was disabled. [verification-network.jsonl](verification-network.jsonl) records method/path/status and minimal village-state evidence (world ID, tick, gold, item/event IDs), without cookies or request bodies. Anonymous initial state reads can have separate ephemeral world IDs; the persisted world after creating the draft remains the same across the tested round trips.

No live models, image generation or transcription calls. Item artwork uses the existing placeholder in this check. No new tests were added for the presentation change; the full 373-test suite and ledger proof last passed in Task 4. Exhaustive gameplay, walking/touch, real-model and human newcomer checks remain part of Task 7 and later validation. This task does not implement runtime separation or draft-to-demo publication. No commits, pushes or deployment.

## Screenshots

- [Desktop demo](demo-desktop.jpg)
- [Phone demo](demo-phone.jpg)
- [After delivery and an authoring round trip](demo-delivered-desktop.jpg)
- [Keyboard focus on the authoring link](demo-keyboard-focus.jpg)

Next: Task 6, update the README, demo story, newcomer test and handoff.
