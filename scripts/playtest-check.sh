#!/usr/bin/env bash
# playtest-check.sh — Tool-agnostic structured pre-flight check for game/UI changes.
#
# Mirrors the 5 checks of the playtest-check Claude Code skill, but as a plain
# shell script anyone (or any AI) can run. The script's job is to gather
# evidence and surface file:line references; final ✅/⚠️/❌ judgment is yours.
#
# Why this exists:
#   - Claude Code users get the same checks via /playtest-check (richer report).
#   - Codex / Cursor / Aider users (and humans without an AI) run THIS instead.
#   - CI can run it too (e.g., GitHub Actions on PR).
#
# Usage:
#   bash scripts/playtest-check.sh                 # checks prototype/encore_prototype.html
#   bash scripts/playtest-check.sh path/to.html    # checks a custom file
#
# Exit codes:
#   0  if all clearly-pass-or-warn (no automatic ❌ found)
#   1  if a clear ❌ pattern surfaces (e.g., tutorial promises a key with no handler)
#   2  if the target file isn't readable

set -u
TARGET="${1:-prototype/encore_prototype.html}"
EXIT_CODE=0

if [[ ! -r "$TARGET" ]]; then
    echo "✗ target unreadable: $TARGET" >&2
    exit 2
fi

# Colors only when stdout is a TTY (so CI / piped output stays plain)
if [[ -t 1 ]]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
    RED=$'\033[31m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
    BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; CYAN=""; RESET=""
fi

section() { echo; echo "${BOLD}${CYAN}━━━ $* ━━━${RESET}"; }
note()    { echo "${DIM}  $*${RESET}"; }
pass()    { echo "  ${GREEN}✓${RESET} $*"; }
warn()    { echo "  ${YELLOW}⚠${RESET} $*"; EXIT_CODE=$(( EXIT_CODE > 0 ? EXIT_CODE : 0 )); }
fail()    { echo "  ${RED}✗${RESET} $*"; EXIT_CODE=1; }

echo "${BOLD}Playtest check${RESET} — target: ${CYAN}$TARGET${RESET}"
echo "$(date '+%Y-%m-%d %H:%M:%S')"

# ──────────────────────────────────────────────────────────────────────────────
section "CHECK 1 · Input device coverage"
# Each promised input class (touch/mouse/keyboard) should be wired.
# Reports the count of each kind of listener; flags if touch >> mouse (or vice
# versa), which is the canonical FPS-auto-fire-bug pattern.
TOUCH=$(grep -cE 'touchstart|touchmove|pointerdown' "$TARGET" || true)
MOUSE=$(grep -cE 'mousedown|mousemove|mouseup|\bclick\b' "$TARGET" || true)
KEY=$(grep -cE 'keydown|keyup|keypress' "$TARGET" || true)
note "touch listeners:    $TOUCH"
note "mouse listeners:    $MOUSE"
note "keyboard listeners: $KEY"
if (( TOUCH == 0 && MOUSE > 0 )); then
    warn "no touch listeners — mobile users will be locked out of input"
elif (( MOUSE == 0 && TOUCH > 0 )); then
    warn "no mouse listeners — desktop users will be locked out of input"
else
    pass "both touch and mouse input paths present"
fi

# Specific anti-pattern: auto-fire/cast gated on touch-only aimAngle()
TOUCH_GATED_FIRE=$(grep -nE 'aimAngle\(\)\s*[!=]=\s*null' "$TARGET" | wc -l | tr -d ' ')
if (( TOUCH_GATED_FIRE > 0 )); then
    warn "$TOUCH_GATED_FIRE place(s) gate behavior on aimAngle() (touch-only). Verify desktop has an alternate path:"
    grep -nE 'aimAngle\(\)\s*[!=]=\s*null' "$TARGET" | sed 's/^/      /' | head -5
fi

# ──────────────────────────────────────────────────────────────────────────────
section "CHECK 2 · No-input default (passive viewer playability)"
# Look for auto-aim / auto-target / nearest-enemy fallbacks. Their absence
# in a per-game update() is the bug that bites silent demo viewers.
AUTO_AIM=$(grep -cE 'auto[-_]?(aim|target|fire)|nearest.*enem|nearestEnemy' "$TARGET" || true)
note "auto-aim / auto-target / nearest-enemy mentions: $AUTO_AIM"
if (( AUTO_AIM >= 3 )); then
    pass "multiple friendliness defaults present (good — passive viewers should be playable)"
elif (( AUTO_AIM >= 1 )); then
    warn "only $AUTO_AIM friendliness default(s) found. Check each game template has its own."
else
    fail "no auto-aim / auto-target patterns found. Passive viewer will not produce gameplay."
fi

# ──────────────────────────────────────────────────────────────────────────────
section "CHECK 3 · Win-reachable inside time budget"
# Extracts the per-game duration + key HP/damage numbers. Math is on you,
# but having the numbers in one place makes it fast to eyeball.
DURATIONS=$(grep -nE '^\s*duration:\s*[0-9]+' "$TARGET" | sed 's/^/      /')
HP_DECLS=$(grep -nE 'hp:\s*[0-9]+,\s*maxHp:\s*[0-9]+' "$TARGET" | sed 's/^/      /')
DRAGON=$(grep -nE 'dragon:.*hp:' "$TARGET" | sed 's/^/      /')
note "durations declared:"
echo "$DURATIONS"
note "HP declarations:"
echo "$HP_DECLS"
if [[ -n "$DRAGON" ]]; then
    note "boss (dragon) HP:"
    echo "$DRAGON"
