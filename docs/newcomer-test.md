# Newcomer test (Oct 31)

One or two people who haven't seen the game, about 15–20 minutes each. You run the session; don't explain the controls first.

## Before each session

- `npm run dev` with real keys and `REPLAY` empty. Open http://localhost:5174 in Chrome and click **New game**.
- Microphone allowed in the browser (typing works too; note which they use).
- A terminal ready to run `npm run ledger-proof`, or the latest `logs/ledger-proof-*.md` open.
- Screen recording, if the tester agrees. Note the start time. After their first message, the newest `logs/*.jsonl` is their session's model log; write its name below.

## Task card (read it aloud, then hand it over)

> **Buy something from the blacksmith, collect it, and find someone who knows about what happened.**

If they're stuck for about two minutes, give the next hint down this list and log it. Never skip ahead.

1. "Who in the village makes things?"
2. "Walk up to someone and press E" (or: "the picker above the chat chooses who you talk to").
3. "Look at what's under his answer."
4. "Time doesn't pass on its own here."
5. "Where would something you own show up?"
6. "Some people saw it happen; others only heard. There's a panel about that." Then, if still stuck: "People talk most in the evening, at the tavern."

## After the task: the ledger proof

Show the ledger-proof terminal output or report, starting with its first line (the "typed by the test harness" note). Then ask:

> **What was attempted, what stopped it, and what changed?**

Write their words down, then score 1 point for each part they got right:

- **Attempted:** the harness (not a model) proposed a 1-gold dagger, a 500-damage dagger, and the smith handing over an order early.
- **Stopped it:** the rules in code (the price floor, the dagger's damage cap, only the clock delivers).
- **Changed:** nothing in gold, stock, items or orders; only a rejection line in the log.

Also note whether they think a model produced those inputs. That misreading is what the labelling must prevent.

## Observation log (copy once per tester)

Tester: ______  Date/time: ______  Device/browser: ______  Voice or typing: ______  Model log: `logs/________.jsonl`

| # | Step | Unaided? (y/n) | Time | Hesitations, questions, wrong turns | Hints given |
|---|---|---|---|---|---|
| 1 | Finds how to talk to Brann | | | | |
| 2 | Places an order (any lost or garbled input?) | | | | |
| 3 | Understands the offer card and accepts | | | | |
| 4 | Finds how to move time forward | | | | |
| 5 | Finds the item in "Your gear" (notices the picture?) | | | | |
| 6 | Finds "Who knows what" | | | | |
| 7 | Tells *saw it* from *heard it* (ask: "Did Tobin see it happen?") | | | | |
| 8 | Ledger proof: attempted / stopped / changed (0–3); thought a model made the inputs? | | | | |

Problems:

| # | What happened | Where | Severity | How to reproduce |
|---|---|---|---|---|
| | | | | |

Severity, in fix order: **blocked** (couldn't finish) → **misleading** (state or wording said something untrue) → **repeated confusion** → **polish**.

## Afterwards

Send me the filled logs, the model log names and any recordings. I fix blockers first, in the severity order above. Then re-test each changed step with the second tester (or the first again).
