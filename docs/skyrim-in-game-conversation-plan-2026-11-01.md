# In-game Brann conversation plan — 2026-11-01

## Starting point and scope

The user reports that repeated polling, reply callbacks, a real trade, and save/load behavior worked in their test. Treat these as user-verified results; this chat has not independently captured their logs or inventory counts. The next task is moving the conversation interface into Skyrim.

The first release should let the player approach Brann, activate him using their normal interact binding, type a message, read his reply, negotiate, explicitly accept an offer, and receive confirmation of the actual transfer without opening a browser.

Keep the existing API, model configuration, authoritative ledger, inventory checks, transfer plan, and acknowledgement flow. Keep the current reset-on-load conversation semantics. Voice, persistent memory, extra NPCs, and a native barter-menu replacement are later work. The local Node services still run outside Skyrim; only the player's interaction moves into the game.

## Proposed experience

1. Activate Brann to open a Skyrim-styled conversation panel over the game scene. Use the configured Activate control rather than hardcoding E. Only the custom Brann reference receives the new behavior.
2. Show his name, recent dialogue, a text field, Send, available offers, and Close. Use subdued parchment/charcoal styling, readable text, and scrollable history. Start with keyboard and mouse; controller text entry is a separate follow-up.
3. Enter sends a nonempty message; Shift+Enter inserts a newline. Display the pending message and a waiting indicator immediately. Prevent repeat submission while a command or transfer is outstanding. Esc closes the panel from any state and releases its input capture.
4. Each offer identifies the item, quantity, unit price, total price, and player gold. Accept opens a short confirmation showing the selected offer's current terms. The confirmation is bound to that contract and revision, so a superseded offer cannot silently change underneath the player.
5. Show delivery success after Skyrim applies the transfer and the adapter receives the matching inventory acknowledgement. An accepted API contract alone must not be presented as completed physical delivery.
6. Closing and reopening the menu in the same loaded session restores the transcript and current offer state. Loading a save starts the existing fresh conversation. Display that reset briefly rather than appearing to lose history silently.

## UI technology and first feasibility gate

Start with a project-owned Scaleform/ActionScript SWF, opened through SKSE's existing `UI.OpenCustomMenu`, and Papyrus UI/event plumbing. The installed `UI.psc` exposes the required opening, closing, invocation, and text-input inspection functions. This avoids adding a new native DLL as an initial requirement.

SKSE's upstream custom-menu implementation is modal and pauses the game. Do not assume the current two-second `RegisterForSingleUpdate` loop will continue inside it. Also, SKSE exposes only one shared `CustomMenu`; opening ours must not replace another mod's custom menu.

Before designing the full interface, build a minimal menu and verify on this installation's Skyrim 1.7.104.0 / SKSE 2.3.1:

- Opening, typing, sending one UI event to Papyrus, receiving one Papyrus UI update, and closing all work.
- Text entry does not trigger gameplay keys, F8, console, or unintended acceptance. Test focus, quotes, newlines, long text, and non-ASCII input supported by the chosen fonts.
- One correlated HTTP request and callback completes while the menu is open. A menu-aware transport driver is required if normal updates stop; test `WaitMenuMode` scheduling rather than assuming it solves all pause behavior.
- Closing, save loading, and menu replacement stop that driver cleanly. Reopening must not create a second polling loop or an overlapping HTTP request.
- A checked test transfer and its acknowledgement complete with the menu open.

If the existing custom menu cannot support the complete round trip while open, the fallback is a small runtime-specific SKSE menu plugin with explicit menu and input behavior. Its loader compatibility on 1.7.104 is a separate gate. Do not silently switch to a new DLL dependency or claim generic AE compatibility. Complete this decision before building the full UI.

Select and pin a reproducible SWF compiler during this spike. Keep editable ActionScript, layout assets, and build instructions in the repository; a hand-edited binary alone is not an acceptable build process.

## Responsibilities and data flow

```text
Conversation SWF
    ↕ typed UI updates / validated UI events
Papyrus conversation controller
    ↕ one serialized request stream
Existing SKSE_HTTP → local adapter → existing API and ledger
    ↓ checked transfer plan
Existing Papyrus inventory application → inventory acknowledgement
    ↓ confirmed result
Conversation UI
```

The SWF renders text and emits intent. It never changes inventory or chooses form IDs. The Papyrus controller handles activation, menu ownership, input focus, local interaction state, and native request scheduling. The adapter continues to own command admission and API credentials. Existing Papyrus transfer checks remain the authority for applying a checked physical plan.

Introduce a versioned native UI protocol, preferably `/skyrim/v2/poll`, while retaining the existing native endpoint during migration. Include an optional command in the next poll instead of adding a second concurrent HTTP callback stream. Reuse the existing `say` and `accept` command validation and queue.

