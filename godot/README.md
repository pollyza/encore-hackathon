# Encore MOBA — Godot 4.x spike

> Phase 2 R&D · M12 milestone in [docs/encore_product_plan.md](../docs/encore_product_plan.md). Standalone Godot port of the MOBA template, not currently wired into the V2G LIVE pipeline. Goal is to validate dev velocity + art polish in a real engine before considering broader migration.

## Status

This directory is a **scaffolded skeleton, not a playable game yet.** The skeleton contains:

- `project.godot` — Godot 4.3 project config, WASD + QWER input bound, mobile-compat rendering
- `scenes/` — minimal scenes for entry, hero, projectile, AoE telegraph
- `scripts/` — complete `Hero`, `Ability`, `AbilityQBolt`, `AbilityWBlast`, `Projectile`, `AoeTelegraph`, `Game`, `HUD` GDScript
- `assets/` — empty (Kenney packs go here, see below)

Opening the project in Godot for the first time will show a placeholder splash with build instructions. The "what to build next" path is documented below.

## First-time setup (10 minutes)

1. **Install Godot 4.3+** (GL Compatibility build for mobile-friendly export later).
   - macOS: `brew install --cask godot` or download from https://godotengine.org/download
   - Verify: `godot --version` prints `4.3.x` or higher.

2. **Open the project**:
   ```bash
   cd /Users/bytedance/Documents/encore-hackathon/godot
   godot project.godot
   ```
   First open will import resources (takes ~10s). You should see the splash with "ENCORE MOBA — SCAFFOLD READY".

3. **Download the Kenney pack** (free CC0 assets — no attribution needed but appreciated):
   - https://kenney.nl/assets/top-down-shooter — characters + projectiles
   - https://kenney.nl/assets/tiny-battle — top-down terrain tiles (RTS feel)
   - Extract zips into `godot/assets/_downloads/` (gitignored).
   - Copy only the sprites/tiles you want to actually use into `godot/assets/sprites/` or `godot/assets/tiles/` (those folders ARE committed).

4. **Install the godot Claude Code skill** (optional, makes AI more accurate):
   ```bash
   # Choose one:
   # · https://jonathansblog.co.uk/the-godot-games-claude-code-skill-build-complete-godot-games-with-ai
   # · https://github.com/jame581/GodotPrompter
   ```

## Build path — Day 1 (~6h)

Goal: a playable scene with 1 hero, 3 enemies, Q skillshot, W AoE, HP bar.

| Step | What you do in the Godot editor | Expected outcome |
|---|---|---|
| 1 | Open `scenes/hero.tscn`. Add a `Camera2D` as child of root (or leave external in main). Tune `Body` ColorRect or replace with `Sprite2D` pointing at a Kenney character | Player visually distinct |
| 2 | Create a new scene `scenes/arena.tscn`. Add `TileMap` node, drag a Kenney tile pack into TileSet. Paint a 30×20 tile arena | Map is walkable |
| 3 | Open `scenes/main.tscn`. Delete `ScaffoldLabel`. Add `Arena` (instance), add 1 player `Hero` (set `is_player=true`), add 3 enemy `Hero`s (`is_player=false`) | Heroes visible in main scene |
| 4 | Right-click in FileSystem panel → New Resource → `AbilityQBolt`. Save as `scripts/abilities/q_bolt_default.tres`. Set `projectile_scene` to `scenes/projectile.tscn`. Drag this resource into the player hero's `ability_q` slot | Q ability slottable |
| 5 | Same for W: New Resource → `AbilityWBlast` → `w_blast_default.tres` → assign `telegraph_scene = scenes/aoe_telegraph.tscn` → drag into player's `ability_w` slot | W ability slottable |
| 6 | Press F5 to run. Move with WASD, aim with mouse, press Q or W to cast | Game playable, no HUD yet |
| 7 | Create `scenes/hud.tscn` with `CanvasLayer` root + `Control` children matching the export refs in `scripts/hud.gd` (HPBar, MPBar, Timer Label, SkillBar with Q/W/E/R children each containing a CD ProgressBar, and an EndCard Panel) | HUD visible during play |

Detailed walkthrough for each step: see [`docs/build-day-1.md`](docs/build-day-1.md) (TODO — write this after Day 1 retro).

## Build path — Day 2 (~6h)

- Minions auto-walking down a lane (`scripts/minion.gd` — TODO)
- Dragon objective in pit area (`scripts/dragon.gd` — TODO)
- Replace placeholder ColorRects with Kenney sprites (player + 3 enemies + minions)
- Particle effects on hit, ability cast, death
- Sound effects (Kenney also has free SFX packs)

## Build path — Day 3 polish (~6h)

- 4-tier Midjourney tile replacement for hero-quality terrain
- Animation states (idle / walk / cast / death)
- Win/lose card polish + replay button
- Web export test: Project > Export > Add Web preset. Test in browser.

## Conventions (mirrors root project)

- **Per-scene ownership** — don't co-edit `arena.tscn` simultaneously with a teammate; assign one owner per scene file. `.tscn` is text-mergeable but same-scene edits → painful conflicts.
- **Resource-based balance** — never hardcode HP/damage/cooldown numbers in GDScript. Always `@export` them so they're editable as `.tres` resources.
- **Signals up, references down** — child nodes emit signals; parents listen. Don't grab refs across the tree with `get_node("../../sibling")` — that's brittle.
- **Run `bash ../scripts/playtest-check.sh godot/scenes/main.tscn`** before declaring a play session done. Script auto-detects the file type and runs the friendliness/playability checks.
- **Run `bash ../scripts/godot-screenshot.sh`** before claiming a Godot change is shipped — renders the actual frame to `/tmp/encore_godot_frame.png` so you (and anyone reviewing) can see what users will actually see. This closes the "I smoke-tested headless but never looked at a rendered frame" gap that bit us on the first arena scaffold.

## How this fits the broader Encore project

- **Engine-agnostic V2G**: see `../prototype/v2g/schema.md`. When this Godot version becomes mature, we can teach it to consume the same JSON `launch` config that the HTML5 prototype consumes, so the LIVE pipeline doesn't care which engine fulfills the request.
- **Hybrid stack OK**: per [encore_product_plan.md §5.1](../docs/encore_product_plan.md), maintaining both stacks side-by-side is acceptable during M12 spike validation. Don't kill HTML5 until Godot version proves itself.
- **CODEOWNERS**: see root `.github/CODEOWNERS`. The `godot/` subdir defaults to whoever picks up the spike — assign in the team chat before serious work starts.
