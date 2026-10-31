# NPC Workshop: clearer entrance and guided village

## Brief for Claude

Implement a focused UX redesign of the existing React/Phaser app. The core engine already works. The objective is to help a newcomer experience it without being confronted by every control, explanation and debugging panel at once.

The site has two equal, clear destinations: **Explore the village** and **Build an NPC**. The village is a freely explorable demonstration with contextual guidance. The workshop is the authoring tool. Do not turn the village into a mandatory tutorial or a fixed dialogue script.

This document is the implementation plan, not permission to deploy. Work through the tasks in order, inspecting repository instructions first. Preserve unrelated changes. Complete and verify each task before moving on; keep a short record of changes and checks. Use existing components and dependencies where practical.

## Product decisions

- Root `#/` becomes the entrance. Use `#/village` for the village and preserve `#/workshop` for the existing editor. Direct links must work.
- Entrance copy: **NPC Workshop**; a short introduction such as “Meet characters who can think for themselves, inside rules you define.”
- Village choice: “Explore the village” / “Meet the villagers, negotiate a deal, and watch word spread.” / “Enter village”.
- Workshop choice: “Build an NPC” / “Shape a character’s personality, actions, and rules—then test it.” / “Open workshop”.
- Each choice gets a restrained visual preview. Reuse local art or UI elements; no new image-generation or external asset dependency is needed.
- In the village, show the world and current conversation first. Keep time, gold and compact access to inventory, help and inspection available.
- Use one contextual hint at a time. Tooltips explain discovered controls; they do not carry essential instructions.
- Advanced tools remain reachable through a deliberate “Sandbox tools” entry. The ledger remains reachable through “Inspect events”.
- Guidance responds to real state and events. Never invent a delivery, gossip event, witness, relationship or successful action for presentation.

## Current implementation map

- `web/src/main.tsx`: hash routing, shared header, village state/actions and the current permanent sidebar.
- `web/src/Chat.tsx`: conversations, microphone, offer cards and shared components also used by the workshop.
- `web/src/Side.tsx`: Forge, Inventory, News, Stock and Ledger.
- `web/src/God.tsx`: world-event reporting controls.
- `web/src/game/Village.tsx`: React/Phaser bridge.
- `web/src/game/VillageScene.ts`: movement, proximity and talk interaction.
- `web/src/Editor.tsx`: existing workshop.
- `web/src/style.css`: current styling.
- Shared view/event types and server projections: inspect before deriving hints or knowledge chains.

Suggested new components/modules below are implementation suggestions, not required filenames.

## Task 1 — Entrance and navigation

Create a simple, responsive entrance with the two choices above. Update routing and navigation. Retain lazy loading of the Phaser village; entering the workshop or entrance must not initialize a village world or issue village model calls. Provide a visible way home and a way to switch destinations.

Acceptance:
- Fresh root load shows only the introduction and two choices, not the game sidebar.
- Both choices work with mouse and keyboard; cards have clear focus states.
- Direct village/workshop links, refresh and browser back/forward work.
- Workshop behavior remains intact. Unknown hashes resolve predictably to the entrance.

## Task 2 — Village shell and progressive disclosure

Refactor the village into a world/conversation area plus compact contextual controls. Separate the clock/gold controls from the Forge panel so hiding an empty forge does not hide time progression. Make inventory, event inspection, knowledge details and sandbox tools available through labelled buttons and panels/drawers. Reuse the existing content.

Default visibility:
- Clock and gold: always visible; advancing time is explicit, with a short explanation that village time advances by user action.
- Forge: visible while work is underway; use “Wait until ready” for the existing skip action.
- Inventory: compact access always available; expand the result when an item arrives without stealing input focus.
- Knowledge: compact access; show a discovery cue after actual knowledge propagation.
- Stock: associated with the current seller, available on demand.
- Ledger and God mode: closed initially, available under inspection/sandbox tools.
- New game: reachable through the village menu with clear reset semantics.

Acceptance:
- First entry does not show empty stock, knowledge, ledger and God mode panels simultaneously.
- All existing capabilities remain reachable, including gifts, reports and rejected-proposal details.
- Open offers, multiple jobs, goods bought from stock and existing sessions render sensibly.
- Preserve pending-action locks, errors, microphone behavior, art polling and editor use of shared chat components.
- Closing a drawer returns focus to its trigger; Escape closes it; Phaser movement is suspended while typing or interacting with overlays.

## Task 3 — Accessible tooltip/help component

Add a reusable short-explanation pattern for unfamiliar controls. Hover and keyboard focus can reveal a tooltip; touch users have an explicit help trigger/popover. Do not rely on native `title` alone. Interactive content belongs in a popover or drawer, not a tooltip.

Initial copy:
- Time: “Village time advances when you choose. Use +1 hour to see what happens next.”
- Wait until ready: “Advance village time until the next order is ready.”
- Reserved materials: “These materials are set aside for accepted orders.”
- Inspect events: “See the recorded actions and the rules that accepted or rejected them.”
- Heard from someone: explain the actual source using the data available.
- Confidence: “A simulation value that decreases with each retelling. It is not a measured probability that the story is true.”

Acceptance:
- Tooltips are accessible by focus and associated with their trigger; Escape dismisses them.
- Tap help works without trapping the primary action or requiring hover.
- Explanations stay within the viewport at narrow widths and browser zoom.
- A newcomer can complete a purchase without opening any tooltip.

