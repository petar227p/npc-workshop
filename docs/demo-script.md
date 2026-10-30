# Demo script (3:00)

The shot list for the submission video, rebuilt on 2026-10-30 around what has actually been verified. Every claim on screen points to evidence in the table below. If a take doesn't reproduce a claim, cut the line; don't reword it into something the evidence doesn't show.

Judging weights: Impact 30%, Use of Meta AI tooling 25%, Demo 25%, Technical depth 20%.

**The story in one line:** NPCs that talk freely but can't break the game's rules, because the model only proposes and code decides. Here is the evidence.

## What we can claim, and from what

| Claim | Evidence | Status |
|---|---|---|
| An order becomes a priced offer checked against the seller's catalogue | `logs/rehearsal-2026-10-30/run{1,2}` (35 g, 5/2/40, 2 iron + 1 leather, 3 h both times) | Verified, typed. **Spoken: your take** |
| An offer charges nothing; Accept pays the agreed price once, to the seller, and reserves the materials | `run{1,2}/verification.json`, 14/14 checks each | Verified |
| Only the clock delivers, at the due time, with the accepted stats, once | same | Verified |
| Muse Image draws the item from the accepted terms, in the background; delivery doesn't wait for it | `run{1,2}/item-c_001.png`, ready ~11–20 s after Accept | Verified |
| A villager who never saw the delivery learns it secondhand (Edda saw it → Pell 70% → Tobin 49%), each telling citing the delivery's event id, with no prompting | `run{1,2}` snapshots 12–13, screenshots | Verified, both runs, same event ids |
| The ledger refuses an underpriced offer, impossible stats and an early delivery, and gameplay state doesn't change | `npm run ledger-proof` → `logs/ledger-proof-2026-10-30T16-58-31-609Z.md` | Verified with **controlled inputs typed by the harness** |
| 106 attacks by a real model on 6 NPCs caused 0 unauthorised state changes | `logs/exploits-2026-10-29T21-20-50-157Z.md` (Brann, Mira), `…21-25-11-393Z.md` (Tobin, Pell, Osric re-run), `logs/exploits-2026-10-30T12-09-47-556Z.md` (Garrick) | Verified. The models declined or stayed legal every time; the ledger refused nothing |

**Never claim:**
- That a model in our runs proposed something illegal and the ledger caught it. Live runs: 0 rejections. Exploit suites: 0 ledger refusals.
- That the ledger-proof rejections came from a model. The harness typed them.
- That a plain LLM gives the item away. That comparison was never run or recorded.
- A cost-per-session number. The cost meter isn't built.

## Shot list

