#!/usr/bin/env bash
# Generate Encore MOBA art assets via OpenAI gpt-image-1.
#
# Reads key from ~/.config/encore/openai.key (chmod 600 it).
# Saves raw outputs into godot/assets/_downloads/ai-openai/ (gitignored).
# YOU run this — agents can't reliably auto-call paid APIs through the
# Claude Code classifier when the credential came from chat.
#
# Cost: ~$0.04 per low-quality 1024x1024 image. Full batch (15 assets,
# possibly with retries) targets ~$0.60-$2.

set -euo pipefail

KEY_FILE="${KEY_FILE:-$HOME/.config/encore/openai.key}"
[[ -f "$KEY_FILE" ]] || { echo "✗ key file missing: $KEY_FILE" >&2; exit 1; }
KEY="$(cat "$KEY_FILE")"

OUT="${OUT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/godot/assets/_downloads/ai-openai}"
mkdir -p "$OUT"

# Default: low quality (~$0.04/img). Set QUALITY=medium or QUALITY=high for
# more $$$.  Set MODEL to override (gpt-image-1 is current default).
QUALITY="${QUALITY:-low}"
MODEL="${MODEL:-gpt-image-1}"
SIZE="${SIZE:-1024x1024}"

# Optional first-arg name filter: only generate assets matching this regex
FILTER="${1:-.*}"

# ============================================================================
# Asset table: name | prompt
# Edit prompts here. To add a new asset: append a line.
# ============================================================================
assets() {
cat <<'TABLE'
grass_a|Orthographic top-down view of a hand-painted Dota 2 style grass terrain tile. Lush short grass with subtle variations and a few small wildflowers. Muted forest green palette. Soft directional lighting from upper left. SEAMLESS TILEABLE both horizontally and vertically — the left edge must match the right edge and the top must match the bottom, no visible border or frame. No characters, no text, no logos. Flat top-down floor texture for a fantasy MOBA map.
grass_b|Orthographic top-down view of a hand-painted Dota 2 style grass terrain tile. Slightly darker patch of forest grass with a few small twigs and pebbles scattered. Muted green palette. Soft top-left lighting. SEAMLESS TILEABLE. No characters, no text.
water|Orthographic top-down view of a hand-painted Dota 2 style river water tile. Calm flowing blue-teal water with subtle ripples and a few white whitecaps. NO rocks, NO vegetation around the edges, NO border — just pure water surface. SEAMLESS TILEABLE both horizontally and vertically. Soft top-left lighting reflecting off the water. No characters, no text.
bush|Orthographic top-down view of a hand-painted Dota 2 style fantasy bush, viewed from directly overhead. Dense leafy green shrub with darker base and brighter top highlights. Soft top-left lighting casts a slight darker side on the lower-right. Isolated on a flat white background, no shadow, fills 70 percent of the canvas. No characters, no text.
rock|Orthographic top-down view of a hand-painted Dota 2 style moss-covered boulder, viewed from directly overhead. Weathered gray rock with green moss on top, slight cracks. Soft top-left lighting. Isolated on flat white background, no cast shadow. Fills 60 percent of canvas. No characters, no text.
hero_player|TOP-DOWN ORTHOGRAPHIC view (camera directly above looking straight down) of a 2D Dota 2 style fantasy mage hero. The character is FLAT against the ground as seen from a bird's-eye perspective — NOT a portrait, NOT standing upright. Cyan and silver robes, holding a glowing cyan staff that points outward radially. Hand-painted painterly art style. Isolated on flat white background, no shadow underneath. Character fills 65 percent of canvas. CRITICAL: this is what you see when looking down at the character from straight above their head — you should only see the top of their head, shoulders, and outstretched arms.
hero_enemy_a|TOP-DOWN ORTHOGRAPHIC view (camera directly above looking straight down) of a 2D Dota 2 style fantasy warrior, FLAT against the ground as seen from directly overhead. Crimson armor, holding a steel sword pointed outward. Hand-painted painterly art style. Isolated on flat white background. Fills 65 percent of canvas. CRITICAL: bird's-eye top-down view, not a portrait.
hero_enemy_b|TOP-DOWN ORTHOGRAPHIC view (camera directly above looking straight down) of a 2D Dota 2 style fantasy assassin, FLAT against the ground as seen from directly overhead. Dark purple cloak with hood, holding twin daggers. Hand-painted painterly art style. Isolated on flat white background. Fills 60 percent of canvas. CRITICAL: bird's-eye top-down view.
hero_enemy_c|TOP-DOWN ORTHOGRAPHIC view (camera directly above looking straight down) of a 2D Dota 2 style fantasy bruiser, FLAT against the ground as seen from directly overhead. Heavy steel plate armor, holding a large war hammer. Hand-painted painterly art style. Isolated on flat white background. Fills 70 percent of canvas. CRITICAL: bird's-eye top-down view.
TABLE
}

# ============================================================================
# Generate loop
# ============================================================================
total=0
generated=0
skipped=0
errored=0

while IFS='|' read -r name prompt; do
    [[ -z "$name" || "$name" == \#* ]] && continue
    [[ "$name" =~ $FILTER ]] || continue
    total=$((total + 1))
    out_file="$OUT/${name}.png"

    if [[ -f "$out_file" ]] && [[ -z "${FORCE:-}" ]]; then
        echo "  = $name already exists, skipping (set FORCE=1 to regen)"
        skipped=$((skipped + 1))
        continue
    fi

    # Build request body via Python to handle JSON escaping safely
    body=$(python3 -c "
import json, sys
print(json.dumps({
    'model': '$MODEL',
    'prompt': sys.stdin.read().strip(),
    'n': 1,
    'size': '$SIZE',
    'quality': '$QUALITY',
}))
" <<< "$prompt")

    echo "  → $name (\$$([[ $QUALITY == low ]] && echo 0.04 || echo 0.17)...)"
    resp=$(curl -sS https://api.openai.com/v1/images/generations \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $KEY" \
        -d "$body")

    # gpt-image-1 returns base64 (no URL). dall-e returns URL. Handle both.
    err=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('message',''))")
    if [[ -n "$err" ]]; then
        echo "    ✗ $err"
        errored=$((errored + 1))
        continue
    fi

    b64=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',[{}])[0].get('b64_json',''))")
    if [[ -n "$b64" ]]; then
        echo "$b64" | base64 -D > "$out_file"
    else
        url=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',[{}])[0].get('url',''))")
        [[ -n "$url" ]] && curl -sL "$url" -o "$out_file"
    fi

    if [[ -f "$out_file" ]] && [[ $(stat -f%z "$out_file") -gt 1000 ]]; then
        size=$(stat -f%z "$out_file")
        echo "    ✓ ${size} bytes"
        generated=$((generated + 1))
    else
        echo "    ✗ write failed or too small"
        errored=$((errored + 1))
    fi
done < <(assets)

echo
echo "Done. total=$total generated=$generated skipped=$skipped errored=$errored"
echo "Output dir: $OUT"
echo
echo "Next: Claude will Read each PNG, pick the good ones, copy them into"
echo "  godot/assets/sprites/ai/ and godot/assets/tiles/ai/ (committed),"
echo "  then wire into arena.tscn inspector slots."
