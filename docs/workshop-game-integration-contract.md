# Workshop game integration: contract and runtime baseline

Recorded 2026-10-31 for Task 1 of [the implementation plan](workshop-game-integration-plan.md).

## Current implementation status

Tasks 1–5 are complete. Draft-based HTTP world creation is enabled, with owned cast snapshots, local vocabulary, raw payload limits and checked quota/event boundaries. See [Task 3 implementation and verification](workshop-game-integration-task-3/README.md), [the runnable backend example](../examples/game-backend/README.md) and [the Workshop handoff screen](workshop-game-integration-task-5/README.md). The boundary and runtime audit below record the original Task 1 baseline; their pending-work statements describe that earlier state.

## Implementation boundary

Task 1 adds shared validation and types in `shared/src/integration.ts`, exported from `@blacksmith/shared`. It does **not** enable draft-based HTTP world creation or add Workshop buttons yet. The existing API still accepts registry IDs only. Tasks 2 and 3 will use these contracts for import/export and draft-based worlds respectively.

## Portable bundle version 1

`NpcBundleSchema` validates an envelope with exactly three fields: `format: "npc-workshop"`, `version: 1`, and `npc: NpcDraft`. `parseNpcBundle(text)` checks raw UTF-8 size before JSON parsing and returns either `{ ok: true, bundle }` or `{ ok: false, errors: string[] }`. Errors include field paths. Invalid JSON, other formats, missing versions and unsupported versions fail without returning a partial draft.

A complete, minimal character example:

```json
{
  "format": "npc-workshop",
  "version": 1,
  "npc": {
    "id": "ada",
    "name": "Ada",
    "persona": "You are Ada, a patient villager. Speak briefly and stay in character.",
    "verbs": ["SAY"],
    "model_verbs": ["SAY"],
    "facts": ["clock"],
    "perception_radius": 5,
    "model": "muse_spark_open",
    "effort": "low",
    "location": "square",
    "schedule": [],
    "sprite": 98,
    "art": { "style": "", "references": [] },
    "start": { "gold": 0, "stock": {} },
    "catalogue": {},
    "labels": {},
    "signals": {},
    "triggers": [{ "kind": "on_spoken_to" }],
    "cue": "Reply to the visitor in character.",
    "fallbacks": {
      "rejected": "Let me think that through. Ask me again.",
      "unavailable": "I cannot talk just now. Try again later."
    }
  }
}
```

The bundle contains the complete normalized draft, including persona, abilities, model choice, effort, limits, catalogue, starting stock, labels, signals, schedule, triggers, fallback lines and artwork settings. Existing draft-schema trimming, defaults and one-line normalization apply. `start` is configuration for a **new** world; it is not the current world's inventory.

Unknown envelope/draft fields are rejected. Tokens, world state, events and conversation history have no fields in this contract. This validates structured configuration; it does not scan author-written persona text for secrets.

Artwork references must be embedded PNG/JPEG/WebP base64 data URLs, as in the current draft schema. Repository filenames, local paths and remote URLs are rejected. Up to three references, each at most 300 KiB decoded, and a style line up to 300 characters are supported. Bundles do not include generated item pictures or the built-in character sprite sheet; `sprite` still selects a frame from the bundled assets. A Workshop export must use the draft, not an NPC file's `art.references` filenames.

## Draft-based world creation contract

`worldCreationSchema(registryCount)` defines the additive request shape for Task 3. `ApiWorldCreate` is its normalized TypeScript type. The registry count is passed explicitly so a registry request keeps its current maximum; the custom-draft count is independent.

Proposed `POST /api/v1/worlds` request construction from a validated bundle:

```ts
const request = {
  definitions: [bundle.npc],
  start: { player: { gold: 200, stock: {} } }
};
```

`definitions` contains complete drafts, **not** bundle envelopes. Passing the versioned envelope directly as a definition fails validation. A backend reads the versioned bundle first, then passes its validated `npc` into this array.

The existing requests remain supported unchanged:

```json
{ "npcs": ["smith", "merchant"] }
```

```json
{ "start": { "player": { "gold": 30, "stock": { "rope": 1 } } } }
```

