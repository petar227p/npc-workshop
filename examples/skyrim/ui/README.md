# Milestone 1: CustomMenu feasibility experiment

**Current package:** task 6 adds verified packaging and an automated regression record to the task-five conversation/activation build. Use [the current release installation and gameplay checklist](release-test.md). F9 remains a diagnostic fallback. The probe instructions below are historical; explicitly pass `--source examples/skyrim/ui/ConversationProbe.as` and a probe `--output` path to build that old diagnostic asset. The probe is excluded from the release ZIP.

**Build and adapter verification passed; basic menu behavior is user-verified.** The user observed advancing callbacks with `nested arrays=true`, then confirmed the echo/input and close/reopen checks worked. Open-menu trade/acknowledgement and the remaining interruption/conflict checks are still pending. This is an HTTP echo probe, not the finished conversation interface. It adds no native DLL. The user authorized milestone 2 backend work; the remaining runtime gate on Skyrim **1.7.104.0 / SKSE 2.3.1** remains required before declaring full UI feasibility.

F8 retains the browser bridge. **F9**, near Brann and out of combat, opens `Interface/NPCWorkshop/ConversationProbe.swf` using `UI.OpenCustomMenu`. The probe contains a 500-character input, Send, status, response text, and Close. Enter sends a diagnostic echo; Shift+Enter inserts a line; Esc releases text capture and requests native menu closure without waiting for Papyrus. Normal explicit closure preserves the draft in the same loaded session. Save loading resets it.

The probe emits a validated, token/generation-bound Papyrus event. The quest includes that text in its next serialized `/skyrim/spike/poll` request. This diagnostic endpoint wraps the existing poll and returns typed echo, nested dictionary, string-array, and dictionary-array fixtures. It does **not** admit `say` or `accept` commands; use the existing browser for those during this experiment. The eventual `/skyrim/v2/poll` protocol is milestone 2.

The quest's `WaitMenuMode` loop is an experiment in paused-menu scheduling. It shares the existing in-flight guard, which remains held through callback processing and inventory application. Closing retires the driver and resumes ordinary scheduling; a matching late session reply can still complete a checked transfer, but cannot reopen or update a retired menu. Errors latch recovery until save loading. No timed mutation retry is added.

## Build

