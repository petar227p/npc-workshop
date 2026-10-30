# NPC Workshop

Build NPCs that talk freely but can't cheat.

An LLM plays the character. A deterministic **ledger** decides what actually happens. The model only *proposes* an action as JSON (`PROPOSE_CONTRACT`, `REFUSE`, `SAY`, ...); plain code checks it against the world state (gold, stock, price floor, forge time) and either commits it as an event or rejects it. Talk the blacksmith into a free sword and the ledger says no. Prompt-inject him and nothing in the world changes.

The demo NPC is **Brann the blacksmith**. You order an item, haggle, accept a contract, wait for the forge, and get exactly the item you agreed to, with a pixel-art picture drawn by Muse Image. The **NPC workshop** is the editor for making more NPCs like him.

Built for the Meta Muse hackathon (Nov 2026).

## Why

A raw LLM in a shop is a push-over: it agrees to anything, forgets what it promised, and announces deals the game can't honour. NPC Workshop splits the job:

| The model does | The code does |
|---|---|
| Speaks in character, haggles, picks a verb | Owns gold, stock, prices, timers, delivery |
| Proposes `{ action, say, ...fields }` | Validates it with Zod + one rule per verb |
| Gets one repair retry with the rejection reason | Logs every verdict; the event log is the source of truth |

The world is rebuilt by replaying the event log, so every session is auditable and replayable. Items are delivered by the clock (code), with the stats copied from the accepted offer. The model never writes them.

## What works today

