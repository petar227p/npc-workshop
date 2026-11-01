# Use your NPC in your game — implementation plan

Created: 2026-10-31

Status: Complete. Tasks 1–7 are implemented and verified locally with scripted model responses. Live-provider, deployment and human newcomer validation are reported separately.

## Outcome

A newcomer creates and tests an NPC, downloads a portable copy, and gets that same character responding through the game API without writing repository files or restarting the server.

Journey: Create → Test → Use in your game → Verify connection.

First integration target: a runnable JavaScript client acting as the game's backend. This establishes the API path before engine-specific adapters.

## Progress tracker

Update this table after each implementation task. Mark a task complete only when its acceptance criteria pass; link the evidence in the last column. Keep blockers and the next action current.

| Task | Deliverable | Depends on | Status | Evidence / blocker |
| --- | --- | --- | --- | --- |
| 1 | Portable bundle contract and runtime baseline | — | Complete | [Contract, validation rules, runtime audit and baseline](workshop-game-integration-contract.md); [shared contract tests](../shared/src/integration.test.ts) |
| 2 | Export and import in Workshop | 1 | Complete | [Implementation, checks, round-trip file and browser evidence](workshop-game-integration-task-2/README.md); [transfer tests](../web/src/__tests__/npcTransfer.test.ts) |
| 3 | Create API worlds directly from drafts | 1 | Complete | [Implementation, limits and verification evidence](workshop-game-integration-task-3/README.md); [28 API integration tests](../server/src/routes/__tests__/v1-drafts.test.ts) |
| 4 | Runnable game integration example | 2, 3 | Complete | [Runnable example and guide](../examples/game-backend/README.md); [implementation, HTTP transcript and checks](workshop-game-integration-task-4/README.md) |
| 5 | “Use in your game” connection screen | 2, 3, 4 | Complete | [Implementation, browser evidence and checks](workshop-game-integration-task-5/README.md); [24 handoff tests](../web/src/__tests__/gameHandoff.test.ts) |
| 6 | Connection verification and recovery | 4, 5 | Complete | [Authenticated evidence, safe token handoff, states and recovery](workshop-game-integration-task-6/README.md); [14 API tests](../server/src/routes/__tests__/v1-connection.test.ts) |
| 7 | End-to-end verification and documentation | 1–6 | Complete | [Reproducible fresh/imported journeys, browser/restart evidence and final checks](workshop-game-integration-task-7/README.md) |

Allowed statuses: Not started / In progress / Blocked / Complete.

Completed: 7 of 7 tasks.

Next action: Optional live-provider run, deployment verification and a human newcomer walkthrough. None was performed or inferred from the scripted local checks. No implementation blocker remains.

## Scope decisions

- Reuse the existing NPC draft schema, `buildNpc()`, engine, world store and `/api/v1` action endpoints.
- Export a versioned JSON bundle containing the complete draft and persona. No credentials, conversation history or live inventory state.
- Re-import restores a character configuration. It does not resume a conversation or restore a world after server restart.
- Each new API world owns a fixed configuration snapshot. Later workshop edits only affect subsequently created worlds.
- Keep existing world creation from registry IDs working unchanged.
- Preserve current browser drafts, demo state, replacement safeguards and development file saving.
- Keep current bundled-map constraints explicit. This milestone does not promise arbitrary maps, custom verbs or engine plugins.
- Keep tokens on the game's backend. The initial connection flow targets a trusted local/backend example, not embedding credentials in a distributed game client.
- No accounts, hosted project persistence, billing, permanent deployment or production credential management in this milestone.

## Task 1 — Define contracts and record the baseline

Primary areas: `shared/src/`, `server/src/routes/v1.ts`, `server/src/worlds.ts`, `server/src/npcs/load.ts`.

- Record the working tree and existing relevant checks; preserve unrelated work.
- Define a bundle envelope such as `{ format: "npc-workshop", version: 1, npc: <NpcDraft> }` using shared validation.
- Define an additive world-creation request field for draft definitions, for example `definitions: [<NpcDraft>]`. Reject requests mixing registry IDs and definitions; preserve the current omitted-body behavior.
- Specify size/count bounds, duplicate and reserved-ID rules, readable validation errors and unsupported-version handling.
- Audit global NPC lookups in response names, signals, schedules, facts, history, art and perception. Identify which must resolve against the world's cast.
- Record the map-dependent behavior supported by this first version. Reject unsupported configuration rather than silently dropping it.
- Define verification credentials: use the existing world token for status checks and the backend example; do not add an unauthenticated world-status endpoint.

