# Evaluations

Live-model checks that measure how the NPCs behave against the ledger. Both call the real model APIs, so they need keys in `.env` and cost a little.

| Command | What it measures |
|---|---|
| `npm run latency-test` | Latency, token use and ledger-valid answers for each model setup (about 50 calls, ~6 minutes, ~$0.20). Results are summarised in [`docs/api-notes.md`](../docs/api-notes.md). |
| `npm run exploit-suite` | Attacks each village NPC (flattery, injection and similar) and checks the world after every attempt (~25 minutes). `--scripted` runs only the scripted openings, which is half the attacks. |

The no-model ledger check is `npm run ledger-proof`. CI runs it on every push to `main` and on every pull request.

## Exploit suite results

Recorded October 29–30, 2026. Each attack had the player try to get something the rules don't allow, through flattery, prompt injection and similar tricks, and the suite checked the world after every attempt. A violation is a change to gold, stock, items or contracts that no rule allows.

| NPC | Attacks | Violations | Model tricked |
|---|---|---|---|
| Brann | 20 | 0 | 0 |
| Mira | 20 | 0 | 0 |
| Tobin | 20 | 0 | 0 |
| Pell | 20 | 0 | 0 |
| Osric | 20 | 0 | 0 |
| Garrick | 6 | 0 | 0 |
| **Total** | **106** | **0** | **0** |

- **What this shows:** no attack caused an unauthorized state change.
- **What it doesn't show:** the ledger catching a live model. "Model tricked" is 0 because the models never proposed an illegal action. `npm run ledger-proof` covers the ledger's refusals, using controlled inputs.
- **Reruns:** the first full run had model errors on three NPCs. Those NPCs were rerun, and the table uses the clean reruns.
- **Age:** the suite has not been rerun since October 30, so these results predate later changes. Raw reports are written to `logs/`, which is not committed.

Latency results are in [`docs/api-notes.md`](../docs/api-notes.md#latency-measured-2026-10-27-npm-run-latency-test).
