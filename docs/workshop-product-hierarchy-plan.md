# Step 1: Make NPC Workshop the product

Status: Tasks 1–7 complete, 2026-10-31, within this presentation/onboarding/documentation milestone. [Final verification and Task 6–7 handoff](product-hierarchy-final-2026-10-31/README.md). Human validation, live presentation rehearsal and deployment remain pending; runtime separation is not implemented. Earlier evidence: [Task 1](product-hierarchy-baseline-2026-10-31/README.md), [Task 2](product-hierarchy-task-2-2026-10-31/README.md), [Task 3](product-hierarchy-task-3-2026-10-31/README.md), [Task 4](product-hierarchy-task-4-2026-10-31/README.md), [Task 5](product-hierarchy-task-5-2026-10-31/README.md).

## Outcome

A first-time visitor understands that NPC Workshop creates and tests NPCs, and that Brann and the village are a playable demonstration of its capabilities. The primary journey is create → configure → test. Integration is explained accurately using the existing developer API documentation.

This milestone establishes product hierarchy through navigation, presentation, onboarding and documentation. It does not complete runtime separation. Existing village geography, server sessions and fixed capability dependencies remain architectural work for later milestones.

## Scope decisions

- Keep the existing home, workshop and village hash routes. Change their hierarchy and labels; avoid a new demo launcher or route migration.
- Home is a concise product introduction with a dominant workshop action and a smaller demo action.
- The existing village remains the playable demo, with Brann as the starting focus. Do not advertise a separate blacksmith-only scene.
- Reuse the existing starter cards, questionnaire, editor and bench. Do not introduce another onboarding wizard.
- Preserve local drafts and existing replacement/reset safeguards.
- Keep the existing design system. Use a calm tool-oriented shell for the workshop and retain pixel art in the example preview and playable demo.
- Preserve current API behavior and model providers. No new export, deployment, live publication, custom-rule generation or automatic demo updates.
- Keep all existing controls reachable, including village-dependent fields; explain their current context rather than disguising them as universal game settings.

## Task 1 — Record baseline and agree terminology in code

Read HANDOVER.md current state, relevant PLAN.md sections, docs/workshop-guided-setup-plan.md and local instructions. Inspect git status before editing; preserve unrelated modifications and untracked work.

Capture the home, initial workshop, restored draft and village at desktop and phone widths. Record current route behavior, draft persistence and village lazy loading.

Use these terms consistently:

| Concept | Visible wording |
| --- | --- |
| Product | NPC Workshop |
| Main activity | Build an NPC / Open workshop |
| Playable example | Blacksmith demo |
| Demo context | Brann's workshop in the example village |
| Authoring state | Draft in this browser |
| Bench | Isolated test session |
| Disk persistence | Save to files — development only |

Acceptance: a short baseline checklist identifies current behavior and any pre-existing failures. Do not make incidental cleanups.

## Task 2 — Rebuild the home hierarchy

Primary files: web/src/Entrance.tsx and scoped styles in web/src/style.css.

Replace the equal-sized village/workshop choice with:

1. NPC Workshop product name.
2. Headline: “Build NPCs that act within your game's rules.”
3. Supporting copy: “Define a character, choose its supported abilities, and test how it responds. The model proposes actions; code checks what can happen.”
4. Dominant action: “Build an NPC” → #/workshop.
5. Secondary action: “Try the blacksmith demo” → #/village.
6. A compact three-part explanation: Create a character → Configure abilities and limits → Test conversations and actions.
7. A subordinate example card: “Brann the blacksmith — a playable NPC Workshop demo.” Explain bargaining, checked offers and timed delivery, and say that it opens inside the example village.

For an existing valid stored draft, a neutral “Open workshop” label is sufficient; do not duplicate the editor's draft parsing just to personalize a CTA.

Replace the workshop's Brann-specific visual preview with an illustrative configuration/bench preview using generic character details. Label any static example results as illustrative. Use existing components or simple markup; no generated art is required.

Acceptance: at a glance the tool is the main offering, the demo is an example, and both destinations are reachable in one click. Home makes no model calls or village-state requests and loads no Phaser chunk.

## Task 3 — Align global navigation and page identity

Primary file: web/src/main.tsx.

- Put “Workshop” first in navigation and “Demo” second.
- Keep the brand link pointing home.
- Preserve #/workshop and #/village, unknown-hash fallback, Back/Forward behavior, focus management and scroll reset.
- Set titles to “NPC Workshop”, “Workshop · NPC Workshop”, and “Blacksmith demo · NPC Workshop”.
- Make active navigation state accessible and visible without relying on color alone.

Acceptance: existing deep links still work on direct load and refresh, and page announcements match the new hierarchy.

## Task 4 — Make workshop onboarding self-contained

