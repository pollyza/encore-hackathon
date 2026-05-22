# v2g/ — owner: **B · V2G/AI**

The Video-to-Game pipeline: sample LIVE frames → Claude Vision → JSON config → iframe game.

## Files

| File | Status | Purpose |
|---|---|---|
| `observer.py` | ✅ shipped (v0.6) | Local HTTP proxy on `127.0.0.1:8081`. Receives a frame from `streamer.html`, forwards to `api.anthropic.com` with the API key, returns JSON config. Keeps the key off the browser and bypasses CORS. |
| `schema.md` | ⏳ to write | The JSON config contract that the iframe game agrees to receive |
| `prompts/system.md` | ⏳ to write | The system prompt fed to Claude Vision |

## How it runs

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pip install anthropic
python3 prototype/v2g/observer.py
# → listening on http://127.0.0.1:8081
```

Environment variables observer.py honors:
- `ANTHROPIC_API_KEY` — required
- `OBSERVER_MODEL` — `claude-sonnet-4-6` (default), `claude-haiku-4-5-20251001` for cheaper, `claude-opus-4-7` for stage demos
- `OBSERVER_PORT` — defaults to 8081

## V2G JSON config (current contract)

When Vision detects a highlight, observer returns:

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

`streamer.html` forwards this to the iframe via `postMessage({type:'launch', config})`. The iframe applies overrides in `applyScenarioOverrides()` (see `encore_prototype.html`).

**Adding a new scenario field?** Update `schema.md` first, then teach `applyScenarioOverrides()` how to consume it, then update the system prompt to ask Vision for it.

## Rules

- **Never commit your API key.** `.env`, hardcoded strings, terminal output — anywhere.
- **Track cost in the observer.py logs** — every call should log `tokens_in / tokens_out / estimated cost` so the team can monitor demo budget.
- **Don't change the JSON shape without coordinating** with the iframe consumer (the game) and the host (streamer.html).
