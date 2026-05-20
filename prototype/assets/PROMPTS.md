# Encore — AI sprite atlas prompt batch (B1)

This is the offline-generation playbook for the Encore sprite atlas. Run each prompt through Midjourney / DALL-E 3 / Stable Diffusion (with a controlled seed, see §Workflow). Crop, downscale, anchor, and pack the results into `atlas.png` + `atlas.json`. The runtime is already wired — when these two files appear in `prototype/assets/`, the game swaps from procedural fallback to PNG sprites with zero code change.

## Quick start with `process.py`

The full workflow is automated by [`process.py`](process.py). After AI generation, the only thing you do by hand is **save each PNG with the right filename**. No Photoshop, no Aseprite, no manual cropping required.

```bash
pip install rembg          # one-time, ~170MB U^2-Net model downloads on first run

# 1. Drop AI-generated PNGs into raw/ named exactly by slot (any resolution):
#    prototype/assets/raw/hero.moba.png
#    prototype/assets/raw/enemy.moba.mage.png
#    ... (22 files)

# 2. Auto-process: rembg → alpha threshold → auto-crop → nearest-neighbor downscale
python3 prototype/assets/process.py
#    optional: python3 prototype/assets/process.py --quantize   # shared 32-color palette
#    optional: python3 prototype/assets/process.py --check      # dry-run report

# 3. Pack into atlas + manifest
python3 prototype/assets/pack.py

# 4. Reload the game in your browser — sprites swap in, zero code changes.

# 5. (Optional) If sprite feet float/sink on atlas load vs procedural fallback:
python3 prototype/assets/process.py --check-anchors
#    Writes suggested_anchors.json with per-slot foot diagnostics.
```

The script handles all the post-processing in one shot: typical wall-clock per sprite ≈ 30s (mostly rembg inference) vs. ~10 min manual Aseprite work. Full 22-sprite batch ≈ 10 min on a laptop CPU, 2 min with a GPU.

## Style preamble (paste in front of every prompt)

```
Isometric 2:1 dimetric pixel art viewed from a 30° downward angle.
Transparent background. Single subject centered, no shadow baked into the sprite.
Hard-edge pixel rendering, NO anti-aliasing, NO blur, NO smooth gradients.
Three flat tone steps per surface: bright top / mid base / dark side.
Chunky voxel palette — Roblox-meets-Minecraft, saturated but not neon.
NO text, NO logos, NO real-world brand or game IP references.
Subject must fit inside <SIZE>px box with 2px margin all sides.
Sprite must read at 32px viewing scale on a phone. Avoid fine detail.
```

## Workflow

1. Generate each prompt at **4× resolution** (e.g. 128×160 for a 32×40 sprite) for crispness.
2. Background removal: threshold alpha < 30 → transparent. Most generators output a colored bg; mask it out in Photoshop / GIMP / `rembg`.
3. Downscale to spec size in Aseprite with **nearest-neighbor** (NOT bilinear). Re-crop to 2px margin.
4. Drop all sprites into `prototype/assets/sprites/` (one PNG per slot, named `<slot>.png`, e.g. `hero.moba.png`).
5. Pack via TexturePacker (free tier) OR run the supplied Python packer (`prototype/assets/pack.py`, see §Packing).
6. The packer outputs `atlas.png` (single sheet) + `atlas.json` (manifest with `{x, y, w, h, ax, ay}` per slot).
7. **Anchor (`ax`, `ay`)** is the "foot pixel" of the sprite — must match the procedural fallback so the entity doesn't jump on atlas load. Recommended foot anchors are listed per slot below.

## Style consistency rule

Pick **one seed** per generation tool and use it for all prompts. Generate 2-3 reference sprites first (suggest: `hero.moba`, `enemy.moba.mage`, `crate.common`). If they read as the same family, proceed with the full batch. If they don't, iterate on the style preamble until they do — **don't ship inconsistent batches**.

---

## Sprite slots (22 total)

### Heroes — playable character per template

| Slot | Size | Anchor (ax,ay) | Subject |
|---|---|---|---|
| `hero.moba` | 32×40 | (16, 36) | Voxel mage hero in teal robe, holding a glowing yellow staff at the side. Friendly readable silhouette. Face-on view from 30° above. |
| `hero.fps` | 32×40 | (16, 36) | Voxel soldier in teal armor with a small dark rifle held diagonally across body. Tactical helmet, neutral pose. |
| `hero.br` | 32×40 | (16, 36) | Voxel survivor in teal shirt with a small backpack visible on shoulders, holding a generic compact pistol. |

