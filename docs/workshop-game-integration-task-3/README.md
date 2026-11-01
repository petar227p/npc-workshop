# Task 3 — API worlds created directly from drafts

Completed 2026-10-31 for [the implementation plan](../workshop-game-integration-plan.md).

A backend can now send `{ definitions: [bundle.npc], start?: … }` to `POST /api/v1/worlds`. Each draft goes through the shared request contract and Workshop's `buildNpc()` checks, including map and cross-field rules. The response and authenticated action endpoints are unchanged. The [contract](../workshop-game-integration-contract.md#draft-based-world-creation-contract) has complete request/response examples.

No NPC registry entries or repository files are written, and no restart is needed. Existing `npcs` selections, omitted bodies, `{}` and start-only bodies still work. Registry selections use the startup drafts, so later development saves do not silently change what registry IDs mean.

## Implementation

- [World creation and checked actions](../../server/src/routes/v1.ts) accept drafts or registry IDs, validate start membership, return readable errors, and keep the existing world tokens, model selection, ledger and artwork paths.
- [Cast building](../../server/src/npcs/load.ts) parses owned configuration and rebuilds model schemas, word mappings, facts and history for each world. [World storage](../../server/src/worlds.ts) also clones start overrides and player starting data. Catalogue, labels, signals, art references, schedules, triggers and fallbacks belong to that world.
- [Local vocabulary](../../server/src/npcs/news.ts) resolves names and labels only from that cast and rejects conflicting labels within it. [Facts](../../server/src/npcs/facts.ts), [history](../../server/src/npcs/history.ts), API dialogue/signals and [news views](../../server/src/sessions.ts) use local context. Custom worlds never register global names or labels. Village and Workshop build callers retain their defaults.
- [HTTP limits](../../server/src/routes/api.ts) allow 4 MiB only for `POST /api/v1/worlds`; action endpoints retain 16 KiB. The route also checks raw UTF-8 bytes before JSON parsing. Shared contracts retain the independent 1–8 custom-draft bound and 2 MiB normalized per-draft bound.

## Limit behavior

World creation still uses the existing per-address, overall, store-capacity and idle-eviction limits. Invalid requests build no world and spend no creation quota. Custom drafts must name bundled village places; registry files retain their existing legacy off-map tolerance.

Model-call quotas are reserved immediately before each `client.chat()` invocation, including repair attempts and calls that throw. Another world's concurrent call and later triggered turns see the reservation immediately. A missing provider client still returns 503 without changing world state. If a repair would exceed the quota, no additional client call is made; the current turn returns the existing `unavailable` outcome/fallback, and the next direct `/say` returns 429 until quota permits it (or a fresh world is needed for the per-world cap). Exhausted triggered NPCs sit out; the clock can still advance. The model client's own bounded network retry policy is unchanged.

The event cap is a hard ceiling on the **persisted** log. Every action computes against immutable engine state, then either saves the complete result or returns 429 if it would exceed the cap. Dialogue, signals, clock movement, inventory transfers and trigger records from an over-cap request are discarded together. Artwork starts only after acceptance is saved. Model calls already made still consume quota; temporary event computation can exceed the cap before this save check. A world whose log is already full rejects further actions. Callers should create a fresh world after a log-limit error.

## Verification

All model replies in these tests are scripted. No live-provider call, browser verification, server deployment or engine adapter was performed in Task 3.

| Command | Result |
| --- | --- |
| `npx vitest run server/src/routes/__tests__/v1-drafts.test.ts` | 28 passed |
| `npm test` | 436 passed in 38 files |
| `npm run typecheck` | Passed |
| `npm run build --workspace web` | Passed; existing large Phaser chunk warning remains |
| `git diff --check` | Passed |

[28 integration tests](../../server/src/routes/__tests__/v1-drafts.test.ts) cover:

- An NPC absent from the registry converses and sends a declared signal through `/say`, with its configured model choice.
- Custom labelled offers and acceptances transfer checked gold and stock. Underpriced offers and undeclared signals leave inventory unchanged.
- Same-ID characters use their own names and signal permissions; one world's token cannot read or drive another. Tokens are absent from action responses; the registry listing stays unchanged.
- Map errors, cross-field failures, conflicting labels, malformed JSON, mixed selections, duplicates, reserved IDs, invalid model verbs, unknown fields and unknown starting actors create no world or consume a creation slot.
- Eight drafts fit independently of registry size; a ninth is rejected. Custom worlds use the existing creation and storage caps.
- Picture-bearing drafts above 16 KiB work. Oversized raw, declared-length and streamed multibyte requests return 413; action limits stay small.
- Source edits to nested catalogue, labels, signals, art, schedules and start overrides do not change an existing world or its prompt, facts or model schema. A subsequent same-ID world uses the changed configuration.
- Facts, memories, summaries, meeting cues, conversation history and heard-news attribution use the local cast. A custom world does not borrow labels from the village registry.
- Both custom and registry worlds stop repair calls at the quota boundary and charge provider failures. Trigger batches and concurrent worlds cannot overspend the call budget.
- Full-log gates and over-cap dialogue, made-to-order acceptance, ticks and reports preserve the prior state. Refused acceptance neither charges gold nor starts artwork.
- Legacy omitted-body, empty-object, registry-selection and start-only requests remain valid; the existing 26 API tests also pass.

Next: Task 4, the runnable backend integration example. No blocker. Worlds remain process-local configuration snapshots; restart recovery, connection-screen verification and engine-specific handlers are later tasks.
