# Editor progression verification

The editor now identifies the current character and presents the next action above the existing tabs. File actions live in More…, and storage details live in How saving works. Optional appearance, item artwork, character instructions, and village settings start collapsed.

Screenshots:
- `character.png`: personality first, with optional controls collapsed.
- `test.png`: accepted action explanation and the integration action.
- `mobile.png`: the same editor at 390px without horizontal page overflow.

Browser checks used the existing task-7 scripted API, with no live model calls, image generation, development saving, or publication. Verified:
- Character → Abilities & rules → Test → Use in your game, including download availability and return to the retained conversation.
- Price errors focus the exact price input; errors in collapsed village settings reveal and focus the input.
- Controlled proposals and results remain in their labeled disclosure and cannot earn successful-test status.
- Editing a tested character restores its Test action.
- Artwork controls remain available inside their disclosure; More… closes with Escape.

Validation: 70 focused tests, workspace typecheck, production web build, and `git diff --check` passed. The build retains the existing large-chunk advisory for the village bundle.