Acceptance: documented request/response examples, validation rules and an explicit list of runtime changes. Baseline identifies pre-existing failures separately.

## Task 2 — Add portable export and safe import

Primary areas: `web/src/Editor.tsx`, `web/src/api.ts`, shared bundle validation and a small focused UI component if useful.

- Add “Download NPC” for valid drafts; export the complete versioned bundle with a useful filename.
- Add “Import NPC” to the starting points and connection screen.
- Parse and validate before replacing the draft. Confirm replacement when the existing draft would be lost, using existing safeguards.
- Show actionable errors for malformed JSON, unsupported versions, oversized files and invalid configurations.
- Restore imported drafts through the normal validation/test path and start a fresh test conversation.
- Define artwork portability: package any required local references or clearly flag references that cannot travel; never imply remote/local art dependencies are embedded when they are not.

Acceptance: export → import preserves personality, supported abilities, limits, catalogue, labels, signals and other supported settings. A failed or cancelled import leaves the existing draft and conversation intact. No repository file writes occur.

## Task 3 — Allow API worlds built from drafts

Primary areas: `server/src/routes/v1.ts`, `server/src/worlds.ts`, `server/src/npcs/`, `shared/src/`, API integration tests.

- Validate every supplied draft through the same build path used by Workshop.
- Create the world from the resulting definitions without changing the global registry or writing files.
- Replace global NPC lookups that can mislabel or misroute a custom world with world-local resolution.
- Own a configuration snapshot per world, including nested catalogue/labels/signals data; avoid shared mutable references.
- Apply world-creation, payload, model-call and event limits to custom worlds as well as existing registry worlds. Set explicit draft-count limits independent of registry size.
- Keep tokens, inventory changes, offers, signals and model selection on the existing checked action path.

Acceptance: a custom NPC absent from the startup registry can converse, trade or signal through the existing API as configured. Invalid definitions create no world. Existing registry-based requests still work. Same-ID characters in different worlds remain independent; no other world's configuration or token is exposed.

## Task 4 — Ship a runnable integration example

Primary areas: a new example under `examples/`, README and focused integration documentation.

- Provide one small JavaScript backend example that reads the downloaded bundle, creates a world and sends a player message.
- Configure the NPC server URL explicitly; hold the returned token in the example process, not in committed files or a client bundle.
- Display dialogue and demonstrate how a game consumes checked events and declared signals. Explain that signals require the game's own implementation.
- Explain world expiry, quota/provider errors and creating a fresh world after restart.
- Include exact setup/run instructions and a sample transcript clearly identified as illustrative if scripted.

Acceptance: from a clean terminal, a developer can run the documented example using an exported custom NPC without editing server configuration, copying files into `npcs/`, or restarting the NPC server. A normal request and a configured rule challenge return understandable outcomes.

## Task 5 — Add “Use in your game” to the product journey

Primary areas: `web/src/Editor.tsx`, a connection component, `web/src/style.css`; routing only if needed.

- Make the action available for a valid draft; highlight it after a successful model conversation. Validation or a controlled test alone must not be described as a successful live conversation.
- Open a focused screen with the NPC name and three steps: Download NPC → Run the example → Verify connection.
- Offer import, download and runnable instructions without requiring users to read development file-saving documentation.
- Explain that this is a configuration snapshot and that game-side actions need event/signal handling.
- Bind the screen to the exported snapshot; if the draft changes, show that the downloaded copy needs updating.
- Preserve the workshop draft and test session when returning from the screen. Keep desktop/phone and keyboard navigation usable.

Acceptance: a newcomer can find the handoff from their first test, identify exactly which NPC/configuration is being connected, and return without losing work. Opening the screen makes no model call.

## Task 6 — Verify connection with real evidence

Primary areas: API world metadata/status, backend example and connection screen.

