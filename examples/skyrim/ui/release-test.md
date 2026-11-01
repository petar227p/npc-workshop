# Task 6: release package and regression record

**Packaging and automated checks passed. Gameplay acceptance remains pending.** The user chose to run the Skyrim checks themselves. No game files were installed, no services were stopped/restarted, and no saves were loaded or modified during this task. Petar's latest modded autosave was identified as the intended disposable test save; back it up before testing.

## Install and start

1. Quit Skyrim. Preserve your current mod package and make a separate copy of Petar's selected `.ess` and matching `.skse` save files. Autosaves may rotate during play; retain that copy outside the live save rotation.
2. Install **`examples/skyrim/dist/NPCWorkshopSkyrim.zip`** in the existing mod profile, or extract its contents into **Data**. Install the ESP, all three `.pex` scripts and the SWF together. Keep `NPCWorkshopSkyrim.esp` enabled. Use the ZIP rather than copying an old staging folder, which may still contain historical diagnostics.
3. Start the existing API and v2 bridge from the repository root (`npm run dev --workspace server` and `npm run skyrim`). Use one bridge on port 8788. If replacing/restarting it, reload a known test save to renew the loaded session. Existing model configuration stays in the repository environment; it is not in the package.
4. Launch through SKSE, load the chosen disposable save, approach Brann outside Warmaidens, and use your configured **Activate** binding. It should reach Ready automatically. F9 opens the same panel for diagnostics; F8 remains browser diagnostics.

The ZIP has 15 entries: seven runtime files (ESP, three scripts, conversation SWF, two face assets), three Papyrus sources, three UI source/build files, installation notes and the manifest. It excludes the old probe, native DLLs, saves, logs, compiler binaries and credentials. The locally generated Bethesda face assets are for this installation; do not redistribute them.

## Focused gameplay run

Run ordinary interaction first, then interruption tests from the backed-up test save. Record pass/fail and the observed status/support code for each row. A queued or completed API command alone is not evidence of physical delivery.

| Check | Procedure and expected result | Current result |
|---|---|---|
| Activation/isolation | Activate Brann without F8/F9. Only the custom panel opens. Test a remapped Activate binding, then restore your preference. Talk to unrelated NPCs and use nearby objects normally. | Not run |
| Text and input restoration | Send two turns; test quotes, Shift+Enter and supported non-ASCII input. Scroll history. Enter sends only chat; it never confirms a purchase. Esc/Close restores movement and ordinary controls; typing never invokes console/F8/F9/Activate. | Not run |
| Exact offer and open-menu transfer | Negotiate an affordable offer. Record item/quantity/total and both actors' gold/item counts. Review, Back, then review again and click Confirm purchase repeatedly. One transfer occurs at the displayed price. Applying trade precedes Trade complete, which requires matching inventory acknowledgement. Check actual counts afterward. | Not run |
| Close/reopen while busy | Close during a reply and again during Applying trade, then activate Brann again. History/drafts/current offers resume, and the action does not repeat. An unsent draft survives acceptance. An unsubmitted confirmation requires fresh review after reopening. | Not run |
| Save/load and late replies | Load the backed-up save, including once during an outstanding reply. Conversation/drafts/offers reset, the old reply never opens a menu or alters the new session, and activation still works. Leave/re-enter the cell as well. A missing-activation-script notification is a failure requiring complete ESP/script installation verification. | Not run |
| Range/combat/death | Verify opening/submission is refused when ineligible. If eligibility changes while open, the panel closes and releases input. A submitted action is not falsely called cancelled; a transfer that cannot pass physical checks enters recovery rather than claiming delivery. The modal pauses the world, so arrange interruption before/during opening or with an existing test setup rather than assuming combat advances while paused. | Not run |
| Service failure and recovery | Stop only the bridge instance you started for the test while a request is pending. Esc still closes. The UI reports failure/unknown outcome and does not resend the mutation. Restart the bridge and reload the backed-up save before another trade. Never interpret a transport timeout as a safe retry. | Not run |
| CustomMenu conflict/replacement | With an existing mod/test setup that uses CustomMenu, verify F9/interaction does not replace its menu. If that setup replaces ours, only our driver/input state retires and the foreign menu remains usable. If no such setup is available, record this as untested, not passed. | Not run |

For a failed row, record the step, visible status/support code, whether the panel closed, and inventory differences if relevant. Report a short redacted Papyrus/bridge log excerpt when available. Do not include environment files, bearer/model keys or whole credential-bearing packets. The existing native HTTP error event lacks request correlation and its timeout is not an overall deadline; a stalled request can require a game restart. This limitation was not changed by packaging.

The earlier open-menu trade/acknowledgement feasibility gate is satisfied only by the actual third row. The release remains pending until the required runtime checks pass; the previous user-reported polling/browser-trade/save-load results are historical evidence, not passes for this package.

## Automated/build evidence — 2026-11-01

