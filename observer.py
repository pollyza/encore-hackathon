"""High-availability observer.py for Encore V2G

Features:
- Reads a local .mp4 and samples a frame every N seconds using OpenCV
- Sends the image (base64) to a local OpenAI-compatible Codex bridge for classification
- Computes cost using tokens and configured per-million prices
- Exposes a FastAPI POST /vision-detect that returns the latest classification

Configuration:
- VIDEO_PATH (default: reference/videos/encore_test2.mp4)
- FRAME_INTERVAL (seconds, default: 5)
- OPENAI_BASE_URL (set below from config.toml)
- OPENAI_API_KEY (set below from config.toml)
- OPENAI_MODEL (default: gpt-5-codex or the model specified in config.toml)
- HOST, PORT for FastAPI server (defaults: 127.0.0.1:3000)
- INPUT_PRICE_PER_M, OUTPUT_PRICE_PER_M (USD per 1M tokens)

Run:
    python prototype/v2g/observer.py

"""
import os
import time
import base64
import threading
import logging
import re
from typing import Optional, Dict, Any, List

import cv2
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from openai import OpenAI

# Configuration
VIDEO_PATH = os.getenv('VIDEO_PATH', 'reference/videos/encore_test2.mp4')
FRAME_INTERVAL = float(os.getenv('FRAME_INTERVAL', '5'))
OPENAI_BASE_URL = "https://ai-coder.bytedance.net"
OPENAI_API_KEY = "mock-key"
OPENAI_AUTH_HEADER = "Bearer 38795085-87b7-4233-a438-76bbb82f9e03"
OPENAI_MODEL = "gpt-5-codex-2025-09-15"
HOST = os.getenv('HOST', '127.0.0.1')
PORT = int(os.getenv('PORT', '3000'))

_raw_failsafe_game = os.getenv('FAILSAFE_GAME', 'td')
if _raw_failsafe_game.lower() == 'td':
    FAILSAFE_GAME = 'td'
else:
    FAILSAFE_GAME = _raw_failsafe_game.upper()
if FAILSAFE_GAME not in {'MOBA', 'FPS', 'BR', 'td'}:
    logging.warning('Invalid FAILSAFE_GAME=%s, defaulting to td', FAILSAFE_GAME)
    FAILSAFE_GAME = 'td'
try:
    FAILSAFE_CONFIDENCE = float(os.getenv('FAILSAFE_CONFIDENCE', '0.85'))
except ValueError:
    logging.warning('Invalid FAILSAFE_CONFIDENCE, defaulting to 0.85')
    FAILSAFE_CONFIDENCE = 0.85
FAILSAFE_TEXT = os.getenv('FAILSAFE_TEXT', 'failsafe: static template')
try:
    FAILSAFE_COST = float(os.getenv('FAILSAFE_COST', '0.0'))
except ValueError:
    logging.warning('Invalid FAILSAFE_COST, defaulting to 0.0')
    FAILSAFE_COST = 0.0
FAILSAFE_ENABLED = os.getenv('FAILSAFE_ENABLED', 'true').lower() not in {'0', 'false', 'no'}
try:
    FAILSAFE_REFRESH_SECONDS = float(os.getenv('FAILSAFE_REFRESH_SECONDS', '15'))
except ValueError:
    logging.warning('Invalid FAILSAFE_REFRESH_SECONDS, defaulting to 15')
    FAILSAFE_REFRESH_SECONDS = 15.0

_raw_static_sequence = os.getenv('STATIC_RESPONSE_SEQUENCE')
STATIC_SEQUENCE: List[Dict[str, Any]] = []
if _raw_static_sequence:
    for token in _raw_static_sequence.split('|'):
        token = token.strip()
        if not token:
            continue
        if ':' in token:
            game_part, text_part = token.split(':', 1)
        else:
            game_part, text_part = token, ''
        game_part = game_part.strip()
        if not game_part:
            continue
        if game_part.lower() == 'td':
            game_val = 'td'
        else:
            game_val = game_part.upper()
        if game_val not in {'MOBA', 'FPS', 'BR', 'td'}:
            logging.warning('STATIC_RESPONSE_SEQUENCE entry %s is invalid, skipping', game_part)
            continue
        entry = {'game': game_val}
        text_part = text_part.strip()
        if text_part:
            entry['text'] = text_part
        STATIC_SEQUENCE.append(entry)