Primary files: web/src/Editor.tsx; GuidedSetup.tsx and Questionnaire.tsx only where their copy needs alignment.

- Rewrite the workshop introduction around creating, configuring and testing NPCs.
- Preserve first-visit starters and returning-draft restoration. A new visitor must not silently start editing Brann.
- Keep templates generic; label named library NPCs as examples, separate from role templates.
- Explain browser draft, validation, bench testing and file saving distinctly. Testing does not publish to the village.
- Move the restart/file workflow explanation beside the development save control or an appropriate disclosure, rather than making it the main product introduction.
- Keep truthful context labels for location, schedule, perception and village sprite controls. For example: “Example village settings”; explain that these currently use the bundled village map.
- Separate item-generation appearance wording from the village sprite wording without changing the stored draft format.
- Review the blank persona's medieval-village assumption; neutralize prose where safe, preserving required output instructions and existing data defaults.
- Keep model-produced rejections and controlled workshop tests distinctly labeled.

Acceptance: a visitor can create a supported NPC and use the bench without playing the demo. Existing draft data, art references, validation, reset protections and save/overwrite semantics survive.

## Task 5 — Frame the existing playable demo

Primary files: web/src/VillagePage.tsx and scoped styles; Side.tsx only if navigation copy needs adjustment.

Add a compact intro above the existing experience:

“Blacksmith demo — built with NPC Workshop”

“Meet Brann in the example village. Negotiate an order, accept a checked offer, and collect the finished item.”

Add a visible “Build your own NPC” link to #/workshop. This opens the normal workshop, restoring the user's draft or starter screen; it must not replace the draft with Brann.

Retain the initial smith selection, existing hints, movement, other NPCs, forge, inventory, knowledge inspection and ledger. Keep the intro compact so it does not crowd the playable area on phones.

Do not add “Edit this NPC”, “Publish”, or “Play my changes” in this milestone: those imply configuration handoff or runtime behavior that this step does not implement.

Acceptance: users understand which product powers the demo and can return to authoring without losing their draft or resetting the village.

## Task 6 — Update the story and handoff

Files: README.md, docs/demo-script.md, docs/newcomer-test.md and HANDOVER.md.

- README leads with authoring and testing, then uses Brann to demonstrate the result. Document both destinations accurately.
- Demo script introduces the workshop first, demonstrates Brann as evidence, and returns to the workshop. Preserve existing evidence qualifications and clearly label unrehearsed changes.
- Integration explanation links to the existing developer API instructions; it must explain current file/server setup and must not imply a browser draft can already be deployed to any game.
- Add newcomer questions before giving instructions: “What is this product for?”, “Where would you create your own NPC?”, “What does the blacksmith demonstrate?”
- Add an authoring task: create a merchant, change one setting and test a conversation; then visit the demo and return to the draft.
- Keep the existing purchase and ledger-comprehension test as demo validation.
- Update HANDOVER with implementation scope, changed files, checks and outstanding architectural coupling.

Acceptance: website, README and presentation describe the same product hierarchy. Human testing remains pending until actually performed.

## Task 7 — Verify and capture evidence

Run npm test, npm run typecheck, npm run build --workspace web and npm run ledger-proof. Separate pre-existing failures from introduced regressions. Add focused tests only for genuinely new logic; no cosmetic snapshot suite.

Browser checks:

- Fresh storage: home → workshop → template → edit → valid preview → bench.
- Existing draft: home → workshop restores it; demo round trip preserves it.
- Home → demo: Brann selected; ordering, accepting and delivery still work.
- Direct loads, refresh and Back/Forward for each route.
- Keyboard navigation, visible focus, readable page titles, 375 px mobile and desktop layout; no horizontal overflow.
- Home/workshop load no Phaser and issue no village-state request solely because they were opened.
- Clearly labeled errors if preview/model services are unavailable.
- Controlled test remains visibly different from a model response.

Use deterministic/stubbed responses for routine regression checks. If performing a real-model smoke test, record that separately; a live rejection is not required for this presentation change. Capture final screenshots of all three screens at desktop and mobile widths.

## Delivery sequence and completion

Implement tasks 1–3, then 4–5, then 6–7. Each group should leave the app usable. Do not commit, push or deploy unless requested.

Complete when the primary action is authoring, the playable game is explicitly an example, the workshop makes sense without a demo visit, routes and drafts remain intact, and the verification record is available. This milestone must not be reported as architectural decoupling.

## Suggested implementation instruction

Read docs/workshop-product-hierarchy-plan.md and the current HANDOVER.md. Implement Step 1's product hierarchy plan in its listed order. Preserve existing work and the working editor/demo behavior. Reuse the current styling and onboarding. Keep architectural extraction, new export/deployment flows and live draft-to-demo integration out of scope. Verify behavior in a browser, run the listed checks, and update the handover with evidence and limitations. Do not commit, push or deploy.