Requests should identify the loaded session, request number, menu generation, and command ID, together with the existing proximity, inventory, plan acknowledgement, and failure fields. Commands contain either message text or a contract ID with the displayed revision. Reject stale terms before acceptance. Keep one in-flight request and one admitted command at a time.

Replies should contain:

- The existing correlation marker and transfer fields.
- Command acknowledgement or rejection, with a stable command ID.
- A bounded UI snapshot: revision, recent messages with IDs, proposed offer terms, gold, busy state, status code, and player-facing status text.
- A status distinguishing model unavailability, a rejected offer, a pending transfer, confirmed delivery, and recovery required.

Use typed dictionary/string/array access supported by the installed HTTP interface; do not make Papyrus parse ad hoc JSON or delimiter-separated player text. Verify the actual nested-array behavior during the spike. Render dialogue as text, with no HTML interpretation. Keep API/world credentials out of the SWF and native packets.

Deduplicate commands within the loaded session. Repeated UI events or a repeated command packet must not execute another model/API mutation. A transport timeout is not evidence that an action failed to commit; preserve the existing no-blind-retry rule. Command IDs improve admission and correlation, not cross-process exactly-once guarantees.

## Lifecycle and interruption rules

- Opening initiates connection automatically; F8 remains a diagnostic shortcut during development.
- Closing the panel discards unsent local text only according to an explicit draft policy; default to preserving it within the same loaded session. It does not imply cancellation of a submitted request or accepted trade.
- A committed transfer keeps its normal completion/acknowledgement path after UI closure, subject to existing proximity and inventory checks. Reopening reads the latest adapter state rather than replaying the action.
- Leaving range, entering combat, or Brann/player death closes the conversation and prevents further submission. Do not describe an already submitted mutation as cancelled without evidence.
- A late HTTP reply can update only its matching loaded session. It cannot reopen a closed menu. Menu generation checks prevent a late UI update from overwriting a newer menu instance, while session checks govern physical transfers.
- Save loading releases menu/input state, retires the previous UI generation, and runs the existing `BeginSession` reset. Preserve stable form IDs when adding records/scripts.
- When another custom menu is already open, decline opening ours with a short explanation. Only close the menu instance this controller owns.

Player-visible states should include Connecting, Ready, Sending, Brann is thinking, Applying trade, Trade complete, Out of range, Service unavailable, and Recovery required. Include a support code for technical failures; keep raw stack traces and credentials out of the panel. A long wait may offer Close, but must not offer an unsafe mutation retry.

## Implementation milestones

Milestone 6 packaging and automated regression prepared: full builds use isolated compiler output, then create an allowlisted ZIP with source snapshots, installation notes and a SHA-256/input manifest. Validation precedes atomic release replacement; the prior ZIP is preserved by its content hash. Fixed ZIP/PEX build metadata makes exact-input repackaging byte-identical. Two fresh source builds exposed nondeterministic PEX symbol-table ordering in the installed Creation Kit compiler; fresh compilation is explicitly not claimed byte-identical. All 586 repository tests, six Python packaging tests and repository typechecks pass, including additional save/menu-generation/interruption regressions. All scripts/SWF compile; no game files or saves were changed. The user will run the gameplay checks. See `examples/skyrim/ui/release-test.md` for the release hash, rollback copy, build evidence and pending runtime result sheet. Milestone 6 and overall release acceptance remain pending those runtime results.

Milestone 5 implementation prepared: `NWBrannActor` is attached only to persistent `NWBrannRef` and forwards player activation to the existing quest controller. `BlockActivation` suppresses default dialogue while retaining engine `OnActivate` events, so the configured Activate binding opens the panel and starts v2 connection automatically. The controller validates Brann/player identity, preserves the existing menu ownership/lifecycle guards, and refreshes the reference's activation configuration at session reset. F9/F8 remain diagnostic shortcuts. All three scripts compile without errors/warnings; rebuilt ESP round-trip assertions verify the reference/quest links, script isolation and unchanged local IDs, and two independent builds match. The complete package is ready; remapped controls, existing-save script attachment and unrelated NPC interaction still require in-game verification. See `examples/skyrim/ui/activation-test.md`. Packaging/gameplay regression is milestone 6.

Milestone 4 implementation prepared: the F9 panel renders up to eight typed offers with two cards per page, item/quantity/unit/total prices and player gold. Review opens a frozen contract/revision confirmation; changed or withdrawn terms invalidate it. Accept uses the same one-command poll stream, locks immediately against repeated input, preserves unsent chat drafts, and shows Applying trade until matching physical acknowledgement permits Trade complete. Automated SWF-method/real-ledger coverage, script/SWF compilation and packaging pass; the in-game exact-offer/repeated-click/open-menu trade checks remain pending. See `examples/skyrim/ui/offers-test.md`. Normal Brann activation remains milestone 5.

