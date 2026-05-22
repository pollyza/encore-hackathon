# Games interface contract

Every game module (`fps.js`, `moba.js`, `br.js`) MUST export a `Games[key]` object that satisfies this contract. The main loop in `encore_prototype.html` calls these methods in a strict order; deviating breaks rendering or input.

> **Changing this file requires consensus from all 4 owners (A, B, C, D).** Don't unilaterally add or remove fields — the contract is what lets us work in parallel.

## Shape

```js
Games.<key> = {
  // ── Metadata (read at startGame) ──────────────────────────────────────
  name:     "FPS · COVER STRIKE",   // string, shown in mode badge + end card
  badge:    "FPS",                  // 3-char short label for HUD
  duration: 30,                     // seconds per round (FPS/BR=30, MOBA=45)
  showMP:   false,                  // does HUD show MP bar? (true for MOBA only)
  fxKey:    "fps",                  // key into the ambient-FX registry (themes.js)
  pills:    { gold: false },        // extra HUD pills to show (MOBA: {gold:true})

  // ── Skill config (called once at startGame) ───────────────────────────
  // Returns the HUD button definitions for this game's skill bar.
  skills() {
    return [
      { key: "q", label: "RELOAD", cost: 0,  color: null   },
      { key: "w", label: "NADE",   cost: 0,  color: null   },
      // ... up to 4 skills; HUD renders them bottom-right
    ];
  },

  // ── Lifecycle ─────────────────────────────────────────────────────────
  // Build the world: tiles, blocks, player, enemies, projectiles array,
  // and crucially write a closure to `state._fit` so refit() can rebake.
  init() {
    // Required mutations to global `state`:
    //   state.mapW, state.mapH, state.bg (baked canvas), state.player,
    //   state.enemies | state.bots, state.projectiles, state.skills,
    //   state.theme, state.themeName, state.tiles, state.blocks,
    //   state._fit (closure that re-computes tile size + camera on resize)
    // See games/fps.js init() for the canonical example.
  },

  // Called every frame while !gameOver && !tutorialActive.
  // Advance world state by dt seconds. May call finishGame(won, subText).
  update(dt) { /* ... */ },

  // Called every frame after update(dt). Draws into `ctx` from world coords.
  // Use Iso.w2s for projection. Do not clear the canvas — main loop does that.
  draw() { /* ... */ },

  // Optional: called when canvas is resized. Should re-run the same fit
  // logic as init() and re-bake state.bg via bakeGround(...).
  // If you saved a closure to state._fit, the default implementation is:
  //   refit() { state._fit(); state.bg = bakeGround(state.tiles, state.blocks, state.mapW, state.mapH); }
  refit() { /* ... */ },
};
```

## Required globals (provided by the engine)

These exist in the global IIFE scope and your module can call them directly:

| Global | What it does |
|---|---|
| `Iso.w2s(wx, wy)` | World → screen coords |
| `Iso.s2w(sx, sy)` | Screen → world coords |
| `Iso.setTile(TW, TH, WS)` | Re-size iso tiles + world step |
| `Iso.camX`, `Iso.camY` | Mutable camera offset |
| `state` | Global game state (yours, you populate it in init()) |
| `W`, `H` | Current canvas size (read-only; auto-updates on resize) |
| `ctx` | The 2D rendering context |
| `aimAngle()` | Returns radians or null. Touch aim pad source |
| `getMoveVec()` | Returns {x, y} from joystick/keys |
| `mouseWorld` | `{wx, wy}` of cursor over canvas, or null |
| `keys[key]` | True while key is held (keyboard) |
| `SFX.shot()`, `SFX.hit()`, etc. | Sound effects |
| `bakeGround(tiles, blocks, mapW, mapH)` | Pre-render the static iso background once |
| `pickTheme(templateKey)` | Returns `{name, theme}` from the 12-theme registry |
| `spawnParticles(arr, wx, wy, color, n)` | Particle helper |
| `flashFCT(wx, wy, text, color)` | Floating combat text |
| `showBanner(text, color, dur)` | Top-of-canvas banner |
| `finishGame(won, subText)` | End the round with a win/lose card |

## Required engine hooks you must NOT touch

- The main loop's `current.update(dt)` and `current.draw()` calls (in `encore_prototype.html`)
- The `tutorialActive` gate (the loop skips your update during tutorial)
- The `gameOver` gate
- The `applyScenarioOverrides()` post-init patcher (V2G overrides HP / enemy count / weapon)

## Friendliness contract (enforced by playtest-check)

Every game **must** be playable by a passive viewer (no input):

- Aim must have a fallback chain: explicit input → mouse cursor → auto-aim nearest enemy → last aim direction.
- Fire / attack must trigger automatically when an enemy is in range AND there's any aim source.
- Win must be reachable in `duration` seconds with passive play, or at minimum with simple keyboard/mouse input.

If your game can't be won by a passive player, you've broken the friendliness contract. The `playtest-check` skill will catch this; please run it before each PR.