- **Engine** (`server/src/engine/`): pure functions, no I/O. `act(world, actor, rawJson)` parses, checks the actor's role, validates, then commits or logs `ACTION_REJECTED`. Verbs are a library of one schema + one rule each.
- **NPCs as data**: `npcs/<id>.json` (name, verbs, which verbs the model may choose, fact blocks, cue, fallbacks) plus `prompts/<id>.md` (persona). Adding an NPC means adding two files.
- **Generic agent turn** (`server/src/agents/`): builds a strict flat JSON schema from the NPC's model verbs, calls the model, maps the reply to an action, retries once with the rejection reason, then falls back to a safe line.
- **Playable web app**: chat with inline contract cards, a forge panel with progress and a skip-time button, your gear, stock, and a live ledger showing every event including the rejections.
- **Item pictures**: Muse Image renders the accepted item as a pixel sprite, snapped to a fixed palette.
- **NPC workshop** (`#/workshop`): edit persona, verbs, fact blocks, cue, fallbacks and radius. The server checks the draft on every edit and shows the generated schema and facts. A **test bench** runs the draft against the real model on a throwaway world, shows the ledger's verdict on each answer, and has cheat-line buttons for quick exploit tests.
- **Dev API** (`/api/v1`): another game makes its own world from the NPCs it picks, then sends what its player says and does and gets back the events to show. No cookie, a bearer token per world, the same ledger. See [Use the NPCs from your own game](#use-the-npcs-from-your-own-game).
- **Model layer**: plain `fetch` clients for the Meta Model API and Baseten, with retries, a JSONL recorder, replay and mock clients. Keys stay on the server.
- **Tests**: 100+ Vitest tests, including injection and exploit cases for the engine.

Not built yet: the walkable village, villagers that gossip, and the live-site budget caps. `prototype/` has a Phaser village mock-up with Kenney art. The design for the rest is below.

## Models

| Role | Model | Via |
|---|---|---|
| Brann, the blacksmith (haggling over made-to-order work) | Muse Spark 1.3 | Meta Model API |
| Mira, the merchant, and later villagers, gossip and attackers | Muse Spark Open (`meta-models/muse-spark-open-1026`) | Baseten |
| Item picture | Muse Image | Meta Model API |

Muse Spark and Muse Spark Open always reason, so the clients send a low `reasoning_effort` and a generous token limit. Baseten does not enforce `json_schema` for Muse Spark Open, so every reply is Zod-validated with one repair retry. Latency and cost numbers from real calls are in [`docs/api-notes.md`](docs/api-notes.md); `npm run latency-test` reproduces them (about 50 calls, six minutes, roughly $0.20).

## Run it

Developed on Node 26 (older versions are untested).

```bash
npm install
cp .env.example .env   # add MODEL_API_KEY (Meta) and BASETEN_API_KEY
npm run dev
```

Open http://localhost:5174. The API runs on :8787. The server starts without keys; the smith only needs one when you first talk to him.

Open http://localhost:5174/#/workshop for the NPC editor and test bench. Saving an NPC to disk is only enabled by `npm run dev`, and never in production. Saved NPCs appear in the village on the next server start.

Other scripts:

```bash
npm test              # Vitest
npm run typecheck     # shared, server, web, scripts
npm run smith-demo    # live order -> accept -> skip -> delivery, then an absurd request and an injection attempt
npm run latency-test  # times each model setup, checks each answer against the ledger
```

Every model call is recorded to `logs/<session>.jsonl` (no keys). Play one back offline with `REPLAY=logs/<file> npm run smith-demo`.

## Make an NPC

An NPC is two files.

`npcs/smith.json`:

```json
{
  "id": "smith",
  "name": "Brann",
  "verbs": ["SAY", "PROPOSE_CONTRACT", "COUNTER_OFFER", "REFUSE", "START_WORK"],
  "model_verbs": ["SAY", "PROPOSE_CONTRACT", "COUNTER_OFFER", "REFUSE"],
  "facts": ["clock", "purse", "stock", "catalogue", "price_floor", "open_offers"],
  "perception_radius": 4,
  "cue": "Reply to the customer's last words.",
  "fallbacks": {
    "rejected": "Hm. Let me think that through properly. Ask me again.",
    "unavailable": "The fire needs tending. Come back in a moment."
  }
}
```

`prompts/smith.md` is the persona. Optional `labels` say what the NPC calls a good or item type whose name isn't a word (see [Your game's items](#your-games-items)). `verbs` is what the ledger allows the NPC to do; `model_verbs` is the subset the model may choose, and the rest (like `START_WORK`) are issued by code only. Fact blocks are named, code-owned snapshots of the world that go into the prompt, so the model never has to remember the price floor.

Or use the workshop and click **Save to files**.

## Use the NPCs from your own game

Any engine or script that can send HTTP can use the NPCs. The server owns the world: your game says what the player did and draws the events it gets back. Every action still goes through the ledger, so your game's code can't skip the rules either.

```bash
# Which NPCs there are, and what each sells
curl -s localhost:8787/api/v1/npcs

# A world with just the NPCs you want. Keep the token: it is the only key to this world.
curl -s -X POST localhost:8787/api/v1/worlds -H 'content-type: application/json' -d '{"npcs":["smith","merchant"]}'
# → { "world_id": "…", "token": "…", "npcs": [...], "state": {...} }

W=localhost:8787/api/v1/worlds/<world_id>
AUTH="authorization: Bearer <token>"

curl -s -X POST $W/say    -H "$AUTH" -H 'content-type: application/json' -d '{"npc":"smith","text":"A plain iron dagger, please."}'
curl -s -X POST $W/accept -H "$AUTH" -H 'content-type: application/json' -d '{"contract_id":"c_001"}'
curl -s -X POST $W/tick   -H "$AUTH" -H 'content-type: application/json' -d '{"hours":3}'
```

| Route | Body | What it does |
|---|---|---|
| `GET /api/v1/npcs` | | The NPCs a world can be made with |
| `POST /api/v1/worlds` | `{ npcs?: [id…], start?: { <actor id>: { gold, stock } } }` | A new world (all NPCs if none are given), optionally starting from your game's own save; returns `world_id` and `token` |
| `GET …/worlds/:id` | | The world now: tick, the player's gold, goods, items and offers, who is where, the news |
| `GET …/worlds/:id/events?since=<event id>&limit=` | | The log from just after `since`, up to 500 events, `more` if there are others |
| `POST …/worlds/:id/say` | `{ npc, text }` | The player speaks; the NPC answers through the ledger |
| `POST …/worlds/:id/accept` | `{ contract_id }` | The player accepts an offer: gold moves, work starts |
| `POST …/worlds/:id/give` | `{ to, gift }` | The player hands over gold, goods or an item |
| `POST …/worlds/:id/tick` | `{ hours: 1–48 }` | Time passes: work comes due and is delivered by code; NPCs on triggers may act |
| `POST …/worlds/:id/report` | `{ text, place, involved?, seen_by?, notable?, hours_ago? }` | Something your game saw happen that no verb covers (a boss slain); news for whoever saw it, no gold or stock changes |
| `POST …/worlds/:id/sync` | `{ actor, gold?, stock?: { <name>: count }, reason }` | Your game changed an inventory itself (loot, theft, crafting): the new totals, logged so replay still holds |
| `GET …/worlds/:id/art/<file>.png` | | The item picture Muse Image drew for an accepted order |
| `DELETE …/worlds/:id` | | Ends the world |

Every call on a world sends `Authorization: Bearer <token>`. Each action returns `{ ok, reason, outcome, events, said, state }`: `reason` is why the ledger refused the player's own action, `said` the NPCs' lines, `events` what the call added to the log, and `state` the world after it. The player is the actor `player`; one per world. Any site may call it (CORS is open, and the token is the only credential).

### Your game's items

Goods, materials and item types are plain names (lowercase letters, digits, `_`), so they can be your game's own item ids:

```json
"start":     { "gold": 30, "stock": { "itm_torch_01": 10, "itm_rope_7": 2 } },
"catalogue": { "in_stock": { "itm_torch_01": { "min_price": 2 }, "itm_rope_7": { "min_price": 4 } } },
"labels":    { "itm_torch_01": "pitch torch", "itm_rope_7": "hemp rope", "itm_wolf_pelt": "wolf pelt" }
```

- **Labels** are what the model and players read. The NPC's facts, history and answer schema are in those words ("pitch torch"); code turns its answer back into the id, so the ledger, the log and the API only ever see `itm_torch_01`. Two things can't share a word. A label can also name something the NPC doesn't hold yet (`itm_wolf_pelt`), so a giver can hand it over once your game syncs it in. The workshop has a box for each name under "What it calls things".
- **Your save comes first.** `POST /worlds` takes `start` for the player and any NPC, so the world begins with what your game says they hold.
- **Two-way, with one owner per change.** Changes the ledger makes (sales, deliveries, gifts) come to you as events: apply them on your side. Changes your game makes itself (loot, theft, crafting) go to the ledger as a `sync` of the new totals. A sync sent twice changes nothing; one that would take away what is promised to accepted work is refused. No verb leads to sync, so no model can ask for it.
- **Made-to-order items** arrive in `ITEM_DELIVERED` with an `item_type`, stats and an id (`i_c_001`). If your game can make custom items, map the type to a base item and apply the stats, and keep `i_c_001` → your own instance id. If it can only hand out fixed items, key the item types by your item ids and give each stat range one value (min = max): the NPC can then only promise exactly that item, at a price the ledger checks against its floor.
- **Things an NPC grants that aren't trade** (a gate pass, a room for the night, a quest) can be goods: a guard "sells" `gate_pass` for 0 gold from a stock your game syncs (3 a day, say), and your game opens the gate when the `GOODS_DELIVERED` event arrives. The ledger guarantees the NPC can't grant more than your game put in its stock.

Limits, so a public server can't be run up: 150 model calls per world (a world out of calls still keeps time, its NPCs just stop acting on their own), 60 calls a minute across all worlds, 5,000 events per world, 200 worlds in memory (only ones idle for 30 minutes are dropped), 5 new worlds a minute per address and 20 overall, request bodies up to 16 KB.

## Layout

```
shared/        Zod action schemas, event and view types (used by server and web)
server/src/
  engine/      world state, events, verbs, validator, clock. Pure, fully tested
  agents/      the generic NPC turn and the flat-schema builder
  npcs/        loads npcs/*.json, fact blocks, conversation history
  models/      Meta + Baseten clients, recorder, replay, mock
  art/         Muse Image prompt, background removal, palette snapping
  routes/      the village's HTTP API, the dev API (/api/v1) and the workshop's preview / bench / save endpoints
web/src/       React app: chat, side panels, workshop editor
npcs/ prompts/ NPC data files and personas
prototype/     Phaser village mock-up (Kenney art)
docs/          API notes (rate limits, latency, costs), market research
scripts/       dev runner, smith demo, latency test
```

## Roadmap

- Walkable Phaser village with NPC schedules; the server owns positions.
- **Perception and gossip**: an NPC only knows events it witnessed or was told, with a confidence that decays as the story passes on.
- Villagers and gossip on Muse Spark Open through Baseten (Mira already runs on it).
- A raw-LLM versus ledger side-by-side, and a per-NPC exploit suite.
- A non-game NPC (a parts-supplier quote desk) on the same engine, to show it isn't only for games.
- Session and budget caps for the public demo.

## Credits

Pixel art in the app and the village prototype is from [Kenney](https://kenney.nl) (Tiny Town and Tiny Dungeon, CC0).