## Task 4 — Contextual village hints

Create a small guidance controller using actual view state, interaction state and stable event IDs. Prefer a pure hint selector with explicit priorities over scattered component conditions. Hints are optional, dismissible and never block play.

Candidate hints, in priority order as appropriate:
1. Before interacting: “Click a villager to talk. You can also walk with WASD and press E nearby.” Only show the click instruction after Task 5 implements it.
2. Talking to Brann before sending a message: “Ask for something you’d like him to make.” Add two optional example requests that fill the input for review; do not auto-send.
3. An open offer: “Negotiate further, or accept these terms.”
4. Work underway: “Brann has started work. You choose when village time advances.”
5. A new delivery: “Your [actual item name] is ready.” Link to that item.
6. Someone newly learns secondhand: “[Actual villager] heard about [actual event].” Link to the relevant knowledge detail.

Do not assume everyone visits Brann first or buys a dagger. Do not assume that delivered art is ready. Avoid repeatedly nudging users back to Brann while they explore elsewhere. Use an existing event identity to deduplicate notifications; state refreshes and art updates must not replay them. Initial hydration of an existing session must not announce its historical events as new.

Persist the global hints preference locally with a versioned key. Keep per-world dismissed/completed guidance scoped to the current world; establish how reset is identified before implementation. “New game” resets session guidance but preserves the global hints preference. A Help control lets users re-enable hints and review basic controls.

Acceptance:
- At most one contextual hint is visible.
- Dismissing a hint allows later relevant hints to appear without immediately recreating the dismissed one.
- Free exploration works with hints off.
- Failed requests do not advance guidance. Async image completion does not repeat delivery hints.
- Existing sessions, reset and returning from the workshop behave predictably.

## Task 5 — Discoverable NPC interaction

Add pointer interaction to villagers using the existing talk callback and pending-action protections. On hover show the NPC’s name and known role; on click open/select that NPC’s conversation. Keep proximity/E interaction available. Do not silently change backend proximity rules; inspect existing semantics and keep pointer interaction consistent with the current NPC picker.

Provide an accessible DOM alternative for selecting an NPC; canvas hover alone is insufficient. Resolve focus intentionally so conversation input works after selection and village movement does not consume typing. Avoid pointer handlers that blur the input immediately after opening it.

Acceptance:
- Click and E select the same NPC conversation.
- Hover does not select an NPC or send a message.
- Switching NPCs during pending replies preserves the current safeguards.
- Touch and keyboard users can discover and select villagers without hover.

## Task 6 — Understandable knowledge inspection

Show “Witnessed” and “Heard from [name]” as the primary knowledge labels. Keep event IDs and numeric confidence in expanded details. Explain the existing knowledge system using the player’s actual events.

Inspect the current projection and event log before drawing a source chain. If the view supplies only the immediate source, show only that source. A complete chain may be rendered only when it can be reconstructed unambiguously from recorded tellings and witnesses. Do not infer a unique path from confidence alone. Support multiple tellings and missing/pruned history with explicit partial-history wording. A small read-only server projection may be added if needed, but keep engine behavior unchanged.

Acceptance:
- Witnessed and secondhand knowledge are clearly distinguishable without percentages.
- Selecting a discovery cue opens the correct event/person.
- No fabricated chain is shown; incomplete history is described honestly.
- Confidence is never presented as a calibrated truth probability.
- Existing detailed news/event evidence remains accessible.

## Task 7 — Visual pass and end-to-end verification

Make typography, spacing, panel density and navigation consistent across the entrance, village and workshop. Keep important actions readable without relying on pixel fonts at tiny sizes. Avoid covering the village or chat with persistent explanatory blocks. Respect reduced-motion preferences for any new animation.

Run `npm run typecheck`, relevant existing tests, and `npm run build -w web`. Add focused tests for the hint selector’s meaningful branches: historical hydration, rejected actions, dismissal, event deduplication and world reset. Add knowledge-chain tests only if chain reconstruction is implemented. Do not add tests that merely mirror layout markup.

Manually verify at desktop, narrow mobile width and 200% zoom:
- Root → village; root → workshop; direct routes; refresh; back/forward.
- First visit, hints off, help restoration and a returning session.
- Keyboard-only selection, tooltip access, drawers, Escape and restored focus.
- A real offer → acceptance → waiting → delivery → secondhand knowledge flow.
- Alternate NPC, in-stock purchase, insufficient gold, model error, pending request and delayed/failed item art.
- Advanced controls and workshop test bench still work.

Use mock/replay fixtures for most checks. Keep any live model verification bounded and identify it in the handoff. Do not claim live behavior was verified if only fixtures were used. Provide screenshots of the entrance, initial village, offer/work state and knowledge detail, plus a concise list of completed checks and limitations.

## Scope boundaries

No new gameplay systems, automatic time progression, scripted fake NPC responses, replacement engine, authentication, analytics, deployment or workshop redesign in this pass. Necessary accessibility, routing and shared-component fixes are within scope. Discuss genuine scope changes before expanding the work.

## Completion target

A newcomer can choose an experience, discover how to talk, complete a transaction and understand one consequence without opening developer tools or reading a technical explanation. A curious developer can still inspect the evidence and reach the workshop easily.
