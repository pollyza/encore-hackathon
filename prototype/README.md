# Encore Prototype — multi-dev layout (M9-prep, 2026-05-22)

Entry point: **`encore_prototype.html`** (game canvas) + **`live/streamer.html`** (V2G LIVE demo host).

This directory was reorganized from "one big HTML file" to a module layout so 4 developers can work in parallel without merge conflicts. The reorganization is **partial** as of v0.6.1:

- ✅ CSS extracted to `styles.css`
- ✅ V2G proxy moved to `v2g/observer.py`
- ✅ LIVE host moved to `live/streamer.html`
- ⏳ JS is still inline in `encore_prototype.html` — split happens on hackathon Day 0 morning (see [games/_interface.md](games/_interface.md) for the contract)

## Module map

| Path | Owner | What lives here | When you'd edit |
|---|---|---|---|
| `encore_prototype.html` | **rotating** | Entry HTML + IIFE orchestrator (until Day 0 split). Everyone touches; please keep diffs small | structural HTML / `<script src=...>` ordering |
| `styles.css` | **D · LIVE/UX** | All global CSS — game canvas, HUD, overlays, splash, tutorial card | visual changes |
| `engine/` | **A · 玩法引擎** | Iso renderer (`iso.js`), input handling (`input.js`), audio (`audio.js`), particles. Pure utilities, no game logic | renderer math, input wiring, low-level helpers |
| `games/` | **A · 玩法引擎** | One file per template: `fps.js`, `moba.js`, `br.js`. All must implement the contract in `_interface.md` | game logic, balance, win conditions |
| `ui/` | **D · LIVE/UX** | HUD bars, skill buttons, banner, HOW_TO_PLAY card, end screen | tutorial copy, HUD layout, transitions |
| `themes.js` | **C · 美术** | The 12 theme registry (4 per template). Pure data | adding palettes, swapping tile colours |
| `v2g/observer.py` | **B · V2G/AI** | Local HTTP proxy that forwards frames to Claude Vision and returns JSON config | prompt changes, cost monitoring, schema validation |
| `v2g/schema.md` | **B · V2G/AI** | The V2G JSON config contract that `streamer.html` ↔ `encore_prototype.html` agree on | adding new scenario fields |
| `live/streamer.html` | **D · LIVE/UX** | The LIVE-emulation host page: plays a recorded stream, samples frames, slides up the iframe on highlight | sheet animation, end card, FORCE button, cost tally |
| `assets/` | **C · 美术** | Sprite atlas + theme art + pipeline (`pack.py`, `process.py`, `PROMPTS.md`) | when running AI sprite batch / adding raw sprites |

## Conventions

- **One module per file** — please don't drop a 200-line helper into `encore_prototype.html` if it belongs in `engine/` or `ui/`.
- **CSS prefixes** — namespace your selectors: `.fps-*`, `.moba-*`, `.br-*`, `.sheet-*`, `.howto-*`. Avoid bare class names to prevent cross-module collisions.
- **No imports yet** — until the JS split lands, every JS file is concatenated via `<script src=...>` tags. Order matters: utilities first, games second, main loop last.
- **Edit, don't rewrite** — when using Claude Code, prefer the Edit tool over Write. Wholesale file rewrites are a merge-conflict factory.

## Run locally

```bash
# 1. Static server (from project root, not from prototype/)
cd /Users/bytedance/Documents/encore-hackathon
python3 -m http.server 8080

# 2. Optional: Vision proxy (for V2G demo)
export ANTHROPIC_API_KEY=sk-ant-...
python3 prototype/v2g/observer.py        # listens on 127.0.0.1:8081

# Then open one of:
#   http://localhost:8080/prototype/encore_prototype.html    ← standalone game
#   http://localhost:8080/prototype/live/streamer.html       ← V2G LIVE demo
```

## Sync mirrors + deploy

```bash
bash scripts/deploy.sh                # sync /tmp/encore-preview, /tmp/encore-deploy, push to Vercel
bash scripts/deploy.sh --skip-vercel  # mirrors only (faster, for local preview)
```

## Pre-commit checklist (you must run before pushing)

1. `bash scripts/deploy.sh --skip-vercel` — confirms mirrors stay in sync
2. Open `http://localhost:8080/prototype/encore_prototype.html` in a real browser, play 1 round of each template
3. If you changed game logic / input / win conditions: invoke the `playtest-check` skill in Claude Code
4. `git diff --stat` — if any single file's diff exceeds 200 lines, consider splitting the commit