- Give the example a way to present its world ID and token for verification; accept them only in a local UI form or another explicitly authenticated flow. Do not put tokens in URLs, analytics or logs.
- Keep entered credentials in memory and clear them when leaving/resetting the connection flow.
- Use an authenticated status check to verify that the example's world contains the expected snapshot and has completed an external conversation through `/api/v1/.../say`.
- Record the evidence server-side. World creation, Workshop bench traffic and opening the connection screen do not count as integration success.
- Show distinct states: Not connected / World created / First reply received / Unavailable or expired. Poll only while this screen is active, with bounded retries and a manual retry option.
- If the exported/imported configuration differs from the world snapshot, explain the mismatch instead of marking the current draft connected.

Acceptance: only a successful external conversation for the matching snapshot earns “Your game connected.” Wrong credentials, mismatched snapshots, expiry, provider outages and server restart produce accurate recovery guidance without losing the draft or exposing credentials.

## Task 7 — Verify the complete journey and document limits

- Add meaningful bundle and API tests: round trip, invalid/versioned inputs, world-local names and signals, snapshot isolation, authentication, quota behavior and legacy requests.
- Run the existing test suite, typecheck and web build. Record commands and results; distinguish scripted model results from live-provider evidence.
- Browser-check a fresh journey and an imported journey at desktop and phone widths; check keyboard focus and error recovery.
- Restart the server, import the downloaded bundle, create a fresh API world and confirm the same character configuration works. Explicitly verify that old worlds are not advertised as restored.
- Edit the browser draft after world creation and verify the existing world keeps the original personality and limits.
- Verify rejected actions do not alter inventory/gold, and that the example does not apply events twice.
- Update README and integration instructions to describe the new path, supported map assumptions, token handling and current limits.
- Record a newcomer walkthrough if a participant is available; otherwise list human validation as pending.

Acceptance: all required checks pass with linked evidence and a reproducible create → test → export → external reply journey. No registry changes, village reset or server restart is needed to connect a new draft. Deployment and live-provider verification are reported separately if not performed.

## Completion record

### Task 1 — Complete, 2026-10-31

- Shared callers can validate a version 1 portable NPC bundle, read bundle JSON with actionable errors, and validate the additive world-creation request shape. No Workshop UI or HTTP draft-creation path is enabled yet.
- Added [integration schemas/types and bundle parser](../shared/src/integration.ts), [contract tests](../shared/src/integration.test.ts), payload/count constants in [shared limits](../shared/src/limits.ts), and exports in [shared index](../shared/src/index.ts).
- Recorded full bundle/request examples, response excerpts, validation rules, artwork portability, map constraints, verification credentials, existing working-tree changes and an explicit runtime-change audit in the [contract and baseline](workshop-game-integration-contract.md).
- Baseline: `npm test` passed 375 tests in 35 files; `npm run typecheck` passed; `npm run build --workspace web` passed with the existing large-chunk warning. No pre-existing failing checks were observed.
- After implementation: `npm test` passed **394 tests in 36 files**, including 19 new contract tests; `npm run typecheck` passed; `npm run build --workspace web` passed with the same existing warning; `git diff --check` passed. The documented bundle also passed both `parseNpcBundle()` and `buildNpc()` against the current map using `node --import tsx`.
- No model/provider calls, browser verification or deployment performed. Existing unrelated changes were preserved. Runtime gaps (global vocabulary, shallow snapshots and quota boundaries) are documented for Task 3, not claimed fixed by contract validation.
- Next: Task 2. No blocker.

### Task 2 — Complete, 2026-10-31