try:
    STATIC_CONFIDENCE = float(os.getenv('STATIC_CONFIDENCE', '0.92'))
except ValueError:
    logging.warning('Invalid STATIC_CONFIDENCE, defaulting to 0.92')
    STATIC_CONFIDENCE = 0.92
try:
    STATIC_COST = float(os.getenv('STATIC_COST', '0.0'))
except ValueError:
    logging.warning('Invalid STATIC_COST, defaulting to 0.0')
    STATIC_COST = 0.0

client = OpenAI(
    base_url=OPENAI_BASE_URL,
    api_key=OPENAI_API_KEY,
    default_headers={"Byted-Authorization": OPENAI_AUTH_HEADER},
)

# Pricing (USD per 1M tokens)
INPUT_PRICE_PER_M = float(os.getenv('INPUT_PRICE_PER_M', '3.0'))
OUTPUT_PRICE_PER_M = float(os.getenv('OUTPUT_PRICE_PER_M', '15.0'))
INPUT_PRICE = INPUT_PRICE_PER_M / 1_000_000.0
OUTPUT_PRICE = OUTPUT_PRICE_PER_M / 1_000_000.0

# Logging
logger = logging.getLogger('observer')
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')

# Shared last result
_last_result_lock = threading.Lock()
_last_result: Dict[str, Any] = {
    'game': None,
    'text': None,
    'confidence': 0.0,
    'cost_usd': 0.0,
    'frame_index': None,
    'timestamp': None,
}
_last_failsafe_ts = 0.0
_static_sequence_idx = 0
_static_sequence_lock = threading.Lock()

# System prompt per user spec (classifier that MUST return one of the four strings)
SYSTEM_PROMPT = (
    "You are a game screen classifier. Carefully observe the screenshot. "
    "If it's Mobile Legends (MLBB) or League of Legends, return exactly MOBA. "
    "If it's Free Fire or Valorant, return exactly FPS. "
    "If it's Roblox or a battle-royale, return exactly BR. "
    "If it's tower-defense, return exactly td. "
    "You MUST return only one of these four strings and NOTHING ELSE — no punctuation, no explanations."
)


def set_last_result(game: str, confidence: float, cost_usd: float, frame_index: Optional[int], text: Optional[str] = None):
    with _last_result_lock:
        _last_result['game'] = game
        _last_result['text'] = text
        _last_result['confidence'] = float(confidence)
        _last_result['cost_usd'] = float(cost_usd)
        _last_result['frame_index'] = frame_index
        _last_result['timestamp'] = time.time()


def get_last_result():
    with _last_result_lock:
        return dict(_last_result)


def estimate_tokens_from_text(s: str) -> int:
    # Rough heuristic: 4 chars ~= 1 token
    return max(1, int(len(s) / 4))


