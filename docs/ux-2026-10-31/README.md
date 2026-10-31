# Village UX pass: verification (2026-10-31)

Implements `docs/claude-ux-plan.md` tasks 1–7. Not deployed, not committed at the time of writing.

## Screenshots (1280 × 820, offline mock API)

1. `1-entrance.jpg`: the entrance, two destinations.
2. `2-village-first-visit.jpg`: first visit, with the "Click a villager to talk" hint.
3. `3-offer.jpg`: Brann's offer card and the "Negotiate further, or accept these terms." hint.
4. `4-work-underway.jpg`: Forge panel with the picture still being drawn, and the work hint.
5. `5-knowledge-detail.jpg`: Who knows what, opened from the gossip hint on Mira's "Heard from Edda" entry.

## How it was checked

Browser pane against an **offline mock API**: the real `createApi` (engine, ledger, routes, sessions), with scripted NPC replies and a mock image client in place of model calls. The mock lives in the session scratchpad, not the repo. The vite dev server ran alone on 5180 with `API_PORT=8790`. **No live model call was made in any of tasks 1–7**, so live model behaviour is not verified here.

Automated: `npm run typecheck`, `npm test` (367 tests, including 9 hint-selector tests and 7 knowledge-chain tests), `npm run build -w web`.

## Checked

- Routes: root → village and root → workshop by keyboard; direct `#/workshop` with refresh (no `/api/state`, no Phaser); back/forward; unknown hash → `#/`.
- Village shell: first entry shows the world, chat, time/gold, folded gear and three tools. Drawers take focus; Esc closes them and returns focus to the button that opened them; one drawer at a time; walking keys are paused while a drawer has focus.
- Flow: dagger request → offer → accept (gold 200 → 140) → work hint, with the picture pending → Wait until ready by keyboard (focus moves to Your gear when the Forge panel goes) → delivery hint (not repeated when the picture arrived) → gossip hint → "How word spread" opens Mira's entry with focus on it.
- Alternate NPC and in-stock purchase: Mira, 2 torches for 6 gold, "Mira handed you 2 × torch."
- Not enough gold: after giving Brann 130 gold, an open 60-gold offer shows "You have 4 gold." with Accept disabled.
- Model failure: the NPC's unavailable fallback line, no crash. HTTP failure (stubbed 409): the error shows and the hint doesn't advance.
- Pending: while Brann was answering, clicking Osric only showed his name.
- Hints: first visit, examples fill the box without sending, a returning session announces nothing, New game restarts the lessons, Turn off hints survives New game, Help → Show hints brings them back.
- Tooltips: keyboard focus with `aria-describedby`, Esc, hover, the touch-style ? toggle, kept on screen at 375 px and 640 × 410.
- Clickable villagers: hover label "Name · role"; click and E open the same chat; clicking open ground returns the keys to walking.
- Sandbox: a god-mode report was logged ("Happened at the gate … the whole village saw it"); ledger rejection details still open.
- Workshop: template → bench line answered (mock); layout unchanged.
- Widths: 1280, 375 (time/gold above the chat, no horizontal scroll) and 640 × 410 (≈200% zoom; no horizontal scroll on entrance, village or workshop).

## Limitations

- **Live models not exercised**: every NPC reply in these checks was scripted.
- **Real touch input not tested**: the pane sends mouse events even when emulating a phone. Taps go through the same pointer events.
- **Real 200% browser zoom not tested**: approximated with a 640 × 410 viewport.
- **Multi-step gossip chains, several tellings, cried news and pruned history** are covered by unit tests only. The mock spread news one step.
- **A failed item picture** wasn't reproduced in the browser this pass. The page falls back to the existing placeholder.
- **Reduced motion** is handled in CSS (card hover, highlight, drawing pulse) but wasn't toggled in the browser.