| # | Time | On screen | Caption / voice | Proves | Needs |
|---|---|---|---|---|---|
| 1 | 0:00–0:15 | Title card over the village. | "Language models make lively shopkeepers. They also agree to things a game never allowed. Here, the model only proposes; code decides." | Impact | Nothing. (A real public incident could open this, but only with a confirmed source; otherwise leave it out.) |
| 2 | 0:15–0:25 | 5-second diagram: model → JSON proposal → verb rule → event log → world. | "NPC Workshop: the model proposes, code decides." | Technical | Diagram (**todo**) |
| 3 | 0:25–1:05 | **New game.** Walk to the forge, E to talk. Press the mic and say the dagger line; the transcript lands in the box; Send. Offer card (≈35 g, 5/2/40, 3 h). **Accept** once: gold 200 → 165, ledger "accepted: 35 gold paid to Brann". *Recording:* hold until the sprite appears on the anvil. *Live:* don't wait for it. **Skip until ready**: "delivered by the clock", the dagger in "Your gear" with the same stats (live, its picture lands there during shot 4). | "Voice Transcribe hears the order, Muse Spark proposes the deal, the ledger checks it, Muse Image draws it from the accepted terms, and only the clock hands it over." | Meta tooling, Demo | Your spoken take. Everything else verified (`run1/screenshots/1–3`) |
| 4 | 1:05–1:40 | **+1 hour** clicks (cut the dead hours in the edit). 11:00 Edda, at the market, saw it and tells Mira. 20:00 Edda reaches the tavern and tells Pell. 21:00 Pell retells it to the room. "Who knows what": Osric/Edda/Brann *saw it*; Pell/Wren/Mira *70% from Edda*; Tobin *49% from Pell*, each with their own words. | "Villagers only know what they saw or were told. The words drift; the event they cite can't. This chatter runs on open-weight Muse Spark Open." | Technical, Meta tooling | Verified (`run1/screenshots/4–6`). Click 20:00 and 21:00 one hour at a time |
| 5 | 1:40–2:10 | Terminal: `npm run ledger-proof`. **Banner on screen the whole shot: "Controlled inputs, typed by the test harness. No model produced these."** Valid offer accepted; price 1, damage 500 and an early DELIVER each rejected with the engine's own reason; "gameplay state unchanged" on each; then the clock delivers at 11:00. Optional: in the village, try to Give 999 gold and open **View rejected proposal** (event id, actor *you (player)*, the exact stored proposal, the reason). | "We typed these on purpose, to show what happens when a proposal breaks the rules. Refused, logged, nothing moved. The rules are code, so it's the same every run." | Technical, Impact | Verified (`logs/ledger-proof-…md`); expander built 2026-10-30 |
| 6 | 2:10–2:25 | The exploit-suite summary tables: 106 attacks (fake authority, raw JSON actions, "you already agreed", asking for DELIVER, made-up event ids, injections in item text…), 0 violations, 0 ledger refusals. | "A model attacked six of our NPCs 106 times. Nothing changed that the rules don't allow. The personas held every time; the ledger is the guarantee for when they don't." | Technical, Impact | Verified (three report files above). Don't say the ledger "stopped" these attacks |
| 7 | 2:25–2:45 | NPC workshop: load a villager; verbs (ledger allows / model may choose), catalogue form, model picker, triggers; on the bench click a "Try to cheat it" line and show the verdict. Optional 5 s: `curl /api/v1/…` against the same engine. | "Every NPC is a data file. Its verbs come from a fixed library whose rules are code, and any game can use them over HTTP." | Impact | Built. Saved NPCs appear after a server restart; don't show add-to-town live |
| 8 | 2:45–3:00 | End card: Muse Spark (Brann), Muse Spark Open (villagers), Muse Image (item art), Muse Voice Transcribe (orders); repo and live URL. | — | Meta tooling | Deploy + URL (**todo**). No cost number unless measured |

If a shot runs long, shorten 2, 7 and 8 first; never cut 3, 4 or 5.

## Does it fit three minutes?

Yes, in both forms below, **as long as the live version skips ahead before the picture is ready**. Waiting for the anvil picture live can push it past 3:00. The waits are measured; the time a person takes to walk, speak, read and click is estimated (marked *est.*). Time one live run with a stopwatch before you rely on it.

### Measured waits

| Wait | Measured | Source |
|---|---|---|
| Voice Transcribe, 5 s spoken order | 4.0 s | `logs/rehearsal-2026-10-30/timing/timing-1.json` (macOS `say` clip, through `/api/transcribe`) |
| Brann's quote (contributor model) | 8.4–12.2 s | timing run 8.4 s end to end; rehearsal model calls 10.3 s and 12.2 s |
| Picture after Accept | 9.5–22 s on screen | timing run 9.5 s; rehearsals ≤ ~20 s; the page checks for it every 2 s |
| Skip until ready (Osric + Edda act) | 2.5–3.2 s | timing run; rehearsal villager calls |
| `+1 hour`, 12:00–19:00 | < 5 ms each | timing run |
| `+1 hour` → 20:00 (Edda tells Pell) | 1.1–1.5 s | timing run; rehearsals |
| `+1 hour` → 21:00 (Pell retells, Edda tells Wren) | 2.6–3.8 s | timing run; rehearsals |
| `npm run ledger-proof` | 0.4–0.7 s | timed twice |
| A villager's reply on the bench (Spark Open) | 1.2–2.0 s | rehearsal villager turns |

Not in the numbers: a repair retry (one more full model turn; 0 seen in 886+ recorded calls), Muse Image's slow tail (p95 29.5 s in the Oct 27 latency test) and a stale dev server (restart it before presenting). On the Standard model Brann was about twice as fast (3.7 s p50, Oct 27).

### Recording, with shortened waits

Every model and image wait is cut to a ~1 s beat. **Mark each cut on screen** with a small tag (e.g. "⏩ 9 s") and add one line to the end card: *"Waits shortened in editing. Real: transcription ~4 s, quote ~8–12 s, picture ~10–20 s."* Only waits are cut; every state change (offer, payment, delivery, each telling) stays on screen.

