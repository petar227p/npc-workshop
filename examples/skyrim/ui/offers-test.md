# Task 4: offers and acknowledged delivery

The current task-five package adds Brann activation; use [the latest installation and activation checklist](activation-test.md). The F9 entry point and offer checks below remain available for diagnostics. The build record below describes the earlier task-four package.

The F9 panel now shows offer cards alongside the transcript, with item, quantity, unit price and exact total. Player gold appears above the cards and in purchase confirmation. Up to eight offers are available, two per page. Fractional unit prices are rounded to two decimals and marked `~` when approximate; the integer total is the authoritative charge.

Review offer opens a confirmation bound to that exact contract and offer revision. Click **Confirm purchase** to accept or **Back** to return. Enter never confirms a purchase; Esc closes the entire panel and releases input. An unchanged poll preserves confirmation, while changed/withdrawn terms, a busy service or insufficient gold dismiss it. Reopening the panel restores current offers but requires a fresh review before accepting.

Accept is serialized with chat commands through the existing v2 poll stream. The SWF locks immediately, Papyrus checks the cached contract/revision and actual gold, and the adapter validates current terms before API mutation. A completed command receipt alone never means delivery: **Applying trade** remains locked until Skyrim's checked inventory transfer and matching acknowledgement produce **Trade complete**. An ambiguous failure requires recovery without automatic retry. Acceptance preserves any unsent chat draft, including across closure/reopening.

## Install

1. Quit Skyrim completely. Retain the previous package for rollback; builds also back it up under `examples/skyrim/dist/package-backups`.
2. Install `examples/skyrim/dist/NPCWorkshopSkyrim.zip` through the existing mod profile, or extract its contents into Skyrim's **Data** directory. Install the matching `Scripts/NWBridgeQuest.pex` and `Interface/NPCWorkshop/Conversation.swf` together. The ESP/form IDs and native dependencies are unchanged.
3. Start the API and the v2 bridge as described in the main Skyrim README. An already running task-three v2 bridge can serve this package. If restarting the bridge, reload a known test save to renew its loaded session.
4. Launch through SKSE, load a disposable save and stand near Brann outside Warmaidens, out of combat. Press **F9**, wait for Ready, then negotiate. Normal actor activation remains task 5.

## Gameplay acceptance — pending user verification

- Ask for two iron daggers and negotiate a price you can afford. Confirm the card shows the correct item, quantity, unit price, total and actual player gold. Check the transcript still scrolls and consecutive chat turns work.
- Review an offer. Compare the confirmation with the card, including total, contract and revision. Back must leave inventory unchanged. Enter, Shift+Enter and typing must never accept a purchase. Esc must close the panel and restore game input.
- Review again and click Confirm purchase repeatedly. Expect one acceptance, one physical transfer and a gold decrease equal to the displayed total. The card must disappear when its contract stops being proposed. Status must progress through Applying trade to Trade complete only after acknowledgement; compare both inventories before/after. Reopen F9 and verify the action is not replayed.
- Keep an unsent chat draft before accepting. It must survive successful/rejected acceptance and close/reopen. Close during acceptance or Applying trade, then reopen: the submitted action continues and the latest state appears without another acceptance. Reopening a confirmation before submission must require a fresh review.
- If another interface renegotiates or withdraws the selected offer while confirmation is open, the old confirmation must close. Accepting stale cached terms before the next poll must be rejected by the adapter rather than silently accepting new terms. No inventory should change for stale terms.
- An unaffordable card cannot be reviewed/accepted. If player gold falls below the total while confirmation is open, confirmation must close on the next snapshot. A queued accept still undergoes actual inventory/ledger checks.
- Service loss during acceptance must show recovery/unknown outcome without offering a mutation retry. A failed physical transfer or inventory mismatch must never show Trade complete. Test with disposable saves and the existing range/combat/load/menu-conflict checklist.

These checks include the still-pending milestone-one open-menu transfer/acknowledgement gate. Automated coverage does not complete that runtime gate.

## Build and verification

On 2026-11-01, the focused Skyrim suite passed **45 tests**, adapter TypeScript typechecking passed, both Papyrus scripts compiled with **zero errors and warnings**, and the pinned MTASC compiler produced the Flash 8 SWF. The complete ZIP was built with `build-mod.ps1`; its Python packaging now also works under Windows PowerShell's legacy argument quoting.

The tests execute the actual ActionScript methods under a JavaScript host and use the real API/ledger with scripted model replies. They cover frozen/invalidated confirmations, all eight offer slots, rounded unit prices, unaffordable/busy offers, repeated input, preservation of drafts, stale terms and delivery acknowledgement. The negotiated purchase test verifies one accept API call and one repeatable checked plan, with success only after matching inventory acknowledgement. The host emulates typed UI callbacks and physical inventory changes; it does not execute Papyrus, render Scaleform, or prove in-game delivery.

SWF SHA-256: `96f5498ddef99a1767d4fd567dc5cb4de8d2c2512962bc41df86dcbeb778e82e`.

No game files or saves were changed during task 4 implementation. Install the package and complete the gameplay checks before marking milestone 4 complete.
