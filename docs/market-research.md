# Market check: "NPCs that reason but can't break the rules"

Done 2026-10-27, from web searches. Most sources are vendor blogs and third-party round-ups, so details are second-hand. Private studio tools can't be seen from outside.

## Question

Is there already a product or library where developers define NPCs that think with an LLM, while code owns the rules (validated actions, event log, replay) and NPCs only know what they saw or were told?

## Short answer

The **idea** is not new: "the model proposes, game code validates" is the pattern write-ups and papers recommend. What we didn't find is a **packaged, reusable library** that combines all of it for several NPCs: per-NPC verbs with validation rules, an authoritative event log with replay, strict-schema output, and perception/gossip. The gap is real but narrow, so a pitch has to name exactly that combination and not just "AI NPCs".

## What exists

| Name | What it is | Overlap with us | Gap |
|---|---|---|---|
| [Convai](https://convai.com/blog/integrating-dynamic-npc-actions-for-game-development-with-convai) | Hosted NPC platform (dialogue, voice, actions, narrative graph). Free tier, $29/mo indie | "Prompt-to-action": the dev lists the actions, game state is injected each turn | Checking that an action is legal is left to the dev's engine code; no event log, replay or gossip |
| [Inworld](https://arcanumrpgs.com/blog/inworld-ai/) | Retired Character Studio; now an "Agent Runtime" SDK plus realtime TTS, games are one market among several | Character logic lives in the dev's code | General runtime, not a rules layer; moved away from game NPCs |
| [NVIDIA ACE](https://www.nvidia.com/en-eu/geforce/news/nvidia-ace-autonomous-ai-companions-pubg-naraka-bladepoint/) | On-device small models for "autonomous game characters" (PUBG Ally, inZOI) | Characters that plan and act | Infrastructure for big studios; rules stay in each game |
| [Studio Atelico](https://wnhub.io/news/engines/item-46721) | On-device AI engine for Unity/Unreal/Godot, generative-agents demo (GARP), $5M seed | Villages of agents | Focus is local inference cost, not rule enforcement |
| [AI Town (a16z)](https://github.com/a16z-infra/ai-town/) | MIT starter kit for a town of LLM agents on Convex | Village, memory, agents talking | A simulation with no game rules or economy to protect |
| [Smallville](https://github.com/nicfok/smallville) / [NPCAgent](https://github.com/PsychoSmiley/NPCAgent) | Small open-source ports of the Generative Agents paper | Memory, agents reacting to the world | No validator; hobby-sized |
| [LLM-Powered-Game-NPCs](https://github.com/halim-abdul/LLM-Powered-Game-NPCs) | Python reference NPC, 5 commits, 0 stars | Action allowlist plus a safe fallback | Its README says the host must recheck world state itself |
| [Rundale / Limerick](https://github.com/dmooney/Rundale) | GPL text adventure (1820 Ireland) on a reusable engine; ~1.4k commits, 4 stars | Authoritative state, injection defenses, gossip between NPCs | One game; GPL; no general NPC-definition API described |
| [Orchestrated Reality (arXiv 2606.16014)](https://arxiv.org/abs/2606.16014) | June 2026 paper: JSON world state, Plan-Diff-Validate-Apply, one GM agent | Closest in spirit: only validated deltas reach the state | Single agent; multi-NPC listed as future work; no code |
| [SIBP (arXiv 2507.07203)](https://arxiv.org/html/2507.07203v1) | Paper: merchant trading as dialogue states; code does the price maths | Our "the model never does arithmetic or moves gold" | Prompting technique for one trader, not a framework |

## Signals about demand

- AI NPCs are still mostly demos and in-house experiments in 2026, not a common feature in released games ([Frisson Labs](https://www.frisson-labs.com/ai-npcs-2026), [Cinevva](https://app.cinevva.com/guides/ai-npcs-dialogue)).
- The blockers they name: inference cost that grows with play, "fun" being hard to measure, and NPCs that can be jailbroken or pulled out of the fiction. A developer write-up describes playtesters spending ages trying to talk a merchant into free gear; the fix was a state machine the LLM can't override ([Medium](https://medium.com/@ashutosh_veriprajna/i-helped-build-ai-that-talks-back-in-video-games-infinite-freedom-nearly-killed-the-fun-83ed58e29a92)).
- Our design addresses jailbreaks and broken state. It helps with cost (models only at decision points, cheap open-weight model for villagers) but doesn't solve "is it fun".
- Gossip/witness research exists ([ALIGN](https://arxiv.org/html/2602.07777v2), rumour-chain studies) but as simulations, not game tooling.

## What would set a framework apart

1. Per-NPC verb lists, each with a validation rule in code; a rejected action is logged with the reason and the model gets one repair try.
2. An event log as the only source of truth, with replay (debugging, tests, demo fallback).
3. Automatic flattening of each NPC's verbs into a strict JSON schema (Meta strict mode forbids a root `anyOf`).
4. NPCs know only what they witnessed or were told, with confidence that decays per retelling.
5. Recording and replay of model calls for offline development and CI.

None of the projects above ships all five. Convai and Inworld leave 1–2 to the developer; AI Town and Generative Agents ports have 4-ish without 1–2; the paper has 1–2 for a single agent.

## Risks for the pitch

- "AI NPC framework" sounds crowded, so lead with "NPCs that can't cheat" and show it with injection attempts.
- Convai's actions or a weekend of glue code could look "good enough" to a judge; the demo has to show what breaks without the validator.
- A framework is hard to judge without a game, so the playable village still matters.
