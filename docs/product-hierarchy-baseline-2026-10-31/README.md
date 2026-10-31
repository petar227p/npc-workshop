# Product hierarchy — Step 1, Task 1 baseline

Recorded 2026-10-31 (Europe/Zagreb), before product-hierarchy application changes. Task 1 only; tasks 2–7 remain pending. Source plan: [workshop-product-hierarchy-plan.md](../workshop-product-hierarchy-plan.md).

## Starting point and preservation

- [x] Read `HANDOVER.md` current state, `PLAN.md` product scope/architecture/cut rules, and `docs/workshop-guided-setup-plan.md`. No `AGENTS.md` or `CLAUDE.md` found in the repository; no ancestor `AGENTS.md` found.
- [x] Inspected git status before edits: branch `codex/workshop-guided-ui`, HEAD `0ec580c957c59e2245455b9d3ff5b79225ec9114`.
- [x] Preserved existing modified `.claude/launch.json`, `.env.example`, `package.json`, and untracked `docs/teardown-2026-10-30/`, `docs/workshop-guided-setup-plan.md`, `docs/workshop-product-hierarchy-plan.md`.
- [x] No application source changes, file saves, commits, pushes or deployments. Added this evidence folder, updated the plan's progress and the local ignored handover.

## Browser baseline checklist

Checked in the in-app browser against the existing Vite server on `localhost:5180` (configured for API port 8790). A temporary tracing proxy at `127.0.0.1:5182` supplied a separate browser-storage origin and recorded HTTP method/path/status only. No model, image or transcription requests were made. [network.jsonl](network.jsonl) contains the trace with UTC timestamps; it contains no request bodies or cookies.

- [x] Home: two equally prominent cards, village first; workshop preview uses Brann's sprite and blacksmith-like personality. Desktop has two columns; phone stacks village above workshop.
- [x] Fresh workshop: no silently loaded Brann. Shows **Create your NPC** and collapsed **Other starting points**. The primary action opens the existing three-step role/name/review flow. Other starting points contains the role templates, questionnaire, blank NPC and named village library.
- [x] Current editor differs from older handover descriptions: **Character / Abilities & rules / Test** section navigation, personality notes and advanced character settings. Preserve this newer implementation in subsequent tasks.
- [x] Merchant template → rename to **Baseline Merchant** → reload: name, `hesta` ID and valid preview restored. Captured restored-draft screenshots below. Storage remains `bs_npc_draft`; source review confirms the existing compatibility parser and browser-only persistence.
- [x] Separately checked an edited blank draft through workshop → village → workshop, Back/Forward and refresh: edited name retained. Village returned at Day 1, 08:00, 200 gold; no reset was requested.
- [x] Village: starts with **Brann · blacksmith**, working canvas, clock/gold, hints, folded gear, stock and village tools. No separate blacksmith scene exists.
- [x] Direct workshop and village loads/refresh, brand link home, Back/Forward, unknown hash → `#/` work. Route transitions focus `.page`; existing navigation and active-page styling remain intact. Hash aliases `''`, `#`, `#/` are also confirmed in `main.tsx`.
- [x] Desktop 1280 × 820 and phone 375 × 812 captures for home, initial workshop, restored draft and village. No viewport horizontal scrolling observed. Restored-draft screenshots retain the browser's scroll position after editing/reloading.
- [x] Home makes no API request. Workshop uses library/preview and explicit bench reset when applying a starter. Neither requests `/api/state`, `/api/art`, `/src/game/*` or Phaser before village entry. The small `VillagePage.tsx` shell is statically imported; the Phaser renderer is lazy.
- [x] First village-state request: `16:02:15.021Z`; first Phaser request: `16:02:15.148Z`. Both occur on entering the village. Development StrictMode duplicates initial library/state reads; this is existing behavior.

| Destination | Current title | Current navigation |
| --- | --- | --- |
| Home (`#/`) | NPC Workshop | Brand points here; header hidden on home |
| Workshop (`#/workshop`) | Workshop · NPC Workshop | Workshop is second |
| Village (`#/village`) | Village · NPC Workshop | Village is first |
| Unknown hash | NPC Workshop | Replaced with `#/` |

