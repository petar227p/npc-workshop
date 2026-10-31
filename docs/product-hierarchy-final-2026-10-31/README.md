# Product hierarchy — Tasks 6–7 and final verification

Completed 2026-10-31. All seven tasks in [Step 1](../workshop-product-hierarchy-plan.md) are complete within the presentation/onboarding/documentation scope. **This is not architectural decoupling.** Human sessions, a new live presentation rehearsal and deployment remain separate pending work.

## Documentation aligned (Task 6)

- [README](../../README.md) now leads with creating/configuring/testing NPCs and presents Brann as the example. It documents both routes, supported starters, browser drafts, isolated testing and the development file/server workflow, linked to the existing developer API reference. Obsolete claims that the village/gossip were unbuilt and the old `PROPOSE_CONTRACT` example were corrected.
- [Demo script](../demo-script.md) starts in the workshop, demonstrates Brann, then returns to the same draft. Historical live trade/art/gossip and exploit evidence retains its qualifications. Controlled proposals and scripted replies are not represented as real-model rejections. The revised 3:00 allocation is explicitly unrehearsed and unmeasured.
- [Newcomer protocol](../newcomer-test.md) asks the three product-comprehension questions before instructions, adds the merchant/edit/conversation/demo-round-trip task, and retains the original purchase task and 0–3 ledger-proof scoring. Observation fields remain blank; no human sessions are claimed.
- The local ignored `HANDOVER.md` records final scope, evidence, findings and remaining coupling.

## Required commands (Task 7)

| Command | Final result | Output |
| --- | --- | --- |
| `npm test` | **375 passed, 35 files** | [test-output.txt](test-output.txt) |
| `npm run typecheck` | Passed | [typecheck-output.txt](typecheck-output.txt) |
| `npm run build --workspace web` | Passed | [build-output.txt](build-output.txt) |
| `npm run ledger-proof` | **5/5 cases passed** | [ledger-proof-output.txt](ledger-proof-output.txt) |
| `git diff --check` | Passed | Checked after final edits |

The build retains the existing >500 kB warning for the lazy Village chunk (1,493.75 kB; gzip 342.85 kB). The proof's structured report is local/ignored: `logs/ledger-proof-2026-10-31T17-04-27-354Z.{md,json}`. Its npm command ran outside the sandbox to allow tsx's local IPC pipe. Expected error-path fixtures log unavailable voice/refused image messages during tests; no live provider is called by these tests.

## Findings resolved during the final pass

1. **Pre-existing provider-outage wording bug:** a failed model call with zero returned attempts was reported as “No model call: it doesn't answer when spoken to.” The verdict now handles `unavailable` before the no-response-trigger case. The pure helper moved to `web/src/benchVerdict.ts`, shared by the visible verdict and technical detail. Two focused tests distinguish these cases; the scripted browser outage/recovery check passes.
2. **Pre-existing test assumption exposed by saved Corwin:** the god-mode integration test listed exactly eight NPC IDs, while the configured registry correctly includes the user's additional Corwin. [The failing output](pre-existing-test-failure.txt) is retained. Its strict “everyone knows” assertion now compares against every configured NPC, rather than weakening the assertion or removing Corwin. The full suite then passes.

The earlier controlled-test provenance fix from [Task 4](../product-hierarchy-task-4-2026-10-31/README.md) remains covered: controlled rejections retain their origin in subsequent log views and actual model rejections remain separately labeled.

## Final browser regression

Browser: in-app Chromium, fresh storage at the isolated loopback origin `127.0.0.1:5188`. The fixture uses the real API, validation, engine, ledger, sessions and current NPC definitions with **scripted model replies**, file saving disabled and no artist/transcriber. Static assets come from the existing Vite server on port 5180.