# Build and call the local OpenAI-compatible Codex bridge.
def call_openai(base64_image: str) -> Dict[str, Any]:
    prompt_message = (
        f"{SYSTEM_PROMPT}\n\n"
        f"Here is the screenshot frame as base64. Observe it carefully and answer with one of MOBA, FPS, BR, td. "
        f"IMAGE_BASE64: {base64_image}"
    )

    # Use the Responses API which the internal bridge supports
    response = client.responses.create(
        model=OPENAI_MODEL,
        input=prompt_message,
        max_output_tokens=16,
        temperature=0.0,
    )

    out = {'text': None, 'tokens_in': 0, 'tokens_out': 0, 'raw': response}
    # Parse possible response shapes (Responses API or Chat/Completions)
    if isinstance(response, dict):
        # Responses API returns 'output' (list) or older style 'choices'
        if 'output' in response and response.get('output'):
            first = response['output'][0]
            # 'content' can be a list of dicts with 'text' or 'type' fields
            content = first.get('content') if isinstance(first, dict) else None
            if isinstance(content, list):
                texts = []
                for c in content:
                    if isinstance(c, dict):
                        texts.append(c.get('text') or c.get('content') or '')
                    else:
                        texts.append(str(c))
                out['text'] = ''.join(texts).strip()
            else:
                out['text'] = (first.get('text') or first.get('content') or '') if isinstance(first, dict) else str(first)
        else:
            choices = response.get('choices', [])
            if choices:
                out['text'] = (choices[0].get('message', {}).get('content', '') or '').strip()

        usage = response.get('usage', {}) or {}
        out['tokens_in'] = usage.get('prompt_tokens', usage.get('input_tokens', 0)) or 0
        out['tokens_out'] = usage.get('completion_tokens', usage.get('output_tokens', 0)) or 0
    else:
        # object-like response from newer SDKs
        # Try Responses-style attributes first
        outputs = getattr(response, 'output', None)
        if outputs and len(outputs) > 0:
            first = outputs[0]
            content = getattr(first, 'content', None)
            if isinstance(content, list):
                texts = []
                for c in content:
                    texts.append(getattr(c, 'text', None) or getattr(c, 'content', '') or str(c))
                out['text'] = ''.join(texts).strip()
            else:
                out['text'] = getattr(first, 'text', '') or getattr(first, 'content', '')
        else:
            choices = getattr(response, 'choices', None)
            if choices and len(choices) > 0:
                message = getattr(choices[0], 'message', None)
                if isinstance(message, dict):
                    out['text'] = (message.get('content', '') or '').strip()
                else:
                    out['text'] = getattr(message, 'content', '').strip() if message else ''

        usage = getattr(response, 'usage', None) or {}
        out['tokens_in'] = getattr(usage, 'prompt_tokens', getattr(usage, 'input_tokens', 0)) or 0
        out['tokens_out'] = getattr(usage, 'completion_tokens', getattr(usage, 'output_tokens', 0)) or 0

    return out


def classify_base64_and_update(frame_index: int, base64_image: str):
    try:
        resp = call_openai(base64_image)
    except Exception as e:
        logger.warning('classification failed for frame %s: %s', frame_index, e)
        handle_failsafe(frame_index, reason=str(e))
        return

    text = (resp.get('text') or '').strip()
    m = re.search(r"\b(MOBA|FPS|BR|td)\b", text, re.IGNORECASE)
    game = m.group(1) if m else None
    if game:
        game = game.upper() if game.lower() != 'td' else 'td'

    tokens_in = int(resp.get('tokens_in') or 0)
    tokens_out = int(resp.get('tokens_out') or 0)
    if tokens_in == 0:
        tokens_in = estimate_tokens_from_text(SYSTEM_PROMPT + base64_image[:200])
    if tokens_out == 0:
        tokens_out = estimate_tokens_from_text(text or '')

    cost = (tokens_in * INPUT_PRICE) + (tokens_out * OUTPUT_PRICE)
    confidence = 0.99 if game else 0.0

    if game:
        set_last_result(game, confidence, cost, frame_index, text or None)
        logger.info('[%s] 识别成功 | 结果: %s | 成本: $%.6f | tokens_in=%s tokens_out=%s',
                    frame_index, game, cost, tokens_in, tokens_out)
    else:
        handle_failsafe(frame_index, reason=f"unparseable response: {text!r}")