An empty HTTP body or `{}` still selects all registered NPCs. The route must translate an empty body to `{}` before schema validation. Invalid JSON and a JSON `null` body fail.

The response keeps `ApiWorldCreated`: `{ world_id, token, npcs, state }`. Expected response excerpt for Ada (illustrative; not live-provider evidence):

```json
{
  "world_id": "example-world-id",
  "token": "<issued bearer token>",
  "npcs": ["ada"],
  "state": {
    "world_id": "example-world-id",
    "people": [{ "id": "ada", "name": "Ada", "sprite": 98, "place": "square", "model": "muse_spark_open" }],
    "tick": 0,
    "calls_left": 150,
    "busy": null,
    "last_event_id": null
  }
}
```

`state` also retains the existing places, news, gold, goods, shops, contracts, items and art fields. No persona, other world's configuration or token is added to state. `GET /api/v1/npcs` continues to list only the startup registry; custom world creation never registers its cast globally.

After creation, the backend uses the existing authenticated action route:

```http
POST /api/v1/worlds/example-world-id/say
Authorization: Bearer <issued bearer token>
Content-Type: application/json

{"npc":"ada","text":"Good day!"}
```

An illustrative successful `ApiResult` excerpt:

```json
{
  "ok": true,
  "reason": null,
  "outcome": "acted",
  "said": [{ "by": "ada", "name": "Ada", "text": "Good day, traveller.", "to": "player" }],
  "signals": []
}
```

The full response also includes checked `events` and `state`. The game consumes events once by event ID; `said` and `signals` are conveniences derived from those events, not a second set of effects.

## Validation rules and bounds

| Check | Rule | Enforcement |
| --- | --- | --- |
| Bundle size | At most 2 MiB (2,097,152 UTF-8 bytes), including pictures and envelope | Shared object schema and raw-text bundle parser; Task 2 also checks `File.size` before reading |
| Definition size | Each normalized draft at most 2 MiB | Shared world-request schema |
| World creation size | At most 4 MiB (4,194,304 UTF-8 bytes) for the entire request | Shared normalized-object check; Task 3 must add the raw HTTP limit before parsing |
| Custom cast size | 1–8 drafts, independently of registry size | Shared world-request schema |
| Registry selection size | 1–`registryCount` IDs, with no duplicates | Shared world-request schema; route resolves registry membership |
| Mixed selections | Reject any request containing both `npcs` and `definitions` | Shared world-request schema |
| Duplicate draft IDs | Reject within a cast, with the repeated `definitions.<index>.id` path | Shared world-request schema |
| Reserved IDs | `player`, `world`, `clock` cannot be NPC IDs | Existing shared draft schema |
| NPC ID syntax | Lowercase letter followed by up to 40 lowercase letters, digits or underscores | Existing shared draft schema |
| Existing NPC ID reused by a draft | Allowed in a custom world; no access to or mutation of registry configuration | Task 3's world-local runtime |
| Same ID across worlds | Allowed; configuration, state, model clients and tokens remain independent | Task 3's snapshot isolation |
| Unknown properties or verbs | Reject; no custom maps, plugins or runtime verb definitions | Existing strict draft/request schemas |
| Inventory overrides | Complete `{ gold, stock }` records for `player` or members of this world's cast only; each replaces that actor's start | Existing shared `StartSchema`; route checks membership before storing a world |
| Other draft bounds | Existing persona (6,000 chars), schedule (24 unique hours), perception (0–20 tiles), labels (200), signals (20), catalogue/range/count and trigger checks remain authoritative | Existing shared draft schema |
| Cross-field validity | Always run every draft through `buildNpc()` before creating a world | Task 2 validates imports through Workshop; Task 3 builds every supplied definition |
| Map validity | Reject unknown `location` or schedule places, rather than discarding them | `buildNpc()` with default `PLACE_NAMES`, never `null` |
| Model/schema validity | SAY required; model verbs must be allowed; required catalogue, facts, signals and non-conflicting model words must build | Existing `buildNpc()` / `defineNpc()` |
| Conflicting labels across custom cast | Reject different labels for the same good ID within a world; never consult or mutate another world's label registry | Task 3's local vocabulary construction |

