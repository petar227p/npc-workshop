# Workshop and demo redesign — Task 1 baseline

Recorded 2026-11-03, before any redesign changes. This covers Task 1 only. Tasks 2–12 have not started. Source plan: [workshop-demo-redesign-plan.md](../workshop-demo-redesign-plan.md).

## Starting point and preservation

- Branch `claude/workshop-demo-redesign`, cut from `main` at `f1d9b76`, so the redesign can be dropped as a single branch.
- Unrelated working-tree changes were left alone and not committed: modified `.claude/launch.json`, `.env.example`, `web/public/brand/roles/craftsperson.png`, plus untracked `.agents/`, `.claude/agents/`, `.claude/skills/`, `.codex/`, `docs/deployment-plan.md`, `docs/teardown-2026-10-30/`, `docs/theme-preview/`, `docs/workshop-guided-setup-plan.md`, `npcs/corwin.json`, `prompts/corwin.md` and the extra craftsperson PNGs.
- The untracked `npcs/corwin.json` loads into the village. **Corwin** therefore shows in the picker, appears first in `view.shops`, and becomes the Give form's default recipient. Screenshots taken from a clean checkout will differ in this respect.
- No application source changes in this task.

## How it was checked

- Built-in browser against the `web-ux` Vite server on `localhost:5180` (`API_PORT=8790`).
- The API on 8790 was [offline-api.ts](offline-api.ts): the real `createApi` (engine, ledger, routes, sessions) with scripted NPC replies and a mock image client. **No model, image or transcription calls were made.** Brann offers a sword whenever the last message mentions a sword or blade; every other NPC replies with a fixed SAY. To run it: `cd server && npx tsx ../docs/workshop-demo-redesign-baseline-2026-11-03/offline-api.ts`.
- The captures are scaled by the browser tool. At 1440×900 the images are 800×500, at 1024×768 they are 800×600, and at 390×844 they are 780×1688.

| Command | Result |
| --- | --- |
| `npm test` | 636 tests passed, 54 files |
| `npm run typecheck` | Passed |
| `npm run build --workspace web` | Passed. Pre-existing >500 kB chunk warning (Village JS 1,494.53 kB, gzip 343.19 kB) |

## Evidence

| File | What it shows |
| --- | --- |
| [demo-1440-default.jpg](demo-1440-default.jpg) | Fresh demo at 1440×900: header HUD, map, hint strip, three tool columns, conversation, "Your gear" cut off at the bottom |
| [demo-1440-rejected-fallback.jpg](demo-1440-rejected-fallback.jpg) | Ledger rejected an offer twice ("a sword takes at least 6"), so Brann used the fallback line. This was a real rejection with the mock's first delivery time |
| [demo-1440-offer.jpg](demo-1440-offer.jpg) | Checked offer card with Accept · pay 120 |
| [demo-1440-forge.jpg](demo-1440-forge.jpg) | After accepting: "on the anvil", Forge panel with Wait until ready under the composer |
| [demo-1440-delivered.jpg](demo-1440-delivered.jpg) | After Wait until ready: delivery notice, gear auto-opened with the item and Give form, "Show it" hint |
| [demo-1440-tools-open.jpg](demo-1440-tools-open.jpg) | All three tools open (Rumours, Village log, Sandbox), page scrolled; the conversation column stays sticky |
| [demo-1440-stock-drawer.jpg](demo-1440-stock-drawer.jpg) | Brann's stock drawer: full height at the page's right edge, covering the conversation and the header's right-hand controls |
| [demo-1024-delivered.jpg](demo-1024-delivered.jpg) | 1024×768: tools stacked in one column under the map |
| [demo-390-delivered.jpg](demo-390-delivered.jpg) | 390×844: header with HUD on a second row, map, hint, conversation starting below the fold |
| [workshop-1440-fresh.jpg](workshop-1440-fresh.jpg) | Fresh workshop: six role cards and four other ways to start |
| [workshop-1440-tested.jpg](workshop-1440-tested.jpg) | Restored-style editor with a populated isolated test: one model proposal (accepted) and one controlled rejection test |
| [workshop-1440-restored.jpg](workshop-1440-restored.jpg) | The same draft after a reload: draft restored, test transcript gone |
| [workshop-1024-restored.jpg](workshop-1024-restored.jpg) | 1024×768: single column, section chips, test behind a **Test** chip and a header **Test Baseline Merchant →** button |
| [workshop-390-restored.jpg](workshop-390-restored.jpg) | 390×844: stacked header actions, wrapped section chips |

