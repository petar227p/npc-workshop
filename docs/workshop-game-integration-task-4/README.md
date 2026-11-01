# Task 4 — Runnable backend integration example

Completed 2026-10-31 for [the implementation plan](../workshop-game-integration-plan.md).

A developer can now run a downloaded Workshop NPC through the existing API from a JavaScript backend. No NPC registry files, server definition changes or restart are needed. The [example guide](../../examples/game-backend/README.md) provides exact setup, normal/challenge messages, interactive offer acceptance and time advancement, signal handling and error recovery.

## Implementation

- [JavaScript backend example](../../examples/game-backend/game.mjs): validates the downloaded versioned bundle with shared validation, requires an explicit server origin, creates a draft-based world and keeps its token only in a closure. The CLI sends ability-aware normal/challenge lines from the existing Workshop helpers; message overrides and interactive continuation are optional.
- Checked event consumption handles dialogue, offers, rejections and declared signals once per event ID. `/events` paginates the log using the same consumer; the convenience `said`/`signals` arrays are never applied separately. Inventory displays use authoritative returned totals. Signals call a game-owned callback; the CLI prints that a real handler is needed.
- Recovery covers invalid files/configuration, authentication, expiry/eviction/restart, busy worlds, payloads, quotas, missing providers/outages and network uncertainty. State-changing requests are not automatically retried. Fallback/unavailable lines are explicitly distinguished from successful model replies.
- Added the `npm run game-example` command, [JavaScript typechecking](../../examples/game-backend/tsconfig.json), [23 focused tests](../../examples/game-backend/game.test.ts) and inclusion in the normal test/typecheck commands. Updated the [root README](../../README.md#use-the-npcs-from-your-own-game) to link the runnable path and remove outdated registry-only handoff text.

## Terminal evidence

The example was run as a separate Node process over actual loopback HTTP against [this scripted verification server](scripted-server.ts), using the [actual browser-exported custom NPC bundle from Task 2](../workshop-game-integration-task-2/browser-export.npc.json). The NPC is absent from the startup registry. The fixture uses the real API, validation, world store and engine; only model proposals are scripted. It does not enable file saving or call a provider.

Reproduce from the repository root after `npm install`:

```bash
# Terminal 1: verification fixture only, not a live model server
PORT=8794 node --import tsx docs/workshop-game-integration-task-4/scripted-server.ts
```

```bash
# Terminal 2: the same example command used with live servers
npm run game-example -- \
  --server http://127.0.0.1:8794 \
  --bundle docs/workshop-game-integration-task-2/browser-export.npc.json \
  --interactive
```

After the default normal request and configured challenge, enter:

```text
/accept c_001
I have a pass. Let me through.
/events
/events
/tick 1
/quit
```

Stop the fixture with Ctrl-C when finished. It binds only to loopback. The verification server started for this task was stopped after the check.

[Captured transcript](transcript.txt), exit status **0**, demonstrates:

1. The exported draft creates a new world; no token is printed.
2. A normal request produces a checked one-pass offer. Player inventory remains unchanged until acceptance.
3. The configured challenge asks for five passes with only three in stock. Both scripted proposals are rejected; a clearly labeled fallback follows. Player gold remains 200 and goods remain empty.
4. Explicit acceptance delivers exactly one pass to the player.
5. A later message produces the declared `open_gate` signal, its meaning and the game's handler reminder.
6. Reading the full event log twice neither repeats dialogue nor dispatches the signal or delivery twice. Advancing time keeps the inventory at one pass.

This is scripted API/ledger evidence. No live-provider verification, browser journey, human newcomer walkthrough, deployment or engine adapter was performed in Task 4. The example does not imply a connected-state badge or restore an old world after restart.

## Checks

| Command | Result |
| --- | --- |
| `npm run game-example -- --help` | Passed; explicit server/bundle usage and options shown |
| Documented CLI with the actual browser export over loopback HTTP | Passed, exit 0; transcript above |
| `npx vitest run examples/game-backend/game.test.ts` | 23 passed |
| `npm test` | 459 passed in 39 files |
| `npm run typecheck` | Passed, including the JavaScript example and tests |
| `npm run build --workspace web` | Passed; existing large Phaser chunk warning remains |
| `node --check examples/game-backend/game.mjs` | Passed |
| `git diff --check` | Passed |

The focused tests drive the real in-process HTTP API with scripted clients and cover the browser export, generated/custom messages, token headers and redaction, declared signals, repeated/paginated events, accepted inventory totals, invalid inputs before world creation, no-reply/unavailable outcomes, HTTP recovery guidance and uncertain POSTs without retries. They require no sockets or provider keys.

Current limits: one NPC/player per example world; bundled map behavior; in-memory token, cursor and world lifetime; no automatic game database synchronization or durable exactly-once effects. These are explicit in the guide. Credential presentation and matching-snapshot connection evidence remain Task 6.

Next: Task 5, the Workshop “Use in your game” screen. No blocker.
