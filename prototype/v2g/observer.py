#!/usr/bin/env python3
"""
observer.py — Claude Vision proxy for Encore V2G demo.

Endpoints:
  GET  /health   → 200 {ok: true, model: <model>}
  POST /analyze  → {image: "data:image/jpeg;base64,...", t: float}
                   → forwards to Anthropic vision API
                   → returns {highlight, confidence, template, theme, scenario, _meta}

Why this exists:
  The Anthropic API requires a secret API key and does not allow direct
  browser calls (key would leak; CORS would block). This thin local proxy
  keeps the rest of the V2G demo browser-driven (per plan: "single page +
  iframe + postMessage"). The browser POSTs base64-encoded frames here;
  the proxy adds the API key and forwards to api.anthropic.com.

Run:
    export ANTHROPIC_API_KEY=sk-ant-...
    python3 prototype/observer.py
    # → listening on http://127.0.0.1:8081
"""

import os
import sys
import json
import re
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

PORT = 8081
MODEL = os.environ.get('OBSERVER_MODEL', 'claude-sonnet-4-6')

# Rough per-million-token prices (USD) for cost estimate logging
PRICES = {
    'claude-opus-4-7':   (15.0, 75.0),
    'claude-sonnet-4-6': (3.0,  15.0),
    'claude-haiku-4-5-20251001': (0.8, 4.0),
}

SYSTEM_PROMPT = """You analyze a single video frame from a game livestream and decide whether it shows a HIGHLIGHT MOMENT — a notable in-game event that the streamer's audience would want to relive: a kill, multi-kill, clutch, ace, dragon take, victory screen, or visually dramatic gameplay action.

You MUST return ONLY a single JSON object, no markdown fences, no prose, no preamble. Schema:

{
  "highlight": true | false,
  "confidence": <float 0.0-1.0>,
  "template": "fps" | "moba" | "br" | null,
  "theme": "desert" | "snow" | "cyber" | "jungle" | "grass" | "lava" | "ice" | "twilight" | "forest" | "island" | "wasteland" | null,
  "scenario": {
    "enemy_count": <int 1-5>,
    "hp_start": <int 30-100>,
    "weapon": "rifle" | "sniper" | "smg" | "pistol" | "staff" | "bow" | null,
    "description": "<short human-readable, ≤80 chars>"
  } | null
}

Template selection by visual genre:
  "fps"  — tactical shooters (Valorant, CS, COD): crosshair, gun barrel, kill feed, ammo HUD
  "moba" — top-down lane game (LoL, Dota, Honor of Kings): champion + ability bar + lane
  "br"   — battle royale (PUBG, Fortnite, Apex): big open map, loot/inventory, blue circle

Theme — closest match to the dominant environment palette in the frame.

Scenario inference rules:
  enemy_count: how many opponents are visible / implied as engaged (1-5; default 3 if a fight)
  hp_start:    if HP bar visible, mirror it. Otherwise: low/critical/clutch → 30-50; mid → 60-80; full → 80-100
  weapon:      visible primary weapon held by the streamer
  description: one short sentence naming the moment (e.g. "1v3 clutch retake on dusty map")

Be CONSERVATIVE with confidence. Only return confidence > 0.6 for clearly dramatic moments. Setup/walking/menus → false."""


# ============================================================
#  Vision API call + JSON parsing
# ============================================================

def parse_image(data_url: str) -> tuple:
    """data:image/jpeg;base64,xxx → (media_type, raw_base64)."""
    m = re.match(r'^data:(image/\w+);base64,(.+)$', data_url, re.DOTALL)
    if not m:
        raise ValueError('not a valid data URL')
    return m.group(1), m.group(2)


def parse_json_loose(text: str) -> dict:
    """Strict JSON first; fall back to ```json fenced block; fall back to first {...}."""
    text = (text or '').strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fence = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass
    m = re.search(r'\{[\s\S]*\}', text)
    if m:
        return json.loads(m.group(0))
    raise ValueError('no JSON in model response')


_inflight_lock = threading.Lock()
_client = None