Python 3 and Windows are required. The compiler is **MTASC 1.14**, obtained from the [FlashDevelop source tree at commit 436add6](https://github.com/fdorg/flashdevelop/tree/436add6fc71f41358b460c4d8e17da85f4b6b2af/FlashDevelop/Bin/Debug/Tools/mtasc). `toolchain.json` pins the archive URL, archive SHA-256, and every extracted compiler input, including standard-library sources. No executable or downloaded library is committed. Build outputs and downloads remain under ignored `examples/skyrim/dist/`.

From the repository root:

```powershell
# First build: fetch and verify the pinned compiler. Later builds can omit --bootstrap.
python examples/skyrim/ui/build.py --bootstrap

# Build the full package with the existing generated ESP and your extracted source paths.
& ./examples/skyrim/build-mod.ps1 `
  -GamePath 'C:/Program Files (x86)/Steam/steamapps/common/Skyrim Special Edition' `
  -SkseSources 'C:/Program Files (x86)/Steam/steamapps/common/Skyrim Special Edition/Data/Scripts/Source' `
  -HttpSources './examples/skyrim/dist/dependencies/http-beta9/Source/Scripts' `
  -GameSources './examples/skyrim/dist/dependencies/base-sources' `
  -Plugin './examples/skyrim/dist/NPCWorkshopSkyrim/NPCWorkshopSkyrim.esp'
```

`-BootstrapUiCompiler` on `build-mod.ps1` also enables bootstrap. `-CompileOnly` still compiles only Papyrus. Full packaging builds the SWF and includes it under `Interface/NPCWorkshop`, along with the existing ESP, scripts, sources, and face assets. Existing zip packages are retained under `dist/package-backups/` before rebuilding. The builder does not install files, change ESP records, or launch Skyrim. The menu is drawn directly in editable ActionScript; there are no external layout assets or hand-edited binary inputs.

For reproducibility, build twice with separate `--output` paths and compare SHA-256. The build verifies a Flash 8 header. Compiler success does not establish native rendering, fonts, input isolation, or callback scheduling.

## Runtime test procedure — remaining checks

Quit Skyrim before installing the complete staged package. Retain the currently installed package/scripts for rollback. Restart the local bridge with this source so the probe route exists (`npm run skyrim`, as in the adapter README), then launch through SKSE and load a disposable test save. Do not overwrite a valuable save during the experiment. Existing ESP records/form IDs are unchanged.

| Check | Procedure and required evidence | Result |
|---|---|---|
| Open/render | Near Brann, press F9. Check readable fonts, cursor, focus, status and text field. Status must progress beyond initialization. | Pending |
| Type/send/receive | Type `He said "hello"`, add a Shift+Enter newline, then `čćžšđ`. Send once. The exact text must appear as plain text, with an increasing `HTTP callback` number and `nested arrays=True`. Test 500 characters, whitespace-only input, and rapid Enter/clicks. | Pending |
| Input isolation | While focused and while Send is pending, test movement, F8, Activate, the console key, Enter and Shift+Enter. None may trigger gameplay, console, or trade acceptance. Confirm any font limitations with the non-ASCII sample. | Pending |
| Paused transport | Keep the menu open for at least ten seconds. Correlated callback numbers must keep advancing without unpausing. `[NWSpike]` trace lines record session, request, generation and nested-array success when Papyrus logging is enabled; player text is not logged. | User verified advancing callbacks and nested arrays |
| Close/reopen | Esc and Close must work both ready and pending. Check movement/input restoration, preserved draft, and advancing callbacks after reopening. Rapidly reopen ten times; there must be one active driver and no overlapping requests. | User confirmed basic close/reopen; stress/pending cases remain pending |
| Menu conflict/replacement | With another mod's `CustomMenu` open, invoke `OpenProbeMenu()` diagnostically; it must decline without replacement. Replace the probe with another custom menu; our driver must retire without closing the other mod's instance. F9 itself is intentionally ignored while any menu is open. | Pending |
| Save load | Close, load another disposable save, then reopen. Draft/session must reset, the previous driver must stop, and late old-session replies must not affect the new session or inventory. Also test load interruption via the game's available load flow while the probe is active. | Pending |
| Checked trade and ack | In the browser, request/negotiate a single dagger and note its exact price and all four counts. Open the probe. From the browser, explicitly accept that displayed offer while leaving the probe open in Skyrim. The checked transfer must apply once; the following native poll must display `Skyrim confirmed the gold and item transfer.` The browser must show the same acknowledgement and no pending transfer. Verify actual player/Brann counts after closing. | Pending |
| Close during transfer | Repeat on a disposable save and close just after acceptance. The existing completion/ack path must continue; reopening must not repeat the acceptance or transfer. | Pending |
| Failure/interruption | Stop the local bridge during a pending request. Esc must still restore input, and reopening must show recovery rather than resubmit. Reload to reconnect. Check out-of-range/combat/death closure wherever the paused runtime permits state changes. | Pending |

**Decision:** retain Scaleform/Papyrus only if the complete open-menu callback, checked transfer and acknowledgement pass. A failed `WaitMenuMode` or callback test leaves milestone 1 incomplete. The runtime-specific native menu-plugin fallback requires a separate implementation and loader test; it is not silently installed by this spike.

## Automated verification

```powershell
npx vitest run examples/skyrim/bridge.test.ts examples/skyrim/spike.test.ts
npx tsc -p examples/skyrim
```

These exercise the real API/ledger with a scripted model, exact Unicode echo, strict probe validation, route isolation, redacted packets, session retirement, and checked transfer/ack behavior across menu generations. They do not execute Papyrus or the SWF in Skyrim.

Verification recorded on 2026-11-01:

- Adapter/probe tests: **17 passed**; Skyrim TypeScript project typecheck passed.
- `NWBridgeQuest` and `NWPlayerAlias`: compiled with **zero errors, zero warnings** using the installed Creation Kit compiler.
- Clean bootstrap from the pinned cached archive into a separate compiler directory and independent SWF build matched SHA-256 **`9ca620f44b20df63f7cdc9c1173e3bea0b709d60b44b1acae9d1a9acaea70f55`**.
- Complete zip contents checked, including the current compiled scripts, exact current Papyrus source, SWF, existing ESP and face assets. No game files were installed or game saves loaded during this spike.

References: the installed SKSE 2.3.1 source archive's `CustomMenu.cpp` confirms modal/pause flags; `Hooks_Scaleform.cpp` registers the UI functions on `_global.skse`. The installed `UI.psc` and `SKSE_HTTP.psc` define the typed invocation/accessor interfaces used here. Upstream equivalents: [CustomMenu](https://github.com/ianpatt/skse64/blob/master/skse64/CustomMenu.cpp), [Scaleform hooks](https://github.com/ianpatt/skse64/blob/master/skse64/Hooks_Scaleform.cpp), [UI API](https://github.com/ianpatt/skse64/blob/master/scripts/modified/UI.psc).