### MOBA enemies — distinct champion silhouettes

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `enemy.moba.mage` | 32×40 | (16, 36) | Voxel dark mage in purple robe (#c070ff base), pointed hood, small glowing magenta orb floating above one hand. |
| `enemy.moba.gunner` | 32×40 | (16, 36) | Voxel archer/gunner in orange tunic (#ff9050 base), small crossbow or short bow held at hip. Light/agile silhouette. |
| `enemy.moba.tank` | 32×40 | (16, 36) | Voxel armored knight in blue plate (#70a0ff base), boxy/bulky proportions, small dark visor slit. Heavy silhouette. |

### FPS enemy

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `enemy.fps` | 32×40 | (16, 36) | Voxel soldier in orange tactical vest (#ff8050 base), small rifle, neutral helmet — mirror of `hero.fps` but in orange. |

### BR squad bots — three squad colors

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `bot.br.0` | 32×40 | (16, 36) | Voxel survivor in orange shirt (#ff8050), generic pistol. Same body shape as `hero.br`. |
| `bot.br.1` | 32×40 | (16, 36) | Voxel survivor in purple shirt (#a070ff), generic pistol. Same body shape. |
| `bot.br.2` | 32×40 | (16, 36) | Voxel survivor in green shirt (#80b050), generic pistol. Same body shape. |

### MOBA minions — small lane creeps

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `minion.ally` | 20×24 | (10, 22) | Tiny voxel soldier in cyan tunic (#5af5e0), simple stylized helmet, holding a stub weapon. Half the height of a hero. |
| `minion.enemy` | 20×24 | (10, 22) | Tiny voxel soldier in orange tunic (#ff8050), simple helmet. Half-hero scale. Mirror of ally. |

### MOBA boss — the dragon

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `dragon` | 80×64 | (40, 56) | Squat voxel dragon, brown-orange body (#aa5020), yellow eyes, jagged orange spines along the back, small wings tucked. Friendly chunky proportions, NOT scary realistic. Foot anchor is the center of the base. |

### MOBA tower — defensive structure

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `tower` | 32×64 | (16, 60) | Stone voxel tower, gray/blue (#a0a0b8), 3 stacked iso-blocks tall, with a single red triangular flag/cap on top. Slightly tapered toward the top. |

### BR loot crates — color-tiered by rarity

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `crate.common` | 24×24 | (12, 20) | Voxel wooden chest with white-ish (#dddddd) banding/lid trim. Small, sealed, slight pixel rivets. |
| `crate.rare` | 24×24 | (12, 20) | Voxel chest with cyan (#5af5e0) glow/trim. Same silhouette as common, different color. |
| `crate.epic` | 24×24 | (12, 20) | Voxel chest with purple (#a044ff) glow/trim. Same silhouette. |
| `crate.legendary` | 24×24 | (12, 20) | Voxel chest with gold (#ffcd75) glow/trim and a small subtle glimmer/star. Same silhouette. |

### FPS grenade

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `grenade` | 12×12 | (6, 10) | Tiny orange-red voxel grenade, round, with a small visible pin loop on top. Very simple. |

### VFX overlays — flashes drawn during action

| Slot | Size | Anchor | Subject |
|---|---|---|---|
| `vfx.muzzle` | 24×24 | (12, 12) | Bright yellow-white voxel starburst / muzzle flash, transparent everywhere else. Centered. |
| `vfx.skillshot` | 24×24 | (12, 12) | Cyan/yellow magic bolt, vaguely arrow-like, with sparkle. Centered. |
| `vfx.pickup` | 24×24 | (12, 12) | Soft green voxel sparkle / plus-sign motif. Centered. |

---

## Packing

After all PNGs are in `prototype/assets/sprites/`, run:

```bash
python3 prototype/assets/pack.py
```

This produces `prototype/assets/atlas.png` (single 256×256 or 512×512 sheet) and `prototype/assets/atlas.json` (manifest). The runtime already loads these via `Assets.load('assets/atlas.png', 'assets/atlas.json')` at boot.

If you ship without the AI batch, the same packer can generate a **placeholder atlas** from solid-color labeled rectangles — useful to verify the loader path end-to-end. Run:

```bash
python3 prototype/assets/pack.py --placeholder
```

## Anchor cheat sheet — match these to procedural fallbacks

The procedural fallbacks in `encore_prototype.html` (`drawVoxelMan`, `mobaDrawDragon`, `mobaDrawTower`, `brDrawCrate`) plant the entity's "foot" at the projected screen pixel `(sx, sy)`. The sprite anchor `(ax, ay)` is the foot pixel inside the sprite itself. Rule of thumb:

- For man-shaped sprites (hero / enemy / minion / bot): `ax = w/2`, `ay = h - 4` (the foot is 4 pixels above the bottom edge so legs read).
- For boss/tower: `ax = w/2`, `ay = h - 8` (more vertical bias).
- For ground props (crate / grenade): `ax = w/2`, `ay = h - 4`.
- For VFX overlays: `ax = w/2`, `ay = h/2` (centered, not foot-anchored — they're drawn at the action point).

If sprites visibly jump or sink when the atlas loads vs. when it's absent, your `ay` is off by a few pixels — adjust in `atlas.json` and refresh.
