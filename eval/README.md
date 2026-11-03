# Evaluations

Live-model checks that measure how the NPCs behave against the ledger. Both call the real model APIs, so they need keys in `.env` and cost a little.

| Command | What it measures |
|---|---|
| `npm run latency-test` | Latency, token use and ledger-valid answers for each model setup (about 50 calls, ~6 minutes, ~$0.20). Results are summarised in [`docs/api-notes.md`](../docs/api-notes.md). |
| `npm run exploit-suite` | Attacks each village NPC (flattery, injection and similar) and checks the world after every attempt (~25 minutes). `--scripted` runs only the scripted openings, which is half the attacks. |

The no-model ledger check is `npm run ledger-proof`.
