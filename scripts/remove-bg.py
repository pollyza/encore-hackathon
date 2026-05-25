#!/usr/bin/env python3
"""Strip white background from AI-generated sprites via 4-corner flood-fill.

Safer than threshold-based clearing: only removes white pixels CONNECTED
to the canvas edge, so internal whites (e.g. mage's silver staff orb)
stay solid.

Usage:
    python3 scripts/remove-bg.py <input.png> <output.png>
    python3 scripts/remove-bg.py <input_dir> <output_dir>   # batch

Tunable:
    --thresh N    flood-fill color tolerance (default 30, 0-255)
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def strip_bg(in_path: Path, out_path: Path, thresh: int = 30) -> None:
    img = Image.open(in_path).convert("RGBA")
    w, h = img.size
    # Flood from all 4 corners — handles disconnected BG regions
    target = (255, 255, 255, 0)
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        # Skip if the corner pixel is already non-whitish (e.g. character
        # touches the edge) — flood would damage the character.
        r, g, b, _ = img.getpixel(seed)
        if (255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2 > 60 * 60:
            continue
        ImageDraw.floodfill(img, seed, target, thresh=thresh)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--thresh", type=int, default=30)
    args = p.parse_args()

    if args.input.is_file():
        strip_bg(args.input, args.output, args.thresh)
        print(f"✓ {args.output}")
        return 0

    if args.input.is_dir():
        n = 0
        for png in sorted(args.input.glob("*.png")):
            out = args.output / png.name
            strip_bg(png, out, args.thresh)
            print(f"✓ {out}")
            n += 1
        print(f"\n{n} files processed")
        return 0

    print(f"✗ not a file or dir: {args.input}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
