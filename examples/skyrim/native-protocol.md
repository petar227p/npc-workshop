# Skyrim native UI protocol v2

## Carried inventory: local view and model facts

The local **Inventory** view uses the token/generation-bound `NWConversationInventory` event, `_root.nwInventoryRequest` and `_root.nwInventoryPage`. Papyrus calls `nwInventoryBegin(token, request, page, pages, gold)`, up to eight `nwInventoryItem(token, request, slot, name, count, weight, value)` callbacks, then `nwInventoryEnd(token, request, message)`, all string arguments. A nonempty end message reports an unavailable snapshot. The SWF ignores retired tokens and superseded request IDs. Inspection pauses polling/submission and refuses in-flight or unresolved exchanges. It never opens a loot menu or changes inventory.

Polls optionally include `inventory: { gold, total, items: [{ form, name, count, weight, value }] }`. `total` is Skyrim's base-form entry count; `items` has at most 128 positive-count entries, names up to 120 characters, unique signed decimal form IDs, nonnegative finite weights and nonnegative integer values. Gold must equal `sgold`. When list length differs from `total`, the model is explicitly told it is partial. The local paged view remains unlimited. Both paths read `GetNumItems` / `GetNthForm` / `GetItemCount` and share the name helper. Weight/value are per base item; improved/enchanted instances are aggregated. Native dictionary handles are reused rather than allocated per item on every poll. Session changes abort an old enumeration before it can drain a new session's queued command.

For each `say`, the adapter forwards **that poll's** observation in the API say body's optional `inventory` field. The authenticated API validates it and appends quoted structured facts only to that NPC's current turn, including repair attempts. These observations never become player dialogue, persona, stored history, ledger goods, catalogue entries or transfer instructions. A missing observation supplies no carried-inventory facts; previous observations are not reused. Old clients without this field still work. Native poll and API say routes permit up to 128 KiB; browser commands keep their previous cap. Restart both services and reload the updated scripts together before testing.

Milestone 2 is implemented in `bridge.ts` and `local.ts`. The SWF/Papyrus controller now sends both `say` and exact-revision `accept` commands through this protocol. Task 5 opens it via Brann activation with automatic connection; F9 remains a diagnostic fallback. See `ui/activation-test.md` for the current package and gameplay checks. The old echo route remains available for diagnostics.

## Transport

POST JSON to **`http://127.0.0.1:8788/skyrim/v2/poll`**. The existing Host/Origin restrictions apply: native requests have no browser Origin, and browser commands continue through the CSRF-protected `/command` endpoint. The old `/skyrim/poll` and `/skyrim/spike/poll` remain available. Valid native requests and application errors use HTTP 200 because of the installed SKSE_HTTP interface. Invalid Host/Origin/content type still receive HTTP 403.

`NativePoll`, `NativeCommand`, and `NativeReply` in `bridge.ts` are the executable Zod schemas. Requests and replies are strict; arbitrary fields and engine commands are not allowed. Requests retain the original inventory/session/transfer fields:

```json
{
  "version": 2,
  "session": "loaded-session-id",
  "request": 2,
  "generation": 1,
  "near": true,
  "ack": "",
  "failed": false,
  "pgold": 100,
  "sgold": 50,
  "pitem": 0,
  "sitem": 6,
  "command": { "id": "command-1", "kind": "say", "text": "Two daggers, please." }
}
```

The first poll establishes the loaded session and must omit `command`. A command on that handshake is rejected as `session_connecting`. Later polls optionally carry one command. A `say` has 1–500 trimmed characters. Exact offer acceptance uses:

```json
{ "id": "command-2", "kind": "accept", "contract": "c_001", "revision": 1 }
```

Identifiers are 1–100 ASCII letters, digits, underscores, dots or hyphens; contract IDs retain the API's `c_` plus digits format. Request numbers and menu generations are positive signed 32-bit integers. Increment request numbers throughout the loaded session and generations whenever a menu instance is replaced. Do not reset request numbers on reopening a menu.

## Replies and snapshots

Each reply echoes `version`, `bridge`, `session`, `request`, and `generation`, and retains `reset`, `plan`, `message`, and the optional eight `before_*`/`after_*` inventory counts. The existing checked transfer application and inventory acknowledgement rules are unchanged. A reply's `message` is the same fixed player-facing text as `ui.status_text`, not an exception or stack trace.

`ui` is a nested dictionary:

| Field | Meaning |
|---|---|
| `revision` | Monotonic snapshot revision; unchanged polls preserve it. Scoped to the loaded session. |
| `status`, `status_text` | Stable machine status and fixed player-facing text. |
| `support_code` | `NW_RECOVERY`, `NW_SERVICE`, or an empty string. |
| `busy` | A command, API request, or physical transfer is outstanding. |
| `gold` | Last observed **actual player gold**, not the ledger's already-debited balance while a transfer is pending. |
| `messages` | At most 32 dictionaries with stable `id`, `role` (`player`, `brann`, `system`), and plain `text` limited to 900 characters. IDs are not recycled when history is trimmed. |
| `offers` | At most eight mapped proposed offers: `contract`, `revision`, `item`, `quantity`, `unit_price`, `total_price`. |
| `command` | Receipt dictionary with `id`, `state`, and `code`; empty ID and `none` values when there has been no native command. |

Offer revisions are independent of snapshot revisions. They change when contract terms/state change; accepting a different snapshot revision is not sufficient. Native accept requires the **displayed contract and that offer's revision**. The browser now sends these revisions too; the legacy adapter method still permits old callers without them during migration. Validate native terms before admission and again immediately before acceptance. Total price is the authoritative integer gold amount; unit price is total divided by quantity and can be fractional.

