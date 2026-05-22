# live/ — owner: **D · LIVE/UX**

The LIVE-emulation host: a webpage that *looks like* a TikTok game live stream and runs the V2G demo end-to-end.

## Files

| File | Status | Purpose |
|---|---|---|
| `streamer.html` | ✅ shipped (v0.6) | Plays a recorded video as a fullscreen "LIVE" feed. Samples one frame every 4s, posts to `observer.py`, and on highlight slides up an iframe of `../encore_prototype.html?embedded=1` |

## Demo flow

```
streamer.html (LIVE-feel host, 1 video element + status bar)
    │
    ├── every 4s: capture frame → POST to localhost:8081/analyze
    │                                       │
    │                                       └─→ observer.py → Claude Vision → JSON
    │
    │   ← {highlight: true, template, theme, scenario}
    │
    ├── bottom sheet slides up
    │
    └── iframe loads ../encore_prototype.html?embedded=1
        ├── parent postMessage({type:'launch', config})
        ├── 30s game plays
        └── child postMessage({type:'encore_done', stats})
            └── sheet slides down, 8s cooldown, sampling resumes
```

## Run

```bash
# Terminal 1 — static server (from project root!)
cd /Users/bytedance/Documents/encore-hackathon
python3 -m http.server 8080

# Terminal 2 — Vision proxy
python3 prototype/v2g/observer.py

# Then open
open http://localhost:8080/prototype/live/streamer.html
```

If you see "observer offline" — terminal 2 isn't running. If you see `analyze error: 401` — re-export `ANTHROPIC_API_KEY`.

## Relative path notes

This file lives at `prototype/live/streamer.html`, so:
- Video source: `../../reference/videos/encore_test2.mp4` (two levels up to repo root)
- Game iframe: `../encore_prototype.html?embedded=1` (one level up to prototype/)

If you move this file again, update both paths.

## UI surfaces inside

- `● LIVE` badge top-left
- Status bar with state dot (cyan = sampling, amber = waiting, red = highlight, grey = idle)
- Cost tally on right
- `FORCE` button (manual highlight trigger for stage demo when real detection misses)
- Bottom sheet (`#sheet`) that slides up + hosts the iframe
