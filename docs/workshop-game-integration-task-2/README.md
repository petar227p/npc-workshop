# Task 2 — Workshop portable download and safe import

Completed 2026-10-31. [Implementation plan](../workshop-game-integration-plan.md).

## What works

- **Download NPC** exports a valid draft as a version 1 `<id>.npc.json` bundle, including the persona, supported abilities, prices/ranges, starting stock, model settings, labels, signals, schedules, triggers and embedded art references.
- **Import NPC** is available beside Create your NPC on the starting screen and in the active Workshop toolbar. Its reusable picker can be placed in Task 5's connection screen when that screen exists.
- Import checks `File.size` before reading, parses with the shared bundle contract, and runs the normal Workshop preview/build validation before any replacement confirmation or test reset. The complete parsed art is retained even though ordinary preview requests omit picture bytes.
- Successful imports use the existing replacement safeguards, clear the old bench only after confirmation, remount its local conversation state and open Test with keyboard focus on its heading. Failed reads, malformed/versioned/invalid files, unavailable validation and cancelled replacements do not replace the draft or reset the bench. A failed bench reset also keeps the existing draft via the pre-existing replacement path.
- Editing and bench actions are disabled during import preparation/replacement to avoid crossing revisions. If a pending picture read changes the draft while validation runs, import pauses for a retry instead of discarding the edit.
- Export checks the final pretty-printed UTF-8 file size, as well as normalized schema size. The limit is 2 MiB. Local/remote art dependencies are rejected by shared validation; only embedded data URLs travel. Generated item pictures and the bundled sprite sheet are not packaged.
- Transfer schema code is loaded only when requested. Vite pre-optimizes `zod` at startup so the first transfer cannot trigger a dependency-discovery reload that loses the visible bench conversation.

Neither action calls development file saving, registers an NPC or changes the demo village. Import uses local file parsing, `/api/editor/preview`, and (only after acceptance) `/api/editor/bench/reset`. It does not make a model call. Download operates locally.

## Files changed

- [Workshop](../../web/src/Editor.tsx): toolbar/starting-point actions, safe preparation and replacement, download lifecycle, notices and actionable errors.
- [Reusable file picker](../../web/src/ImportNpcButton.tsx).
- [Transfer preparation/serialization](../../web/src/npcTransfer.ts) and [14 focused tests](../../web/src/__tests__/npcTransfer.test.ts).
- [Styles](../../web/src/style.css), [Vite configuration](../../web/vite.config.ts), [usage instructions](../../README.md#create-and-test-an-npc) and the plan tracker.

## Automated checks

| Check | Result |
| --- | --- |
| `npx vitest run web/src/__tests__/npcTransfer.test.ts` | PASS: 14 new tests |
| `npm test` | PASS: 408 tests in 37 files (394 tests before Task 2) |
| `npm run typecheck` | PASS: shared, server, web and scripts |
| `npm run build --workspace web` | PASS; same existing Phaser chunk warning above 500 kB |
| `git diff --check` | PASS |
| Actual downloaded bundle vs original fixture | PASS: deep equality after parsing the complete envelope |

Tests cover every supported setup's export/import round trip, nested configuration and art preservation, independent parsed data, oversized files rejected before reading, malformed JSON, unsupported versions, raw-draft rejection, invalid configuration, local/remote art rejection, unreadable files, server rejection/unavailability, invalid export and formatted-file size overflow.

## Browser checks

Used a separate local origin at `127.0.0.1:5177`, backed by a temporary API at `127.0.0.1:8793` with file saving disabled and a scripted model reply. The existing Workshop origin and its stored draft were preserved. No live provider, production deployment or external game API conversation was used.

| Action | Observed result |
| --- | --- |
| Fresh starting screen | Import NPC visible beside Create your NPC |
| Import [Portable Ada](portable_ada.npc.json) | Character restored, including schedule, labels/signals and embedded picture; fresh Test opened |
| Send a test line | Scripted response: “A scripted hello from the imported character.” |
| Import [malformed JSON](invalid-json.npc.json) | Actionable JSON error; previous dialogue remains; no replacement confirmation |
| Import [unsupported version](unsupported-version.npc.json) | Version 1 guidance; previous dialogue remains |
| Import [off-map configuration](off-map.npc.json) | Server's map error with supported places; previous dialogue remains; no replacement confirmation |
| Import valid file, cancel replacement | Existing draft and both conversation lines remain |
| Download NPC | Browser produced `portable_ada.npc.json`; the actual download was copied to [browser-export.npc.json](browser-export.npc.json) and matched every original field |
| Re-import actual browser download | Valid character restored; previous conversation cleared; new empty test session visible |
| Blank the required name | Download disabled while checking and after invalidation |
| Keyboard navigation | Tab from Import NPC reaches Download NPC; successful import focuses `test-heading` |
| Desktop 1280 × 900 | Controls and imported test view fit without horizontal overflow (document width 1280) |
| Phone 390 × 844 | Controls wrap, imported view usable without horizontal overflow (document width 390) |

### Evidence

[Desktop screenshot](imported-desktop.jpg), [phone screenshot](imported-phone.jpg), [rejected import with preserved dialogue](rejected-import.jpg), [actual exported bundle](browser-export.npc.json).

## Limits and next task

The connection screen does not exist yet; Task 5 will reuse the picker and these actions there. The server's current Workshop preview payload limit still applies to the configuration sent for validation (reference pictures are omitted from that request); a configuration too large for the existing preview path is refused without replacing the current draft. The 2 MiB bundle limit does not bypass that server limit.

API worlds still select registered IDs. Task 3 will enable draft definitions, world-local vocabulary and snapshot isolation. No runtime quota changes, live-provider verification, server-restart recovery or newcomer participant study are claimed here.
