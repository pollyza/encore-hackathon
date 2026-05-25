#!/usr/bin/env bash
# godot-screenshot.sh — render a Godot scene to a PNG, headless.
#
# Closes the "I shipped a Godot PR without ever looking at the actual
# rendered frame" loop. Run this before claiming a Godot change is done.
#
# Usage:
#   bash scripts/godot-screenshot.sh                                       # main.tscn, /tmp/godot.png
#   bash scripts/godot-screenshot.sh scenes/main.tscn /tmp/my.png 2.0     # custom scene, path, wait
#   bash scripts/godot-screenshot.sh -                                     # print path to last screenshot
#
# Args (all optional):
#   $1  scene path RELATIVE to godot/ (default: scenes/main.tscn)
#   $2  output PNG path (default: /tmp/encore_godot_frame.png)
#   $3  wait seconds before snap (default: 1.5)
#
# Requirements:
#   - Godot 4.3+ binary discoverable (set GODOT env var to override).
#   - On macOS, defaults to ~/Downloads/Godot.app/Contents/MacOS/Godot
#     or /Applications/Godot.app/Contents/MacOS/Godot — whichever exists.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GODOT_DIR="$REPO_ROOT/godot"
HELPER_SCRIPT="res://scripts/_screenshot_helper.gd"

SCENE="${1:-scenes/main.tscn}"
OUT="${2:-/tmp/encore_godot_frame.png}"
WAIT="${3:-1.5}"

# Locate Godot binary
if [[ -n "${GODOT:-}" ]]; then
    GODOT_BIN="$GODOT"
elif [[ -x "$HOME/Downloads/Godot.app/Contents/MacOS/Godot" ]]; then
    GODOT_BIN="$HOME/Downloads/Godot.app/Contents/MacOS/Godot"
elif [[ -x "/Applications/Godot.app/Contents/MacOS/Godot" ]]; then
    GODOT_BIN="/Applications/Godot.app/Contents/MacOS/Godot"
elif command -v godot >/dev/null 2>&1; then
    GODOT_BIN="$(command -v godot)"
else
    echo "✗ Godot binary not found. Install via:" >&2
    echo "    brew install --cask godot" >&2
    echo "  Or set GODOT=/path/to/godot env var." >&2
    exit 2
fi

# Build a one-shot wrapper scene that just runs the helper script
WRAPPER="$GODOT_DIR/scenes/_screenshot_wrapper.tscn"
cat > "$WRAPPER" <<EOF
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="$HELPER_SCRIPT" id="1"]

[node name="Root" type="Node"]
script = ExtResource("1")
EOF

# Clean up wrapper on exit (even on error)
trap 'rm -f "$WRAPPER"' EXIT

# Translate scene path to res:// form if relative
case "$SCENE" in
    res://*) SCENE_URI="$SCENE" ;;
    /*)      SCENE_URI="$SCENE" ;;  # absolute, shouldn't happen for Godot res
    *)       SCENE_URI="res://$SCENE" ;;
esac

# Kill any running Godot instance to avoid port conflicts / TTY issues
pkill -f Godot >/dev/null 2>&1 || true
sleep 0.5

echo "→ rendering $SCENE_URI"
"$GODOT_BIN" --path "$GODOT_DIR" scenes/_screenshot_wrapper.tscn ++ --scene "$SCENE_URI" --out "$OUT" --wait "$WAIT" 2>&1 | grep -E '^\[screenshot\]|ERROR|SCRIPT ERROR' || true

if [[ -f "$OUT" ]]; then
    echo "✓ $OUT ($(file "$OUT" | awk -F'PNG image data, ' '{print $2}' | awk '{print $1, $2, $3}'))"
else
    echo "✗ screenshot file not written" >&2
    exit 1
fi
