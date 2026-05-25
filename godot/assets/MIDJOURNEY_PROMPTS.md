# Midjourney prompts — Encore MOBA art polish (Day 3 pass)

Replaces the Kenney placeholders with hand-painted Dota-style assets.

## Why a "Day 3" pass

Kenney's CC0 packs got us a playable game on Day 1, but the style is mismatched (chunky pixel tiles + clean vector chars). The user reference (https://i.imgur.com/dota2-map.jpg) called for *hand-painted, muted-palette, soft-directional-lighting* — a different visual language. This file is the prompt playbook to bridge that gap once gameplay is stable.

## Workflow

1. **Generate** with Midjourney v6+ using the prompts below. For each asset, generate 4 variants (V1-V4), pick the best, upscale.
2. **Save** raw outputs into `godot/assets/_downloads/midjourney/` (gitignored).
3. **Process**:
   - **Terrain tiles**: crop to 256×256, ensure seamless tiling (test by 2×2 tiling in Photoshop). No background removal needed.
   - **Hero / minion sprites**: 512×512, remove background to transparent PNG (use rembg, remove.bg, or Photoshop magic wand).
   - **Boss / dragon**: 1024×1024, transparent background.
4. **Place final files**:
   - Terrain: `godot/assets/tiles/mj/<name>.png` (NEW subfolder)
   - Sprites: `godot/assets/sprites/mj/<name>.png`
5. **Swap into game** via inspector — see "Override slots" below.

## Prompts

### Terrain — base grass

```
top-down 2D hand-painted MOBA terrain tile, dota 2 stylized aesthetic,
lush green grass with subtle variations, soft directional lighting from
top-left, muted forest palette, seamless tileable, no characters, no text
--ar 1:1 --style raw --v 6.1
```

Generate 4-6 grass variants (different flower densities, slight color shifts).

### Terrain — water (river)

```
top-down 2D hand-painted MOBA water tile, dota 2 stylized aesthetic,
flowing river water with subtle ripples and small whitecaps, blue-teal
palette, soft top-left directional lighting, seamless tileable both axes,
no characters
--ar 1:1 --style raw --v 6.1
```

### Terrain — dirt path (for lanes)

```
top-down 2D hand-painted MOBA dirt path tile, dota 2 stylized aesthetic,
worn earth with small stones, warm brown palette, soft directional
lighting from top-left, seamless tileable, no characters, no logos
--ar 1:1 --style raw --v 6.1
```

### Decoration — bush

```
top-down 2D hand-painted fantasy bush sprite, dota 2 stylized aesthetic,
dense leafy plant viewed from above, dark forest green with brighter
top highlights, slight transparency at edges, isolated on transparent
background, ~30% canvas fill
--ar 1:1 --style raw --v 6.1
```

### Decoration — rock

```
top-down 2D hand-painted boulder sprite, dota 2 stylized aesthetic,
moss-covered gray rock viewed from slightly elevated angle, weathered
surface with cracks, isolated on transparent background, ~25% canvas fill
--ar 1:1 --style raw --v 6.1
```

### Hero — player (cyan mage / generic)

```
top-down 2D hand-painted MOBA hero sprite, dota 2 stylized aesthetic,
fantasy mage holding a glowing staff, viewed from above (slight 3/4),
cyan and silver robes, dynamic idle pose, isolated on transparent
background, character occupies ~70% of canvas
--ar 1:1 --style raw --v 6.1
```

### Hero — enemy archetypes (3 variants)

```
# Enemy A — sword fighter
top-down 2D hand-painted MOBA hero sprite, dota 2 stylized aesthetic,
red-armored warrior holding a sword, viewed from above (slight 3/4),
crimson and steel color palette, aggressive idle pose, isolated on
transparent background, character ~70% of canvas
--ar 1:1 --style raw --v 6.1

# Enemy B — assassin
... rogue archetype, dark cloak, twin daggers ...

# Enemy C — bruiser
... heavy plate armor, war hammer, intimidating stance ...
```

### Minion (smaller, simpler)

```
top-down 2D hand-painted MOBA minion sprite, dota 2 stylized aesthetic,
small armored creature with simple weapon, viewed from above, ~50% of
canvas fill, transparent background, low-detail (will be tiny on screen)
--ar 1:1 --style raw --v 6.1
```

### Boss — dragon (objective)

```
top-down 2D hand-painted MOBA boss sprite, dota 2 stylized aesthetic,
large coiled dragon viewed from above, scaly green-bronze body with
spread wings, menacing pose, isolated on transparent background, fills
canvas
--ar 1:1 --style raw --v 6.1
```

## Override slots in code

`arena.gd` exposes `@export` slots so you can drag MJ outputs into the
Arena scene's inspector without touching any GDScript:

| Inspector field | What to drop in |
|---|---|
| `Hero Sprite Override / Player` | `assets/sprites/mj/hero_player.png` |
| `Hero Sprite Override / Enemy A/B/C` | enemy variants |
| `Terrain Override / Grass A/B/C` | grass tile variants |
| `Terrain Override / Water A/B` | water tiles |
| `Terrain Override / Bush` | bush decoration |
| `Terrain Override / Rock` | rock decoration |

If a slot is left empty, the Kenney default is used. So you can swap one asset at a time and see incremental improvement.

## Tips for staying on style

- Always include "dota 2 stylized aesthetic" + "muted palette" + "soft directional lighting from top-left" in every prompt. These three phrases lock in the visual coherence.
- Use `--style raw` to avoid Midjourney's default "epic fantasy" overcooking.
- Generate the FULL set in one session — color matching between assets is much better when MJ keeps similar latent state.
- For tile-able terrain: use the upscale → seamless-loop trick (or run a Krita/Photoshop offset filter and fix the seam).
- Budget: ~40 generations × ~$0.05/gen = $2-3 total for the full pack.

## Don't replace until gameplay is solid

This is a polish pass. If the game's not yet fun (D = HUD just landed, next is E = hit feedback, F = minions/dragon), DON'T spend MJ tokens on art yet. Art polish on broken gameplay is wasted work.