| Requirement | Evidence/result |
| --- | --- |
| Fresh home → workshop → template → edit → valid preview → bench | Merchant template; renamed **Regression Merchant** with personality **Patient with clear prices.** Normal scripted SAY accepted in the isolated session |
| Existing draft restores from home | Home's authoring link restores that name/personality and valid preview |
| Demo round trip preserves draft and world | Authoring link retains the merchant; returning to Demo preserves the same world ID, tick 3, 165 gold and one delivered item |
| Home → demo selects Brann | Picker selects `smith`, **Brann · blacksmith** |
| Checked order/accept/delivery | Scripted dagger offer 35 gold, stats 6/2/40 → one Accept → Wait until ready → Day 1, 11:00 delivery; one gear item |
| Direct routes and refresh | Home, `#/workshop` and `#/village` render and refresh with expected titles |
| Back/Forward and fallback | Workshop/demo history works; scrolling the demo to 769.5 px then Back/Forward resets destination scroll to 0 and focuses `.page`; unknown hash replaces to `#/`, and history skips the unknown URL |
| Keyboard and active state | Tab reaches the primary authoring link; Enter opens Workshop. Tab after Demo reaches **Build your own NPC**, and Enter restores the draft. Active navigation has `aria-current` and an underline |
| Desktop/phone layout | All three screens captured at 1280 px and 375 px; no horizontal overflow. Home also checked at 640 × 410 |
| No village request/render load from authoring | Home trace has no API request. Home/workshop/bench trace has no `/api/state`, `/api/art`, `/src/game/*` or Phaser request |
| Preview unavailable | Scripted preview 503 shows **Check again** and recovers to a valid draft |
| Model/API unavailable | Provider failure now explicitly explains the fallback/retry; a bench HTTP 503 exposes **Send it again**, which succeeds on recovery |
| Controlled versus model response | Controlled rejection is labeled workshop/no model; deliberately invalid scripted model replies are separately labeled model rejections. Neither is presented as a live-model result |

No `/api/reset` or `/api/editor/save` request occurred in the final browser run. Hash checks confirm all 19 existing NPC/persona/art files, including the untracked Corwin files, and the three unrelated modified config/package files were preserved.

Machine-readable observations: [browser-observations.json](browser-observations.json) (19 records). Request traces: [home](home-network.jsonl), [authoring only](authoring-network.jsonl), [full verification](verification-network.jsonl). Traces omit request bodies/cookies; village reads include only world/tick/gold/item/event IDs needed to establish persistence. Scripted 503s in the full trace are expected fault injection.

## Reproduce the scripted environment

With the current dependencies installed, run from the repo root. Reuse an existing Vite on 5180, or start it in one terminal; start the fixture in another:

```sh
npm run dev --workspace web -- --port 5180 --strictPort
node --import tsx docs/product-hierarchy-final-2026-10-31/regression-harness.mjs
```

Open `http://127.0.0.1:5188/` in a fresh test profile. [The fixture source](regression-harness.mjs) never configures live provider clients or enables file saving. It writes its trace and fault-control JSON under `/tmp`. Supported fault controls are `failPath`, `unavailableModel` and `rejectModel`; default `{}` returns normal scripted responses. The temporary fixture was stopped after this verification.

## Final screenshots

Desktop viewport: 1280 × 820. Phone viewport: 375 × 812, captured as full pages so every section is reviewable.

| Screen | Desktop | Phone |
| --- | --- | --- |
| Home | [home-desktop.jpg](home-desktop.jpg) | [home-phone.jpg](home-phone.jpg) |
| Workshop draft | [workshop-desktop.jpg](workshop-desktop.jpg) | [workshop-phone.jpg](workshop-phone.jpg) |
| Blacksmith demo | [demo-desktop.jpg](demo-desktop.jpg) | [demo-phone.jpg](demo-phone.jpg) |

Additional evidence: [visible keyboard focus](home-keyboard-focus.jpg), [controlled/model provenance](bench-provenance.jpg), [corrected provider-outage message](model-unavailable.jpg).

## Remaining scope and limits

- **Runtime coupling remains:** bundled village geography and fixed capability dependencies, a server-loaded NPC registry, shared browser server-session infrastructure/locks for bench and village, and development save/restart semantics. No arbitrary new rules, engine plugins, browser export/deployment or live draft publication were implemented.
- This run verifies scripted behavior. Historical live-model evidence stays in the demo script with its dates and qualifications. No new live-model, image-generation or transcription call was made; item artwork used a placeholder.
- Human newcomer sessions, a timed live rehearsal of the new story, spoken recording/microphone recovery, real touch/screen-reader checks and deployment are pending. Native discard/overwrite dialog cancellation was not exercised through this automation; the existing guards and API protections remain covered by prior checks/tests.
- No commit, push, merge or deployment was performed. The working tree includes preserved pre-existing work.
