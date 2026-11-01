# Skyrim: Brann at Warmaidens (Windows, text first)

This is the first Skyrim adapter implementation. The local text page sends conversations and explicit offer acceptance through the existing `/api/v1` world API. Papyrus applies checked stock sales to the actual player and Brann inventories. The scope is one new blacksmith, plain vanilla iron daggers, gold, negotiation and refusals. No voice, crafting timers, generated weapon stats, engine commands from dialogue, or vanilla merchant replacement.

**Status: adapter tested; scripts and ESP built and installed; HTTP DLL load confirmed.** The in-game HTTP round trip, actor placement, real trade and save/load checklist still need verification. Later records below supersede earlier missing-tool statements; those are retained as inspection history.

## Current first-play steps

**F8/browser pause fix:** The first in-game attempt did reach the native HTTP endpoint and create a world seeded with the player's observed 97 gold, with Brann visible at the forge. This proves a native request reached the server, but ongoing replies, dialogue and trades are not yet verified. Diagnosing the report of no visible F8 effect also exposed an input-console view and paused/stale polling. Close Skyrim's console/menus and resume gameplay before expecting updates. F8 starts the connection; it does not open a browser or vanilla dialogue menu, and E has no custom dialogue in this build.

The browser previously disabled messages after five seconds without game polls, which made typing while Skyrim was in the background impractical. That freshness gate was removed from both UI and queue admission. A paused-game message now remains queued until a native poll validates the current session, proximity and inventory; changed-save and out-of-range cancellation still apply. The page explains that returning to Skyrim resumes work. New sessions also receive a notification pointing to the text page. The live chat bridge was restarted with this fix, discarding the idle pre-dialogue world; no trade was pending. Targeted verification now passes **11 tests**, including paused-game queue/resume against the actual API and ledger, and adapter typechecking passes.

The demo ESP is enabled in this PC's `Plugins.txt`; its previous contents were backed up in ignored build outputs. The API and text bridge were started locally and Skyrim was launched to the main menu through SKSE. No save was loaded or overwritten during that launch.

