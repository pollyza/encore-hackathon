#!/usr/bin/env python3
"""
process.py — AI sprite post-processor.

Pipeline per sprite (raw/<slot>.png → sprites/<slot>.png):
  1. Load RGBA
  2. Background removal via rembg (U^2-Net)
  3. Alpha threshold cleanup (kills halo edges)
  4. Auto-crop to non-transparent bbox + 2px margin
  5. Two-stage resize: LANCZOS to 2x target, then NEAREST to target
  6. Re-threshold alpha post-resize
  7. Save

Then run pack.py to produce atlas.png + atlas.json.

Usage:
  python3 process.py                    # batch all 22 from raw/
  python3 process.py hero.moba          # one slot only
  python3 process.py --check            # dry-run, no writes
  python3 process.py --quantize         # also enforce a shared 32-color palette
  python3 process.py --check-anchors    # foot-pixel diagnostic vs SLOTS' ay
"""

import os
import sys
import json
from pathlib import Path

# Import SLOTS from pack.py (same dir) — single source of truth for sizes/anchors
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from pack import SLOTS
except ImportError as e:
    print(f'ERROR: cannot import SLOTS from pack.py: {e}')
    sys.exit(1)

try:
    from PIL import Image
    import numpy as np
except ImportError as e:
    print(f'ERROR: missing dep: {e}')
    print('Install: pip install Pillow numpy')
    sys.exit(1)

# rembg is heavy (~170MB model on first use); import lazily.
def get_rembg():
    try:
        from rembg import remove
        return remove
    except ImportError:
        print('ERROR: rembg not installed.')
        print('Install: pip install rembg')
        print('First use downloads a ~170MB U^2-Net model to ~/.u2net/ (cached after).')
        sys.exit(1)