def get_client():
    global _client
    if _client is None:
        try:
            from anthropic import Anthropic
        except ImportError:
            print('ERROR: anthropic SDK not installed.')
            print('Install: pip install anthropic')
            sys.exit(1)
        _client = Anthropic()
    return _client


def analyze_frame(image_data_url: str, t: float) -> dict:
    media_type, b64 = parse_image(image_data_url)
    client = get_client()
    resp = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=[{
            'type': 'text',
            'text': SYSTEM_PROMPT,
            'cache_control': {'type': 'ephemeral'},
        }],
        messages=[{
            'role': 'user',
            'content': [
                {
                    'type': 'image',
                    'source': {'type': 'base64', 'media_type': media_type, 'data': b64},
                },
                {'type': 'text', 'text': f'Frame at t={t:.1f}s. Classify.'},
            ],
        }],
    )
    text = resp.content[0].text if resp.content else ''
    parsed = parse_json_loose(text)
    u = resp.usage
    parsed['_meta'] = {
        'tokens_in': u.input_tokens,
        'tokens_out': u.output_tokens,
        'cache_creation_in': getattr(u, 'cache_creation_input_tokens', 0) or 0,
        'cache_read_in': getattr(u, 'cache_read_input_tokens', 0) or 0,
        'model': MODEL,
    }
    return parsed


def estimate_cost_usd(meta: dict) -> float:
    in_p, out_p = PRICES.get(MODEL, (3.0, 15.0))
    return (meta.get('tokens_in', 0) * in_p + meta.get('tokens_out', 0) * out_p) / 1_000_000


# ============================================================
#  HTTP server
# ============================================================

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # silence default access log; we emit our own
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _send_json(self, code: int, obj: dict):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self._send_json(200, {'ok': True, 'model': MODEL, 'port': PORT})
        else:
            self._send_json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/analyze':
            self._send_json(404, {'error': 'not found'})
            return
        if not _inflight_lock.acquire(blocking=False):
            self._send_json(200, {'busy': True})
            return
        try:
            length = int(self.headers.get('Content-Length', 0) or 0)
            raw = self.rfile.read(length).decode('utf-8')
            body = json.loads(raw) if raw else {}
            image = body.get('image')
            t = float(body.get('t', 0))
            if not image:
                self._send_json(400, {'error': 'missing image'})
                return
            stamp = datetime.now().strftime('%H:%M:%S')
            print(f'[{stamp}] /analyze t={t:.1f}s img={len(image)//1024}KB ', end='', flush=True)
            try:
                result = analyze_frame(image, t)
            except Exception as e:
                print(f' FAIL: {type(e).__name__}: {e}')
                self._send_json(200, {
                    'highlight': False,
                    'confidence': 0.0,
                    'error': f'{type(e).__name__}: {e}',
                })
                return
            cost = estimate_cost_usd(result.get('_meta', {}))
            hl = result.get('highlight', False)
            desc = ((result.get('scenario') or {}) or {}).get('description', '-')
            meta = result.get('_meta', {})
            print(
                f"→ hl={hl} ({meta.get('tokens_in',0)}+{meta.get('tokens_out',0)} tok, "
                f"~${cost:.4f}, cached={meta.get('cache_read_in',0)}) "
                f"{desc}"
            )
            self._send_json(200, result)
        finally:
            _inflight_lock.release()


def main():
    if not os.environ.get('ANTHROPIC_API_KEY'):
        print('ERROR: ANTHROPIC_API_KEY env var not set.')
        print('Get one at https://console.anthropic.com/settings/keys')
        print('Then: export ANTHROPIC_API_KEY=sk-ant-... && python3 observer.py')
        sys.exit(1)
    srv = HTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Encore V2G observer listening on http://127.0.0.1:{PORT}')
    print(f'Model: {MODEL}  |  ~${PRICES.get(MODEL, (3.0, 15.0))[0]}/M in, ~${PRICES.get(MODEL, (3.0, 15.0))[1]}/M out')
    print(f'Health: curl http://127.0.0.1:{PORT}/health')
    print(f'Ctrl+C to stop.\n')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nshutdown.')


if __name__ == '__main__':
    main()