## Baseline behavior checklist

Each item below is what the redesign must preserve or deliberately replace. "Observed" means it was exercised in the browser. "Code" means it was read in source because the scripted mock cannot produce it.

### Demo

- [x] **Ordering (observed).** Typing "A sword, please." and pressing Return shows the message, then the reply and a checked offer card (stats, price, delivery time, materials, remark, **Accept · pay 120**). The hint changes to "Negotiate further, or accept these terms." While a reply is pending, the NPC picker is disabled (`Chat` `thinking`), and E or a click on a different NPC is ignored (`talk`).
- [x] **Ledger rejection (observed).** When an offer breaks a rule twice, the NPC says its fallback line in the chat and above its head. Each rejection is recorded as `ACTION_REJECTED` in the log.
- [x] **Accept (observed).** Gold goes from 200 to 80. The card changes to "on the anvil" and the line "The hammer rings. Ready at Day 1 · 16:00." appears. A **Forge** panel appears between the composer and Your gear, which shrinks the transcript. Focus moves to **+1 hour** (`keepFocus` → `[data-focus-home]`). The hint changes to "Brann has started work…".
- [x] **Inventory arrival (observed).** **Wait until ready** advances to 16:00. The card changes to "delivered" and the line "Brann hands you the Hammerhead Blade." appears. The Forge panel goes away. **Your gear opens automatically** (`useArrivals` → `setGearOpen(true)`), focus moves to the `#gear` toggle (`keepFocus`: the forge's last job went to the gear), and the page scrolls by about 35 px. The hint "Your Hammerhead Blade is ready." gets a **Show it** button, which opens the gear and reveals `item-<id>`.
- [x] **Give form (observed).** Quantity, then "What to give" (defaults to **gold**), then "Who to give it to" (defaults to the first shop, Corwin here), then **Give**. Giving switches the conversation to the recipient (`give`).
- [ ] **Rumour hints (code).** The scripted mock never retells news, so this was not observed. `useArrivals` sets `heard` when a new `(event, listener)` `told_by` pair appears. That shows a **new** cue on the Rumours tool button until Rumours is opened (`seenHeard`). A news hint's link opens Rumours and reveals `know-<event_id>-<knower>`, a `<details>` that opens and focuses its summary. A world reset recomputes the cue against an empty world.
- [x] **Log filters (observed).** The Village log has **All / Deals / Rumours / Rule checks** (`aria-pressed`), entries are grouped by day, and rejections have a **Technical details** disclosure. The selected filter (Deals) survived folding and unfolding all tools.
- [x] **Sandbox input (observed).** A half-typed note ("A storm knocked down the mill.") survived folding and unfolding, because tool bodies stay mounted with `hidden`. The sandbox flow is: **What happened?** textarea → **Read it** (a model call; not exercised) or **Fill it in yourself** → form (text, hours ago, notable, place, seen by, people) → preview → **Make it so** / **Edit details** / **Start over**.
- [x] **Stock (observed).** **Brann's stock** sits beside the character identity, and only for sellers. It opens a `Drawer` (`role=dialog`, nonmodal, focus on open). Escape closes it and returns focus to the opener. It closes when the conversation partner changes. It is independent of the tools, so the two can be open at once.
- [x] **HUD (observed).** The site header holds Day/time, gold, **+1 hour** (with tip), **Help** (Getting around list and a **Show hints** checkbox), **Menu** (**New game…** with a confirm step: **Start a new game** / **Cancel**; **Back to the entrance**), and **Build your own NPC →**. The reset itself was not clicked, to keep the delivered state.
- [x] **Hints (observed).** A strip under the map shows the current hint, an optional link button, **Turn off hints** and ×. Example chips put text in the message box.
- [x] **Scene (observed).** The canvas is 2080×1388 backing for 1040×694 CSS at DPR 2, inside a 1040×735 `.stage`. Talking puts speech bubbles over heads. Standing near someone shows "E talk".

### Workshop

- [x] **Fresh (observed).** Six role cards (Merchant, Craftsperson, Villager, Bard, Town crier, Guard). Other ways to start: **Help me choose**, **Copy an example**, **Blank NPC**, **Import NPC**. Choosing a role opens step 2 of 3 (name and personality are optional), then the review step and **Create draft and test**.
- [x] **Editor (observed).** The left rail has Your NPCs, **+ New NPC** and a Now editing card. Navigation: **Character** (Basics, Appearance, Item artwork, Advanced settings) and **Abilities & rules** (What it sells, Example village, Advanced). The header holds the status ("Ready to test" / "Checked action completed" · "Saved in this browser"), **Import NPC**, **Download** and **Use in your game**.
- [x] **Test state (observed).** The right pane is **Test <name>** with "Isolated session · Muse Spark Open" and **Reset**. Below it are the starter chips (**Try a normal request**, **Try a challenge**, **Controlled rejection test**), the message box and Send. Results render inline as ledger cards (Model proposal · attempt N / Controlled proposal · workshop · no model; proposal, applicable rule, verdict, resulting state). Then come the success line and **Use <name> in your game →**. After a reload a **More test options** disclosure shows.
- [x] **Restore (observed).** After a reload the draft comes back from `bs_npc_draft` / `bs_npc_drafts` with the same name and section. **The isolated test transcript does not come back.** This is existing behavior.
- [x] **Widths (observed).** At 1440 there are three columns (rail / editor / test). At 1024 and 390 there is a single column: section chips, **Test** as a chip, and a header **Test <name> →** primary button in place of **Use in your game**. No horizontal overflow at any of the three widths.

## Existing issues found (not fixed here)

1. **1440×900 demo already overflows.** The page is 935 px tall, so **Your gear** is clipped and the page scrolls about 35 px. With all three tools open it is 1,293 px.
2. **Arrival moves focus and scrolls.** After Wait until ready, focus jumps to the Your gear toggle and the page scrolls. Task 7 replaces this with an arrival cue.
3. **The stock drawer covers the conversation and the header controls** (+1 hour, Help, Menu, Build your own NPC) at 1440. At 390 it is full screen. It is nonmodal there, but it covers everything.
4. **1024×768:** the tools stack into one column under the map. The page is 897 px tall.
5. **390×844:** **Build your own NPC** is hidden (`display: none`). The composer sits at y≈1081, below the fold. Several controls are under 44 px: +1 hour, ?, Help, Menu (32 px tall), hint buttons (17–25 px), picker (26 px), stock (25 px), Your gear toggle (17 px), the Give form controls (19–25 px), Send and mic (38 px).
6. **The Give form defaults to gold** rather than the item that just arrived. It is noted here only; the plan does not change it.
7. **Workshop at 1024:** the test is only reachable through a chip or button. Three columns appear only at wider widths.

## Control inventory and target home

Every existing control, and where it goes in the target layout. "Kept" means it keeps its current behavior.

| Control | Today | Target (task) |
| --- | --- | --- |
| Brand, Workshop / Demo nav | Site header | Site header (5) |
| Build your own NPC → | Site header (hidden on phone) | Site header; visible on phone too, e.g. in the header or the village toolbar (5, 8) |
| Day/time, gold | Site header HUD | Village toolbar on top of the stage (5) |
| +1 hour, Help (hints toggle), Menu (New game… confirm, Back to entrance) | Site header HUD | Village toolbar (5) |
| Hint strip (link, Turn off hints, ×, example chips) | Under the map | Compact strip at the stage's bottom edge, above the utility bar (5) |
| Phaser village, click, E, WASD | Stage | Stage, fills the space between the toolbar and the utility bar; never remounts (5) |
| NPC picker, model line, stock button | Conversation head | Kept together at the top of the conversation (6) |
| Transcript, offer cards, Accept, delivery notices, pending | Conversation | Kept; scrolls inside the panel (6) |
| Composer (input, mic, Send) | Conversation | Anchored at the bottom of the conversation (6) |
| Error alert | Under the composer | Kept visible in the conversation (6) |
| Forge rows, Wait until ready | Panel under the composer | Compact progress rows in the conversation column with expandable details (6) |
| Your gear (items, art, Give form) | Disclosure under the forge | **Bag** drawer, opened from the utility bar, showing the count (2–4) |
| Rumours (News, new cue) | Tool column 1 | **Rumours** drawer, with the unread cue on the bar button (2–4) |
| Village log (filters, Technical details) | Tool column 2 | **Inspect village** drawer → **Activity** tab (4) |
| Sandbox tools (note, Read it, form, preview, Make it so) | Tool column 3 | **Inspect village** drawer → **Sandbox** tab, kept mounted (4) |
| Brann's stock drawer | Page-right drawer | Same drawer slot as the utility panels; only one panel open at a time (2, 4) |

## Target layout

### Desktop (≥ 1024 wide)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ NPC Workshop   Workshop  Demo                            Build your own NPC →│  site header
├───────────────────────────────────────────────────┬──────────────────────────┤
│ Day 1 · 08:00  🪙 200   [+1 hour]       [Help][Menu]│ [Brann · blacksmith ▾]   │
├───────────────────────────────────────────────────┤ Muse Spark · …  [Stock]  │
│┌───────────────┐                                  │──────────────────────────│
││ Bag        [×]│                                  │ transcript (scrolls)     │
││ (drawer slot: │         village (Phaser)         │  offer card [Accept]     │
││  left of the  │                                  │  delivery notice         │
││  stage, over  │                                  │                          │
││  the map,     │                                  │──────────────────────────│
││  own scroll)  │                                  │ ▸ Hammerhead Blade  16:00│  forge rows
│└───────────────┘                                  │   [Wait until ready]     │
│ hint: Negotiate further, or accept…   Turn off  × │──────────────────────────│
├───────────────────────────────────────────────────┤ [message……] [🎙] [Send]  │  composer
│ [Bag · 1 •new]  [Rumours •]  [Inspect village]    │                          │  utility bar
└───────────────────────────────────────────────────┴──────────────────────────┘
```

### Phone (< 768 wide)

```
┌──────────────────────────────┐
│ NPC Workshop  Workshop Demo  │
│ Build your own NPC →         │
├──────────────────────────────┤
│ Day 1 · 08:00 🪙200 [+1h][≡] │  village toolbar (Help in the ≡ menu, or kept as its own 44 px button)
│                              │
│   compact village (~45dvh)   │
│                              │
│ hint strip                   │
├──────────────────────────────┤
│ [Bag 1] [Rumours] [Inspect]  │  utility bar, 44 px targets
├──────────────────────────────┤
│ [Brann · blacksmith ▾][Stock]│
│ transcript                   │
│ forge rows                   │
│ [message…………] [🎙] [Send]   │
└──────────────────────────────┘
  utility panel → bottom sheet up to ~85dvh, its own scroll, Close always reachable
```

### Drawer placement decision

- **Desktop:** one drawer slot inside the stage, anchored to the **left edge** and above the utility bar. It spans the stage's height, with width `min(420px, 45%)`, overlays the map and has its own scroll area. It sits next to the bar buttons that open it. It never covers the conversation, the composer or the village toolbar, and it never resizes the Phaser container. **Stock uses the same slot**, so opening any panel closes the others. This replaces today's page-right drawer that covers the conversation.
- **Phone and narrow widths:** the same panels become a bottom sheet. If it covers the page, it gets real modal semantics (inert background, contained focus, restored focus), as task 8 requires. The desktop drawer stays nonmodal, with today's Escape, opener-restore and movement-key protection from `Drawer.tsx`.
- **Inspect village** holds the **Activity** and **Sandbox** tabs. The active tab is remembered separately from which panel is open, and both tab bodies stay mounted so filters and an unsent report survive.
