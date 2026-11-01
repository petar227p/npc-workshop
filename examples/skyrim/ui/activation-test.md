# Task 5: Brann activation and automatic connection

Task 6 now packages this implementation with an allowlist and manifest; use [the current release record/checklist](release-test.md). The hashes and build record below describe the earlier task-five package. Its interaction checks remain applicable.

Activate Brann using Skyrim's configured Activate control to open the conversation. No key is hardcoded for this interaction. `NWBrannActor` is attached only to persistent `NWBrannRef` and blocks default dialogue while preserving engine `OnActivate` events. Player activation routes to `NWBridgeQuest`, which verifies the actor is its configured Brann reference and the activator is the player before opening the existing menu. Other actors and NPC-triggered activation cannot open it through this entry point.

Opening starts the existing serialized v2 connection automatically; F8 is not required. F9 remains a diagnostic shortcut to the same panel and F8 retains browser diagnostics. Repeated opening requests return while a menu is already requested. An existing foreign CustomMenu is left open with a short notification; other menus/text entry must be closed before opening. The existing range/combat checks, session reset, draft/history preservation and transfer acknowledgement path remain in the controller.

The reference script configures default-activation blocking on initialization/cell load. `BeginSession` also refreshes its controller link and blocking after save loading. Missing reference-script attachment produces a diagnostic notification and leaves F9 available. This recovery path does not establish that every pre-existing save will attach a newly added script; test that explicitly.

## Install and start

1. Quit Skyrim completely. Retain the prior package for rollback. The build preserves its ZIP under `examples/skyrim/dist/package-backups`.
2. Install **the entire** `examples/skyrim/dist/NPCWorkshopSkyrim.zip` through the existing profile, or extract its contents into Skyrim's **Data** directory. This task changes the ESP's reference script wiring. Install `NPCWorkshopSkyrim.esp`, `Scripts/NWBrannActor.pex`, `Scripts/NWBridgeQuest.pex`, `Scripts/NWPlayerAlias.pex` and the matching conversation SWF together. An old ESP plus new scripts cannot provide the activation link.
3. Keep the plugin enabled. Local IDs remain **000800** (NPC), **000801** (reference) and **000802** (quest); no new actor instance or native DLL is needed. Do not spawn a duplicate Brann.
4. Start the existing API and updated v2 bridge. The task-three/four v2 bridge already supports this package. If restarting it, reload a known disposable save to renew the session.
5. Launch through SKSE and load a disposable test save. Approach Brann outside Warmaidens, out of combat, target him and use your configured Activate control. The panel should open and reach Ready without F8 or F9.

## Gameplay acceptance — pending user verification

- **Normal interaction:** approach Brann immediately after loading, activate him and confirm only the custom conversation opens. No vanilla greeting/dialogue menu should take focus. Send two messages, negotiate, review the exact offer and confirm one purchase using [the offer checklist](offers-test.md). Delivery still requires real inventory changes and their matching acknowledgement.
- **Remapped control:** temporarily remap Activate through Skyrim's controls, close settings, and interact using that binding. Brann must open the same panel without requiring E. Restore your preferred binding afterward. Text entry remains keyboard/mouse; controller text entry is a separate follow-up.
- **Reference isolation:** activate unrelated NPCs, including Ulfberth/Adrianne, and use normal nearby objects. Their usual interactions should work and must not open Brann's panel. The builder checks that the NPC base is script-free and no additional NPC records are emitted; the gameplay result still needs verification.
- **Repeated activation and reopen:** press Activate repeatedly while opening. Expect one panel and one polling driver, not replacement or duplicate connection. Close with Esc/Close, then activate Brann again. Transcript, drafts, current offers and an outstanding reply/trade must resume without replaying a command. An unsubmitted confirmation requires a fresh review.
- **Save/load and cell reload:** load a known disposable save with the old package previously present and test activation. Leave/re-enter the cell and test again. Load another save: history/drafts should reset and activation should remain wired. If a missing-script notification appears or only F9 works, verify the complete ESP/scripts installation and record that save as an unverified migration; retest from a disposable save predating the mod. Do not reset quests or spawn duplicate actors as a workaround.
- **Menu ownership/input:** with another mod's CustomMenu open, attempts to open Brann's panel must leave it untouched. Attempted opening during another menu/text field must not steal focus. Esc must release text input and restore ordinary movement/interaction. Check that typing does not invoke Activate, F8, F9, console or purchase confirmation.
- **Eligibility and service:** combat/death/out-of-range conditions must not admit interaction and must close an already open conversation under the existing lifecycle rules. With the bridge unavailable, activation may open the panel but must show the existing failure/recovery behavior without silently retrying a mutation. Closing must remain available.

These are runtime acceptance checks, not reported passes. The open-menu checked transfer/acknowledgement gate from milestone 1 and task 6 regression remain outstanding.

## Build and verification

Build the ESP with the updated `plugin-builder` as described in the main Skyrim README, then package using `build-mod.ps1` with `-Plugin` pointing to that new ESP. The builder now emits `NWBrannActor.Bridge` on the placed reference and parses its bytes back to validate the complete reference/quest link. It still asserts exactly five records, one Skyrim.esm master, unchanged starter inventory, an unscripted NPC base, and unchanged local IDs. All three project Papyrus scripts are compiled by the packaging command.

On 2026-11-01:

- Plugin-builder compilation passed with zero errors/warnings. Two independent ESP builds matched byte-for-byte and both passed the round-trip assertions.
- All three Papyrus scripts compiled with zero errors/warnings; the pinned Flash 8 SWF build passed.
- The existing focused Skyrim regression suite passed **45 tests** and adapter TypeScript typechecking passed. These test the adapter/UI/ledger behavior; they do not execute `OnActivate` in Skyrim.
- ZIP integrity and packaged source, compiled activation entry points, ESP, scripts, SWF and face assets matched the build outputs. The previous package was retained for rollback.

ESP SHA-256: `e9a1c1c6ef1a08e5be0cc7c3f4a8c0b580060d1739dd4e776500f592577b38a1`.

ZIP SHA-256: `1edaf7617d8951c4b5b8a3cc539c703b225b2a01c18ebc2df44d210799422f35`.

No game files were installed and no saves were loaded or changed during task 5 implementation. Task 5 is prepared for gameplay verification; the release is not yet runtime-validated.