Milestone 3 implementation prepared: F9 conversation SWF with scrollable plain-text transcript, input, pending/working status and Close; Papyrus v2 `say` commands and typed snapshot rendering; preserved drafts/history within a loaded session; no automatic resend after closure or transport failure. The original checked transfer/ack path remains in the bridge quest. See `examples/skyrim/ui/conversation-test.md` for installation and pending in-game verification. Offers/confirmation UI and normal actor activation remain milestones 4 and 5.

User verification update: the user observed advancing open-menu callbacks with `nested arrays=true`, then confirmed the echo/input and close/reopen checks worked and authorized milestone 2. These are user-reported results. An open-menu checked trade/acknowledgement and the remaining interruption/conflict checks have not been reported as passed.

Milestone 2 backend implementation: `/skyrim/v2/poll`, strict request/reply schemas, session-scoped command receipts/deduplication, shared browser/native admission, offer revisions, bounded/redacted snapshots, and delivery status tied to physical acknowledgement are implemented. The focused suite passes 30 tests and adapter typechecking passes. See `examples/skyrim/native-protocol.md`. The F9 SWF/Papyrus probe remains on its existing endpoint; live conversation UI integration is milestone 3.

Milestone 1 implementation started: editable `examples/skyrim/ui/ConversationProbe.as`, checksum-pinned MTASC 1.14 build, F9 diagnostic menu, serialized `WaitMenuMode` driver, and typed `/skyrim/spike/poll` echo/array experiment are prepared. See `examples/skyrim/ui/README.md` for the build and runtime evidence checklist. This spike keeps browser-based command admission and existing ESP form IDs. **Runtime feasibility is pending; milestone 1 is not yet complete.** No native-menu DLL fallback has been added.

| Milestone | Deliverable | Completion check |
|---|---|---|
| 1. Menu feasibility | Minimal SWF, build command, menu-aware callback experiment | Type, send, receive, close, reopen, and complete a test trade while open on this runtime |
| 2. Native UI protocol | Versioned request/reply schema and adapter mapping | Tests cover stale sessions/terms, duplicate commands, busy admission, redacted snapshots, and existing trade behavior |
| 3. In-game conversation | Transcript, input, status, scroll, and live Brann replies | Multiple turns without browser switching; close/reopen during a reply works |
| 4. Offers and delivery | Offer cards, confirmation, and acknowledged delivery feedback | Negotiate and accept one exact displayed offer; repeated clicks cause one transfer |
| 5. Brann activation | Script wiring and automatic connection on interaction | Normal interaction opens only Brann's panel; unrelated NPC interaction still works |
| 6. Packaging and regression | Reproducible package and focused gameplay record | Save/load, combat/range interruption, service failure, menu conflict, and input restoration checks pass |

Potential source changes:

- New `examples/skyrim/ui/` for editable ActionScript, layout assets, and build configuration; stage the resulting SWF under the mod's `Interface` directory.
- New `NWConversationUI.psc` for menu lifecycle/events and `NWBrannActor.psc` for activation of the custom actor.
- Extend `NWBridgeQuest.psc` to accept UI intent, drive the serialized transport while the menu is open, and publish typed state changes. Keep inventory application concentrated here.
- Extend `bridge.ts` and `local.ts` for the versioned native UI protocol. Keep the browser page available for development diagnostics and have both interfaces share command admission.
- Update `plugin-builder/Program.cs` to attach scripts/properties to Brann and the owning quest while preserving current form IDs and adding round-trip assertions.
- Update `build-mod.ps1` to compile all new scripts, build/copy the SWF, and package complete installable output.

Prepare and compile the complete package before installation. Quit Skyrim before replacing scripts, ESP, or UI assets. Use a disposable test save and retain the previous package for rollback.

## Release acceptance

The release is complete when the player can activate Brann, send two messages, negotiate an offer, review its exact total, confirm once, and see both the real inventory changes and their acknowledgement, entirely in Skyrim. Closing/reopening, loading a save, losing service mid-request, and repeated input must behave predictably. The browser is no longer required for play; local service startup remains required.

## Technical references

- [SKSE UI Papyrus API](https://github.com/ianpatt/skse64/blob/master/scripts/modified/UI.psc): custom menu, typed UI invocation, and text-input functions.
- [SKSE CustomMenu implementation](https://github.com/ianpatt/skse64/blob/master/skse64/CustomMenu.cpp): modal/pause behavior and cursor handling. Check the shipped build during the feasibility test; upstream source alone is not runtime validation.
- [SKSE UI implementation](https://github.com/ianpatt/skse64/blob/master/skse64/PapyrusUI.cpp): registration and UI invocation mechanics.
- Installed `Data/Scripts/Source/ObjectReference.psc`: `BlockActivation` preserves `OnActivate` events, allowing Brann-specific activation handling.
- Installed `SKSE_HTTP.psc`: typed dictionaries and arrays, fixed native reply/error event interface.