## Terminology for the following code changes

These are the agreed visible terms from the plan. The locations below identify where to apply them in tasks 2–6; copy is intentionally unchanged during baseline capture. Keep technical route keys, storage keys, API paths and data identifiers compatible.

| Concept | Visible wording | Code/copy locations |
| --- | --- | --- |
| Product | NPC Workshop | `Entrance.tsx`, brand and page titles in `main.tsx`; workshop heading in `Editor.tsx` |
| Main activity | Build an NPC / Open workshop | `Entrance.tsx` primary destination; existing authoring entry points |
| Playable example | Blacksmith demo | `Entrance.tsx`, `main.tsx` demo identity/title; navigation label **Demo** as specified in task 3 |
| Demo context | Brann's workshop in the example village | `VillagePage.tsx` introduction; home example card |
| Authoring state | Draft in this browser | `Editor.tsx` status and onboarding copy |
| Bench | Isolated test session | `Editor.tsx` bench introduction; `GuidedSetup.tsx` / `Questionnaire.tsx` explanations where relevant |
| Disk persistence | Save to files — development only | `Editor.tsx` save control and nearby workflow explanation |

Source review confirms `applyDraft` checks edited-draft replacement, locks during bench activity, and resets the bench before applying a replacement; failure retains the old draft. The development file workflow has a separate overwrite confirmation. These guards must survive later edits. **Cancellation of the native discard dialog was not verified**: the browser automation click timed out and the test draft had already been replaced before a dialog could be inspected. No file-save or overwrite operation was attempted; the existing offline API does not expose Save to files in these captures.

## Checks and existing issues

| Command | Baseline result |
| --- | --- |
| `npm test` | 372 tests passed, 34 files |
| `npm run typecheck` | Passed |
| `npm run build --workspace web` | Passed; existing >500 kB chunk warning (Village JS 1,493.75 kB, gzip 342.85 kB) |
| `npm run ledger-proof` | 5/5 controlled cases passed; no model involved |

The sandbox initially blocked tsx's local IPC pipe (`EPERM`). `node --import tsx scripts/ledger-proof.ts` passed, and the exact npm command subsequently passed outside the sandbox. This is an execution-environment restriction, not an application failure. Proof report: local ignored `logs/ledger-proof-2026-10-31T16-04-14-309Z.{md,json}`.

Existing issues to carry forward:

- Home phone cards extend about 14.8 px beyond their 343 px grid/container (card right edge 373.8 px versus container right edge 359 px). The 375 px viewport still has no horizontal scroll, but right/left margins are uneven. Address with the task 2 scoped layout work.
- Browser requested `/favicon.ico`, which returned 404. Leave this unrelated cleanup out of the hierarchy work.
- Product hierarchy/copy gaps remain as described above. No failing automated checks or failed application API responses were observed.

Limitations: no live models, microphone, touch device, purchase/delivery/gossip rehearsal, failure injection, exhaustive questionnaire path check, art-reference retention or native-dialog cancellation proof in this task. Task 7 and human newcomer validation remain outstanding. This baseline does not establish architectural separation.

## Captures

All eight files are viewport screenshots, with original dimensions verified. Desktop: 1280 × 820; phone: 375 × 812.

| State | Desktop | Phone |
| --- | --- | --- |
| Home | [home-desktop.jpg](home-desktop.jpg) | [home-phone.jpg](home-phone.jpg) |
| Initial workshop | [workshop-initial-desktop.jpg](workshop-initial-desktop.jpg) | [workshop-initial-phone.jpg](workshop-initial-phone.jpg) |
| Restored merchant draft | [workshop-restored-desktop.jpg](workshop-restored-desktop.jpg) | [workshop-restored-phone.jpg](workshop-restored-phone.jpg) |
| Village | [village-desktop.jpg](village-desktop.jpg) | [village-phone.jpg](village-phone.jpg) |

Next: task 2, rebuild the home hierarchy using the existing routes and styling.
