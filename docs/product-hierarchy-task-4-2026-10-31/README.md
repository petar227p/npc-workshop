# Product hierarchy — Task 4

Completed 2026-10-31. Scope: self-contained workshop onboarding from [the Step 1 plan](../workshop-product-hierarchy-plan.md). Tasks 5–7 remain pending.

## What changed

- `web/src/Editor.tsx`: introduction now explains create → configure → test. Browser drafts, server validation and isolated testing are named separately; testing explicitly does not publish to the example village.
- The status says **Draft in this browser**; the main action is **Test your NPC**. **Save to files — development only** retains the existing save/overwrite handler. Restart/file instructions live in a collapsed **Development file workflow** disclosure, including an explanation when saving is disabled.
- **Role templates** and **Example NPCs** are separate groups. Named library options are labeled examples, and **Load example** opens an editable draft copy through the existing replacement/reset path.
- **Example village settings** explicitly identifies the bundled map used by location, schedule and perception. The existing controls, identifiers and defaults remain intact.
- Appearance distinguishes **Example village sprite** from **Generated item artwork**. Art direction/reference controls and their stored data format are unchanged.
- The blank persona now begins “You voice an NPC in a game.” Its required JSON output instructions and other defaults remain unchanged. Restored/library personas are not rewritten.
- `GuidedSetup.tsx` and `Questionnaire.tsx` only received copy changes explaining editable browser drafts, isolated testing and separate file saving. Existing steps and apply/cancel behavior remain.
- Small scoped styles support the file disclosure, paragraph spacing and separate library group.

## Rejection labeling fix found during verification

An existing bug lost the browser's set of controlled-event IDs on reload. When a later bench response included the earlier log, a controlled rejection could be labeled as the model's proposal.

The controlled endpoint now stores optional `data.source: 'workshop-controlled'` metadata on its rejection events, in both the immediate response and bench log. The editor reads this marker as well as its existing local ID set. Actual model rejections remain unmarked. This adds provenance to bench events without changing action checks, world effects, model providers, API destinations or the NPC draft format.

Supporting files: `shared/src/events.ts`, `server/src/routes/editor.ts`, and one focused regression in `server/src/routes/__tests__/editor.test.ts`. The regression checks later views, actual model rejections and reset/new-session isolation.

## Checks

| Check | Result |
| --- | --- |
| `npm test` | 373 passed, 34 files |
| `npm run typecheck` | Passed |
| `npm run build --workspace web` | Passed; existing large village-chunk warning |
| `npm run ledger-proof` | 5/5 controlled cases passed |
| `git diff --check` | Passed |

The two focused server files also passed independently (66 tests). Ledger report: local ignored `logs/ledger-proof-2026-10-31T16-35-19-570Z.{md,json}`. The npm proof command ran outside the sandbox to permit tsx's local IPC pipe.

## Browser evidence

An isolated loopback server at port 5184 used the real `createApi`, validation, engine, ledger and save handler, with scripted model replies and temporary copies of `npcs/` and `prompts/`. Vite assets came from the existing port 5180 server. All writes from the save control went to temporary files. Hash comparison confirmed all 17 original NPC/persona/art files were unchanged.

- Fresh storage → existing three-step creation → merchant review → valid draft → normal scripted conversation → controlled rejection, without visiting the demo.
- Controlled and scripted-model rejections have different labels. After reload and another conversation, the earlier controlled rejection retains its controlled label.
- Rename, personality, selected sprite (99), art direction and a 2 × 2 PNG reference survive reload. Saving the draft to temporary files retains its name, persona, sprite, art direction and reference.
- A failed bench reset shows a clear error and retains the current merchant and conversation. While a scripted answer is pending, template replacement controls are disabled. Reset succeeds when the service recovers.
- An empty name produces validation guidance; saving and the bench message input are disabled. A scripted preview failure exposes **Check again**, which recovers without losing the reference image.
- Location (`market`), perception (`4`), schedule, triggers and advanced controls remain reachable in the editor's existing sections.
- Blank NPC validates with the neutral persona and original JSON instructions. Questionnaire review explains the state boundaries; Cancel keeps the current blank draft. Explicitly loading Brann from the example library yields a valid draft copy and an example-library notice.
- The existing saving-disabled local server shows **File saving is not enabled on this server** in the disclosure and no save control.
- Desktop 1280 px and phone 375 px layouts checked: no horizontal overflow in the intro, editor, test session, village-settings section or expanded templates/library. Captures below include both viewport and full-page images.

[authoring-network.jsonl](authoring-network.jsonl) records the initial creation/testing flow; [verification-network.jsonl](verification-network.jsonl) records the restarted isolated server's subsequent checks. Neither trace includes request bodies or cookies. The authoring flow makes no village-state or Phaser request. Expected scripted 503 responses exercise preview/reset recovery. No live model, image-generation or transcription service was called; the reference is a local test fixture.

Limitations: native discard/overwrite dialog **cancellation** was not exercised through browser automation. Existing confirmation handlers are unchanged; server save/overwrite protections pass the existing tests. Live models, microphone, real touch input, village purchase/delivery/gossip and human newcomer validation were not exercised in this task. Task 7 remains outstanding. No commits, pushes or deployment; runtime separation remains later architectural work.

## Captures

| View | Evidence |
| --- | --- |
| Workshop overview | [Desktop](workshop-overview-desktop.jpg) |
| Fresh workshop | [Desktop](workshop-initial-desktop.jpg), [phone](workshop-initial-phone.jpg) |
| Guided review | [Phone](guided-review-phone.jpg) |
| Templates and examples | [Desktop](templates-and-examples-desktop.jpg), [phone](templates-and-examples-phone.jpg) |
| Restored character, art reference and file explanation | [Desktop](restored-character-desktop.jpg), [phone](restored-character-phone.jpg) |
| Example village settings | [Desktop](example-settings-desktop.jpg), [phone](example-settings-phone.jpg) |
| Controlled versus scripted model rejection | [Controlled](controlled-test-desktop.jpg), [model](model-rejection-desktop.jpg), [phone](test-session-phone.jpg) |
| Controlled label after reload | [Desktop](controlled-origin-after-reload.jpg) |
| Questionnaire review | [Desktop](questionnaire-review-desktop.jpg) |

Next: Task 5, frame the existing playable demo.
