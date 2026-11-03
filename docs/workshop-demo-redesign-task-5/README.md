# Workshop and demo redesign — Task 5: stage and HUD

Recorded 2026-11-03. Plan: [workshop-demo-redesign-plan.md](../workshop-demo-redesign-plan.md). Previous step: [Task 4](../workshop-demo-redesign-task-4/README.md).

## What changed

- **The site header** now holds only the brand, Workshop / Demo and **Build your own NPC →**. The link is visible on phones again: it had been hidden at ≤640 px and now sits on the header's second row.
- **Village toolbar** (`.village-toolbar`): the `Hud` moved here unchanged. Time and gold sit on the left with **+1 hour** next to them; **Help** and **Menu** are pushed to the right. `data-focus-home` on +1 hour is unchanged, so focus recovery still lands there.
- **The village column** (`.village-col`) is now toolbar → stage (scene, hint strip, drawer slot) → utility bar. The conversation is the second grid column.
- **Desktop sizing:** `.demo-layout` is `calc(100dvh - var(--top-h))` tall with a minimum of 560 px. The scene is `flex: 1 1 0` with a minimum of 240 px, so it takes whatever the toolbar, hint and bar leave. The old fixed `150px` allowance and the sticky talk column are gone; both columns now fill the grid row. A short window scrolls the page rather than squeezing the scene.
- **Phones (≤860 px):** one column. The village (toolbar, scene at 55vh, bar) sits above the conversation. At ≤640 px the toolbar packs tighter.
- No changes to `Village.tsx` or `VillageScene.ts`. The existing ResizeObserver, `fitZoom` and DPR handling cover the new container.

## Checked in the browser

Run against the offline mock. No model calls.

- [x] **1440×900:** header 56, toolbar 45, scene 712, hint 41, bar 45, for a total of 900 with no page scroll. The composer is visible at y = 849. Map, composer, HUD and utility buttons are all on screen together. → [demo-1440-default.jpg](demo-1440-default.jpg)
- [x] **High density:** at DPR 2 the canvas backing is 2080×1424 for 1040×712 CSS, and zoom is 4.
- [x] **Camera framing:** the camera midpoint equals the player position (424, 360). One early frame was captured mid-follow; a later capture is centered.
- [x] **Drawers don't resize or remount the game:** opening Bag, Rumours, Inspect and stock kept the scene at 1040×713 / 2080×1426, and `window.game` stayed the same instance.
- [x] **Pointer selection:** clicking Osric on the canvas set the picker to `crier` and focused "Message to Osric".
- [x] **Menu popover** draws above the scene. Opening it and choosing New game… did not reset anything. Escape closed it and returned focus to Menu. → [demo-1440-menu-over-scene.jpg](demo-1440-menu-over-scene.jpg)
- [x] **1024×768:** toolbar 45, scene 622, bar 45, for a total of 768 with no scroll. The composer is at y = 718. The same game instance resized to a 1248×1244 backing.
- [x] **Short window, 1440×600:** the page is 616 px and scrolls by 16 px. The scene keeps 470 px; the bar and composer stay reachable.
- [x] **390×844:** no horizontal overflow, Build your own NPC is visible, the toolbar is a single row, and the bar sits under the scene. → [demo-390.jpg](demo-390.jpg)
- [x] **Error state:** with the API unreachable, the header (with Build your own NPC) and the "The forge didn't answer (500)." message both render. → [demo-error-state.jpg](demo-error-state.jpg)
- [x] `npm test` (642), `npm run typecheck` and `npm run build --workspace web` all pass.

**Capture note:** the browser pane was hidden during these checks, which throttles `requestAnimationFrame` to about 2 per second. Screenshots taken just after a resize show a black canvas. At 1024 a `game.renderer.snapshot()` pixel read confirmed the scene was drawn (sand 234,165,108 and grass 132,198,105 at a 1248×1244 backing), so no 1024 screenshot is included.

## Left for later tasks

- Toolbar buttons are 32 px tall on phones; 44 px touch targets come in Task 8.
- The hint strip still changes the scene's height when its text wraps. The scene re-fits through the ResizeObserver, and its zoom only steps by whole numbers.
- Conversation layout (forge rows, composer anchoring): Task 6.
