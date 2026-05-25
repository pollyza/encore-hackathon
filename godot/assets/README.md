# Assets

CC0 free packs from Kenney + selectively converted Midjourney art.

## Layout

```
assets/
├── tiles/         # Terrain + decoration tilesets (PNG + Godot .tres TileSets)
├── sprites/       # Characters, projectiles, props (individual PNGs)
├── sfx/           # .wav / .ogg sound effects
├── _downloads/    # Raw Kenney zip extracts (gitignored, don't commit)
└── kenney_raw/    # Same — gitignored landing area for unprocessed downloads
```

## Kenney packs (free CC0, no attribution required but appreciated)

Download into `_downloads/`, then copy ONLY the sprites you actually use into `sprites/` or `tiles/`. We don't commit the full Kenney packs because:
- They're 10-50 MB each (bloats repo)
- Most assets are unused (only a handful match our hand-painted MOBA aesthetic)
- License is CC0 so anyone can re-download

| Pack | URL | Use for |
|---|---|---|
| **Tiny Battle** | https://kenney.nl/assets/tiny-battle | Top-down terrain tiles (grass / dirt / water), best style match for MOBA feel |
| **Top-down Shooter** | https://kenney.nl/assets/top-down-shooter | Hero + enemy character sprites with directional animation |
| **Tower Defense Top-Down** | https://kenney.nl/assets/tower-defense-top-down | Alternative tile set + UI elements |
| **Particle Pack** | https://kenney.nl/assets/particle-pack | Hit / cast / death effects |
| **Sci-Fi Sounds** | https://kenney.nl/assets/sci-fi-sounds | Cast / hit SFX (works fine for fantasy too) |

## Workflow

1. `mkdir -p assets/_downloads && cd assets/_downloads`
2. Download a Kenney pack ZIP from the URL above
3. `unzip <pack>.zip`
4. In Godot: open the project, the asset auto-imports
5. Drag the specific tile/sprite you want into `tiles/` or `sprites/` (commits clean copies)
6. Optionally delete the raw zip from `_downloads/` to save disk

## Midjourney path (Phase 2 polish)

For higher-fidelity Dota-like tiles than Kenney provides, use prompts like:

```
top-down 2D hand-painted MOBA terrain tile, dota 2 style, lush grass with subtle path,
muted color palette, soft directional lighting from top-left, seamless tileable 256x256
```

Run through the same pipeline as `prototype/assets/process.py` (background removal not needed for terrain) and drop into `tiles/`.

## License

All Kenney assets are CC0 (public domain). Your AI-generated art is yours. Custom art credited per-file in commit messages.
