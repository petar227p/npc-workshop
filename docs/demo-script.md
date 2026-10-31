# Demo script (3:00)

Workshop-first revision, 2026-10-31. **The revised three-minute sequence has not been rehearsed or timed with live models.** Product-hierarchy browser checks use scripted replies: UI/state evidence, not live model quality or latency. Historical live evidence below remains separate. If a take does not reproduce a claim, cut the line.

**The story:** NPC Workshop creates and tests NPCs. Brann's workshop in the example village demonstrates bargaining, checked offers and timed delivery. Return to the authoring draft to show the product behind the example.

## Evidence and qualifications

Historical logs are local and gitignored. Their behavior belongs to the recorded Oct 30 runs, not to an unrehearsed new take.

| Claim | Evidence | Status |
| --- | --- | --- |
| Create/configure/test an NPC without visiting the demo; return to the same draft | [Workshop checks](product-hierarchy-task-4-2026-10-31/README.md), [demo round trip](product-hierarchy-task-5-2026-10-31/README.md), [final regression](product-hierarchy-final-2026-10-31/README.md) | Scripted browser evidence; live presentation take pending |
| An order becomes a priced offer checked against its catalogue | `logs/rehearsal-2026-10-30/run{1,2}`: 35 gold, stats 5/2/40, 2 iron + 1 leather, 3 hours | Historical live, typed; spoken take pending |
| Offer charges nothing; Accept pays once to the seller and reserves materials | `run{1,2}/verification.json`, 14/14 checks each | Historical live evidence |
| Only the clock delivers, at the due time, once, with accepted stats | Same rehearsal evidence | Historical live evidence |
| Muse Image draws from accepted terms; delivery does not wait for artwork | `run{1,2}/item-c_001.png`, ready roughly 11–20 seconds after Accept | Historical live evidence; scripted UI checks use placeholder artwork |
| A non-witness learns the delivery secondhand, citing checked event IDs | Edda saw it → Pell confidence 0.70 → Tobin 0.49; both rehearsal snapshot sequences, same event IDs | Historical live evidence; wording can drift |
| Underpriced offers, impossible stats and early delivery are refused without gameplay changes | `npm run ledger-proof`; original `logs/ledger-proof-2026-10-30T16-58-31-609Z.md`; current report linked in final verification | **Controlled inputs typed by the harness**, not model behavior |
| 106 attacks on six NPCs caused zero unauthorized state changes | `logs/exploits-2026-10-29T21-20-50-157Z.md` (Brann/Mira), `…21-25-11-393Z.md` (Tobin/Pell/Osric rerun), `logs/exploits-2026-10-30T12-09-47-556Z.md` (Garrick) | Historical real-model attacks: models declined or stayed legal; zero ledger refusals |

**Do not claim:**

- That historical live models proposed illegal actions and the ledger caught them: those runs had zero rejections. Scripted invalid replies in regression checks are fixtures.
- That ledger-proof or controlled workshop rejections came from a model.
- That a plain LLM gave away an item: that comparison was never run or recorded.
- A cost-per-session figure: there is no cost meter.
- That a browser draft is published to the village or deployed to any game. Current integration requires saved server definitions and setup.

## Revised shot list — estimated allocations

