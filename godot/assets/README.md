# Assets

CC0 free packs from Kenney + (Day 3+) Midjourney art for hand-painted Dota-style polish.

## What's committed (412 KB total)

```
assets/
├── tiles/
│   ├── tilemap_packed.png    Tiny Battle — chunky pixel terrain (grass / water / dirt / trees / buildings, 16x16 per tile, 202 tiles in one sheet)
│   ├── tilemap.png           Same content as tilemap_packed but spaced out (easier to slice in editor)
│   └── tdshooter_tilesheet.png  Top-down Shooter — vector industrial floor / wall tiles (524 tiles, modern feel — NOT Dota-style)
├── sprites/
│   ├── hero_player.png       Soldier 1 (green) — placeholder player hero, top-down vector style
│   ├── hero_enemy_a.png      Hitman 1 (dark suit) — placeholder enemy hero
│   ├── hero_enemy_b.png      Survivor 1 — placeholder enemy hero variant
│   ├── hero_enemy_c.png      Robot 1 — placeholder enemy hero variant
│   ├── minion_ally.png       Man Blue — placeholder ally minion body
│   ├── minion_enemy.png      Zombie 1 (or Man Old) — placeholder enemy minion
│   └── tdshooter_characters.png  Full character spritesheet (16+ chars, all poses) for picking more variants
└── particles/
    ├── particle_circle.png   Soft white ring — for AoE telegraph, hit burst
    ├── particle_star.png     Star burst — for kill / win VFX
    ├── particle_magic.png    Magic glow — for Q skillshot trail
    ├── particle_smoke.png    Smoke puff — for cast wind-up
    ├── particle_spark.png    Spark — for projectile impact
    └── particle_light.png    Light glow — for buff / heal aura
```

## What's NOT committed (gitignored, regenerable)

```
_downloads/
├── tiny-battle/           extracted Tiny Battle (~3 MB)
├── top-down-shooter/      extracted TDS (~38 MB, 587 PNGs)
├── particle-pack/         extracted Particle Pack (~3 MB, 193 PNGs)
├── tiny-battle.zip        original 128 KB
├── top-down-shooter.zip   original 2.5 MB
└── particle-pack.zip      original 14 MB
```

Total raw: ~43 MB. If you want to swap a sprite, dig into `_downloads/<pack>/` to find alternatives, then copy into `sprites/` or `tiles/` and commit.

## Honest tradeoff — Day 3 art polish needed

What we have NOW is enough to build a **playable, ugly** MOBA on Day 1. The visual style is a mismatch:
- Top-down Shooter chars are vector / modern military
- Tiny Battle tiles are chunky pixel war units
- Particle Pack is clean transparent glows (fits both)

Pasting modern soldiers onto pixel-grid grass won't look like the Dota screenshot the user referenced. That's expected and intentional — we're using Kenney to *unblock Day 1 development*, not to ship final art.

**Day 3 plan (Midjourney pass)** — see `prototype/assets/PROMPTS.md` for the proven MJ workflow on this project. Suggested prompts:

```
top-down 2D hand-painted MOBA terrain tile, dota 2 style, lush grass,
muted color palette, soft directional lighting from top-left,
seamless tileable 256x256, no characters, no logos

top-down 2D hand-painted MOBA terrain tile, dota 2 style, river water with
ripples, blue-green palette, soft lighting, seamless tileable 256x256

top-down 2D hand-painted MOBA hero sprite, fantasy mage holding staff,
512x512 transparent PNG, dota 2 stylized art, viewed from above, idle pose
```

Run through the same pipeline as `prototype/assets/process.py` (bg removal for sprites, not for tiles) and drop into `tiles/` / `sprites/` to overwrite the Kenney placeholders.

## How to add more assets later

```bash
# 1. Find a Kenney pack on https://kenney.nl/assets
# 2. Download the zip into _downloads/  (gitignored, no commit)
# 3. unzip and browse for the specific file you want
# 4. Copy that single file into tiles/, sprites/, or particles/
# 5. git add the copied file (NOT the whole _downloads tree)
```

## License

All Kenney assets are CC0 (public domain). No attribution required but appreciated — credit `kenney.nl` in shipped game credits if any. Your Midjourney art is yours. Custom art credited per-file in commit messages.
