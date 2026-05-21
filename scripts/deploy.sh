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
sync_file "$REPO_ROOT/prototype/encore_prototype.html" "$PREVIEW_DIR/encore_prototype.html"
sync_file "$REPO_ROOT/prototype/encore_prototype.html" "$DEPLOY_DIR/prototype/encore_prototype.html"

# Slides + streamer are also part of the deploy bundle; sync if they exist on
# both sides. (Preview mirror has them at the top level; deploy mirror nests
# slides under docs/.)
if [[ -f "$REPO_ROOT/docs/encore_slides.html" ]]; then
    [[ -d "$DEPLOY_DIR/docs" ]] && sync_file "$REPO_ROOT/docs/encore_slides.html" "$DEPLOY_DIR/docs/encore_slides.html"
    [[ -d "$PREVIEW_DIR" ]] && sync_file "$REPO_ROOT/docs/encore_slides.html" "$PREVIEW_DIR/encore_slides.html"
fi
if [[ -f "$REPO_ROOT/prototype/streamer.html" && -d "$DEPLOY_DIR/prototype" ]]; then
    sync_file "$REPO_ROOT/prototype/streamer.html" "$DEPLOY_DIR/prototype/streamer.html"
fi

if [[ $SKIP_VERCEL -eq 1 ]]; then
    echo "[2/2] --skip-vercel set — skipping deploy."
    exit 0
fi

echo "[2/2] deploying $DEPLOY_DIR to Vercel prod"
cd "$DEPLOY_DIR"
vercel --prod --yes
