# Developer API reference

Any engine or script that can send HTTP can call a running NPC server. The server owns the world: your game sends what the player did and renders the events that come back. Every supported action goes through the ledger. Game-specific actions requested through [signals](#actions-the-ledger-has-no-verb-for) remain your game's responsibility.

All routes are under `/api/v1` on the API port (`:8787` in development).

## Creating a world from a downloaded NPC

Download an NPC from Workshop, then send its bundle's `npc` configuration as `{ definitions: [bundle.npc] }` to `POST /api/v1/worlds` from your backend. The server validates the draft and creates a new world without writing registry files or restarting. Each world owns a snapshot of its configuration, so later edits affect only newly created worlds.

Keep the returned token on your game's backend. The local verification flow briefly copies it into Workshop memory; never put it in URLs, analytics, logs, committed files or a distributed game client. Serve Workshop on localhost or HTTPS so the browser can compute snapshot hashes.

### Runnable backend example

Run the example from the repository root while the NPC server is running:

```bash
npm run game-example -- --server http://localhost:8787 --bundle "$HOME/Downloads/your_npc.npc.json"
```

It keeps the token in memory and consumes checked events once. Add `--interactive` to continue the same world with messages, `/accept ID`, `/tick HOURS`, `/events` and `/verify`. See [setup, signal handling and recovery](../examples/game-backend/README.md).

### Using registry NPCs instead

`GET /api/v1/npcs` lists the IDs in the startup registry. Pass either `definitions` or `npcs` in each request; omitting both selects all startup NPCs. Worlds currently use the bundled village geography and are lost when the server restarts. Reimporting a bundle restores its settings into a fresh world, not an earlier conversation or inventory.

### Connection verification

Workshop's **Use in your game** screen compares a SHA-256 fingerprint of the complete normalized draft with private, server-side evidence of an external reply. World creation, Workshop bench calls and timer activity do not count as a reply. Verification polls only after you enter credentials, at most six times per submission, with manual retry.

## Quick example

```bash
# List the NPCs and what each sells
curl -s localhost:8787/api/v1/npcs

# Create a world with the NPCs you want. Keep the token: it is the only key to this world.
curl -s -X POST localhost:8787/api/v1/worlds -H 'content-type: application/json' -d '{"npcs":["smith","merchant"]}'
# → { "world_id": "…", "token": "…", "npcs": [...], "state": {...} }

W='http://localhost:8787/api/v1/worlds/REPLACE_WORLD_ID'
AUTH='authorization: Bearer REPLACE_TOKEN'

curl -s -X POST $W/say    -H "$AUTH" -H 'content-type: application/json' -d '{"npc":"smith","text":"A plain iron dagger, please."}'
curl -s -X POST $W/accept -H "$AUTH" -H 'content-type: application/json' -d '{"contract_id":"c_001"}'
curl -s -X POST $W/tick   -H "$AUTH" -H 'content-type: application/json' -d '{"hours":3}'
```

## Routes

| Route | Body | Description |
|---|---|---|
| `GET /api/v1/npcs` | | The startup registry. Custom drafts can also create worlds. |
| `POST /api/v1/worlds` | `{ npcs?: [id…], definitions?: [NpcDraft…], start?: { <actor id>: { gold, stock } } }` | Creates a world from registry IDs or 1–8 drafts (one or the other), optionally starting from your game's own save. Returns `world_id` and `token`. |
| `GET …/worlds/:id` | | Current world state: tick, the player's gold, goods, items and offers, NPC positions and news. |
| `GET …/worlds/:id/connection` | | Authenticated snapshot hashes, the first committed external spoken reply per NPC, the latest say outcome, busy state and remaining calls. Contains no token or conversation text. |
| `GET …/worlds/:id/events?since=<event id>&limit=` | | Events after `since`, up to 500, with `more` set if others remain. |
| `POST …/worlds/:id/catalogue` | `{ npc, goods: [{ id, label, min_price }…] }` | Replaces what a stock-selling NPC may sell in this world, using 1–128 goods from your game. Only your authenticated game can call this; the model cannot. Not available for NPCs that make items to order. |
| `POST …/worlds/:id/say` | `{ npc, text }` | The player speaks; the NPC answers through the ledger. |
| `POST …/worlds/:id/accept` | `{ contract_id }` | The player accepts an offer: gold moves and work starts. |
| `POST …/worlds/:id/give` | `{ to, gift }` | The player hands over gold, goods or an item. |
| `POST …/worlds/:id/tick` | `{ hours: 1–48 }` | Advances time: work comes due and is delivered by code; triggered NPCs may act. |
| `POST …/worlds/:id/report` | `{ text, place, involved?, seen_by?, notable?, hours_ago? }` | Reports something your game observed that no verb covers (for example, a boss slain). Becomes news for witnesses; changes no gold or stock. |
| `POST …/worlds/:id/sync` | `{ actor, gold?, stock?: { <name>: count }, reason }` | Records inventory changes your game made itself (loot, theft, crafting) as new totals, logged so replay stays consistent. |
| `GET …/worlds/:id/art/<file>.png` | | The item picture Muse Image generated for an accepted order. |
| `DELETE …/worlds/:id` | | Ends the world. |

Every call on a world requires `Authorization: Bearer <token>`. Each action returns `{ ok, reason, outcome, events, said, signals, state }`:

- `reason`: why the ledger refused the player's own action, if it did
- `said`: the NPCs' spoken lines
- `signals`: what the NPCs asked your game to do (see [below](#actions-the-ledger-has-no-verb-for))
- `events`: the events this call added to the log
- `state`: the world after the call

The player is the actor `player`; there is one per world. CORS is open, so any origin may call the API; the token is the only credential.

## Mapping your game's items

Goods, materials and item types are plain names (lowercase letters, digits and `_`), so they can be your game's own item IDs:

```json
"start":     { "gold": 30, "stock": { "itm_torch_01": 10, "itm_rope_7": 2 } },
"catalogue": { "in_stock": { "itm_torch_01": { "min_price": 2 }, "itm_rope_7": { "min_price": 4 } } },
"labels":    { "itm_torch_01": "pitch torch", "itm_rope_7": "hemp rope", "itm_wolf_pelt": "wolf pelt" }
```

- **Labels** are what the model and players read. The NPC's facts, history and answer schema use those words ("pitch torch"); code maps the answer back to the ID, so the ledger, the log and the API only ever see `itm_torch_01`. Two items cannot share a label. A label can also name something the NPC does not hold yet (`itm_wolf_pelt`), so the NPC can receive it once your game syncs it in. In Workshop, labels are under **Abilities & rules → Advanced → Names and labels**.
- **Your save is the starting point.** `POST /worlds` accepts `start` for the player and any NPC, so the world begins with the inventories your game reports.
- **Each change has exactly one owner.** Changes the ledger makes (sales, deliveries, gifts) arrive as events for your game to apply. Changes your game makes (loot, theft, crafting) go to the ledger as a `sync` of the new totals. Syncs are idempotent, and a sync that would remove goods promised to accepted work is refused. No verb produces a sync, so the model cannot request one.
- **Made-to-order items** arrive in `ITEM_DELIVERED` with an `item_type`, stats and an ID (`i_c_001`). If your game supports custom items, map the type to a base item, apply the stats, and map `i_c_001` to your own instance ID. If it only supports fixed items, key the item types by your item IDs and give each stat range a single value (min = max). The NPC can then only promise exactly that item, at a price the ledger checks against its floor.

## Actions the ledger has no verb for

The ledger handles trade, gifts and news. Anything else (opening a gate, following the player, starting a fight) stays in your game's code. There are three ways to connect such actions to an NPC, from simplest to most involved:

1. **Game code only.** The NPC only talks; your game decides using its own rules and UI (an "Ask to follow" button, a quest flag). Suitable when the NPC's opinion does not matter.
2. **A counted grant.** Something an NPC hands out in limited numbers (a gate pass, a room for the night) can be modeled as a good, free or priced. Garrick the guard ([`npcs/guard.json`](../npcs/guard.json)) holds three `gate_pass` at 0 gold; once they are gone, no conversation produces a fourth until your game syncs more in. Your game acts when the `GOODS_DELIVERED` event arrives.
3. **A signal.** When the NPC's judgment should decide (the guard is persuaded to open the gate, or sees real trouble), give it the `SIGNAL` verb and declare its signals with their meaning: `"signals": { "open_gate": "…", "raise_alarm": "…" }`. The model can only name a declared signal; the ledger refuses anything else, and the exploit suite checks this. A signal changes nothing in the ledger and is returned in `signals`. Your code decides whether to carry it out and can check what the model cannot, such as whether the player really holds a pass. This is more robust than parsing the NPC's words, which a player could manipulate.

The guard combines both approaches: it hands out passes (counted) and signals `open_gate` once the player holds one (decided by game code). The demo village has no game code behind signals, so the chat shows what a game would be asked to do.

## Limits

To protect a public server:

| Limit | Value |
|---|---|
| Model calls per world | 150 (a world out of calls still keeps time; its NPCs stop acting on their own) |
| Model calls across all worlds | 60 per minute |
| Events per world | 5,000 |
| Worlds in memory | 200 (only worlds idle for 30 minutes are evicted) |
| New worlds | 5 per minute per address, 20 per minute overall |
| Action request body | 16 KiB (`catalogue`: 128 KiB) |
| World-creation request body | 4 MiB |
| Custom draft | 2 MiB each (picture-heavy casts may reach the combined limit sooner) |

Repair calls and provider failures count against the model-call quota. An action that would exceed the event cap returns `429` and saves no partial changes; model calls already made still count.
