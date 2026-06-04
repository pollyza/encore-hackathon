#!/usr/bin/env bash
# Sync the canonical Encore prototype to both mirror directories,
# then (optionally) deploy to Vercel prod.
#
# Mirrors:
#   /tmp/encore-preview/  — served by the local static server for MCP preview
#   /tmp/encore-deploy/   — the Vercel deploy bundle (same project as
#                            https://encore-deploy.vercel.app)
#
# Usage:
#   bash scripts/deploy.sh                # sync mirrors + deploy to prod
#   bash scripts/deploy.sh --skip-vercel  # sync mirrors only
#
# Run from anywhere — the script resolves its own location.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PREVIEW_DIR="/tmp/encore-preview"
DEPLOY_DIR="/tmp/encore-deploy"

SKIP_VERCEL=0
for arg in "$@"; do
    case "$arg" in
        --skip-vercel|--no-deploy) SKIP_VERCEL=1 ;;
        -h|--help)
            sed -n '2,15p' "$0"
            exit 0
            ;;
        *)
            echo "unknown arg: $arg" >&2
            exit 2
            ;;
    esac
done

# Pre-flight: mirrors must already exist (they're created during initial setup;
# this script does not create them to avoid masking a misconfigured machine).
for dir in "$PREVIEW_DIR" "$DEPLOY_DIR/prototype"; do
    if [[ ! -d "$dir" ]]; then
        echo "✗ mirror missing: $dir" >&2
        echo "  expected to be set up during initial preview/deploy bootstrap." >&2
        exit 1
    fi
done

sync_file() {
    local src="$1" dst="$2"
    if [[ ! -f "$src" ]]; then
        echo "✗ source missing: $src" >&2
        return 1
    fi
    if cmp -s "$src" "$dst" 2>/dev/null; then
        echo "  = $dst (unchanged)"
    else
        cp "$src" "$dst"
        echo "  → $dst"
    fi
}

echo "[1/2] syncing mirrors from $REPO_ROOT"

# Game prototype + extracted CSS — the core deliverable
sync_file "$REPO_ROOT/prototype/encore_prototype.html" "$PREVIEW_DIR/encore_prototype.html"
sync_file "$REPO_ROOT/prototype/encore_prototype.html" "$DEPLOY_DIR/prototype/encore_prototype.html"
if [[ -f "$REPO_ROOT/prototype/styles.css" ]]; then
    sync_file "$REPO_ROOT/prototype/styles.css" "$PREVIEW_DIR/styles.css"
    sync_file "$REPO_ROOT/prototype/styles.css" "$DEPLOY_DIR/prototype/styles.css"
fi