The 4 MiB combined cap can reject a cast with individually valid, picture-heavy drafts. The recovery is to reduce picture or cast size. Raw JSON whitespace/escaping also counts toward HTTP/file limits. No existing registry request or other action endpoint gets the new larger payload allowance. The current HTTP limit remains **16 KiB** until Task 3 explicitly enables the larger limit for `POST /api/v1/worlds` only.

Task 2's exporter must also check the final serialized file size (pretty-printing adds bytes), rather than relying solely on normalized-object validation.

Readable errors already available from the shared parser/schema include:

```text
Invalid JSON; choose a downloaded NPC bundle (.json)
version: Unsupported NPC bundle version; this app supports version 1
npc.start.gold: Number must be greater than or equal to 0
definitions: Choose registry NPC ids (npcs) or draft definitions, not both
definitions.1.id: Duplicate NPC id 'ada'; each NPC once
```

The HTTP route will keep its existing `{ error: string }` error shape, joining validation paths. Invalid shape/build/map/start requests must produce HTTP 400 **before** `worlds.create()`, so they neither create a world nor spend world-creation quota. Raw oversized HTTP requests produce 413. Store limits continue to produce 429/503.

## Required runtime changes: audit

| Area | Existing behavior | Required implementation |
| --- | --- | --- |
| `routes/v1.ts` world creation | `NewWorldBody` accepts registry IDs only | Use the shared schema, run all definitions through `buildNpc()`, validate start membership, then store the selected cast. No file writes or registry changes |
| `routes/api.ts` body middleware | All `/api/v1` requests are limited to 16 KiB before reaching the subrouter | Allow 4 MiB only for POST world creation; keep action limits unchanged. Test raw/chunked bodies as well as schema size checks |
| `worlds.ts` `gameWorld()` | `picked.map(from)` retains definition and nested catalogue/labels/signals/schedule/art references unless a start override is supplied; overrides themselves retain input references | Build from an owned, deep configuration snapshot. Rebuild closures/model schemas against that snapshot; a shallow spread or cloning a definition with functions is insufficient. Clone start overrides too |
| API `said()` and `signalled()` | Names come from global `nameOf()` | Resolve with this world's cast, including same-ID custom characters. Engine SIGNAL permission checks already use the actor's own signals |
| `npcs/news.ts` | Global `NAMES`/`LABELS`; `labelsFor()` falls back to registry labels. `summarize()`, gifts and `memoriesText()` consult global vocabulary | Introduce explicit world-local name/label resolvers; provide village defaults only for existing village callers. Never register custom names/labels globally |
| `npcs/load.ts` | `buildNpc()` closes facts/history/model words over a parsed draft and global label fallback | Accept the appropriate local vocabulary/context when building a cast; retain current Workshop and startup behavior. All custom-world definitions use the same build rules |
| `npcs/facts.ts` | Most blocks use the NPC's own catalogue/labels/signals; memories still call global `memoriesText()` | Carry local vocabulary into the memories block; retain own-catalogue, own-signal and own-stock calculations |
| `npcs/history.ts` | Own name/labels are captured; another NPC customer's name comes from global `nameOf()` | Resolve other cast members locally, especially on meeting-triggered conversations |
| `sessions.ts` views | People/shops already use supplied cast; `newsView()` uses global names for `told_by` and global summaries | Resolve news names/labels with the supplied world cast; preserve village views and Workshop bench behavior |
| Schedules | `placeAt()`/engine schedules use supplied actors; town meeting cues already find names in the supplied cast | Keep this path; copy schedule entries as part of the snapshot and test distinct same-ID schedules |
| Perception and reports | `gameWorld()` creates senses/engine with its cast, bundled `placeDistance` and `PLACE_NAMES` | Keep world-local actors and map constraints. `/report` and `/tick` already pass the cast/engine; ensure no new call falls back to village defaults |
| Artwork | API accept already finds the seller's art in `w.cast`; each world owns its art gallery and uses authenticated picture routes | Keep this path; own the nested art snapshot and embedded references. No registry artwork lookup needed |
| Action engine | Rules resolve actors against the engine's own cast; gold, stock, contracts, events and memories live in each world | Reuse, including SIGNAL, offer/accept, GIVE and sync checks. Verify rejected actions leave inventory/gold unchanged |
| API limits | Store creation caps already apply to all worlds; model/event gates currently check before a whole turn/transaction | Keep store caps. Ensure retries and triggered turns cannot bypass model caps; document/fix event-boundary behavior rather than silently assuming gates are hard ceilings |

