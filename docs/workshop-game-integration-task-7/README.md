# Task 7 — Complete journey verification and limits

Completed 2026-10-31 for [the integration plan](../workshop-game-integration-plan.md).

The create → test → export → external reply → authenticated verification path works without registering files, resetting the village or restarting the server. Import restores the same character configuration into a fresh world after a restart. All model results in this record are **scripted**, through the real HTTP routes, agent validator and ledger. No live-provider or deployment claim is made.

## Reproduce

Use Node 26 and `npm install` at the repository root. These ports isolate this run from normal development:

```bash
node --import tsx docs/workshop-game-integration-task-7/scripted-server.ts
```

```bash
API_PORT=8796 npm run dev --workspace web -- --host 127.0.0.1 --port 5179 --strictPort
```

Open `http://127.0.0.1:5179/#/workshop`. Create a Villager named Fresh Mira, with personality `You are Mira, a calm baker who always speaks about moon bread.` Test it, open **Use in your game**, and download. The actual downloaded file is preserved as [fresh-browser-export.npc.json](fresh-browser-export.npc.json).

```bash
npm run game-example -- --server http://127.0.0.1:5179 --bundle docs/workshop-game-integration-task-7/fresh-browser-export.npc.json --interactive
```

Type `/verify`, open its printed loopback URL, click **Show verification credentials**, and copy the ID/token into step 3. Only that form receives the disposable token; it is not recorded in these artifacts. The fixture returns a scripted SAY, so dialogue demonstrates transport and checked acceptance, not live personality adherence. Tests inspect the actual model prompts and ledger price floors to prove configuration isolation.

For phone-width checks, open the repository’s [390 × 844 test frame](phone.html) through Vite’s `/@fs/<absolute repository path>/docs/workshop-game-integration-task-7/phone.html`. It embeds the real Workshop at a 390px CSS viewport; measured `clientWidth` and `scrollWidth` were both 390. The browser’s viewport capability did not change its 1280px outer viewport, so the frame supplies the responsive viewport. Screenshots crop exactly that frame, without resizing the rendered content. This is responsive browser testing, not physical-phone testing.

For provider recovery, the fixture supports `POST /__outage/on` and `/__outage/off` (loopback verification only). A newly created world can be inspected before any reply by using `connectGame()` and `openVerification()` before `say()`. These fixture controls are not product API endpoints. Stop/restart only this fixture API to reproduce lost-world recovery; leave Vite running, import the download again, and run a new example. Normal connections do not require a restart.

## Browser walkthrough and evidence

| Action | Observed result |
| --- | --- |
| Fresh guided Villager → personality → create/test | Valid Fresh Mira draft; accepted scripted SAY highlights handoff |
| Type an unsent message, open handoff | Heading receives focus; **Not connected**; no model call or world allocation from opening |
| Download Fresh Mira | Actual portable file produced; backend example reads it without registry changes |
| Enter nonexistent world | Unavailable/expired guidance says to create a fresh world, not restore old runtime progress |
| Enter existing world ID with wrong token | Token refused; automatic retries stop; draft and test retained |
| Enter matching example credentials | **First reply received — Your game connected**; server’s `e_0002` evidence ([desktop](fresh-connected-desktop.png), [390px form](fresh-connected-phone.png)) |
| Fresh handoff at 390px | Correct responsive layout, width = scroll width = 390 ([intro](fresh-phone.png)); fields/actions usable |
| Back from handoff | Same spoken conversation and `Keep this unsent` text; focus returns to opening handoff button |
| Reopen after leaving | ID/token empty, **Not connected**, Verify disabled |
| Edit name to Edited Mira and change personality | Download remains Fresh Mira; stale warning; verification unavailable for edited draft ([evidence](stale-copy.png)) |
| Import actual Task 2 Portable Ada export | Replacement warning shown for edited draft; successful import opens a fresh test session; imported character tests successfully |
| Enter Fresh Mira world credentials for imported Ada | **Configuration mismatch**, no connection success; bounded checks stop ([evidence](mismatch-desktop.png)) |
| Create matching Ada world before calling `say()` | **World created**, no success claim despite a matching snapshot ([evidence](world-created.png)) |
| Enable fixture outage, send external message | Safe unavailable fallback; **Unavailable or expired** with provider/key/quota recovery ([evidence](provider-outage.png)) |
| End outage and send external message; retry | **First reply received** with `e_0004` evidence ([desktop](imported-connected-desktop.png), [390px form](imported-connected-phone.png)) |
| Keyboard from World ID → Tab | Focus reaches masked World token field; visible focus and form buttons usable |
| Stop and restart fixture API; retry old credentials | Old world is unavailable, with explicit settings-versus-progress recovery guidance ([evidence](restart-expired.png)) |
| Import actual Fresh Mira download after restart | Fresh test session; same normalized character configuration restored |
| Run example again from that file | New world ID, original Fresh Mira name/settings and accepted external replies; matching verification succeeds ([evidence](restart-fresh-connected.png)) |

