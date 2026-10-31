# NPC Workshop

Build NPCs that act within your game's rules.

**NPC Workshop is an authoring and testing tool.** Create a character, choose its supported abilities and limits, then test conversations and actions in an isolated session. Start from a role template, use the guided setup or questionnaire, or load an editable example. Drafts stay in your browser; the server validates their settings.

The model proposes actions as JSON (`OFFER`, `REFUSE`, `SAY`, ...). A deterministic **ledger** checks what can happen against code-owned rules: stock, gold, price floors, item limits and timers. Accepted actions become events; rejected proposals are logged. The model never writes the delivered item's stats.

**Brann the blacksmith is the playable demonstration**, inside the example village. Negotiate an order, accept a checked offer, and collect the finished item. The workshop and demo are separate destinations: testing a draft does not publish it to the village. To connect saved definitions to another game, follow [the developer API instructions](#use-the-npcs-from-your-own-game).

Built for the Meta Muse hackathon (Nov 2026).

## Why

Dialogue alone cannot establish which trades a game can honour. NPC Workshop separates character decisions from authoritative state changes:

| The model does | The code does |
|---|---|
| Speaks in character, haggles, picks a verb | Owns gold, stock, prices, timers, delivery |
| Proposes `{ action, say, ...fields }` | Validates it with Zod + one rule per verb |
| Gets one repair retry with the rejection reason | Logs every verdict; the event log is the source of truth |

The world is rebuilt by replaying the event log, so every session is auditable and replayable. Items are delivered by the clock (code), with the stats copied from the accepted offer. The model never writes them.

## What works today

- **NPC Workshop** (`#/workshop`): generic Merchant, Craftsperson, Villager, Bard / Town crier and Guard starters; guided creation and a short questionnaire; editable persona, model, permissions, catalogues, signals, schedules, perception, appearance, labels and fallbacks. Validation checks the current revision. An **isolated test session** runs the draft through the same action checks as the demo. Suggested normal/challenge messages call its configured model; a separately labeled controlled test submits an invalid proposal without calling a model.
- **Engine** (`server/src/engine/`): pure functions, no I/O. `act(world, actor, rawJson)` parses, checks the actor's role, validates, then commits or logs `ACTION_REJECTED`. Verbs are a library of one schema + one rule each.
- **NPCs as data**: `npcs/<id>.json` (name, verbs, which verbs the model may choose, fact blocks, cue, fallbacks) plus `prompts/<id>.md` (persona). Adding an NPC means adding two files.
- **Generic agent turn** (`server/src/agents/`): builds a strict flat JSON schema from the NPC's model verbs, calls the model, maps the reply to an action, retries once with the rejection reason, then falls back to a safe line.
- **Blacksmith demo** (`#/village`): a walkable Phaser village with Brann selected initially, chat and checked offer cards, timed forge delivery, gear and stock, contextual hints, knowledge inspection and the event ledger. **Build your own NPC** returns to the normal workshop draft or starter screen.
- **Schedules, perception and gossip**: server-owned positions determine witnesses. Villagers can pass on known events; the bard retells and the crier announces news. Knowledge inspection distinguishes witnessing from secondhand reports and shows their sources and confidence. Wording can drift; cited event IDs are checked.
- **Item pictures**: Muse Image renders the accepted item as a pixel sprite, snapped to a fixed palette.
- **Speak instead of typing**: the mic beside the chat box records a line (up to 30 s), the browser encodes it as 16 kHz WAV itself, and Muse Voice Transcribe turns it into text in the box. You read it over and press Send; typing always works.
- **Signals**: an NPC can ask the game to do something the ledger has no verb for (open a gate, raise the alarm), only from a list it declares. The game's own code decides whether it happens. Garrick the guard at the gate uses them.
- **Dev API** (`/api/v1`): another game makes its own world from the NPCs it picks, then sends what its player says and does and gets back the events to show. No cookie, a bearer token per world, the same ledger. See [Use the NPCs from your own game](#use-the-npcs-from-your-own-game).
- **Model layer**: plain `fetch` clients for the Meta Model API and Baseten, with retries, a JSONL recorder, replay and mock clients. Keys stay on the server.
- **Tests and proof**: Vitest coverage for the engine, API, guided setup and UI helpers; `npm run ledger-proof` verifies controlled invalid proposals separately from live-model behavior. See [the product-hierarchy verification record](docs/product-hierarchy-final-2026-10-31/README.md).

Current limits: abilities come from the supported code-owned library. The editor's map-dependent settings use the bundled village, and bench/village worlds still share server-session infrastructure. Browser drafts have no deployment/export flow or automatic update of a running village. Development file saving plus a server restart is the current handoff; broader runtime separation and a live-site spend budget remain future work.

## Models

| Role | Model | Via |
|---|---|---|
| Brann, the blacksmith (haggling over made-to-order work) | Muse Spark 1.3 | Meta Model API |
| Mira, villagers, gossip and attackers | Muse Spark Open (`meta-models/muse-spark-open-1026`, configurable) | Baseten |
| Item picture | Muse Image | Meta Model API |
| Spoken lines to text (the chat box's mic) | Muse Voice Transcribe | Meta Model API |

Muse Spark and Muse Spark Open always reason, so the clients send a low `reasoning_effort` and a generous token limit. Baseten does not enforce `json_schema` for Muse Spark Open, so every reply is Zod-validated with one repair retry. Latency and cost numbers from real calls are in [`docs/api-notes.md`](docs/api-notes.md); `npm run latency-test` reproduces them (about 50 calls, six minutes, roughly $0.20).

## Run it

Developed on Node 26 (older versions are untested).

```bash
npm install
cp .env.example .env   # add MODEL_API_KEY (Meta) and BASETEN_API_KEY
npm run dev
```

Open [NPC Workshop](http://localhost:5174/#/). The API runs on :8787. The server starts without keys: starters, questionnaire and validation work without model calls. Conversations require the selected NPC's provider key; image generation and transcription require the Meta key.

- [Workshop](http://localhost:5174/#/workshop): create, configure and test an NPC.
- [Blacksmith demo](http://localhost:5174/#/village): play the existing example village.

**Save to files — development only** is enabled by the development runner, and never in production. It writes definition/persona files and optional art references on that server. Existing files require overwrite confirmation. Restart the server to load saved definitions into the village and developer API registry; this also recreates in-memory worlds. Browser drafts and test sessions remain separate from these files.

Other scripts:

```bash
npm test              # Vitest
npm run typecheck     # shared, server, web, scripts
npm run smith-demo    # live order -> accept -> skip -> delivery, then an absurd request and an injection attempt
npm run latency-test  # times each model setup, checks each answer against the ledger
npm run ledger-proof  # controlled inputs (no model): a valid offer, then invalid ones the ledger must refuse unchanged
```

Every model call is recorded to `logs/<session>.jsonl` (no keys). Play one back offline with `REPLAY=logs/<file> npm run smith-demo`.

## Create and test an NPC

1. Open Workshop and choose **Create your NPC**, a role template, **Help me choose**, or **Blank NPC**. Named library entries are examples, separate from role templates.
2. Set the character's personality and supported abilities. Change catalogue limits, signals or automatic behavior as needed. Location, schedule, perception and NPC sprite controls currently use the example village context; generated item artwork is configured separately.
3. Wait for a valid preview, then choose **Test your NPC**. Try a normal conversation and a challenge. A valid configuration is checked again when it proposes an action. The controlled rejection test is explicitly separate from the model's answer.
4. Return from the demo to continue the draft. To use it outside the browser, follow the development file workflow and [developer API setup](#use-the-npcs-from-your-own-game).

An NPC definition is `npcs/<id>.json` plus its persona in `prompts/<id>.md`, with optional art references. This is an excerpt from [Brann's complete definition](npcs/smith.json); the full file also supplies the catalogue, starting stock, model and example-world settings:

`npcs/smith.json`:

```json
{
  "id": "smith",
  "name": "Brann",
  "verbs": ["SAY", "OFFER", "COUNTER_OFFER", "REFUSE", "START_WORK"],
  "model_verbs": ["SAY", "OFFER", "COUNTER_OFFER", "REFUSE"],
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

The workshop's development save control writes these files; testing alone does not.

## Use the NPCs from your own game

An engine or script that sends HTTP can call the running NPC server. The server owns its world: your game sends what the player did and renders the returned events. Each supported action goes through the ledger. Game-specific actions requested through signals remain your game's responsibility.

Start by saving the definition/persona on a development server and restarting it, or by placing the files in that server's configuration before starting it. `GET /api/v1/npcs` lists the loaded registry; worlds select from those IDs. The browser draft is not sent to this API or deployed to another game. The existing server still uses bundled village geography; adapting world/map behavior is additional integration work. The routes below describe the current file/server workflow, not an engine plugin or live publication feature.

```bash
# Which NPCs there are, and what each sells
curl -s localhost:8787/api/v1/npcs

# A world with just the NPCs you want. Keep the token: it is the only key to this world.
curl -s -X POST localhost:8787/api/v1/worlds -H 'content-type: application/json' -d '{"npcs":["smith","merchant"]}'
# → { "world_id": "…", "token": "…", "npcs": [...], "state": {...} }

W='http://localhost:8787/api/v1/worlds/REPLACE_WORLD_ID'
AUTH='authorization: Bearer REPLACE_TOKEN'

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

Every call on a world sends `Authorization: Bearer <token>`. Each action returns `{ ok, reason, outcome, events, said, signals, state }`: `reason` is why the ledger refused the player's own action, `said` the NPCs' lines, `signals` what the NPCs asked your game to do (see below), `events` what the call added to the log, and `state` the world after it. The player is the actor `player`; one per world. Any site may call it (CORS is open, and the token is the only credential).

### Your game's items

Goods, materials and item types are plain names (lowercase letters, digits, `_`), so they can be your game's own item ids:

```json
"start":     { "gold": 30, "stock": { "itm_torch_01": 10, "itm_rope_7": 2 } },
"catalogue": { "in_stock": { "itm_torch_01": { "min_price": 2 }, "itm_rope_7": { "min_price": 4 } } },
"labels":    { "itm_torch_01": "pitch torch", "itm_rope_7": "hemp rope", "itm_wolf_pelt": "wolf pelt" }
```

- **Labels** are what the model and players read. The NPC's facts, history and answer schema are in those words ("pitch torch"); code turns its answer back into the id, so the ledger, the log and the API only ever see `itm_torch_01`. Two things can't share a word. A label can also name something the NPC doesn't hold yet (`itm_wolf_pelt`), so a giver can hand it over once your game syncs it in. The workshop exposes these under **Abilities & rules → Advanced → Names and labels**.
- **Your save comes first.** `POST /worlds` takes `start` for the player and any NPC, so the world begins with what your game says they hold.
- **Two-way, with one owner per change.** Changes the ledger makes (sales, deliveries, gifts) come to you as events: apply them on your side. Changes your game makes itself (loot, theft, crafting) go to the ledger as a `sync` of the new totals. A sync sent twice changes nothing; one that would take away what is promised to accepted work is refused. No verb leads to sync, so no model can ask for it.
- **Made-to-order items** arrive in `ITEM_DELIVERED` with an `item_type`, stats and an id (`i_c_001`). If your game can make custom items, map the type to a base item and apply the stats, and keep `i_c_001` → your own instance id. If it can only hand out fixed items, key the item types by your item ids and give each stat range one value (min = max): the NPC can then only promise exactly that item, at a price the ledger checks against its floor.

### Actions the ledger has no verb for

The ledger only knows trade, gifts and news. Anything else (open a gate, follow the player, start a fight) stays in your game's own code. There are three ways to connect it to an NPC, from least to most involved:

1. **Your code alone.** The NPC just talks; your game decides from its own rules and buttons ("Ask to follow", a quest flag). Fine whenever the NPC's opinion doesn't matter.
2. **A grant the ledger counts.** Something an NPC hands out in limited numbers (a gate pass, a room for the night) can be a good, free or not. Garrick the guard (`npcs/guard.json`) has three `gate_pass` at 0 gold; when they're gone, no amount of talk gets a fourth until your game syncs more in. Your game does the rest when the `GOODS_DELIVERED` event arrives.
3. **A signal.** When the NPC's own judgment should decide (the guard is persuaded to open the gate, or sees real trouble), give it the `SIGNAL` verb and declare its signals in its file with what each means: `"signals": { "open_gate": "…", "raise_alarm": "…" }`. The model can only name a declared one (the ledger refuses anything else, and the exploit suite checks it); the event changes nothing in the ledger and comes back in `signals`. Your code carries it out, or doesn't: it can check what the model can't, such as whether the player really holds a pass. Parsing the NPC's words instead would be fragile, and a player could talk it into saying the magic phrase.

The guard does both: it hands out passes (counted) and signals `open_gate` once you hold one (your call). In the village there is no game code behind a signal, so the chat shows what a game would be asked.

Limits, so a public server can't be run up: 150 model calls per world (a world out of calls still keeps time, its NPCs just stop acting on their own), 60 calls a minute across all worlds, 5,000 events per world, 200 worlds in memory (only ones idle for 30 minutes are dropped), 5 new worlds a minute per address and 20 overall, request bodies up to 16 KB.

## Layout

```
shared/        Zod action schemas, event and view types (used by server and web)
server/src/
  engine/      world state, events, verbs, validator, clock. Pure, fully tested
  agents/      the generic NPC turn and the flat-schema builder
  npcs/        loads npcs/*.json, fact blocks, conversation history
  models/      Meta + Baseten clients (chat, image, voice), recorder, replay, mock
  art/         Muse Image prompt, background removal, palette snapping
  routes/      the village's HTTP API, the dev API (/api/v1) and the workshop's preview / bench / save endpoints
web/src/       React product home, workshop and playable demo; game/ contains the Phaser village
npcs/ prompts/ NPC data files and personas
prototype/     Phaser village mock-up (Kenney art)
docs/          API notes (rate limits, latency, costs), market research
scripts/       dev runner, smith demo, latency test
```

## Roadmap

- Separate authoring/runtime concerns and support game-specific world configuration beyond the bundled village.
- Export/deployment and adding saved definitions to a running world without a restart.
- A recorded raw-LLM versus ledger comparison (not yet run); the existing per-NPC exploit reports are separate evidence.
- A non-game NPC (a parts-supplier quote desk) on the same engine, to show it isn't only for games.
- Human newcomer sessions, spoken recording, deployment and a global spend budget; existing session/turn limits are already implemented.

## Credits

Pixel art in the app and the village prototype is from [Kenney](https://kenney.nl) (Tiny Town and Tiny Dungeon, CC0).