Global imports used by the village demo, god mode, exploit tools and static registry listing can stay global. The custom `/api/v1` execution path, model facts/history and returned views must use explicit world context.

### Supported geography and behavior

The first version uses the bundled village places: `forge`, `market`, `notice_board`, `square`, `tavern`, `farm`, `chapel`, `cottage`, `gate`. A draft's home and all schedule entries must be in this set. Perception uses Euclidean tile distance between place centres, not a game's arbitrary position or navigation mesh. Schedule hours use the existing 24-hour game clock, one tick per hour. The player has no fixed place; talking to an NPC happens at that NPC's current place for witnessing. ANNOUNCE and news triggers retain their existing home-place restrictions; TELL requires a listener at the same place. Reports require bundled places and actors in this world. Engine-specific game movement and signal handlers remain the game's responsibility.

## Verification credentials and evidence contract

Use the existing world bearer token for both the backend example and the connection screen's authenticated status check. `GET /api/v1/worlds/:id` already requires it; do not add an unauthenticated world-status route. A missing/wrong token stays 401, and a missing/evicted/deleted/post-restart world stays 404. The server does not restore worlds from bundles.

Task 6 will add authenticated metadata/evidence for the configuration snapshot and a successful external `/say` reply. Configuration identity must be derived from the complete normalized draft (including nested data), using deterministic serialization; equality by ID/name alone is insufficient. No public persona or token echo is required. A bench response, world creation, rejected action, provider-unavailable fallback or screen visit cannot establish an external live conversation. The screen must compare the selected snapshot and successful external reply evidence, not infer success from any `SAID` event (fallbacks also produce them).

Tokens remain in the trusted backend process or a local UI form's memory, clear on leaving/resetting that screen, and never go in URLs, committed files, analytics or logs. The example should reveal credentials only through an explicit local verification interaction, with a hidden token entry; ordinary output may show the world ID. A distributed game client is outside this milestone's credential model.

## Baseline evidence

Baseline commit: `0578b82`. Runtime used: Node `v26.11.0`, npm `11.20.0`. No `AGENTS.md` was found in the project/parent scan.

Existing work at start, preserved:

```text
 M .claude/launch.json
 M .env.example
 M package.json
?? docs/teardown-2026-10-30/
?? docs/workshop-game-integration-plan.md
?? docs/workshop-guided-setup-plan.md
?? npcs/corwin.json
?? prompts/corwin.md
```

| Check, before changes | Result |
| --- | --- |
| `npm test` | PASS: 35 files, 375 tests |
| `npm run typecheck` | PASS: shared, server, web and scripts |
| `npm run build --workspace web` | PASS; existing Vite warning for chunks above 500 kB (Phaser village chunk approximately 1.49 MB) |

No pre-existing failing checks were observed. Tests emit expected mocked provider/art-error stderr. No live-provider calls, browser journey or deployment verification was performed for Task 1.

Pre-existing implementation gaps found by code audit (separate from failing checks): global names/labels and shallow definition references as listed above; the shared HTTP gate is too small for picture-bearing drafts. Also, `npcTurn()` permits a repair retry after the route's quota check, and town turns are charged after the batch; thrown model calls are not counted as attempts. The event gate checks current log length before transactions that can add multiple events. Task 3 needs boundary tests and explicit handling before claiming hard per-call/event ceilings.

## Task 1 verification

The new `shared/src/integration.test.ts` covers all supported setup round trips; nested fields and embedded art; three maximum-sized reference pictures; malformed/oversized/multibyte JSON; version/format errors; unknown state/credential fields; local/remote art rejection; invalid draft paths; duplicate/reserved IDs; exclusive selections; legacy request shapes; cast limits independent of registry size; owned parsed data; normalized per-draft size; and combined payload limits.

Final verification results are recorded in the [implementation plan's completion record](workshop-game-integration-plan.md#completion-record). Next: Task 2, add download/import using this shared contract and the existing server validation/test path.