Render message text as text, never HTML. Consume nested dictionaries/arrays using the installed HTTP typed accessors. The snapshot exports an allowlist rather than raw API state: no world ID, bearer token, configuration, provider errors, stack traces, or raw contract metadata. System failure text is sanitized; user/NPC dialogue remains plain text.

Statuses are `connecting`, `ready`, `sending`, `thinking`, `model_unavailable`, `offer_rejected`, `transfer_pending`, `delivery_confirmed`, `out_of_range`, `service_unavailable`, and `recovery_required`. Connecting/sending/service-unavailable states are available for client lifecycle rendering; an ambiguous API mutation failure returns recovery. Ledger rejection takes precedence over a subsequent model fallback when selecting the action's status.

## Command receipts and interruption

| State | Meaning |
|---|---|
| `queued` | Admitted to the shared queue; no API mutation has started. |
| `executing` | API processing is outstanding. |
| `completed` | Processing returned. Consult status and transfer fields for the action/delivery outcome. |
| `rejected` | Not admitted or not executed. The code explains why. |
| `uncertain` | An API call failed ambiguously. It may have committed; reload a known save instead of retrying. |

Codes currently include `none`, `admitted`, `executing`, `completed`, `action_rejected`, `outcome_unknown`, `command_id_conflict`, `session_connecting`, `stale_session`, `stale_request`, `stale_menu`, `stale_offer`, `busy`, `out_of_range`, `recovery_required`, and `command_limit`.

Commands are canonicalized by schema parsing. Within a loaded session, repeating an ID with the same payload returns its existing receipt and does not repeat admission or API mutation. Reusing it for different intent returns `command_id_conflict`. Rejected IDs remain rejected; a deliberate later user action uses a new ID. Retain the command ID while waiting for its receipt; do not send the intent again with a fresh ID to work around an unknown outcome.

Native command `kind` is normalized to lowercase before union validation and deduplication. The installed SKSE `StringUtil.psc` documents Skyrim's case-insensitive `BSFixedString` pool, which can alter literal casing. Only this machine enum is normalized; text and identifiers retain their original spelling. The initial in-game Send failure was logged as `command.kind` / `invalid_union_discriminator`; casing normalization is covered by regression tests, with the next gameplay attempt needed to confirm the runtime fix. Redacted failure logs report validation paths/codes without recording player text or raw exceptions.

The browser and native UI use the same single command queue and existing API/ledger. A browser-admitted action cannot be displaced by a native one. While an API call is outstanding, duplicate native commands can report `executing`; a different command is rejected as `busy`. Stale request numbers do not process inventory, acknowledgements, or new commands. Older menu generations cannot admit new commands, but session-matching physical transfer acknowledgements remain valid independently of menu generation.

Receipts are retained for at most 1,024 unique IDs per session. Once full, new IDs cannot execute; old IDs are retained rather than evicted and inadvertently re-admitted. Session retirement rejects late previous-session commands and exports none of the new session's transcript or offers. A malformed packet returns a bounded, correlated recovery reply where valid correlation fields can be recovered.

**A `completed` accept receipt is not delivery confirmation.** A returned plan means `transfer_pending` and `busy=true`. Only the later matching inventory acknowledgement produces `delivery_confirmed`. Resending a checked plan uses the existing physical idempotency checks. An inventory mismatch or failed application enters recovery and blocks further admission. Closing the menu does not cancel an admitted action or accepted transfer. The game controller must reject late UI updates for retired menu generations without discarding a valid session transfer reply.

Command IDs and receipts live only in the adapter's memory. They do not provide exactly-once guarantees across adapter/API restarts. Session resets and no-blind-retry behavior remain required; restarting the bridge discards conversation state.

## Verification

On 2026-11-01, **30 tests passed** across `native.test.ts`, `bridge.test.ts`, and `spike.test.ts`; `npx tsc -p examples/skyrim` passed. Tests use the real API/ledger with scripted model responses and cover native duplicate commands, ID conflicts, stale sessions/requests/menu generations/offer terms, browser/native busy admission, lost post-commit responses, redaction, bounded history/receipts, model outcomes, physical transfer resends, and matching/mismatched acknowledgements. These verify the backend protocol, not v2 UI integration in Skyrim.


## General carried-item stock sales

Observed rows optionally add `saleable` and `player_count`. Missing flags never authorize a new sale. The game computes eligibility from playable item type, equipped state, VendorNoSale and valid base value. The bridge creates stable runtime-form good IDs and updates `/api/v1/worlds/:id/catalogue` with `{ npc, goods: [{ id, label, min_price }] }` before synchronizing stock. This authenticated game endpoint rebuilds the same world-owned seller's model schema, facts and ledger catalogue; model output cannot invoke it. Ordinary stock sellers only; no crafting catalogue conversion. Catalogue bodies share the bounded 128 KiB inventory transport allowance and have at most 128 distinct goods. Changed stock is synchronized in batches of at most 128, including zeroes for previously observed goods.

Non-dagger transfer packets retain all original gold/dagger counts and add signed integer `item_form`, plus `item_before_player`, `item_before_seller`, `item_after_player`, `item_after_seller`. Native scripts resolve only that form, recheck eligibility and conservation, move the actual item before charging gold, and retain it as LastTransferItem with LastPlan. A subsequent poll includes `ack_item: { form, player, seller }`, with a signed decimal-string form. The adapter requires its identity and exact after-counts, along with the original gold/dagger checks, before acknowledging delivery. Repeated LastPlan packets are acknowledged without repeating removal. The original dagger plan shape remains supported. Model text and observed rows alone never perform a transfer.
