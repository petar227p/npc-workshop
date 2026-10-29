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

`prompts/smith.md` is the persona. `verbs` is what the ledger allows the NPC to do; `model_verbs` is the subset the model may choose, and the rest (like `START_WORK`) are issued by code only. Fact blocks are named, code-owned snapshots of the world that go into the prompt, so the model never has to remember the price floor.

Or use the workshop and click **Save to files**.

## Layout

```
shared/        Zod action schemas, event and view types (used by server and web)
server/src/
  engine/      world state, events, verbs, validator, clock. Pure, fully tested
  agents/      the generic NPC turn and the flat-schema builder
  npcs/        loads npcs/*.json, fact blocks, conversation history
  models/      Meta + Baseten clients, recorder, replay, mock
  art/         Muse Image prompt, background removal, palette snapping
  routes/      HTTP API and the workshop's preview / bench / save endpoints
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