1. Load a disposable test save and go outside **Warmaidens in Whiterun**. Look for **Brann** beside the forge. His initial placement is 200 units along the X axis from the vanilla outdoor forge reference; exact navmesh/appearance still need a visual check.
2. Stand close to Brann, out of combat, and press **F8**.
3. Open [the text page](http://127.0.0.1:8788). It should show **Connected** once the native Papyrus HTTP round trip succeeds. Type a request there, then return to Skyrim so polling resumes. The initial ledger inventory should reflect your loaded save.
4. Negotiate a dagger, explicitly accept a checked offer, return to Skyrim and verify the item/gold changes and transfer acknowledgement. Follow the full verification checklist below before using a valuable save.

If Brann is absent, do not spawn another copy. Check whether `NPCWorkshopSkyrim.esp` is enabled. For diagnosis, Skyrim console `help NWIntegrationQuest 4` / `sqv NWIntegrationQuest` can verify the quest; `startquest NWIntegrationQuest` starts it if it did not start automatically. These console commands have not been executed here. On this keyboard, automated console-toggle input did not open the console, so the in-game test was left at the main menu for user interaction.

## Reproducible ESP build (does not require Creation Kit)

Creation Kit opened after first-run registration/extraction but stalled for several minutes during vanilla reference initialization. We switched to [Mutagen](https://mutagen-modding.github.io/Mutagen/), a Bethesda plugin authoring library. The checked-in `plugin-builder` project pins `Mutagen.Bethesda.Skyrim` **0.53.0** and targets installed .NET 9.

```powershell
dotnet run --project .\examples\skyrim\plugin-builder -- --build `
  'C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition\Data\Skyrim.esm' `
  .\examples\skyrim\dist\NPCWorkshopSkyrim
```

The builder writes only project output. It derives a new actor from the installed Ulfberth appearance and outfit, removes merchant identity/factions, scripts, packages and inventory, sets Essential/Unique without Respawn, then supplies six plain iron daggers and 50 gold. Brann stands at his station; sandbox schedules and bespoke appearance are later work. His face mesh and tint are copied from this PC's vanilla BSA archives to the new plugin's face paths. These Bethesda assets and the generated ESP stay in ignored `dist` outputs; do not commit or publish the assets from this local build.

Fixed local IDs are **000800** (NWBrann), **000801** (NWBrannRef), **000802** (NWIntegrationQuest). Placement is derived from outdoor forge reference **0C430A:Skyrim.esm** in WhiterunWorld. The persistent reference is connected to the quest's `Brann` property; a forced PlayerRef alias carries `NWPlayerAlias` for save-load session renewal.

The emitted ESP is parsed back from disk. Automated assertions check exactly five records (new NPC/reference/quest plus the enclosing Whiterun world/persistent-cell overrides), one Skyrim.esm master, correct starter inventory, no inherited merchant factions/packages/script, correct quest property, and the player alias script/reference. No vanilla NPC record is overridden. Record round-trip validation does not prove game startup, placement, animation, FaceGen rendering or native HTTP behavior.

The generated ESP and both face assets were installed after checking Skyrim was closed; differing existing outputs were not overwritten. `Data\Scripts` contains the compiled demo scripts. Source and binary hashes were verified during dependency/script installation. The local server logs are in ignored `logs\skyrim-api.*.log` and `logs\skyrim-bridge.*.log`.

Final build verification: the two independent ESP builds had SHA-256 `305e03c0e0cd5d55ee8b2be06e9f15034dd8dfd5e8828bbb7d2cdd741bb46c49`. The final packaging command recompiled both Papyrus scripts with zero errors/warnings and produced `dist\NPCWorkshopSkyrim.zip`. The prior user plugin-list backup is kept separately under `dist\installation-backup`, excluded from the mod package. This package is already installed on this PC; it is not necessary to reinstall it before the first game test. No game save was loaded or overwritten in this verification run.

To package after building the ESP, use `build-mod.ps1` below with `-Plugin` set to the generated ESP and the extracted source directories. The alternative Creation Kit instructions below remain useful for manual editing; the generated plugin replaces the need to author those records manually.

## Follow-up after installing SKSE and Creation Kit

**Native load verified:** The fresh `skse64.log` from 2026-11-01 16:47 records `plugin SKSE_HTTP.dll (00000001 SKSE_HTTP 00000010) loaded correctly (handle 1)` on runtime 1.7.104.0 with SKSE 2.3.1. The user reached the main menu without visible errors. This establishes DLL loading, not a completed Papyrus HTTP round trip. Creation Kit authoring was then started from its game directory; first launch requests administrator elevation to register the flowchart control. That security permission prompt requires the user's interaction before editor setup can continue.

**Creation Kit initialization:** The user completed first-run elevation; bundled script extraction finished and the visible 64-bit editor opened. The compiled `NWBridgeQuest.pex` / `NWPlayerAlias.pex` and their `.psc` sources were installed without replacing differing existing scripts. During read-only loading of `Skyrim.esm`, Creation Kit stopped at a vanilla reference initialization warning: `AutoLoadDoor01` (`00015E1D`), `YngolBarrowExterior` (`0000B452`), whose teleport marker is too close to the linked door. No NPC/quest/plugin record has been edited or saved. Continuation past the warning is awaiting user approval under the computer-use confirmation policy; the full warning remains in the game's `EditorWarnings.txt`.

**Latest installation update:** The user's Address Library archive was extracted to the game-root `SKSE\Plugins` folder. Verified the database header is format 5 for runtime 1.7.104.0, then copied `versionlib-1-7-104-0.bin` to the required `Data\SKSE\Plugins` location. Also installed the staged community `SKSE_HTTP.dll` there and the upstream `SKSE_HTTP.pex` under `Data\Scripts`. All three installed files match their source SHA-256 hashes; no differing existing file was overwritten and the original misplaced directory was preserved. The approved installation succeeded. A fresh SKSE launch/plugin log and native HTTP smoke test are still required; this supersedes the missing-dependency statements in the earlier follow-up below. The `.esp` remains unbuilt.

Verified on this PC on 2026-11-01:

- Runtime remains **1.7.104.0**. SKSE loader is **2.3.1**; `skse64.log` confirms initialization and `GetSKSEVersion_Execute` during a successful game launch. Creation Kit is **1.7.99.0**, with its Papyrus compiler installed.
- Extracted Creation Kit's `Data\Scripts.zip` into ignored project build dependencies. Installed SKSE source overrides are at `Data\Scripts\Source`.
- Compiled `NWBridgeQuest.pex` and `NWPlayerAlias.pex` with the installed compiler: **both succeeded, zero errors, zero warnings**. Outputs are in `dist\NPCWorkshopSkyrim\Scripts`. Sandbox assembly loading was denied; the approved compilation outside the sandbox succeeded. No game files were changed.
- Static PE inspection confirms the original HTTP beta9 DLL trips SKSE 2.3.1's old-build Address Library V5 recompilation gate. The check uses the installed `src\skse64-2.3.1.tar.gz` headers/loader source, its exported metadata and PE timestamp. It does not execute the DLL. Reproduce with `python examples/skyrim/inspect-http.py <DLL>`.
- Found the [community Mantella-AE104 rebuild](https://github.com/aviallon-mods/Mantella-AE104/releases/tag/v1.7.104), commit `47a9649`, which rebuilds Leidtier's HTTP plugin with newer CommonLib. The downloaded archive matches the published SHA-256 `03f33e859a149e339fac88c159a2b41cfc02b6bee2e2bb78bc9d55281ba0bc7e`. The candidate HTTP DLL SHA-256 is `0bfd36c5899d5b9f14d7fb5aaf2ee4bf67107b33c716827cec750e30f7bd93a7`. It is staged at `dist\dependencies\http-ae104\SKSE\Plugins\SKSE_HTTP.dll`, not installed. Only the HTTP DLL is relevant; the other Mantella plugins are not needed.
- This rebuild has a newer PE timestamp and does not trip that old-build gate. The V5 metadata flag alone is **not** a sufficient compatibility test: the current SKSE loader has a build-date exception, and both inspected DLLs omit that flag. The publisher's build provenance supports trying the rebuild; actual compatibility remains unverified until plugin load and HTTP smoke tests pass here.
- **Next missing prerequisite:** [Address Library All in One (1.7.104.0) v13](https://www.nexusmods.com/skyrimspecialedition/mods/32444?tab=files). The required installed file is `Data\SKSE\Plugins\versionlib-1-7-104-0.bin`, currently absent. Download the **main file**, not the mod-author offsets text. Nexus download/login may require the user's browser session. Once downloaded, stage/install that database, then the candidate HTTP DLL and matching upstream Papyrus interface, before the native smoke test. No complete Mantella installation is needed for our adapter.

Reproduce script compilation without an ESP:

```powershell
powershell -NoProfile -File .\examples\skyrim\build-mod.ps1 `
  -GamePath 'C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition' `
  -SkseSources 'C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition\Data\Scripts\Source' `
  -HttpSources .\examples\skyrim\dist\dependencies\http-beta9\Source\Scripts `
  -GameSources .\examples\skyrim\dist\dependencies\creation-kit-sources\Source\Scripts `
  -CompileOnly
```

The installed compiler requires access to its .NET assemblies; run normally outside a restrictive sandbox. The `.esp` records, native plugin load, actual transfers and save/load journey still need implementation/verification in Creation Kit and Skyrim. Compiled scripts alone do not place Brann or start his quest.

## Inspection and compatibility (2026-11-01)

Read-only inspection found:

| Component | Observed result |
| --- | --- |
| Storefront/edition | Steam app 489830, Skyrim Special Edition |
| Directory | `C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition` |
| Executable | `SkyrimSE.exe`, file/product version `1.7.104.0` |
| Steam installed build | `24914197`, manifest state 4 (installed) |
| SKSE loader | Absent in game root |
| HTTP plugin | `Data\SKSE\Plugins` absent |
| Creation Kit/compiler | Absent in game root |
| Vortex/MO2 | Not found in checked standard install/profile paths; portable installations elsewhere remain possible |
| Native build tools | `cl`, `cmake`, `7z` absent from PATH; not proof that none are installed |
| Item mapping | Read local `Skyrim.esm` WEAP record: `IronDagger` is `0x0001397E` |

Repeat inspection from the repository root:

```powershell
powershell -NoProfile -File .\examples\skyrim\inspect.ps1
# Optional nonstandard installation:
powershell -NoProfile -File .\examples\skyrim\inspect.ps1 -GamePath 'D:\Games\Skyrim Special Edition'
```

The [official SKSE site](https://skse.silverlock.org/) currently lists **SKSE 2.3.1 for Steam runtime 1.7.104**. Match the executable, not the store's SE/AE marketing label. That site also distinguishes GOG/VR/older runtimes and says Epic and Game Pass are unsupported. Do not install a 1.6.1170 build on this 1.7.104 installation.

[Leidtier/SKSE_HTTP releases](https://github.com/Leidtier/SKSE_HTTP/releases) list **v0.1.0-beta9**, dated 2025-01-09, commit `8da249b`, asset `SKSE_HTTP_v0.1.0-beta9.zip`. Its [build configuration](https://github.com/Leidtier/SKSE_HTTP/blob/8da249b/CMakeLists.txt) uses CommonLibSSE; [dependencies](https://github.com/Leidtier/SKSE_HTTP/blob/8da249b/vcpkg.json) name CommonLibSSE-NG. The release predates 1.7.104 and supplies no explicit compatibility statement for it. **No compatible HTTP build has been verified.** Neither a CommonLib dependency nor successful compilation establishes runtime support. Check the selected DLL's runtime requirements and any required Address Library build for this exact executable; an old AE Address Library is not sufficient evidence. A rebuild against libraries supporting 1.7.104 may be necessary. No DLLs were downloaded or installed and no game downgrade was performed.

The bridge follows the upstream [Papyrus interface](https://github.com/Leidtier/SKSE_HTTP/blob/8da249b/Source/Scripts/SKSE_HTTP.psc) and [native implementation](https://github.com/Leidtier/SKSE_HTTP/blob/8da249b/plugin.cpp): typed dictionaries, localhost POST, fixed Basic auth, lowercase keys/route, integer ModEvent reply handles and HTTP **200** success handling. A separate loopback adapter is necessary because this interface cannot attach our world bearer header. The native `timeout` parameter sets connection timeout, not a complete request deadline; a stalled request can require restarting the game. `clearAllDictionaries` is global to the plugin. This mod deliberately does not call it and invalidate other consumers' handles; dictionary retention is an upstream limitation, so keep demo sessions short. Test in an isolated profile: error broadcasts lack request correlation and a foreign consumer's error can stop this demo conservatively.

## Native prerequisite gate

1. Use a dedicated mod-manager profile and a disposable manual save in Whiterun. Record the runtime before changing tools. Install the exact matching SKSE from its official source, including its script sources for compilation. Launch once through `skse64_loader.exe` and check the console `getskseversion` and SKSE logs. This has **not** been done here.
2. Obtain an HTTP build with evidence of support for **1.7.104** (or build and validate one with an appropriate updated toolchain). Install its `SKSE_HTTP.dll` and matching `SKSE_HTTP.pex`; retain `SKSE_HTTP.psc` for compilation. Satisfy the selected DLL's documented dependencies. Check SKSE logs for a successful plugin load. Do not treat beta9 as verified for this runtime.
3. Install the Steam Skyrim Special Edition Creation Kit and extract its base Papyrus source archive to `Data\Source\Scripts` (or pass another source directory to the build command). The compiler, base scripts, SKSE scripts including `ModEvent.psc`, and HTTP `.psc` are all needed. The build script reports missing inputs instead of installing tools or editing the game directory.
4. Follow the next section to build the mod. With the servers running, enter the demo save and press F8 near Brann. The page must show **Connected** after a correlated native JSON reply. This is the HTTP smoke test; DLL load alone is insufficient.

## Create the tiny plugin in Creation Kit

These are manual authoring steps, **not steps already completed on this PC**. No proprietary game records are distributed here.

1. Load `Skyrim.esm`; save a new regular plugin **`NPCWorkshopSkyrim.esp`**. Do not modify vanilla actor records.
2. Create a new Actor record, EditorID **`NWBrann`**, name **Brann**, male Nord, with a working vanilla appearance/voice type. Assign an outfit and appropriate blacksmith animation/sandbox behavior. Mark Essential, Unique and not Respawn. Leave factions, merchant containers, scripts and dialogue empty; this demo uses its own text page. Put **6 plain IronDagger** and **50 Gold001** in his inventory. Do not duplicate a vanilla merchant's faction/vendor configuration or attach a merchant chest.
3. Place this actor outdoors beside Warmaidens in **WhiterunWorld**, on the navmesh with room to stand. Give the placed reference EditorID **`NWBrannRef`** and mark it **Persistent Reference**. Verify the location visually; this adapter's bundled engine `forge` location is symbolic and does not move actors in Skyrim.
4. Create Quest **`NWIntegrationQuest`**, Start Game Enabled, not Run Once, priority 10, no dialogue/stages required. Attach `NWBridgeQuest` from `mod\Source\Scripts`. Set its **Brann** Actor property to the placed `NWBrannRef`, not the actor base.
5. Add a quest Reference Alias **Player**, forced reference `PlayerRef` (`00000014`), and attach `NWPlayerAlias`. This alias receives `OnPlayerLoadGame` and renews the connection session after each load. If the editor requires compilation before attaching scripts, compile them using the command below with a preliminary saved plugin, then attach/set properties and rebuild after saving the final plugin.
6. Compile both scripts and save the plugin. Confirm that the quest VMAD contains the quest script/property and alias script. Use a new test save; if quest startup needs diagnosis, use `startquest NWIntegrationQuest` and `sqv NWIntegrationQuest`. Start-enabled quest behavior and alias load events must be verified in game.

Build/package without writing to the installed game:

```powershell
powershell -NoProfile -File .\examples\skyrim\build-mod.ps1 `
  -GamePath 'C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition' `
  -Plugin 'C:\your-mod-work\NPCWorkshopSkyrim.esp' `
  -SkseSources 'C:\your-mod-work\skse\Data\Scripts\Source' `
  -HttpSources 'C:\your-mod-work\SKSE_HTTP\Source\Scripts'
```

Adjust the two source directories to the extracted archives. The compiler flags file must be `TESV_Papyrus_Flags.flg` in the base source directory; use `-GameSources` if needed. The script fails on compile errors and creates ignored `examples\skyrim\dist\NPCWorkshopSkyrim.zip`. Install that archive with your mod manager and enable the ESP. SKSE and HTTP dependencies are separate. Package creation does not validate plugin records or native compatibility.

## Run the servers and play

From the repository root, after normal `npm install` and `.env` setup:

```powershell
# Terminal 1: existing server (reads provider keys from .env)
npm run dev --workspace server
# Terminal 2: local Skyrim adapter, no provider keys or world token needed here
npm run skyrim
```

Open [the text page](http://127.0.0.1:8788). Live replies use Brann's configured Muse Spark provider and need `MODEL_API_KEY` on the main server. Missing keys produce explicitly labelled unavailable outcomes, not evidence of model success. Start Skyrim using SKSE, load the disposable save, stand within 400 game units of Brann, out of combat, and press **F8**. Type on the page, then return to Skyrim so its Papyrus polling resumes. Background Skyrim may pause; no INI change is required. Ask for a dagger, negotiate, then click **Accept** on a checked offer. Return to Skyrim for the transfer and confirmation. Speech also appears as a short game notification; the page retains the recent dialogue and offers. There is no new vanilla dialogue menu or voice.

Brann's minimum is 10 gold **per dagger**, and prices on offer cards are for the whole lot. The ledger checks quantities, price floors, contract status and funds again at acceptance. The model never chooses form IDs. Plain vanilla IronDagger behavior/stats come from Skyrim. Do not put enchanted/tempered variants in Brann's inventory; this first demo maps base-form counts only and cannot distinguish instance metadata.

## Ownership, deduplication and saves

`Skyrim -> SKSE_HTTP -> 127.0.0.1:8788 -> existing /api/v1 -> authoritative ledger`.

- Each load creates a random Papyrus session. A new API world is seeded from the loaded player's and Brann's actual gold/dagger counts. Conversation, old offers and unapplied ledger plans are discarded. This is explicit reset-on-load semantics, **not durable dialogue/world restoration**. No persistent cursor is claimed. An adapter/API restart also loses runtime progress; reload a known save before resuming. Old API worlds remain subject to the existing server quotas/eviction; repeated loads can reach world-creation limits.
- Before each queued action, `/sync` logs Skyrim's external inventory changes for both actors. No sync runs over a pending transfer. The UI is bound to the active load session; stale UI submissions and late retired sessions are rejected. A player leaving Brann cancels a queued action. Combat/death/distance are checked again by Papyrus before transfer.
- A checked `CONTRACT_ACCEPTED` plus `GOODS_DELIVERED` pair produces one allowlisted transfer plan with before/after counts. Effects do not come from `said`, signals, snapshots or raw model proposals. Event IDs are deduplicated within their world; a plan remains pending until Skyrim acknowledges its ID and all four exact after-counts.
- Papyrus matches bridge marker, session and request number, checks before-counts, conservation and proximity, then uses `RemoveItem(..., recipient)` for gold and daggers. It remembers the last plan in the save. Repeated delivery of that plan does not execute it again. The adapter cannot issue another command while a plan is pending. Repeating `/accept` never automatically replays an API mutation.
- Skyrim inventories and an HTTP ledger cannot commit atomically. A partial transfer, changed inventory during a reply, missing acknowledgement, failed network request or ambiguous API result stops trading. **Do not compensate or retry automatically.** Stop, inspect inventories, and load a known pre-trade save. Save only after confirmation for the happy-path demo. Loading a save captured mid-transfer can preserve partial counts; a new world cannot infer or repair that. This implementation does not claim crash-safe exactly-once effects.
- Counts are bounded at 1,000,000 to match the existing API. Only one active player/save is supported. The text server binds IPv4 loopback only, validates Host/Origin, and uses an ephemeral UI CSRF header. World credentials remain in a private process closure, absent from game scripts, HTML, URLs and output. Loopback is a local trust boundary; other native processes on the PC can call it. Do not port-forward either server.

For durable continuation later, persist seed/configuration, ledger/events, session/save identity and outstanding plan/ack records together; add explicit branch/rollback detection and reconciliation before restoring offers. Do not persist only a last event ID and assume that makes cross-process transfers atomic.

## Verification

Automated commands:

```powershell
npx vitest run examples/skyrim/bridge.test.ts
npm run typecheck
npm test
```

The adapter tests use the **actual HTTP API and ledger** with scripted model responses and simulated inventory snapshots. They verify a checked offer and stock sale, plan resend without a second API acceptance, acknowledgement, external spending sync and unaffordable rejection, session reset/late responses, partial application failure, distance cancellation, payload validation, unsupported effect rejection, mutation-response loss and HTTP access checks. They do **not** execute Papyrus, the native DLL, Creation Kit, Skyrim inventory functions or a live provider.

Still required in game, record each result and relevant SKSE/Papyrus logs:

1. Exact runtime/SKSE/HTTP DLL combination loads; `getskseversion` works and the F8 HTTP smoke test connects.
2. One new Brann is correctly placed beside Warmaidens, with six daggers and 50 gold; vanilla NPCs remain unaffected.
3. Live model dialogue, negotiation/counteroffer and refusal work. A challenge for free unlimited enchanted weapons never grants items. Label provider fallback separately.
4. Record both actors' gold/dagger counts before/after accepting: player `-price/+qty`, Brann `+price/-qty`. Price/stock/funds violations produce no transfer. Verify inventory UI and the confirmation message.
5. Repeated acceptance clicks and a repeated pending-plan packet grant nothing twice. Leave range, enter combat, spend gold or remove stock before acceptance and during model latency; queued actions cancel or fail closed.
6. Save after confirmed delivery, quit/reload: inventories persist, offers/history reset, no transfer repeats, F8 reconnects. Load an older pre-trade save: its counts seed a fresh world. Test the player alias event on both manual saves and quickloads.
7. Stop either server while a reply is outstanding; no blind mutation retry occurs. Start servers and reload a known save. Exercise the partial-transfer recovery on disposable saves before expanding the demo.

No in-game, native plugin load, compiled Papyrus, live-model or save/load result has been observed yet.

### Recorded automated results (2026-11-01)

- `npm run typecheck`: PASS, including the Skyrim adapter.
- Full `npm test`: PASS, 47 files / 545 tests at that run. The sandboxed attempt hit two existing editor-test temporary-file rename permission errors; the approved run outside the sandbox passed. Two additional Skyrim negotiation/rejection tests were subsequently added and checked with the targeted run below.
- Final targeted Skyrim run: PASS, 10 tests; adapter TypeScript and `git diff --check` also passed after those additions.
- Actual loopback server smoke test: HTTP 200 for the text page, initial state `connected: false`, no token in state. The sandbox blocked loopback access; the approved test outside the sandbox passed and stopped its temporary server.
- `inspect.ps1`: PASS; reported runtime 1.7.104.0 and the four missing native/authoring components above. `build-mod.ps1`: PowerShell syntax parse PASS only; compilation/package creation could not run without its inputs.
- Existing untracked `__MACOSX/` and `pc-transfer/` content was preserved.
