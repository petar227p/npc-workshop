# Task 3: in-game conversation test

Task 3 replaces the F9 echo panel with the conversation interface. It sends `say` commands through `/skyrim/v2/poll`, renders the bounded transcript as plain text, and supports consecutive turns without the browser. The current package also implements task 4 offers/confirmation: use [the task-four checklist](offers-test.md) for the latest build. Opening via Brann's normal Activate control remains task 5. The build record below describes the earlier task-three package.

## Install and start

1. Quit Skyrim completely. Install the rebuilt `examples/skyrim/dist/NPCWorkshopSkyrim.zip` over the previous NPC Workshop package, retaining the previous package for rollback. Keep `NPCWorkshopSkyrim.esp` enabled. There are no new native DLLs or plugin records.
2. For manual installation, extract the zip contents into Skyrim's **Data** directory. The current menu must be `Data/Interface/NPCWorkshop/Conversation.swf`, and `Data/Scripts/NWBridgeQuest.pex` must be from the same new package. The old `ConversationProbe.swf` may remain for diagnostics; F9 no longer opens it.
3. Run the existing API (`npm run dev --workspace server`) and the **updated** bridge (`npm run skyrim`) from the repository root. Restart an older bridge rather than starting a second copy on port 8788. Live model replies require the already configured main-server model key. If the bridge was restarted, reload a known test save to reset the conversation.
4. Launch via SKSE, load a disposable test save, stand near Brann outside Warmaidens and press **F9**. The heading should read **Brann — Warmaidens**, with status, player gold, transcript, input, Send and Close. If the heading still says “menu feasibility probe,” the previous UI/script package is still installed or loaded.

## Gameplay acceptance — pending user verification

- Wait for **Ready**, type a message, and press Enter or Send. Your pending message should appear immediately; the status changes to **Brann is thinking...** and Send is locked while the command is outstanding. A timeout offers no automatic retry.
- Brann's actual model reply should appear in the transcript with `Brann:`. The input clears after the matching completed receipt. Send a second message and verify both turns remain in history. An unavailable model must show **Brann cannot reply right now**, rather than presenting the fallback as model success.
- Scroll with the wheel over history, Up/Dn, or Page Up/Down. Polling must preserve your scroll position; readers at the end should follow new replies automatically. History is limited to the latest 32 bounded messages by the protocol.
- Enter sends; Shift+Enter adds a newline. Test quotes, multiline and supported non-ASCII text. Text renders literally. Check that typing never activates gameplay controls, F8, the console, or offer acceptance.
- Close with Esc or Close while a reply is outstanding, then reopen F9. The submitted command must not run twice. Once it finishes, the new panel should show the updated transcript and unlock. Closing does not cancel a submitted request or an accepted trade.
- Type an unsent draft, close and reopen; the draft should remain. Rejected commands preserve the text. Loading another test save should clear the old conversation/draft and show the reset message in history.
- Stop the bridge during a reply: Esc must still release input. After a failure the panel must require a save reload, rather than resubmit the mutation. Restarting the service may reset conversation state. Older menu/session replies must not reopen a closed menu or overwrite a newer menu instance.

The Papyrus controller caches history/status for the current loaded session, sends each command ID once, and continues v2 polling after closure. A terminal command receipt received for an older menu generation can update the session cache; only a matching active generation may update UI. The next current-generation poll refreshes the reopened menu. Inventory application and acknowledgements remain in the original checked transfer path.

## Build and verification

`python examples/skyrim/ui/build.py` now compiles `ConversationMenu.as` to `Conversation.swf` with the same pinned/checksummed MTASC toolchain. The archived probe can be built explicitly with `--source examples/skyrim/ui/ConversationProbe.as --output examples/skyrim/dist/ConversationProbe.swf`. Full packaging continues through `build-mod.ps1`.

The automated suite covers the real API/ledger with scripted model responses, two-turn history, reopen during a delayed response, duplicate suppression, and the actual ActionScript UI methods under a JavaScript host with text-field/input stand-ins. That host removes AS2 type syntax and supplies its static-member lookup semantics; it does not render Flash or execute Papyrus. Successful compilation/tests do not establish in-game visual quality or completion of the earlier open-menu trade/interruption checklist.

Verification on 2026-11-01: **36 tests passed**, adapter TypeScript typecheck passed, both Papyrus scripts compiled with **zero errors/warnings**, and the Flash 8 SWF compiled successfully. Packaged source and UI entry points were checked against the build outputs. Conversation SWF SHA-256: `242f6f788a6f1d3b56c07901d81e46ed62f8553aed4056cbf5796cf94464bb56`.

The idle older bridge was replaced with the updated version; `/skyrim/v2/poll` now responds with protocol 2. No game files were installed and no saves loaded during implementation. Install the rebuilt ZIP and reload your disposable save before testing the new panel. Actual live-model rendering in Skyrim remains pending user verification.
