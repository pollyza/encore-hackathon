# ui/ — owner: **D · LIVE/UX**

UI surfaces that wrap the game canvas: splash, HUD, tutorial card, end screen, bottom-sheet integration.

## Files (to be split out of `encore_prototype.html` on hackathon Day 0)

| File | What goes in it | Anchor in current file |
|---|---|---|
| `howto.js` | The `HOW_TO_PLAY` registry + `showTutorial`, `dismissTutorial`, auto-dismiss countdown | grep for `HOW_TO_PLAY` |
| `hud.js` | HP/MP bars (`setBarsConfig`), skill button HUD (`setSkillsConfig`, `updateSkillsHUD`), timer, mode badge, pills | grep for `function setBarsConfig` |
| `banner.js` | Top-of-canvas banner (`showBanner`), floating combat text (`flashFCT`) | grep for `function showBanner` |
| `splash.js` | The 3-template card splash + `startGame(key)` entry | grep for `function startGame` |
| `end.js` | Victory/Defeat end card + replay/menu buttons | grep for `function finishGame` |

## Rules

- **Tutorial copy is here, not in games/.** Game modules describe mechanics; UI describes how to teach them. If a player reports "I don't know what to do," fix the tutorial copy in `howto.js`, not the game.
- **Tutorial promises must match game reality.** The `playtest-check` skill verifies every "press X to do Y" row in HOW_TO_PLAY has a real binding in the game module.
- **CSS prefix:** all new UI classes must use `.howto-`, `.hud-`, `.sheet-`, `.splash-`, `.end-` prefixes to avoid colliding with game canvas styling.