Failed/cancelled imports, malformed/versioned/off-map inputs and full bundle equality have additional [Task 2 browser evidence](../workshop-game-integration-task-2/README.md) and maintained automated coverage. Snapshot matching and authentication failures in this run do not alter drafts or conversation. The old and new worlds have independent IDs/tokens; first-reply evidence starts empty for each new world.

## Automated checks

| Command | Result |
| --- | --- |
| `npm test` | **514 passed in 43 files**; [raw output](tests.txt) |
| `npm run typecheck` | Passed across shared/server/web/scripts/example; [raw output](typecheck.txt) |
| `npm run build --workspace web` | Passed; existing large Phaser chunk warning; [raw output](build.txt) |
| `git diff --check` | Passed |
| `node --check examples/game-backend/game.mjs` and `node --check examples/game-backend/verification.mjs` | Passed |

Coverage includes:

- [Bundle contract](../../shared/src/integration.test.ts) and [transfer tests](../../web/src/__tests__/npcTransfer.test.ts): complete round trip, malformed/versioned/oversized/unsupported inputs and failure-safe imports.
- [Draft API tests](../../server/src/routes/__tests__/v1-drafts.test.ts) and [legacy API tests](../../server/src/routes/__tests__/v1.test.ts): world-local names/labels/signals, nested snapshot isolation, map rules, custom/registry requests, quota reservation, provider/repair costs and atomic event caps.
- [Connection API tests](../../server/src/routes/__tests__/v1-connection.test.ts): authenticated/per-NPC evidence; actual timer broadcasts and Workshop calls cannot count; no spoken trigger/silent/fallback/unavailable/over-cap outcomes; pending transaction; independent snapshot hashes and prompts after edits; original world retains its original zero-price limit while an edited world rejects that same offer at its higher floor; rejected action retains gold/stock; restart/reimport, eviction and exhausted quota.
- [Connection helper tests](../../web/src/__tests__/connectionStatus.test.ts): matching browser/Node hashes, all states, malformed responses, safe error handling, Authorization-only credentials, six-read bound, terminal errors, manual retry and cleanup during pending reads.
- [Backend example tests](../../examples/game-backend/game.test.ts): real exported file, checked acceptance/rejection, signals handled once across replay/pagination, authoritative totals without duplicate delivery, errors and no token in output/URLs/serialized connection. [Local-page test](../../examples/game-backend/verification.test.ts): same-origin-only credential reveal, unexpected Host, cross-site requests, no-store, framing protection and shutdown.

## Current limits and pending validation

The [root README](../../README.md) and [backend guide](../../examples/game-backend/README.md) now document the complete path, authenticated status, bounded verification, safe token handoff, restart recovery and fixed-snapshot behavior. Locations, schedules, clock, perception and sprites still use the bundled village. Arbitrary maps, custom verbs, engine adapters, persistent worlds, accounts and production credential management remain outside this milestone. The example’s per-process event deduplication is not durable exactly-once processing across crashes.

No live-provider calls or deployment were performed. A human newcomer participant was not available; human walkthrough validation remains pending. Physical phone/browser-matrix and production hosting checks were not performed. These are separate validation items, not inferred from scripted replies. Temporary verification servers/example processes were stopped after checks; normal development origins and unrelated working-tree changes were preserved.
