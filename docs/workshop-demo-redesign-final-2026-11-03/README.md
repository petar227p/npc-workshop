# Workshop and demo redesign: final verification (task 12)

Branch `claude/workshop-demo-redesign`, 2026-11-03. This covers tasks 1–12 of `docs/workshop-demo-redesign-plan.md` as one flow, after the task 12 fixes listed below.

## Setup

- Web: the Vite dev server on `localhost:5180`, proxying `/api` to port 8790 (`web-ux` in `.claude/launch.json`).
- API: the committed offline fixture, `cd server && npx tsx ../docs/workshop-demo-redesign-baseline-2026-11-03/offline-api.ts`. It is the real `createApi` (engine, ledger, routes, sessions) with scripted NPC replies and mock images. **No model, image or transcription calls were made.** No real-model run was done for this task.
- Working tree as found: the untracked Corwin NPC, the changed `craftsperson.png` and other unrelated files were left alone and are not part of these commits.

## Automated checks

| Check | Result | Output |
| --- | --- | --- |
| `npm test` | 56 files, 654 tests passed | [npm-test.txt](npm-test.txt) |
| `npm run typecheck` | Passed | [typecheck.txt](typecheck.txt) |
| `npm run build --workspace web` | Passed; the existing large-chunk warning for the deferred Phaser bundle remains | [build.txt](build.txt) |
| `git diff --check` | Passed | |

No pre-existing failures this run (the earlier sandbox `EPERM` on a loopback test did not recur).

## Demo flow (1440×900 unless noted)

| Step | Observed |
| --- | --- |
| Select and converse | Brann selected; "I need a sword, nothing fancy" produced a checked offer (Blade No. 2, 40 gold, 14 h) |
| Negotiate | "Can you do it for 30 gold?" got a plain line: the scripted mock can't counter-offer, so real negotiation was not exercised |
| Accept | Gold 200 → 160; forge row "0% done, ready Day 1 · 22:00"; focus moved to Wait until ready ([01](01-demo-1440-order-accepted.jpg)) |
| Wait | Clock to 22:00; Bag "1 thing · new"; no drawer opened by itself; focus fell back to Bag because the Wait button went away |
| Hint target | Show it opened the Bag, focused `item-i_c_001` and cleared the "new" cue ([02](02-demo-1440-bag-drawer-delivered.jpg)) |
| Give | Blade to Mira: refused by the ledger, kept in the Bag, explained in her chat. 5 gold to Mira: accepted, 160 → 155 |
| Rumours | Opened with focus on the drawer; lists the gift with who saw it and who hasn't heard |
| Activity filters | Deals shows the gift and refusal; Rule checks shows its empty state; All restores |
| Sandbox | ArrowRight moved selection and focus to Sandbox; "Make it so" stayed disabled with "Pick a place first." until a place was chosen; the report reached the world state and Rumours |
| Stock | Mira's stock replaced Rumours (one drawer at a time); Escape closed it and returned focus to the stock button |
| Reset | Menu → New game… opened a confirmation with focus on Cancel; confirming restored 200 gold, Day 1 · 08:00 and an empty Bag with no cues |
| Multiple orders | Two blades on the forge (gold 200 → 120); the composer stays in the window (bottom at 888 of 900 px, no page scroll) ([04](04-demo-1440-two-orders.jpg)) |
| Slow response | With `/api/say` delayed 4 s in the page: your line shown, "Brann is thinking", Send and the NPC picker locked, input still editable; the offer arrived afterwards |
| Recoverable error | With one `/api/say` answering 500: the error is an alert, **the message goes back in the box** (fixed in this task), and Send delivers it and clears the error |

## Workshop flow (1440×900 unless noted)

A throwaway "Test Trader" (Merchant) was created through New NPC and deleted at the end; the existing Baseline Merchant draft was set aside meanwhile and is back as the active draft.