fi
# Heuristic: if any dragon HP > 80 with duration 30, that's a frustration cliff
DRAGON_HP=$(grep -oE 'dragon:.*hp:\s*[0-9]+' "$TARGET" | grep -oE '[0-9]+$' || true)
if [[ -n "$DRAGON_HP" ]] && (( DRAGON_HP > 80 )); then
    warn "dragon HP $DRAGON_HP looks high — verify it's killable in the round timer"
fi
echo "      ${DIM}→ compute time-to-win = win_threshold / dps_under_realistic_play${RESET}"
echo "      ${DIM}→ flag if headroom = duration / time_to_win < 1.5${RESET}"

# ──────────────────────────────────────────────────────────────────────────────
section "CHECK 4 · Tutorial promises ↔ code reality"
# Extract HOW_TO_PLAY key labels and confirm each one has a binding.
ROWS=$(grep -E "^\s*\[\s*['\"][A-Z 鍵键]+['\"]\s*," "$TARGET" | head -20)
if [[ -z "$ROWS" ]]; then
    note "no HOW_TO_PLAY-style rows detected — skipping (no tutorial?)"
else
    note "tutorial row keys mentioned (first 20):"
    echo "$ROWS" | sed -E "s/^\s*\[\s*['\"]([^'\"]+)['\"].*$/      \1/"

    # For each unique alphabetic key, confirm a handler exists.
    KEYS=$(echo "$ROWS" | grep -oE "'[A-Z 鍵键]+'" | sort -u)
    MISSING=0
    for k in Q W E R; do
        lower=$(echo "$k" | tr '[:upper:]' '[:lower:]')
        # only check if tutorial actually mentions the key
        if echo "$ROWS" | grep -qE "['\"]\s*${k}\b|${k}\s*键|${k}\s*技能"; then
            # match the binding in several common shapes:
            #   keys['q'] / keys.q / case 'q':
            #   skillHeld.q / skillHeld['q']
            #   castRelease('q') / castPress('q')
            #   ['q','w','e','r'].includes(...)
            #   if (k === 'q')
            if grep -qE "(keys\.|keys\[|skillHeld\.|skillHeld\[)['\"]?${lower}['\"]?\]?|case\s+['\"]${lower}['\"]|cast(?:Press|Release|Hold)\(['\"]${lower}['\"]\)|['\"]${lower}['\"]\s*[,\]]|k\s*===?\s*['\"]${lower}['\"]" "$TARGET"; then
                pass "$k tutorial row has a key handler"
            else
                fail "$k mentioned in tutorial but no handler found"
                MISSING=$(( MISSING + 1 ))
            fi
        fi
    done

    # Mouse-related promises
    if echo "$ROWS" | grep -qiE "mouse|鼠标"; then
        if grep -qE 'mousemove' "$TARGET"; then
            pass "MOUSE tutorial row has a mousemove handler"
        else
            fail "MOUSE mentioned in tutorial but no mousemove handler — desktop won't respond"
        fi
    fi
fi

# ──────────────────────────────────────────────────────────────────────────────
section "CHECK 5 · Multi-template parity"
# If multiple Games.x exist, surface where each template's update() lives so
# you can compare auto-aim presence across them.
GAMES=$(grep -nE '^\s*Games\.[a-z]+\s*=\s*\{' "$TARGET" | sed 's/^/      /')
if [[ -z "$GAMES" ]]; then
    note "no Games.* declarations — single-template project, skipping parity check"
else
    note "templates detected:"
    echo "$GAMES"
    # Quick presence check: each template's neighborhood should have auto-aim
    for game in $(grep -oE 'Games\.[a-z]+' "$TARGET" | sort -u); do
        # Find the line number where this game starts
        START=$(grep -nE "^\s*${game}\s*=\s*\{" "$TARGET" | head -1 | cut -d: -f1)
        if [[ -n "$START" ]]; then
            # Look in the next 600 lines for auto-aim / nearest-enemy patterns
            SLICE=$(sed -n "${START},$((START + 600))p" "$TARGET")
            # Case-insensitive: catches NearestEnemy, mobaAimDir, autoFire, etc.
            if echo "$SLICE" | grep -qiE 'auto[-_]?(aim|target|fire)|nearest.*enem|aimdir|mobaaim'; then
                pass "$game has friendliness default in its update region"
            else
                warn "$game may be missing friendliness default — check manually around line $START"
            fi
        fi
    done
fi

# ──────────────────────────────────────────────────────────────────────────────
echo
if (( EXIT_CODE == 0 )); then
    echo "${BOLD}${GREEN}Playtest check passed.${RESET} No automatic ❌ found. You still need to apply judgment to checks 3-5 (the math, the parity vibe). The evidence is above."
elif (( EXIT_CODE == 1 )); then
    echo "${BOLD}${RED}Playtest check found at least one ❌.${RESET} Fix the items above before declaring done. See ~/.claude/skills/playtest-check/references/checks.md for what good looks like."
fi
echo
echo "${DIM}This script gathers evidence. For the structured ✅/⚠️/❌ verdict report,${RESET}"
echo "${DIM}invoke /playtest-check in Claude Code, or paste this output into your AI tool.${RESET}"

exit $EXIT_CODE
