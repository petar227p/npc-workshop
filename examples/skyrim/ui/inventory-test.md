# Conversation styling and actual Skyrim inventory

The conversation uses the game's `$EverywhereFont`, pale text, translucent black panels, fine silver dividers, diamond ornaments and restrained hover controls. The world remains visible behind the conversation. Inventory opens a matching full-screen list, with eight base-item rows per page, quantities, base weights/values, Brann's gold and Refresh.

## Install

With Skyrim closed, install the entire rebuilt `examples/skyrim/dist/NPCWorkshopSkyrim.zip` into the existing mod profile. Keep the ESP enabled. Both the conversation SWF and `NWBridgeQuest.pex` changed, so copying only the SWF leaves the inventory button without its native handler. Reload a disposable test save to register the inventory event. Start the usual API/bridge for conversation and trading, then activate Brann near Warmaidens. The inventory snapshot itself is read directly from Skyrim, without a model or HTTP inventory endpoint.

## Gameplay checks

These checks are pending; automated tests and compilation do not render Scaleform or execute game inventory functions.

| Check | Expected result |
|---|---|
| Conversation appearance | Readable white text and translucent panels at the usual resolution; title, offers, composer and bottom hints do not overlap. Hover highlights choices. World remains visible. |
| Actual inventory | Select Inventory. Confirm names, quantities and gold against Brann in a disposable save. Items beyond the ledger's dagger/gold mapping appear, including any carried armor or other weapons. No Take/Equip/Buy operation occurs. |
| Multiple pages | Give Brann more than eight different base items using your existing test setup, reopen or Refresh, and navigate all pages. No list is silently capped at eight total items. Empty inventories display an empty-page message. |
| External changes | Close the view, change Brann's carried items in the test setup, and reopen. Refresh/page requests read current counts from the game. Enchanted/improved copies share a base-form row; individual instance metadata is not shown. |
| Chat preservation | Type a draft, inspect items, then press Esc/Back. The draft remains and input focus returns when chat is ready. Enter inside inventory sends no chat and accepts no offer. A second Esc exits conversation and releases game input. |
| Trade exclusion | Inspection during a pending submission/confirmation is refused. If a native update is in flight, the view shows an unavailable message and Refresh hint. After an acknowledged purchase, inventory shows the new actual gold/item counts. |
| Late callbacks | Rapidly open/back/reopen; an old response must not populate the new request. Close the conversation during a read and reopen; no old menu is restored and normal polling continues. |

Inspection stays read-only; purchases use the separate checked offer flow. Weight and value describe one base item, not total stack weight or a negotiated price. The list represents the last successful refresh, rather than a continuously updating inventory.

## Automated verification

The actual ActionScript-method harness covers inventory requests, arbitrary plain-text item names, row fields, page bounds, duplicate clicks, stale callbacks, busy failures, draft preservation, modal input and command isolation. Existing chat, offer and real-ledger transfer tests remain in the Skyrim suite. The installed Papyrus compiler validates all three scripts, and pinned MTASC compiles the Flash 8 SWF. Packaging verifies source snapshots, runtime file hashes and the existing 15-file allowlist.

Historical UI-only build, recorded on 2026-11-01: **591 repository tests passed**, including **54 Skyrim tests** (19 SWF-method tests); all repository typechecks and **six Python packaging tests passed**. All three Papyrus scripts compiled with zero errors/warnings, and the Flash 8 SWF compiled successfully. Conversation/inventory source-layout previews were visually checked with substitute fonts and sample data; this does not verify Skyrim rendering. That 15-file ZIP passed archive/manifest verification, with SHA-256 `c67bdca8d539f142989cb2b780e50cb35b1fd5719531fd234d49314057d55f43`.

No game installation, service restart, save change or gameplay acceptance is claimed for this change.

## Model awareness connection

Install the rebuilt ZIP, restart **both API and bridge** from this checkout, and reload a disposable save. Ask Brann what else he carries and compare his answer with Inventory. Change an item in your test setup, then ask again: the next reply must use new counts and omit removed items from its current facts. Test queued browser chat too. Eligible unequipped clothing and other stock can now be negotiated and purchased; equipped gear is protected. For more than 128 base forms, the model is told the snapshot is partial; the local list still reaches all pages. Save loading during enumeration must retire the old snapshot without submitting a new session's queued command.

Automated connection tests inspect actual model requests through the real adapter/API. They cover arbitrary items, updates/removals, missing observations, browser queue resumption, empty/partial lists, quoted modded names, save isolation, unmapped sale rejection, schema failures and native/API payloads above the old 16 KiB limit. These tests use a scripted model. Native enumeration performance and model awareness in Skyrim remain unverified.

Final connection build, 2026-11-01: **599 tests passed in 51 files**, including **62 Skyrim tests** (eight model-inventory integration tests and 19 SWF-method tests). Repository typechecks and six Python packaging tests passed. All three Papyrus scripts compiled with zero errors/warnings, and pinned MTASC rebuilt the Flash 8 SWF. The verified 15-file package has SHA-256 `e036003b7084f9b774ce2690e4fac2fd14a0f663bfb95effe1a6fbc8a5f9df99`. Source lives on `codex/skyrim-inventory-awareness` in the separate checkout. The current ZIP and its matching API/bridge code must be used together. No game files, saves or running services were changed.


## Purchases beyond daggers

The adapter derives a sale catalogue from the current native snapshot's `saleable` flags and `player_count` fields. It updates the authenticated API catalogue before an action, then synchronizes both actors' actual stock. Each non-dagger good is identified by its runtime base-form ID, with duplicate display names disambiguated by that ID. The model receives the updated offer schema; owning an eligible item is not a reason to refuse its sale. Protected/unobserved goods cannot enter the catalogue. The first 128 catalogue entries include the legacy dagger entry.

Ask to buy an eligible carried item, negotiate, review its name/quantity/total, and confirm. Skyrim checks actual counts and eligibility again, transfers the actual form to the player, then charges gold only if the full item quantity moved. It acknowledges the exact form and both after-counts before Trade complete. Changed or missing counts stop the session; duplicate packets do not reapply the transfer. Equipped items (including equipped daggers), gold, non-playable forms, keys and VendorNoSale forms are excluded. Some quest-protected forms cannot be distinguished from ordinary base forms during listing; if the engine refuses removal, gold is not charged and recovery is required. Enchanted/improved instances are moved by the engine, but their individual metadata is not represented in pricing; the minimum uses base value, at least one gold, with the existing ten-gold dagger floor.

Gameplay acceptance remains pending. Test a non-dagger purchase, insufficient funds, removed/equipped stock, repeated confirmation, actual item/gold counts and close/reopen on a disposable save. Five real-API/ledger purchase tests cover these protocol cases with a scripted model and emulated game acknowledgement. The final suite has 604 passing tests. Native transfer/eligibility checks compile with zero errors/warnings; execution in Skyrim is still to be checked by the user.
