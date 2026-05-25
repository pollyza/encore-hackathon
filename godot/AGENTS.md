# Project rules for AI assistants working in `godot/`

> Read this on every session start. Claude Code reads `CLAUDE.md` (symlink to this file). Codex / Cursor read `AGENTS.md` directly. Same content, two filenames.

## Project type

Godot 4.3+ project. Not a web HTML project — different rules apply here than in `../prototype/`. Specifically:

- File types in play: `.gd` (GDScript), `.tscn` (text scene), `.tres` (text resource), `.import` (auto-generated, **don't edit**), `.godot/` (cache, gitignored)
- Engine docs: https://docs.godotengine.org/en/stable/

## GDScript style — the 6 things AI gets wrong most often

1. **Static typing is non-optional.** Use `var hp: float = 100.0`, not `var hp = 100`. Untyped vars in node refs cause "Invalid get index" crashes 50% of the time. Always annotate function params and returns: `func take_damage(amount: float, _source: Node2D) -> void:`.

2. **Signals up, references down.** Children emit signals; parents `.connect()` to them. Do NOT do `get_node("../../sibling")` to reach a sibling — that breaks the moment someone reorganizes the tree. Add an `@export` slot, drag the ref in the inspector, or pass it through a parent.

3. **Game state lives in Resources, not Nodes.** Hero stats (max_hp, damage, ability_q), level data, balance numbers → all `@export` vars on `Resource` subclasses saved as `.tres`. Nodes are presentation; Resources are data. This makes balance tuning a file edit, not a code edit.

4. **`@onready var x = $Path/To/Node` for guaranteed-existing children.** Avoid `@onready var x: Node = null` then `_ready()` populating it — that's a JS habit.

5. **`_physics_process(delta)` for movement, `_process(delta)` for rendering/UI.** Mixing them causes jitter at high refresh rates.

6. **Don't use `get_tree().get_root().get_node("Main/Player")` to find the player.** Use `get_tree().get_nodes_in_group("player")` — assign nodes to groups in the editor or via `add_to_group("player")` in `_ready()`.

## Multi-developer rules (mirrors root `CLAUDE.md`)

1. **Per-scene ownership** — one person edits `arena.tscn` at a time. Same-scene edits from two people = merge hell. Use scene instancing to compose.
2. **`.tscn` files are text** — `git diff` works, but the UID and node-order changes from the editor can look noisy. Read carefully before merging.
3. **`.import/` and `.godot/` are gitignored** — don't try to commit them.
4. **Resources over hardcoded numbers** — if you balance-tune a number, make it an `@export` field, save as `.tres`, then non-coders can rebalance via the editor.
5. **Run `bash ../scripts/playtest-check.sh godot/scenes/main.tscn`** before declaring a session done. (Script may need a small patch to recognize `.tscn` files — flag if it errors.)

## What lives where

| Path | Purpose |
|---|---|
| `scenes/main.tscn` | Entry scene; `Game` script attached. Game flow lives in `scripts/game.gd`. |
| `scenes/hero.tscn` | Reused for player AND enemy heroes — flip `is_player` in inspector. |
| `scenes/projectile.tscn` | Spawned by `AbilityQBolt`. Area2D + script. |
| `scenes/aoe_telegraph.tscn` | Spawned by `AbilityWBlast`. Node2D + script that draws a ring. |
| `scripts/ability.gd` | Base class for all abilities. Resource (not Node). |
| `scripts/abilities/q_bolt.gd` | Straight-line skillshot with ±25° aim assist. |
| `scripts/abilities/w_blast.gd` | Telegraphed circle AoE. |
| `scripts/hero.gd` | Player input + AI driver. Same script for both via `is_player` flag. |
| `scripts/projectile.gd` | Bullet that ticks position and hit-tests against `enemies` group. |
| `scripts/aoe_telegraph.gd` | Manages telegraph delay + impact damage + cleanup. |
| `scripts/game.gd` | Top-level controller: round timer, win/lose detection. |
| `scripts/hud.gd` | Wires Game + Player signals to HUD `Control` nodes. |
| `assets/sprites/` | Per-feature sprites (`hero_player.png`, `hero_enemy.png`, etc.). |
| `assets/tiles/` | Tileset PNGs (terrain, decoration). |
| `assets/sfx/` | Sound effects (.wav, .ogg). |

## Adding a new ability

```
1. Create a new GDScript at scripts/abilities/x_<name>.gd that extends Ability.
2. Override _cast(caster, target_pos). Call _start_cooldown() on success.
3. In the editor, right-click the FileSystem panel → New Resource → AbilityX<Name>.
4. Save as scripts/abilities/x_<name>_default.tres.
5. Tune the @export fields (damage, range, cooldown).
6. Drag the .tres into a hero's ability_x slot.
```

## Adding a new hero variant

Don't make a new scene. Make a new Resource:
- Hero stats (hp, mp, speed, damage) → all `@export` already
- Ability loadout → drag different `.tres` ability resources into Q/W/E/R slots
- Sprite → swap `$Sprite2D.texture` via `@export var sprite_texture: Texture2D`

This way "Dragon Champion" and "Bolt Mage" are 2 `.tres` files, not 2 scenes.

## Don't do

- **Don't `print()` for debugging in committed code.** Use `push_warning()` / `push_error()` or remove before commit.
- **Don't import a new addon without team sign-off.** Addons modify `addons/` and `project.godot`; they're harder to revert than scripts.
- **Don't change `project.godot` input bindings** without saying so in the commit message — input map changes are easy to overlook in review.
- **Don't store game state on `Game` singleton.** Even though `Game` is a controller, treat it as session-only. Persistent state → `Resource` saved to disk.
- **Don't co-edit `main.tscn`.** It's the integration point; one owner only during active dev.

## Reference docs to load when stuck

- GDScript style: https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html
- Signals: https://docs.godotengine.org/en/stable/getting_started/step_by_step/signals.html
- Resources: https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html
- Best practices: https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html
- Web export specifics: https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
