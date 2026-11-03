# Workshop and demo redesign — Task 7: selection and arrival feedback

Recorded 2026-11-03. Plan: [workshop-demo-redesign-plan.md](../workshop-demo-redesign-plan.md). Previous step: [Task 6](../workshop-demo-redesign-task-6/README.md).

## What changed

- **Selection marker in the scene.**
  - `VillageScene` has `setSelected(id)` and draws a still green ring (an ellipse, 18×6 world px, `#4ade80` fill at 40%, with a 1 px `#22c55e` outline) at the selected villager's feet. It follows them as they walk and is drawn under their sprite.
  - `Village` takes a `selected` prop and passes it on, including when the scene is first created. `VillagePage` passes `talkTo`.
  - Picker, click and E all already set `talkTo`, so the ring and the conversation can't disagree. The rule that blocks switching while an NPC is replying is unchanged: `talk()` ignores another villager, and the picker is disabled.
  - The ring doesn't animate, so reduced motion needs nothing extra. The conversation heading names the NPC in text.
- **Bag arrival cue.** `useArrivals` now also tracks `unseen`: something arrived since the Bag was last opened.
  - The Bag button shows a **new** text badge (the same `.cue` as Rumours) until the Bag is opened. Opening it by the button or through the hint's Show it clears the badge.
  - On each arrival the Bag button glows briefly (`.arrived`, a 1.6 s background fade). With `prefers-reduced-motion` there is no animation; the count change and the **new** badge remain.
  - Nothing new is announced. The chat's handover line ("Brann hands you the …") and the existing hint already announce the arrival.
  - A new game resets `unseen` against the empty world, the same way `heard` already worked, so both cues clear.
- The Bag still never opens on its own (since Task 4), so an arrival doesn't open an overlay or move focus.

## Checked in the browser

Run against the offline mock. No model calls.

The browser pane was hidden, which pauses `requestAnimationFrame` completely (`game.loop.frame` stayed at 0). The scene was therefore driven by calling `game.step()` by hand for these checks.

- [x] **Initial:** Brann is selected and the ring is visible under his feet, below his sprite's depth. → [selection-marker-brann.png](selection-marker-brann.png): 3× canvas crops (`renderer.snapshot()`) of Brann and Tobin on the plaza's sand.
- [x] **Picker → Osric:** the scene selected `crier`, the ring moved to Osric's feet, and the chat read "Message to Osric".
- [x] **Click on Mira** (emulated sprite pointerdown/up): the scene selected `merchant`, the picker changed to `merchant`, and the ring moved to her.
- [x] **E next to Brann:** the scene and picker selected `smith`, the ring moved to Brann, and focus went to "Message to Brann".
- [x] **Pending reply:** while Brann was thinking, clicking Osric changed nothing. The picker stayed disabled, and both the scene and the picker still had `smith` after the reply.
- [x] **Arrival while typing:** with "half-typed question" in the message box, Wait until ready was clicked without taking focus.
  - Focus stayed in the message box and the text was kept.
  - No drawer opened.
  - The Bag button read "Bag 1 thing new" with the `arrived` glow, and the glow cleared afterwards.
  - Opening the Bag cleared **new**, and it stayed clear after closing.
- [x] **Reset:** with "Bag 2 things new" showing, Menu → New game… → Start a new game gave "Bag 0 things" with no cue, no Rumours cue, Day 1 · 08:00, and Brann still selected.
- [x] `npm test` (642), `npm run typecheck` and `npm run build --workspace web` all pass.

The ring was first drawn 2 px higher. In the crop it was almost hidden behind the feet, so it was moved down to the feet line and widened by 4 px before the capture above. Moving it didn't affect the sync checks, since they don't depend on where it's drawn.

## Colour change (follow-up)

At the user's request the ring changed from gold (`#ffc329`) to green. On sand it stands out clearly. On grass the fill blends in, and the ring is carried by its darker outline: still readable, but with less contrast. → [selection-marker-on-grass.png](selection-marker-on-grass.png), a 5× crop with the ring placed on a grass patch.

## Left for later

- Phone layout, the sheet presentation and touch targets: Task 8.