| Step | Observed |
| --- | --- |
| Create | Merchant → name → review → Create draft and test; Baseline Merchant moved to Your NPCs; focus on the test pane |
| Restore | After a reload: same draft, same page, both list entries |
| Edit each page | Character personality, Abilities candle minimum price 1 → 3, World perception radius 4 → 7, Advanced label `candle` → "tallow candle"; all in the stored draft, still valid |
| Validation | Invalid id plus radius 99: header "✕ 2 settings to fix · Saved in this browser" (local save and server check reported separately); testing disabled. The header link opened Advanced with the id field focused; "Go to world" opened World with the radius focused; both fixed back |
| Test | Normal request, challenge and controlled rejection. The edits reached the test: "tallow candle" in the conversation, and the controlled offer rejected as "below the minimum of 3" ([03](03-workshop-1440-populated-test.jpg)) |
| Action details | Each check is one line (verdict, proposal, reason when rejected); Details opens the receipt, also by keyboard |
| Handoff | Use in your game showed the Test Trader snapshot; Back returned to the editor with focus on Use in your game (fixed in this task). Download was not clicked, since it saves a file |
| Demo and back | Draft, edits and Your NPCs preserved. The test transcript is not restored; see the limits below |
| Test error | With one `editor/bench/say` answering 500: Send it again recovered |

## Widths

| Width | Evidence |
| --- | --- |
| 1440×900 | [01](01-demo-1440-order-accepted.jpg), [02](02-demo-1440-bag-drawer-delivered.jpg) (open drawer), [03](03-workshop-1440-populated-test.jpg) (populated workshop test), [04](04-demo-1440-two-orders.jpg) |
| 1024×768 | [05](05-demo-1024-rumours-drawer.jpg): drawer over the map, conversation and forge usable |
| 768×1024 | [06](06-workshop-768-advanced-labels.jpg): labels table and what the model gets, with the edited label and price |
| 390×844 | [07](07-demo-390-inspect-sheet.jpg): mobile sheet, `aria-modal`, background inert, 44 px Close. [08](08-workshop-390-test.jpg): workshop test; shows both the new compact check and the older full-text note |

No horizontal overflow at any of these widths.

## Fixed in this task

- **Demo, failed send:** the typed line was cleared and lost. `Chat` now gets `false` back from `onSay` when the line never reached the server, and puts it back unless something new was typed. A ledger refusal still counts as said. Existed before the redesign.
- **Workshop, handoff Back:** focus fell to `<body>`, because the header's buttons are rebuilt when the connection page closes. It now falls back to the new Use in your game button (`data-handoff-opener`). Existed before the redesign.
- **Reduced motion:** both conversation panels always scrolled smoothly; they now use `newLineScroll()` from `ConversationLog.tsx`, which is `auto` under `prefers-reduced-motion`. Every CSS animation already had an override.
- **Workshop nav:** Test sat 8 px below the four page buttons (spacing left from the removed group headings).
- **Dead CSS:** 35 rules removed and 5 selector lists trimmed for 19 classes no component uses (old layout, overview, status bar, panel toggle and others). Computed styles of every visible element were identical before and after on the workshop page and on the demo with the Bag open.

## Limits

- **Real model and real negotiation:** not exercised; the scripted fixture cannot counter-offer or tell secondhand rumours. The rumour Show it link remains covered only by the reducer tests.
- **Test transcript after leaving the workshop:** a reload, or the demo and back, keeps the draft but not the isolated test conversation (it was already like this at the task 1 baseline). After a reload, earlier rejections show as the plain note rather than the compact line, because the check details live only in the page.
- **Reduced motion, screen readers, on-screen keyboards, physical phones:** the reduced-motion work was checked in code only, because this browser can't emulate the setting. The others were not tested.
- **Testing artifact:** the browser pane was hidden during this run, which delays `requestAnimationFrame` by around a second. Focus moves scheduled that way (validation links, handoff Back) were confirmed once they ran, not at a fixed delay.
- **Fixture kept:** `docs/workshop-demo-redesign-baseline-2026-11-03/offline-api.ts` is referenced by the handover and this README as the way to reproduce these checks, so it stays.
