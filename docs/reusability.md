# Reusability: other games, mods, new games

Checked 2026-10-29 against the code on `main`. Short version: the **pattern** and the **agent layer** are engine-agnostic today; the **rules** are one rule set (trade) wired in as fixed lists. Trade is the first module, not the only one the design allows.

## The pattern

An LLM plays the character; it only *proposes* an action as JSON. Plain code checks the proposal against the world and either commits it as an event or logs it as `ACTION_REJECTED` with a reason. The world is whatever the event log replays to. Nothing in that loop depends on swords, villages or Phaser: it fits any agent that touches money, stock or promises, in a game or out of one.

## What is generic today

| Layer | Where | Status |
|---|---|---|
| Engine: role check → parse → rule → commit or reject, `replay` | `server/src/engine/index.ts`, `events.ts` | Pure functions, no I/O. Actors are passed to `createEngine`; nothing names a specific NPC. |
| Agent turn: prompt from persona + code-owned facts + history, one repair retry with the rejection reason, safe fallback line | `server/src/agents/npc.ts` | Works for any NPC definition; model client is injected. |
| Strict schema generation from an NPC's verb list | `server/src/agents/flat.ts` | Mechanism is generic; enums come from each NPC's own catalogue. |
| Model layer: OpenAI-compatible client with retries, JSONL recorder, replay, mock | `server/src/models/` | Usable as is with any OpenAI-compatible provider. |
| NPCs as data: `npcs/<id>.json` + `prompts/<id>.md`, workshop editor, test bench with attack lines | `npcs/`, `web/src/Editor.tsx`, `server/src/routes/editor.ts` | Generic idea; the forms know trade fields only. |

## What ties it to this game

1. **Closed verb set.** `VERBS`, `ACTION_SCHEMAS`, the `EngineEvent` union, the `apply` switch, `LEDGER_VERBS` / `MODEL_VERBS`, the `LEDGER` map in `npcs/load.ts`, the flat verbs and the history renderer are hardcoded. Adding `ATTACK` or `OPEN_GATE` touches about 10 places across `shared`, `server` and `web`.
2. **Fixed world shape.** `World` is gold, stock, contracts and items. There is no slot for HP, reputation, quest flags or faction standing.
3. **Trade in the shared types.** `STATS` is damage / weight / durability, so a made-to-order item is always weapon-shaped. Fact blocks are a closed enum, all about trade.
4. **Literals.** `'player'`, `'village'` and `'clock'` are defaults inside rules; `buildNpc` checks places against the village map by default; `game.ts` uses a global `act` and `smith`.
5. **Time.** One tick is one hour; schedules use hours 0–23.
6. **Delivery.** A Hono server with cookie sessions and player-shaped routes (`/api/say`, `/api/accept`); private `@blacksmith/*` workspaces run with `tsx`. No host-agnostic protocol yet.
7. **Speed.** About 4 s per turn on Muse Spark at low effort: fine for shops and quest givers, too slow for combat barks. `apply` clones the world per event, so a very long log replays in quadratic time.

## As a mod for an existing game

Feasible, medium-to-hard. The usual setup for AI NPC mods applies: this server runs as a local sidecar and a thin in-game mod (C#, Lua, Java) talks to it over HTTP or WebSocket.

The hard part is **who owns the state**. In a mod the host game owns gold and inventory, so the ledger needs an "external authority" mode:

1. Before a turn, snapshot the game's state into `World`.
2. Validate the proposal exactly as now.
3. The mod carries out the committed event in the game (move gold, spawn the item).
4. Anything the game changed on its own is logged as a sync event, or replay stops being the truth.

Made-to-order items with free stats also need a game that can spawn custom items; many can't. Shopkeepers, haggling and quest givers fit best, which is what the toolkit already does.

**Built since (2026-10-30, branch `dev-api`):** steps 1 and 4 exist as the dev API's `start` (a world begins from the game's save) and `sync` (the game's own changes, as totals, logged as `SYNCED`; refused if it would take what is promised to accepted work). Step 3 is the game applying the events it gets back. Item ids can be the game's own, with `labels` so the model reads words. Games that can't spawn custom items can key item types by their ids with fixed stats (min = max). Non-trade grants (a gate pass, a room) can be goods the game syncs into the NPC's stock. **And on branch `game-actions`:** a game action that is neither trade nor a grant is a declared **signal** (`SIGNAL` verb, `signals` in the NPC file): the ledger checks the name is declared and logs it, the game's own code carries it out or doesn't. So a new kind of action no longer needs a new verb, as long as the game owns its effect; a verb is still needed when the ledger itself must own the state (as with gold and stock).

## As the base of a new game

A good fit: here the ledger *is* the authority, so the sync problem disappears. A JS/TS game (Phaser, as in the demo village) uses it directly. Godot, Unity or Unreal use it as a backend; the engine is about 600 lines of pure logic and could be ported, but model calls belong on a server anyway to keep keys private. The server is already authoritative, so multiplayer gets cheat-proof NPCs without extra work.

## Path to a reusable toolkit (after the hackathon)

1. **Registries** for verbs, events and fact blocks: one `defineVerb({ schema, rule, apply, flat, describe })`, so a verb lives in one place.
2. **Pluggable world state:** modules add their own slice and reducer; trade becomes the first module.
3. **Config instead of literals:** player id, default place, clock actor, stat names per catalogue.
4. **Packages:** `core` (engine), `agent` (turn, schema, models), `trade`, `server`, `workshop`.
5. **Host protocol:** stateless `POST /turn { npc, snapshot, input } → events` plus WebSocket, with the external-authority mode for mods.
6. **Snapshots** so replay stays linear.

## For the pitch

Honest claim: *"The model-proposes, code-decides loop and the agent layer are engine-agnostic; trade is the first rule set."* The parts-supplier quote desk (PLAN.md, Nov 1) is the cheapest proof that it isn't only for games. Avoid "any dev can drop it into any game today": the verb set is closed until step 1 above lands.