- Valid drafts can now be downloaded as portable `<id>.npc.json` bundles and imported through the starting points or Workshop toolbar. Import runs local bundle checks and normal server validation before confirmation/reset/replacement, then opens a fresh test conversation. Failed or cancelled imports keep the existing draft and conversation.
- Added [transfer helpers](../web/src/npcTransfer.ts), a [reusable import picker](../web/src/ImportNpcButton.tsx), and [14 focused tests](../web/src/__tests__/npcTransfer.test.ts); updated [Workshop](../web/src/Editor.tsx), [styles](../web/src/style.css), [Vite startup bundling](../web/vite.config.ts), and [usage instructions](../README.md#create-and-test-an-npc).
- Checks: `npm test` passed **408 tests in 37 files**; `npm run typecheck`, `npm run build --workspace web` and `git diff --check` passed. The build retains the existing large Phaser chunk warning.
- [Browser evidence and reproducible fixtures](workshop-game-integration-task-2/README.md) cover a first import, actual download/re-import with complete bundle equality, malformed/versioned/off-map errors, cancelled replacement, preserved dialogue, a fresh session after success, invalid-download gating, keyboard focus, and desktop/phone widths. Scripted replies only; no live-provider verification or deployment.
- Import/download do not write NPC registry files. Existing demo state, development file saving and unrelated work are preserved. The reusable picker will be added to the connection screen in Task 5 when that screen exists. Existing preview request limits still apply; oversized or unsupported configurations leave the current draft intact.
- Next: Task 3, API worlds created directly from drafts. No blocker.

### Task 3 — Complete, 2026-10-31

- `POST /api/v1/worlds` now accepts complete draft `definitions`, validates them through the same build path as Workshop, and creates independent runtime casts without registry changes, file writes or restart. Existing registry and omitted-body requests remain supported.
- Each cast owns parsed configuration and rebuilt model schemas/facts/history; nested catalogue, labels, signals, art, schedules and start overrides stay isolated. Dialogue, signals, memories, news and meeting history resolve names/labels from that world's cast.
- Enabled the 4 MiB world-creation payload allowance while retaining 16 KiB action limits and the independent eight-draft cap. Model calls reserve quota before each invocation, including repair retries and provider failures. Event limits now reject an over-cap transaction atomically, preserving prior state and charging only model calls already made.
- [Implementation details, limit behavior and evidence](workshop-game-integration-task-3/README.md); [28 focused API tests](../server/src/routes/__tests__/v1-drafts.test.ts). `npm test` passed **436 tests in 38 files**; `npm run typecheck`, `npm run build --workspace web` and `git diff --check` passed. The existing large Phaser chunk warning remains.
- Scripted models only; no live-provider verification, browser work or deployment. Existing unrelated changes were preserved. Worlds still use the bundled map and in-memory lifetime; connection identity/evidence remains Task 6.
- Next: Task 4, runnable backend integration example. No blocker.

### Task 4 — Complete, 2026-10-31

- Added [a runnable JavaScript backend example](../examples/game-backend/game.mjs) and [setup/integration guide](../examples/game-backend/README.md). `npm run game-example -- --server <origin> --bundle <download>` creates a draft-based world and sends an ability-aware normal message and rule challenge. Optional interactive commands accept checked offers, advance time and replay events.
- Tokens stay in process memory. Checked events are consumed once by ID, signals reach an explicit game-owned callback, and inventory uses authoritative totals. The guide covers provider/quota/payload errors, network uncertainty, eviction/restart and the need for game-side signal handlers. Unavailable/fallback replies are never described as a successful model conversation.
- Verified the exact CLI over loopback HTTP using the actual Task 2 browser export and a clearly labeled scripted server: valid offer → rejected over-stock challenge → acceptance → declared signal → repeated log reads with no duplicate handling. [Evidence, reproducible fixture and captured transcript](workshop-game-integration-task-4/README.md).
- Added [23 focused tests](../examples/game-backend/game.test.ts), example JavaScript typechecking and normal command wiring; updated README handoff instructions. `npm test` passed **459 tests in 39 files**; `npm run typecheck`, `npm run build --workspace web`, JavaScript syntax and `git diff --check` passed. The existing large Phaser chunk warning remains.
- Scripted models only; no live-provider verification, browser work, human walkthrough or deployment. Existing unrelated work was preserved. Token presentation and matching-world connection evidence remain Task 6; durable state/engine adapters are later milestones.
- Next: Task 5, Workshop “Use in your game” screen. No blocker.

### Task 5 — Complete, 2026-10-31

- Added **Use in your game** in the valid-draft toolbar and Test, highlighted only after an accepted direct model reply with spoken dialogue. Validation, controlled tests, unavailable/fallback responses and timer broadcasts cannot earn it; changing the configuration or resetting/replacing the test clears the applicable evidence.
- Added the [connection screen](../web/src/GameConnection.tsx): selected snapshot name/ID/model/abilities, download/import, quoted runnable backend instructions and an explicitly unverified third step. The screen explains fixed configuration copies, backend tokens, event/signal handling and fresh-world recovery without requiring the development file-saving workflow.
- The screen retains the actual normalized download snapshot. Later edits show that copy with an update warning until re-downloaded. Workshop/bench stay mounted, so Back preserves the selected section, dialogue, unsent message and keyboard focus. Opening makes no API request or model call; browser counters confirmed this.
- Added [24 focused tests](../web/src/__tests__/gameHandoff.test.ts). `npm test` passed **483 tests in 40 files**; typecheck, web build and `git diff --check` passed. The existing large Phaser chunk warning remains. [Implementation and desktop/phone browser evidence](workshop-game-integration-task-5/README.md) also cover unsuccessful-test gating, import recovery, actual downloads, stale-copy handling, command copying, focus and no horizontal overflow.
- Scripted browser replies only; no live-provider call, deployment, human newcomer study or external game-connection verification. Task 6 remains responsible for credentials, authenticated snapshot matching and a verified connection state. Existing unrelated work was preserved.
- Next: Task 6, authenticated connection verification and recovery. No blocker.

### Task 6 — Complete, 2026-10-31

- Workshop verifies the example’s world with its existing bearer token and a complete normalized draft SHA-256 hash. Only a committed external `/say` turn with an accepted model proposal and NPC speech records first-reply evidence. Bench traffic, timers, world creation, silent actions, fallback/provider failures and over-cap transactions cannot earn success.
- Added authenticated private status in [API routes](../server/src/routes/v1.ts), per-world metadata in [world storage](../server/src/worlds.ts), [shared identity](../shared/src/snapshot.ts), [verification UI](../web/src/ConnectionVerification.tsx), [bounded status/poll helpers](../web/src/connectionStatus.ts) and the example’s [temporary loopback credential page](../examples/game-backend/verification.mjs). Tokens stay out of URLs, logs and persistent storage; leaving/resetting the flow clears entered credentials and cancels reads.
- Distinct creation/reply/unavailable states, mismatch guidance, six-check bounds and manual retry were verified. Wrong-token, outage, restart, eviction and stale-copy recovery keep Workshop work intact. [Implementation and limitations](workshop-game-integration-task-6/README.md).
- Checks: 14 API tests, 16 verification-helper tests and one loopback-page test; final full suite **514 tests in 43 files passed**; typecheck, web build, JavaScript syntax and diff whitespace checks passed. The existing large Phaser chunk warning remains.
- Next: Task 7, completed below. Scripted models only; no live-provider call or deployment.

### Task 7 — Complete, 2026-10-31

- Browser-verified a fresh guided character and an imported character at desktop and a real 390px responsive frame: create/test, actual portable download, backend reply, authenticated matching snapshot, keyboard focus, wrong-token/mismatch/outage recovery, stale-copy prevention, cleared credentials, and preserved conversation/unsent input on return.
- Actually restarted the isolated fixture server, observed old-world expiry, imported the actual browser download and created/verified a new world with the same character configuration. Old worlds were explicitly not advertised as restored. Automated checks verify independent personalities and price floors after edits, no rejected-action inventory/gold effects, and no double-handled example events.
- Updated [README](../README.md) and [backend setup/recovery guide](../examples/game-backend/README.md). Added [reproducible fixture, actual downloaded bundle, screenshots, walkthrough, raw check results and limits](workshop-game-integration-task-7/README.md).
- Final `npm test`: **514 passed / 43 files**. `npm run typecheck`, `npm run build --workspace web`, both example JavaScript syntax checks and `git diff --check` passed. Build retains the existing large Phaser chunk warning. All calls used scripted model proposals through real API/ledger code.
- No live-provider verification or deployment performed. No human participant was available; newcomer validation remains pending. Responsive checks use a browser frame, not physical phone hardware. Temporary verification processes were stopped; existing development origins and unrelated work were preserved.
- Implementation plan complete. Optional next validation: live-provider/deployment checks and a human newcomer walkthrough; durable runtime storage and engine adapters remain later milestones.

For each task, append:

- Date and status.
- What the user can now do.
- Files changed and checks performed.
- Evidence links and any remaining limitation.
- Next task or concrete blocker.

## Later milestones

- Persistent projects and versioned NPC storage.
- Accounts, revocable project credentials and usage budgets for hosted access.
- Godot/Unity examples after the generic API journey is proven.
- Custom world/map configuration and durable world recovery.