| # | Time | On screen | Caption / voice | Evidence / remaining work |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:15 | Home: NPC Workshop and **Build an NPC**; open Workshop. | “Create a character, configure what it can do, and test it. The model proposes actions; code checks what can happen.” | Current UI checked; presentation take unrehearsed |
| 2 | 0:15–0:40 | Create a merchant from a role starter, change one setting, wait for validation, open **Test your NPC** and send a normal message. | “This is a draft in this browser. Validation checks its settings; this isolated session checks its actions.” | Scripted creation/bench checks; live reply and timing pending. Keep this draft for shot 7 |
| 3 | 0:40–1:20 | Open **Demo**. Brann starts selected. Place the dagger order, review actual terms and **Accept** once. Gold 200 → 165 if the price is 35. **Wait until ready**; inspect item and stats. | “Brann is a playable example. Muse Spark proposes a deal, code checks it, and the clock delivers the agreed item. Muse Image draws from the accepted terms.” | Historical typed trade/art evidence. A spoken take must show transcription landing before Send; microphone take pending |
| 4 | 1:20–1:50 | Single **+1 hour** steps around 20:00 and 21:00; open **Who knows what** and the relevant **Heard from** details. | “NPCs know what they witnessed or were told. Words can drift; the event IDs are checked. Muse Spark Open handles this chatter.” | Historical Edda → Pell 0.70 → Tobin 0.49. Reproduce the chain in the new take |
| 5 | 1:50–2:15 | Run `npm run ledger-proof`. Banner throughout: **Controlled inputs, typed by the test harness. No model produced these.** Show valid control, price 1, damage 500, early DELIVER and eventual timed delivery. | “We submit these invalid proposals deliberately. The rules refuse them, log the reasons and leave gameplay state unchanged.” | Deterministic proof. Optional: a player rejection via **Inspect events → View rejected proposal**; identify the actor accurately |
| 6 | 2:15–2:30 | Historical exploit tables: 106 attacks, zero unauthorized changes, zero ledger refusals. | “These real-model attacks stayed within the rules. The ledger remains the backstop for an invalid proposal.” | Cite the three reports; do not say the ledger rejected those attacks |
| 7 | 2:30–2:50 | **Build your own NPC** returns to the merchant draft. Show **Draft in this browser**, then the file disclosure / [developer API instructions](../README.md#use-the-npcs-from-your-own-game). | “The workshop is the product; the village is its example. Save definitions on the development server and restart it to load them. Your game can then call the existing API and render its events.” | Draft round trip checked. No live publication, generic export or automatic host-game setup |
| 8 | 2:50–3:00 | End card: Muse Spark, Muse Spark Open, Muse Image, Muse Voice Transcribe; repo and verified live URL if deployed. | “NPC Workshop: create, configure, test.” | Deployment/live URL and final recording pending |

The slots sum to 3:00; they are allocations, not measured completion times. Rehearse with a stopwatch. Shorten decorative beats and the exploit summary if needed; preserve authoring, checked trade, proof provenance and the return to the draft.

## Historical measured waits (Oct 30)

| Wait | Measured | Source |
| --- | --- | --- |
| Voice Transcribe, 5-second spoken order | 4.0 seconds | `logs/rehearsal-2026-10-30/timing/timing-1.json`; a macOS `say` clip through `/api/transcribe`, not a human microphone take |
| Brann quote on contributor model | 8.4–12.2 seconds | Timing run / two rehearsals |
| Picture after Accept | 9.5–22 seconds on screen | Timing run / rehearsals; page polls every 2 seconds |
| Wait until ready, including triggered NPC turns | 2.5–3.2 seconds | Timing run / rehearsals |
| Each +1 hour at 12:00–19:00 | Under 5 ms | Timing run |
| +1 hour to 20:00, Edda tells Pell | 1.1–1.5 seconds | Timing run / rehearsals |
| +1 hour to 21:00, Pell retells / Edda tells Wren | 2.6–3.8 seconds | Timing run / rehearsals |
| Ledger proof | 0.4–0.7 seconds | Two historical timings |
| Villager reply on Spark Open | 1.2–2.0 seconds | Rehearsal villager turns |

These do not measure the new sequence. A repair retry adds another model turn (none seen in the historical 886+ recorded calls). Muse Image had a 29.5-second p95 in the Oct 27 latency test. Brann on Standard was about twice as fast (3.7-second p50, Oct 27); neither figure promises current live timing.

## Recording and live presentation notes

- Prepare a fresh test browser profile so authoring does not overwrite someone's draft. Set up a new village through **Demo → Menu → New game**, then return home before the take.
- Use: “I'd like a plain iron dagger with a leather grip. What would it cost, and when would it be ready?” Terms may differ from rehearsals; verify pay-once, reservation, due time and identical delivered stats rather than forcing old numbers.
- Record trade/gossip live for new model claims. `REPLAY` only replays chat-model answers; it does not reproduce voice or Muse Image, and artwork falls back to a placeholder. Retain each take's model log.
- Gossip checks meetings at the end of a time advance. Use single-hour steps around 20:00 and 21:00. Uneventful hours can be shortened in an edited recording.
- Tag every shortened wait (for example “⏩ 9 s”) and disclose shortened waits on the end card. Keep every offer, payment, delivery and telling visible. Historical full waits were approximately transcription 4 s, quote 8–12 s and picture 10–20 s.
- Live, talk over the quote and choose **Wait until ready** after Accept; do not wait for the picture first. A slow image should not hold up delivery. Do not claim the revised sequence fits until timed.
- Keep the ledger or knowledge detail visible for evidence beats. The controlled-input banner stays up for the entire proof segment.
- Record at a fixed browser size, 1080p, with readable chat/ledger text and captions.

## Still pending

- A timed live rehearsal of workshop → demo → workshop, with current controls.
- Spoken trade take, real-microphone recovery and human newcomer sessions using [the revised protocol](newcomer-test.md).
- Any diagram remains optional/unproduced; deployment, verified live URL and final recording remain pending.

Supported template starters now exist and are shown in the authoring beat. Add-to-running-village, a raw-model comparison, quote desk, browser deployment/export and cost meter remain outside this milestone.