| Check | Result |
|---|---|
| Repository suite (`npm test`) | **586 tests passed**, 50 files. Initial sandbox run blocked three unrelated socket/temp-file tests; the full run outside the sandbox passed. |
| Skyrim subset within that run | **49 tests passed**: 18 native, 14 SWF-method, 12 bridge, five probe tests. New cases cover delayed old-save replies, acknowledgements from retired menus, interrupted physical delivery and reopen during acceptance without replay. |
| Repository typechecks (`npm run typecheck`) | Passed across shared/server/web/scripts and both adapters. |
| Python packager suite | **Six tests passed**: metadata normalization, rejected formats, stable archive metadata/order, content/allowlist validation, tamper detection and preservation of a previous release after missing inputs. Tests use project-owned temporary directories. |
| Papyrus | All three scripts compiled with **zero errors/warnings**. |
| SWF | Pinned MTASC Flash 8 compilation passed; SHA-256 `96f5498ddef99a1767d4fd567dc5cb4de8d2c2512962bc41df86dcbeb778e82e`. |
| ESP | The task-five builder's two independent builds matched and reparsed with stable IDs and Brann-only reference wiring; the same validated ESP is packaged here. SHA-256 `e9a1c1c6ef1a08e5be0cc7c3f4a8c0b580060d1739dd4e776500f592577b38a1`. |
| Package | CRC/allowlist/manifest verification passed. Packaged script/UI sources match the repository. Packaged PEX files match metadata-only normalization of their raw compiler output. |
| Repackaging comparison | Two ZIPs made from identical compiled inputs matched byte-for-byte: **`76fc631e149f1676b62cc25c97d352237cb44561e2bd0d58fb72b7469d2cdd33`**, 785,441 bytes. |
| Fresh source rebuild comparison | **Not byte-identical.** Creation Kit changed PEX symbol-table/variable ordering. No attempt was made to rewrite bytecode or switch compilers to conceal this difference. See the reproducibility boundary below. |

The ActionScript tests execute actual UI methods under a JavaScript host with input/field stand-ins. Native tests use the actual API/ledger with scripted model replies and emulated inventory acknowledgement. Neither executes Papyrus or renders Scaleform in Skyrim. Those boundaries are why runtime rows remain untested.

## Build, verify and reproduce

Build the ESP first with the updated `plugin-builder` command in the main Skyrim README. Its output directory must include the matching face assets. Then build the complete package:

```powershell
powershell -NoProfile -File examples/skyrim/build-mod.ps1 `
  -GamePath 'C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition' `
  -SkseSources 'C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition\Data\Scripts\Source' `
  -HttpSources examples/skyrim/dist/dependencies/http-beta9/Source/Scripts `
  -GameSources examples/skyrim/dist/dependencies/creation-kit-sources/Source/Scripts `
  -Plugin examples/skyrim/dist/activation-build/NPCWorkshopSkyrim.esp

python examples/skyrim/package_mod.py --verify examples/skyrim/dist/NPCWorkshopSkyrim.zip
python -m unittest discover -s examples/skyrim -p '*_test.py' -v
```

Full builds compile in a new `dist/build-*` directory, retained for diagnosis/repackaging. Missing inputs, compilation failures or invalid archives leave the previous installable ZIP intact. Only the inspected stage may retain historical extra files; they cannot enter the allowlisted archive. `-OutputDirectory examples/skyrim/dist/other-build` creates another stage and adjacent ZIP.

`NPCWorkshop-manifest.json` includes each payload's size/hash, aggregated source-input directory hashes, compiler/assembler/dependency hashes, pinned UI toolchain data, source-build-script hashes and target protocol/runtime. It contains no user paths or service credentials. The source/compiler inputs must match to compare rebuilds meaningfully. Manifest hashes provide integrity/provenance for a local build, not an independent signature or evidence of gameplay success.

**Reproducibility boundary:** ZIP entry order, timestamp, permissions and storage method are fixed. PEX source/build timestamps and user/computer header strings are normalized; bytecode and debug line tables remain intact. Header/debug layout follows the primary [Caprica PEX reader/writer](https://github.com/Orvid/Caprica/blob/master/Caprica/pex/PexFile.cpp) and [debug-info writer](https://github.com/Orvid/Caprica/blob/master/Caprica/pex/PexDebugInfo.cpp). Unknown PEX versions fail packaging. Metadata normalization does not resolve the installed compiler's nondeterministic code/table ordering. Therefore exact compiled-input repackaging is proven byte-identical; a fresh source compilation is rebuildable and checked, with byte-for-byte identity explicitly unproven/failed on this toolchain.

The raw compiler directory for this release is `examples/skyrim/dist/build-aacba3c3b9ec4a20aa0f7cb1ba8b3dfb`. To reproduce its ZIP exactly, invoke `package_mod.py` with that `--compiled` directory, the ESP path above, the same `--papyrus-compiler`, `--skse-sources`, `--http-sources`, `--game-sources` paths, and a different `--output` directory. The packager's `--help` lists these arguments. Both the original and repackaged ZIP hashes were checked after creation.

## Rollback

The prior task-five package is preserved at:

`examples/skyrim/dist/package-backups/NPCWorkshopSkyrim-1edaf7617d8951c4b5b8a3cc539c703b225b2a01c18ebc2df44d210799422f35.zip`

Its SHA-256 matches that filename. Quit Skyrim before restoring it, restore the whole previous mod package through your profile, then load the backed-up test save. Do not overwrite a valuable save with test progress. The task-five package also includes the actor script; rolling back further to a pre-activation package requires handling that added file through the mod manager rather than merely copying an old ZIP over it.
