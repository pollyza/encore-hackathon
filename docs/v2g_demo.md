# V2G Demo — observe LIVE → detect highlight → launch Encore

This is the V2G pipeline that closes the 看 → 玩 → 播 loop: a host page plays a video as if it were a TikTok LIVE feed, an observer process samples frames and sends them to Claude Vision, and when the AI detects a highlight the matching Encore mini-game pops up in a bottom sheet — already configured (template + theme + scenario) for what was just observed.

## Files

- **`prototype/live/streamer.html`** — host page. Plays the source video, samples frames, sends them to `observer.py`, slides up the iframe on detection. *(moved here in v0.6.1)*
- **`prototype/v2g/observer.py`** — local Python proxy. Adds your API key and forwards frames to `api.anthropic.com`. Browser can't call Anthropic directly (key would leak; CORS). *(moved here in v0.6.1)*
- **`prototype/v2g/schema.md`** — V2G JSON config contract. Read this before changing the payload shape.
- **`prototype/encore_prototype.html`** — the existing game. Accepts `?embedded=1` and listens for `postMessage({type:'launch', config})` from the parent.
- **`reference/videos/encore_test2.mp4`** — canonical Valorant 1v3 source. Must be served from the same origin as `streamer.html` to avoid tainting the canvas.

## Run

You need two terminals (one for the static file server, one for the observer proxy) and an `ANTHROPIC_API_KEY`.

```bash
# terminal 1 — static server (note: serve from project root, NOT prototype/)
cd /Users/bytedance/Documents/encore-hackathon
python3 -m http.server 8080
```

```bash
# terminal 2 — Claude Vision proxy
cd /Users/bytedance/Documents/encore-hackathon
export ANTHROPIC_API_KEY=sk-ant-...
pip install anthropic           # one-time
python3 prototype/v2g/observer.py
# → listening on http://127.0.0.1:8081
```

Open in a browser: `http://localhost:8080/prototype/live/streamer.html`

Tap the play button to satisfy autoplay policy. Observer status bar narrates each sample. When Claude returns `highlight: true` with confidence ≥ 0.6, the bottom sheet slides up and the Encore mini-game starts with the matching template + theme + scenario.

## What you see

- **Top-left** `● LIVE` badge + the video playing fullscreen behind everything (TikTok-style)
- **Bottom bar** with a status dot:
  - cyan = sampling
  - amber pulsing = waiting for Claude response
  - red glowing = highlight detected
  - grey = idle / cooldown
- **`$0.0012`** running cost tally on the right (token usage × model price)
- **`FORCE`** button — manual trigger for stage rehearsal in case real detection misses
- **Bottom sheet** slides up on detection, hosts the iframe of `encore_prototype.html?embedded=1`, plays for ~30s, then slides down after a short "end card visible" delay (3.5s). Sampling resumes after an 8s cooldown.

## Cost

- Per frame: ~$0.005 with default `claude-sonnet-4-6` (input ~1500 tokens for the image + system prompt, output ~150 tokens for the JSON)
- 4-second sample interval × 30-min demo = 450 calls ≈ **$2.25 / demo**
- Switch to Haiku 4.5 for cheaper trial: `OBSERVER_MODEL=claude-haiku-4-5-20251001 python3 prototype/v2g/observer.py` (~$0.0008/call, $0.35/demo)
- Switch to Opus for highest quality on a stage demo: `OBSERVER_MODEL=claude-opus-4-7 python3 prototype/v2g/observer.py` (~$0.022/call, $9.90/demo)

Watch the observer.py terminal — every call logs tokens in/out and estimated cost.

## Config schema

When the observer returns `highlight: true`, the response (passed to the iframe via `postMessage`) is:

```json
{
  "highlight": true,
  "confidence": 0.92,
  "template": "fps",
  "theme": "desert",
  "scenario": {
    "enemy_count": 3,
    "hp_start": 60,
    "weapon": "rifle",
    "description": "1v3 clutch retake on dusty map"
  },
  "_meta": { "tokens_in": 1421, "tokens_out": 142, "model": "claude-sonnet-4-6" }
}
```

The iframe applies the overrides:
- **`template`** picks `Games[template]`
- **`theme`** forces the world palette via the `Themes[template][theme]` registry
- **`scenario.hp_start`** sets `state.player.hp`
- **`scenario.enemy_count`** trims `state.enemies` / `state.bots`
- **`scenario.weapon`** (BR only) swaps the starting weapon rarity
- **`scenario.description`** is shown in the mode badge

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `observer offline` red status | observer.py not running | start terminal 2 |
| `analyze error: 401` | bad API key | re-export `ANTHROPIC_API_KEY` |
| frame grab fails (CORS) | video served from different origin | make sure both `streamer.html` and `reference/videos/*` are served from `localhost:8080` |
| sheet pops up but game doesn't start | iframe didn't get `launch` msg | check browser console; the iframe should post `encore_ready` on load |
| every frame triggers a highlight | over-eager confidence | raise `CONFIDENCE_THRESHOLD` in `streamer.html` (default 0.6) |
| API call latency exceeds sample interval | model + image too large | reduce `FRAME_MAX_WIDTH` (default 480), or switch to Haiku |

## Out of scope (still)

- Real TikTok LIVE integration (uses pre-recorded video as a stand-in)
- Audio analysis (vision only — kill-feed text + visual cues)
- Multi-stream / load balancing
- Per-Encore behavior DSL (config is currently 4 fields, not full DSL)

These are explicitly Phase 2 / production concerns. Today's deliverable demonstrates the full *看 → 玩 → 播* loop in a single laptop session.