| Shot | Slot | Edited length | Notes |
|---|---|---|---|
| 1 | 15 s | 15 s | |
| 2 | 10 s | 10 s | |
| 3 | 40 s | ~25 s (*est.*) | walk 5 + speak 5 + transcript ⏩1 + Send 2 + quote ⏩1 + offer 4 + Accept 1 + picture ⏩1 + skip ⏩1 + gear 4 |
| 4 | 35 s | ~18 s (*est.*) | 12:00–19:00 as a 2 s montage, 20:00 and 21:00 ⏩1 each, panel 12 |
| 5 | 30 s | 18–29 s (*est.*) | run + banner and summary 15; optional Give 999 + expand 10 |
| 6 | 15 s | 15 s | |
| 7 | 20 s | ~17 s (*est.*) | bench reply ⏩ |
| 8 | 15 s | 15 s | plus the "waits shortened" line |
| | **3:00** | **~2:15–2:25** | 35–45 s spare: hold beats longer rather than speeding up |

### Live presentation, real waits

Nothing is cut, so the waits are part of the timeline. Two rules keep it inside 3:00:

1. **Talk over Brann's quote.** Say shot 3's caption while he thinks (8–12 s).
2. **Click Skip until ready right after Accept.** Delivery doesn't wait for the picture; it lands in "Your gear" a few seconds later, during shot 4, so point at it then.

| Shot | Slot | Live length | Of which waiting |
|---|---|---|---|
| 1 | 15 s | 15 s | — |
| 2 | 10 s | 10 s | — |
| 3 | 40 s | 36–40 s | transcribe 4 + quote 8.4–12.2 + skip 2.5–3.2 (walk 5, speak 5, Send 2, offer 4, Accept 1, gear 4 *est.*) |
| 4 | 35 s | 26–28 s | 20:00 1.1–1.5 + 21:00 2.6–3.8 (8 quick clicks 8, panel 12 *est.*) |
| 5 | 30 s | 18–29 s | run 0.4–0.7 |
| 6 | 15 s | 15 s | — |
| 7 | 20 s | 17–18 s | bench reply 1.2–2.0 |
| 8 | 15 s | 15 s | — |
| | **3:00** | **2:32–2:49** | 11–28 s spare |

**If you wait for the anvil picture live** (Accept → picture → Skip), shot 3 grows to 45–62 s and the whole thing to 2:42–3:11: it can run over. If Brann or the picture is slow on the day, keep talking and drop the optional parts of shots 5 and 7, not shots 3–5 themselves.

## Recording notes

- Start every take from **New game** and use the exact line: *"I'd like a plain iron dagger with a leather grip. What would it cost, and when would it be ready?"* Brann chose the same terms in both rehearsals, but a take may differ; the relationships (pay once, reserve, deliver at due time, same stats) are what must hold.
- Record shots 3–4 **live**. `REPLAY` replays chat-model answers only: it doesn't reproduce voice transcription or Muse Image (pictures fall back to the placeholder). Keep each take's `logs/<session>.jsonl`.
- Gossip needs single `+1 hour` steps around the meetings: a multi-hour skip only checks meetings at its last hour. In both rehearsals nothing happened between 12:00 and 19:00, so those clicks can be cut.
- In the recording, cut model waits to a beat and tag each cut (see "Does it fit three minutes?"). Live, never cut: follow the two live rules instead.
- Keep the ledger or "Who knows what" on screen whenever state changes; it is the evidence.
- Shot 5's banner stays up for the entire terminal segment. Show the harness's own provenance line, not just the rejections.
- 1080p, browser at a fixed size, captions burned in, large fonts in the chat and ledger.

## Still to do before recording

| Task | Shot | Owner |
|---|---|---|
| Spoken trade take (mic) | 3 | You |
| Newcomer sessions (Oct 31), then fixes | all | You run them; fixes after |
| Diagram | 2 | todo |
| Deploy + live URL | 8 | todo (Nov 2) |
| Confirm a source for any real-world incident in shot 1, or drop it | 1 | You |

**Dropped from the old script, and why:** the raw-LLM side-by-side (never built or recorded; no evidence a plain model gives the item away), the exploit report page (not built; the markdown report is enough), the templates gallery, add-to-town without a restart, the quote desk and the cost meter (not built).