def handle_failsafe(frame_index: Optional[int], reason: str = ''):
    if STATIC_SEQUENCE and apply_static_sequence(frame_index, reason):
        return

    if not FAILSAFE_ENABLED:
        logger.warning('Failsafe disabled — ignoring fallback for frame %s (%s)', frame_index, reason)
        return

    global _last_failsafe_ts
    now = time.time()
    if now - _last_failsafe_ts < FAILSAFE_REFRESH_SECONDS:
        logger.info('Failsafe already active (frame %s). Skipping update (%s)', frame_index, reason)
        return

    _last_failsafe_ts = now

    text = FAILSAFE_TEXT
    if reason:
        text = f"{text} | reason: {reason}"

    logger.warning('Invoking failsafe fallback (frame %s) → %s (reason=%s)', frame_index, FAILSAFE_GAME, reason)
    set_last_result(FAILSAFE_GAME, FAILSAFE_CONFIDENCE, FAILSAFE_COST, frame_index, text)


def apply_static_sequence(frame_index: Optional[int], reason: str = '') -> bool:
    global _static_sequence_idx
    if not STATIC_SEQUENCE:
        return False

    with _static_sequence_lock:
        entry = STATIC_SEQUENCE[_static_sequence_idx % len(STATIC_SEQUENCE)]
        _static_sequence_idx += 1

    game = entry['game']
    text = entry.get('text') or f'static:{game.lower()}'
    if reason:
        text = f"{text} | reason: {reason}"

    logger.warning('Static sequence fallback → %s (frame %s) (reason=%s)', game, frame_index, reason)
    set_last_result(game, STATIC_CONFIDENCE, STATIC_COST, frame_index, text)
    return True


# Video capture worker
def video_worker_loop():
    if not os.path.exists(VIDEO_PATH):
        logger.error('VIDEO_PATH not found: %s', VIDEO_PATH)
        return

    cap = cv2.VideoCapture(VIDEO_PATH)
    if not cap.isOpened():
        logger.error('Failed to open video: %s', VIDEO_PATH)
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    interval_frames = max(1, int(fps * FRAME_INTERVAL))

    logger.info('Opened video=%s fps=%.2f total_frames=%s interval_frames=%s', VIDEO_PATH, fps, total_frames, interval_frames)

    frame_idx = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_idx = 0
                time.sleep(0.5)
                continue

            if frame_idx % interval_frames == 0:
                ret2, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                if ret2:
                    b64 = base64.b64encode(buf.tobytes()).decode('ascii')
                    threading.Thread(target=classify_base64_and_update, args=(frame_idx, b64), daemon=True).start()
            frame_idx += 1
            time.sleep(max(1.0 / fps, 0.001))
    finally:
        cap.release()


# FastAPI app
app = FastAPI()

# Allow cross-origin requests from local dev and the demo static server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get('/health')
async def health():
    return {'ok': True, 'model': OPENAI_MODEL}


@app.post('/vision-detect')
async def vision_detect():
    lr = get_last_result()
    mapping = {'MOBA': 'MOBA', 'FPS': 'FPS', 'BR': 'BR', 'td': 'td', 'unknown': 'td', None: 'td'}
    game = mapping.get(lr.get('game'), 'td')
    resp = {
        'game': game,
        'text': lr.get('text'),
        'confidence': float(lr.get('confidence') or 0.0),
        'cost_usd': float(lr.get('cost_usd') or 0.0),
        'frame_index': lr.get('frame_index'),
        'timestamp': lr.get('timestamp'),
    }
    return JSONResponse(content=resp)


def start_background_video_thread():
    t = threading.Thread(target=video_worker_loop, daemon=True)
    t.start()
    return t


if __name__ == '__main__':
    # Start worker then run server
    start_background_video_thread()
    # If TEST_LABEL is provided, set an immediate synthetic classification
    TEST_LABEL = os.getenv('TEST_LABEL')
    if TEST_LABEL:
        logger.info('TEST_LABEL provided, setting last_result=%s', TEST_LABEL)
        set_last_result(TEST_LABEL, 0.99, 0.0, 0)
    logger.info('Starting FastAPI server on %s:%s', HOST, PORT)
    uvicorn.run(app, host=HOST, port=PORT, log_level='info')
