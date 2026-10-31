# Task 5 — Workshop “Use in your game” screen

Completed 2026-10-31 for [the implementation plan](../workshop-game-integration-plan.md).

A valid Workshop draft now has **Use in your game** in the toolbar and test session. A successful direct model reply highlights the handoff. It opens a screen for the selected character with three steps: **Download NPC → Run the example → Verify connection**. Download/import and runnable instructions are available without the development file-saving workflow.

## Implementation

- [Workshop](../../web/src/Editor.tsx) keeps the editor and bench mounted behind the screen, preserving the selected section, conversation, typed-but-unsent message and form state. Returning restores focus to the opening button and the previous scroll position. A deliberate successful import uses the existing replacement/reset path and opens a fresh Test.
- [Connection screen](../../web/src/GameConnection.tsx) shows the copy's name, ID, model, abilities and filename, plus an expandable configuration review. It offers import/download and a quoted, copyable `npm run game-example` command with explicit server origin and bundle path. The default origin serves the same relative API routes as Workshop, including the Vite proxy; the URL can be changed for a direct backend connection.
- Download preparation now returns the owned, normalized NPC used in the [actual bundle](../../web/src/npcTransfer.ts). The handoff retains that snapshot and compares the complete source configuration, including nested catalogue, labels, signals, schedule and embedded art. Later changes show the older copy with **Your downloaded copy needs updating** and disable command copying until a new download is requested. Re-downloading updates the displayed snapshot. A prepared copy that has never been downloaded follows the current draft when reopened.
- [Handoff helpers](../../web/src/gameHandoff.ts) require a successful direct `/say` result with an accepted model attempt and an NPC spoken line to highlight the action. Configuration checks, controlled tests, unavailable/fallback responses and broadcast timer activity do not earn that highlight. Changes to the draft invalidate it; resetting/replacing the test clears it.
- Opening the screen is local: no model call, world creation, test reset or validation request. Downloads do not claim connection success. Step 3 explicitly says **Not verified here** and describes checking the example terminal; authenticated connection evidence is Task 6.
- [Responsive styles](../../web/src/style.css) keep the steps, form fields and command usable at desktop/phone widths. Hidden Workshop controls are not in the tab order. The screen heading receives focus on entry; controls have visible keyboard focus, and copying has a selectable-text fallback if clipboard access fails.

The screen explains configuration snapshots, backend token handling, event-ID consumption, game-owned signal handlers, bundled sprites, eviction/restart and fresh-world recovery. It contains no token fields or polling.

## Automated checks

| Command | Result |
| --- | --- |
| `npx vitest run web/src/__tests__/gameHandoff.test.ts web/src/__tests__/npcTransfer.test.ts` | 38 passed: 24 new handoff tests plus the existing 14 transfer tests |
| `npm test` | 483 passed in 40 files |
| `npm run typecheck` | Passed |
| `npm run build --workspace web` | Passed; existing large Phaser chunk warning remains |
| `git diff --check` | Passed |
| Actual updated browser download vs Task 2 export | Complete bundle equality after accounting for the deliberately edited NPC name |

[24 focused tests](../../web/src/__tests__/gameHandoff.test.ts) cover accepted/repaired replies; rejection of false success from validation, controlled tests, fallbacks, unavailable providers, missing speech, other speakers and broadcasts; complete snapshot comparison/isolation; reversible edits and object-key ordering; explicit origins; and safe terminal quoting of paths with spaces, quotes, `$()` and backticks. Existing transfer tests continue to cover invalid/cancel-safe preparation and version/size/portability checks.

## Browser verification

Used a separate origin, `http://127.0.0.1:5178`, with [a scripted verification API](scripted-server.ts) on port 8795 and file saving disabled. The normal origin on ports 5174/8787 and its stored browser draft were preserved. Browser replies below are scripted, not live-provider evidence.

Reproduce the isolated setup from the repository root after `npm install`:

```bash
# Terminal 1: no provider keys/calls, no file saving
node --import tsx docs/workshop-game-integration-task-5/scripted-server.ts
```

```bash
# Terminal 2
API_PORT=8795 npm run dev --workspace web -- --host 127.0.0.1 --port 5178 --strictPort
```

Open `http://127.0.0.1:5178/#/workshop` and import [the actual Task 2 browser export](../workshop-game-integration-task-2/browser-export.npc.json). The fixture scripts an unavailable turn, two rejected proposals, then successful SAY replies. Controlled tests use no model. The temporary servers used for this verification were stopped afterward.

| Action | Observed result |
| --- | --- |
| Import Portable Ada and pass configuration validation | Test opens; both handoff buttons available with secondary styling |
| Run the controlled undeclared-signal test | Clearly labeled rejection; no handoff highlight |
| Send first normal request | Scripted provider outage/fallback; no highlight |
| Send second normal request | Both model proposals rejected; safe fallback; no highlight |
| Send third normal request | Accepted SAY and NPC speech; toolbar and test handoff highlighted |
| Enter an unsent message, then open from Test | Connection heading focused; editor hidden and still mounted |
| Observe API counters immediately before/after opening | Identical: 4 model calls and 9 API requests; no `/api/v1/worlds` request and no reset/preview request on opening |
| Download from the screen | Browser produced the bundle; copy-command action enabled; no connection success claimed |
| Enter the actual downloaded file path and copy | Clipboard contains the quoted server/file command, including spaces in the browser-added filename suffix |
| Return to Workshop | Same dialogue and unsent message; focus returns to the handoff button |
| Change name from Portable Ada to Updated Ada and reopen | Screen remains bound to Portable Ada's downloaded copy; update warning visible; command copy disabled |
| Download updated NPC | Screen updates to Updated Ada; update warning clears; complete exported configuration remains intact |
| Clear the required NPC name | Handoff disabled while checking/invalid; restoring the name allows it again |
| Import an unsupported-version file from the screen | Actionable version error stays on the screen; draft/test retained |
| Import a valid file from the screen | Normal replacement path opens a fresh Test and clears old download/highlight tracking |
| Tab after the entry heading | Focus moves to Review this copy's settings; visible focus indicator |
| Reset test session | Highlight cleared; valid handoff still available |
| Invalid server URL with `/api/v1` | Origin guidance shown; command copying disabled |
| Desktop 1280 × 900 | Document width 1280; no horizontal overflow |
| Phone 390 × 844, including a long path with spaces | Document width 390; fields/command wrap; all three steps and Back usable |
| Browser error log | No errors |

### Evidence

- [Desktop screen](connection-desktop.jpg) and [phone screen](connection-phone.jpg).
- [Post-test handoff at desktop](test-handoff-desktop.jpg) and [phone](test-handoff-phone.jpg).
- [Stale downloaded copy with update warning](stale-copy-desktop.jpg).
- [Actual updated browser bundle](updated-browser-export.npc.json); only the deliberate name edit differs from Task 2's complete export.
- [Viewport preview](connection-preview.jpg).

No live-provider calls, deployment, external game verification or human newcomer study was performed. Import replacement safeguards are reused from Task 2; this run checked failed and successful imports from the new screen, while cancelled replacement was previously checked in Task 2.

Next: Task 6, authenticated matching-snapshot verification and recovery. No blocker.