# ---- Constants ----
ALPHA_THRESHOLD = 40
MARGIN = 2
HERE = Path(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = HERE / 'raw'
SPRITES_DIR = HERE / 'sprites'

CHARACTER_LIKE_PREFIXES = ('hero.', 'enemy.', 'bot.', 'minion.')


# ============================================================
#  Pipeline steps
# ============================================================

def alpha_threshold_inplace(img: Image.Image) -> Image.Image:
    """Pixels with alpha < ALPHA_THRESHOLD → fully transparent (0,0,0,0).
    Vectorized via numpy. Kills the soft halo rembg sometimes leaves."""
    arr = np.array(img)
    mask = arr[:, :, 3] < ALPHA_THRESHOLD
    arr[mask] = [0, 0, 0, 0]
    return Image.fromarray(arr)


def auto_crop(img: Image.Image, margin: int = MARGIN) -> Image.Image:
    """Crop to the non-transparent bounding box, add `margin` px of transparent
    padding on all sides. Returns the original if the image is fully transparent."""
    bbox = img.getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    left = max(0, left - margin)
    top = max(0, top - margin)
    right = min(img.width, right + margin)
    bottom = min(img.height, bottom + margin)
    return img.crop((left, top, right, bottom))


def resize_pixel_art(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Crisp pixel-art two-stage resize:
       LANCZOS to (target * 2)  → keeps detail during the big shrink
       NEAREST to target        → final 2x step locks edges to pixel grid"""
    if img.size == (target_w, target_h):
        return img
    intermediate = (target_w * 2, target_h * 2)
    if img.size != intermediate:
        img = img.resize(intermediate, Image.LANCZOS)
    return img.resize((target_w, target_h), Image.NEAREST)


def process_one(slot: str, w: int, h: int, do_remove_bg: bool = True) -> Image.Image:
    """Run the full pipeline. Returns None if raw/<slot>.png is missing."""
    raw_path = RAW_DIR / f'{slot}.png'
    if not raw_path.exists():
        return None
    img = Image.open(raw_path).convert('RGBA')
    if do_remove_bg:
        remove = get_rembg()
        img = remove(img)
        # rembg may return PIL Image directly or bytes; normalize
        if not isinstance(img, Image.Image):
            from io import BytesIO
            img = Image.open(BytesIO(img)).convert('RGBA')
    img = alpha_threshold_inplace(img)
    img = auto_crop(img)
    img = resize_pixel_art(img, w, h)
    img = alpha_threshold_inplace(img)
    return img


# ============================================================
#  Palette quantization (optional --quantize flag)
# ============================================================

def build_master_palette(sprite_dict: dict, colors: int = 32) -> Image.Image:
    """Concatenate all processed sprites onto one canvas, quantize to N colors,
    return a 'P' mode image carrying the shared palette."""
    items = [im for im in sprite_dict.values() if im is not None]
    if not items:
        return None
    total_w = sum(im.width for im in items)
    max_h = max(im.height for im in items)
    canvas = Image.new('RGBA', (total_w, max_h), (0, 0, 0, 0))
    x = 0
    for im in items:
        canvas.paste(im, (x, 0))
        x += im.width
    # Quantize RGB only (palette doesn't include alpha)
    rgb = canvas.convert('RGB')
    return rgb.quantize(colors=colors, dither=Image.NONE)


def apply_palette(img: Image.Image, palette_img: Image.Image) -> Image.Image:
    """Apply a shared palette to an RGBA image while preserving original alpha."""
    rgb = img.convert('RGB')
    quantized_rgb = rgb.quantize(palette=palette_img, dither=Image.NONE).convert('RGB')
    arr = np.array(img)
    rgb_arr = np.array(quantized_rgb)
    out = np.zeros_like(arr)
    out[:, :, :3] = rgb_arr
    out[:, :, 3] = arr[:, :, 3]
    return Image.fromarray(out)


# ============================================================
#  Foot anchor diagnostic (optional --check-anchors flag)
#
#  Convention: the procedural fallbacks in encore_prototype.html plant the
#  entity's drawn foot at canvas (sx, sy+OFFSET) where OFFSET varies by entity
#  category. The atlas anchor ay is set so the sprite's foot row lines up
#  with the procedural foot. So:
#      measured foot row in sprite − anchor ay = expected category offset
#  Any drift from that expected offset means the sprite will jitter when the
#  atlas loads vs procedural fallback.
# ============================================================

EXPECTED_FOOT_DELTA = {
    # slot prefix → expected (foot_row - ay) offset on canvas
    'hero.':        8,
    'enemy.':       8,
    'bot.':         8,
    'minion.':      2,
    'dragon':       8,
    'tower':        0,
    'crate.':       0,
    'grenade':      0,
    'vfx.':         0,
}


def expected_delta_for(slot: str) -> int:
    for prefix, d in EXPECTED_FOOT_DELTA.items():
        if slot == prefix or slot.startswith(prefix):
            return d
    return 0


def measure_foot(img: Image.Image) -> tuple:
    """Find the lowest non-transparent row in the center 50% of width.
    Returns (foot_col, foot_row) inside the sprite."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    cx_lo, cx_hi = w // 4, w - w // 4
    for y in range(h - 1, -1, -1):
        if (alpha[y, cx_lo:cx_hi] > 0).any():
            xs = np.where(alpha[y, :] > 0)[0]
            if len(xs):
                return (int(xs.mean()), y)
    return (w // 2, h - 1)


def check_anchors() -> dict:
    """For each character-like sprite, measure foot row vs SLOTS' ay and compare
    against the expected category offset. Print drift; return dict."""
    suggestions = {}
    for slot, w, h, ax, ay in SLOTS:
        if not slot.startswith(CHARACTER_LIKE_PREFIXES):
            continue
        sprite_path = SPRITES_DIR / f'{slot}.png'
        if not sprite_path.exists():
            continue
        img = Image.open(sprite_path).convert('RGBA')
        if img.size != (w, h):
            print(f'  {slot}: SIZE MISMATCH ({img.size} vs {(w,h)}) — skipping')
            continue
        col, row = measure_foot(img)
        expected = expected_delta_for(slot)
        actual = row - ay
        drift = actual - expected
        suggestions[slot] = {
            'measured_foot': {'x': col, 'y': row},
            'current_anchor': {'ax': ax, 'ay': ay},
            'expected_delta': expected,
            'actual_delta': actual,
            'drift_px': drift,
            'suggest_ay': row - expected,
        }
        if abs(drift) <= 2:
            note = ' (ok)'
        else:
            note = f'  ← drift {drift:+d}px from {expected}px convention, suggest ay={row - expected}'
        print(f'  {slot}: foot={row} ay={ay} actual_Δ={actual:+d} expected_Δ={expected:+d}{note}')
    return suggestions


# ============================================================
#  Main
# ============================================================

def usage():
    print(__doc__.strip())


def main():
    argv = sys.argv[1:]
    if '--help' in argv or '-h' in argv:
        usage()
        return

    dry_run = '--check' in argv
    do_quantize = '--quantize' in argv
    do_anchors = '--check-anchors' in argv
    positional = [a for a in argv if not a.startswith('--')]

    # --check-anchors is an independent diagnostic on already-processed sprites
    if do_anchors:
        if not SPRITES_DIR.exists():
            print(f'No sprites/ dir at {SPRITES_DIR}. Run process.py first.')
            sys.exit(1)
        print('Foot anchor diagnostic (measured row vs SLOTS ay):\n')
        suggestions = check_anchors()
        out_path = HERE / 'suggested_anchors.json'
        with out_path.open('w') as f:
            json.dump(suggestions, f, indent=2)
        print(f'\nWrote {out_path}')
        return

    # Ensure raw/ exists; create sprites/ for real runs
    if not RAW_DIR.exists():
        print(f'No raw/ dir at {RAW_DIR}.')
        print('Create it and drop AI-generated PNGs named by slot:')
        for slot, *_ in SLOTS:
            print(f'  raw/{slot}.png')
        sys.exit(1)
    if not dry_run:
        SPRITES_DIR.mkdir(exist_ok=True)

    # Determine target slots
    if positional:
        targets = []
        for name in positional:
            spec = next((s for s in SLOTS if s[0] == name), None)
            if spec is None:
                print(f'WARNING: unknown slot {name!r} (not in SLOTS) — skipping')
                continue
            targets.append(spec)
        if not targets:
            print('No valid slots specified.')
            sys.exit(1)
    else:
        targets = list(SLOTS)

    # Dry run: report what would happen, no writes
    if dry_run:
        present, missing = [], []
        for slot, w, h, ax, ay in targets:
            raw_path = RAW_DIR / f'{slot}.png'
            if raw_path.exists():
                present.append((slot, w, h, raw_path.stat().st_size))
            else:
                missing.append(slot)
        if present:
            print(f'Would process {len(present)} sprite(s):')
            for slot, w, h, sz in present:
                print(f'  ✓ {slot}.png ({sz // 1024} KB → {w}×{h})')
        else:
            print('No files to process, drop AI-generated PNGs into raw/ named by slot:')
            for slot, w, h, *_ in SLOTS:
                print(f'  raw/{slot}.png    ({w}×{h})')
        if missing:
            print(f'\nMissing in raw/ ({len(missing)}): {", ".join(missing)}')
        return

    # Actual processing
    processed = {}
    missing = []
    for slot, w, h, ax, ay in targets:
        raw_path = RAW_DIR / f'{slot}.png'
        if not raw_path.exists():
            missing.append(slot)
            continue
        print(f'Processing {slot}... ', end='', flush=True)
        try:
            out = process_one(slot, w, h)
        except Exception as e:
            print(f'FAILED ({type(e).__name__}: {e})')
            continue
        if out is None:
            print('SKIP')
            continue
        processed[slot] = out
        print(f'OK ({w}×{h})')

    if not processed:
        print('\nNo sprites produced.')
        if missing:
            print(f'Missing from raw/: {", ".join(missing)}')
        sys.exit(1)

    # Optional palette quantization
    if do_quantize:
        print('\nQuantizing to shared 32-color palette...')
        palette_img = build_master_palette(processed, colors=32)
        if palette_img is not None:
            for slot in processed:
                processed[slot] = apply_palette(processed[slot], palette_img)
            print('Done.')

    # Save outputs
    for slot, img in processed.items():
        out_path = SPRITES_DIR / f'{slot}.png'
        img.save(out_path, optimize=True)

    print(f'\nWrote {len(processed)} sprite(s) to {SPRITES_DIR}/')
    if missing:
        print(f'Missing from raw/ (skipped): {", ".join(missing)}')

    # Non-zero exit if user asked for specific slots but some were missing
    if positional and missing:
        sys.exit(1)
    # Non-zero exit if batch run had any missing (so CI can catch incomplete batches)
    if not positional and missing:
        sys.exit(2)


if __name__ == '__main__':
    main()
