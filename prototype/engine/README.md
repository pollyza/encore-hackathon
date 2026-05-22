# engine/ — owner: **A · 玩法引擎**

Pure utilities used by every game template. No game-specific logic here.

## Files (to be split out of `encore_prototype.html` on hackathon Day 0)

| File | What goes in it | Search anchor in current file |
|---|---|---|
| `iso.js` | `Iso` object: `setTile`, `w2s`, `s2w`, `camX`, `camY`, `WS`, `TW`, `TH` | grep for `const Iso = {` |
| `input.js` | joystick (`joyStart`), aimpad (`aimStart`), keyboard (`keys`, `keydown`), mouse-on-canvas (`mouseWorld`), `getMoveVec`, `aimAngle` | grep for `function joyStart` |
| `audio.js` | `SFX` object: `shot`, `hit`, `win`, `lose`, `reload`, `grenade`, `snipe`, `shotLow` | grep for `const SFX = {` |
| `particles.js` | `spawnParticles`, `updateParticles`, ambient FX driver (`updateAmbient`, `drawAmbient`, `drawColorGrading`) | grep for `function spawnParticles` |
| `voxel.js` | `bakeGround`, `drawVoxelMan`, voxel art helpers shared across games | grep for `function bakeGround` |

## Rules

- **No `state.*` reads in engine code.** Engine functions take their inputs as arguments and return values. State mutation lives in the game modules.
- **No global side effects on import.** Each file should declare its exports but not run code at top level (except attaching to `window.*` or `globalThis.*` for the script-tag concatenation model).
- **Breaking changes here are breaking changes for everyone.** If you change `Iso.w2s` signature, all 3 games break. Coordinate with the team first.

## Open question (resolve at Day 0)

Do we use ES6 modules (`<script type="module">`) or globals (`<script src="...">`)? See `prototype/README.md` for the current state — globals for now, modules optional Phase 2.