# Game modules — encore_prototype.html loads these via <script src="games/*.js">.
# BUG FIX (2026-05-29): these were never synced, so the deployed build shipped
# stale/missing game logic while the local source had the real games. Sync all
# game modules + the sprite atlas to both mirrors.
for sub in games assets; do
    if [[ -d "$REPO_ROOT/prototype/$sub" ]]; then
        mkdir -p "$PREVIEW_DIR/$sub" "$DEPLOY_DIR/prototype/$sub"
        for f in "$REPO_ROOT/prototype/$sub"/*; do
            [[ -f "$f" ]] || continue
            base="$(basename "$f")"
            # skip dev-only python/markdown in assets; ship js/png/json only
            case "$base" in
                *.py|*.md) continue ;;
            esac
            sync_file "$f" "$PREVIEW_DIR/$sub/$base"
            sync_file "$f" "$DEPLOY_DIR/prototype/$sub/$base"
        done
    fi
done

# Kenney CC0 art + audio live UNDER assets/ in nested dirs (assets/kenney/, assets/kenney/audio/).
# The flat games/assets loop above only copies top-level files, so sync the whole tree here.
if [[ -d "$REPO_ROOT/prototype/assets/kenney" ]]; then
    for target in "$PREVIEW_DIR/assets/kenney" "$DEPLOY_DIR/prototype/assets/kenney"; do
        mkdir -p "$target"
        cp -R "$REPO_ROOT/prototype/assets/kenney/." "$target/"
        echo "  → $target/ (Kenney art+audio tree)"
    done
fi

# Slides — used by the access-gated deck in the deploy bundle
if [[ -f "$REPO_ROOT/docs/encore_slides.html" ]]; then
    [[ -d "$DEPLOY_DIR/docs" ]] && sync_file "$REPO_ROOT/docs/encore_slides.html" "$DEPLOY_DIR/docs/encore_slides.html"
    [[ -d "$PREVIEW_DIR" ]] && sync_file "$REPO_ROOT/docs/encore_slides.html" "$PREVIEW_DIR/encore_slides.html"
fi

# Landing + QR — the Vercel root rewrite points at docs/landing.html. Keep the
# local mirrors current so QR/link QA uses the same entry page as production.
if [[ -f "$REPO_ROOT/docs/landing.html" ]]; then
    mkdir -p "$DEPLOY_DIR/docs" "$PREVIEW_DIR/docs"
    sync_file "$REPO_ROOT/docs/landing.html" "$DEPLOY_DIR/docs/landing.html"
    sync_file "$REPO_ROOT/docs/landing.html" "$PREVIEW_DIR/docs/landing.html"
fi
if [[ -f "$REPO_ROOT/docs/qr-encore.svg" ]]; then
    mkdir -p "$DEPLOY_DIR/docs" "$PREVIEW_DIR/docs"
    sync_file "$REPO_ROOT/docs/qr-encore.svg" "$DEPLOY_DIR/docs/qr-encore.svg"
    sync_file "$REPO_ROOT/docs/qr-encore.svg" "$PREVIEW_DIR/docs/qr-encore.svg"
fi

# LIVE streamer host — now under prototype/live/ (was prototype/) as of v0.6.1
# Sync to BOTH mirrors. The earlier version only synced to DEPLOY_DIR, which
# left /tmp/encore-preview/prototype/live/streamer.html stale and produced
# "I verified the old code" false-positives in local preview checks.
if [[ -f "$REPO_ROOT/prototype/live/streamer.html" ]]; then
    # Mirror streamer.html + all css/js to BOTH the local preview AND the
    # Vercel deploy bundle. Earlier passes had two gaps that broke prod:
    #   1) Only streamer.html went to DEPLOY_DIR; the css/js glob only ran
    #      against PREVIEW_DIR — so new files (clip-composer.js,
    #      player-recorder.js) 404'd on Vercel after deploy.
    #   2) The PREVIEW_DIR-side glob existed but DEPLOY_DIR-side did not,
    #      so the gap was invisible during local testing.
    # Now both sides run the same loop.
    for target_dir in "$DEPLOY_DIR/prototype" "$PREVIEW_DIR/prototype"; do
        [[ -d "$target_dir" ]] || continue
        mkdir -p "$target_dir/live"
        # Mirror every *.html under prototype/live/ (streamer.html + feed.html
        # + any future room shells). Earlier passes hardcoded streamer.html
        # only — adding a sibling like feed.html silently 404'd in preview.
        for html in "$REPO_ROOT/prototype/live/"*.html; do
            [[ -f "$html" ]] || continue
            sync_file "$html" "$target_dir/live/$(basename "$html")"
        done
        for src in "$REPO_ROOT/prototype/live/css/"*.css \
                   "$REPO_ROOT/prototype/live/js/"*.js \
                   "$REPO_ROOT/prototype/live/assets/icons/"*.png \
                   "$REPO_ROOT/prototype/live/assets/icons/"*.svg; do
            [[ -f "$src" ]] || continue
            rel="${src#$REPO_ROOT/prototype/live/}"
            dst="$target_dir/live/$rel"
            mkdir -p "$(dirname "$dst")"
            sync_file "$src" "$dst"
        done
    done
fi

# Note: prototype/v2g/observer.py is intentionally NOT synced to the deploy
# bundle. It's a local Python process that runs on the demo machine; the
# deployed Vercel build is client-side only.

if [[ $SKIP_VERCEL -eq 1 ]]; then
    echo "[2/2] --skip-vercel set — skipping deploy."
    exit 0
fi

echo "[2/2] deploying $DEPLOY_DIR to Vercel prod"
cd "$DEPLOY_DIR"
vercel --prod --yes
