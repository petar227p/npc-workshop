# Workshop usability verification

This change addresses five findings from the archived Impeccable critique: first-test visibility, competing creation/editing contexts, accessible conversations and sprite selection, browser-save confidence, and accidental test resets. The critique is a historical baseline; its score has not been recalculated after these changes.

## Automated checks

- `npm run typecheck` passed.
- `npm run build -w web` passed. Vite reports a large deferred village/Phaser chunk; it remains loaded separately from the main entry.
- Vitest: 536 tests passed in the sandbox. The remaining loopback-server test could not bind its port there; `npx vitest run examples/game-backend/verification.test.ts` passed with local networking enabled. Combined result: all 537 tests passed.
- Browser-storage regression tests cover complete-draft persistence, denied storage access, preservation of the previous saved copy after a failed write, and successful retry of the latest draft.
- Scoped Impeccable scans and `git diff --check` passed. The file-scoped `side-tab` exception records why the six existing semantic event/status borders were retained; other rules remain enabled.

## Browser checks

Native in-app browser checks used 1280×720 desktop and 390×844 mobile viewports. Temporary viewport overrides were reset. Temporary fixtures were removed after checking actual components with simulated storage and bench responses; no model requests were required.

| Area | Evidence |
|---|---|
| First test | Empty transcript collapses. Both suggested requests and game handoff fit in the initial mobile viewport, including after the save-status line was added. Populated/pending history retains the bounded scroll area. |
| New character | Existing header/editor are hidden during creation, while the editor remains mounted. Starter, wizard and questionnaire cancellation restore the previous Test section and an unsent message. Focus returns to More. |
| Sprite keyboard | One Tab stop; Tab/Shift+Tab enter at the selected sprite; arrows move focus and selection and wrap at either end; Home/End select boundaries; Space activates; Tab exits. Original sprite restored afterward. |
| Conversation log | Workshop exposes its named polite log. A fixture using the actual demo Chat component verified incoming replies are inside the log and thinking feedback is outside it, with no nested live regions. |
| Browser saving | Simulated quota failure displays recovery guidance and Retry browser save. Failed retries retain the warning; enabling simulated storage and retrying changes status to saved. Actual stored drafts were not changed by this fixture. |
| Reset protection | Empty session resets without confirmation. Conversation, controlled-test-only and timer-only sessions require confirmation. Keep and Escape make no reset request and preserve history/message input. Failed reset retains results and allows retry. Pending reset disables controls and prevents Escape dismissal. Success clears session history, preserves message input and restores focus to Reset test session. All reset checks used a simulated bench. |

## Screenshots

- First test: [desktop](ux-first-test-2026-11-01/desktop.png), [mobile](ux-first-test-2026-11-01/mobile.png).
- Focused creation: [desktop](ux-focused-creation-2026-11-01/desktop.png), [mobile](ux-focused-creation-2026-11-01/mobile.png).
- Accessibility: [sprite keyboard focus](ux-accessibility-2026-11-01/sprite-keyboard-focus.png), [mobile test](ux-accessibility-2026-11-01/mobile-test.png).
- Save guidance: [desktop](ux-browser-save-2026-11-01/desktop.png), [mobile](ux-browser-save-2026-11-01/mobile.png), [simulated storage failure](ux-browser-save-2026-11-01/storage-failure.png).
- Reset confirmation, with simulated session data: [desktop](ux-reset-protection-2026-11-01/desktop.png), [mobile](ux-reset-protection-2026-11-01/mobile.png).

## Limits

Actual screen-reader speech, physical touch devices, older browsers and a live-model conversation were not verified. ARIA and keyboard checks do not establish accessibility conformance. Mobile checks used an emulated viewport. Earlier screenshots are checkpoints from their individual fixes; the final save-status mobile screenshot also verifies that the first-test controls remain visible.
