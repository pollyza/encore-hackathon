#!/usr/bin/env python3
"""
Batch-generate 42 Encore hackathon sprite raw PNGs via Google AI Studio (Nano Banana).

Setup (one-time):
    pip3 install --user --break-system-packages google-genai
    # get free API key: https://aistudio.google.com/apikey
    export GEMINI_API_KEY=your_key_here

Run:
    cd ~/Documents/encore-hackathon/prototype/assets
    python3 generate_sprites.py

Output: 42 PNGs (1024×1024 transparent bg) saved to raw/, raw/roblox/, raw/gta/.
Existing files are skipped — rerun to retry failures only.
Then: python3 process.py  to downsample into sprites/<slot>.png
"""

import os
import sys
import time
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:
    sys.exit(
        "Missing dependency. Install with:\n"
        "    pip3 install --user --break-system-packages google-genai"
    )

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    sys.exit(
        "Set GEMINI_API_KEY env var.\n"
        "Get a free key: https://aistudio.google.com/apikey\n"
        "Then: export GEMINI_API_KEY=your_key_here"
    )

MODEL = "gemini-2.5-flash-image"
HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"

STYLE = (
    "Isometric voxel pixel art, 2:1 dimetric view from 30 degrees above. "
    "Chunky voxel block construction in Minecraft × Roblox style. "
    "3-tone hard-edge shading per surface: bright top, mid front, dark side. "
    "Hard pixel edges, NO anti-aliasing, NO blur, NO smooth gradient, "
    "NO baked shadow, NO ambient occlusion. "
    "Single subject centered with generous padding, 1024×1024 PNG, "
    "fully transparent background (alpha=0). "
    "Negative: no text, no letters, no numbers, no logos, no watermarks, "
    "no signatures, no real-world brand or game IP (no Minecraft logo, no Roblox logo, "
    "no Pokemon characters), no realistic photographic rendering, no 3D Pixar render, "
    "no anime, no Cartoon Network style, no motion blur, no depth-of-field, "
    "no atmospheric fog, no multiple subjects, no scene background."
)

TOPDOWN = (
    "Pure top-down view (looking straight down from above, NOT isometric). "
    + STYLE
)

PROMPTS = [
    ("roblox/hero_jump_0.png", STYLE, "Chunky voxel boy character in startup crouch, knees bent deeply preparing to jump, arms drawn back behind body. Bright orange t-shirt, blue shorts, light skin tone, brown hair in blocky chunks. Standing on imaginary ground line, no actual shadow."),
    ("roblox/hero_jump_1.png", STYLE, "Chunky voxel boy character pushing off ground, legs straightening explosively, arms swinging forward and up. Bright orange t-shirt, blue shorts, brown blocky hair."),
    ("roblox/hero_jump_2.png", STYLE, "Chunky voxel boy character in early ascent, feet off ground, body leaning slightly forward, arms raised mid-air. Orange t-shirt, blue shorts, brown hair."),
    ("roblox/hero_jump_3.png", STYLE, "Chunky voxel boy character at jump apex, body fully airborne, both legs tucked slightly, arms spread wide for balance. Orange shirt, blue shorts, brown blocky hair."),
    ("roblox/hero_jump_4.png", STYLE, "Chunky voxel boy character beginning descent, body tilted slightly forward, legs extending downward, arms still up for balance. Orange t-shirt, blue shorts, brown hair."),
    ("roblox/hero_jump_5.png", STYLE, "Chunky voxel boy character preparing to land, legs reaching down toward ground, knees slightly bent in anticipation, arms coming down. Orange shirt, blue shorts, brown blocky hair."),
    ("roblox/hero_jump_6.png", STYLE, "Chunky voxel boy character touching down at landing impact, knees absorbing impact deeply, arms dropped to sides, body compressed. Orange t-shirt, blue shorts, brown hair."),
    ("roblox/hero_jump_7.png", STYLE, "Chunky voxel boy character recovering to standing pose, knees straightening back up, arms returning to neutral by sides, balanced upright stance. Orange shirt, blue shorts, brown blocky hair."),
    ("roblox/platform_basic.png", STYLE, "Floating platform tile, square block roughly 1 unit thick, bright grass green top surface (#7ac142), darker green sides, brown earth bottom edge. Single platform floating in empty space."),
    ("roblox/platform_bounce.png", STYLE, "Floating bounce pad platform, yellow square top surface (#f5d24c) with a chunky coiled spring rising from the center, spring shown as 3 stacked yellow voxel coils. Dark yellow side faces, brown bottom."),
    ("roblox/platform_moving.png", STYLE, "Floating moving platform, steel blue top surface (#5a9bd4) with two visible recessed rail grooves running across it, darker blue sides showing rivet bumps, gunmetal grey bottom."),
    ("roblox/platform_disappearing.png", STYLE, "Floating warning platform with diagonal red and white hazard stripes on top surface (stripes rendered as alternating hard pixel bands not gradients), dark red side faces, brown bottom edge."),
    ("roblox/platform_goal.png", STYLE, "Floating goal platform, golden yellow top surface (#ffd700) with a tall flagpole rising from the center holding a small red triangular flag. Bright gold top, darker gold sides, slight glow around platform edge."),
    ("gta/car_player.png", TOPDOWN, "Voxel pixel art muscle car, hood pointing straight up toward top of frame. Deep midnight blue body (#2a4a78), black windshield in front, black rear window behind, silver chrome bumpers front and back, two visible exhaust pipes at rear."),
    ("gta/cop_car.png", TOPDOWN, "Voxel pixel art police car, hood pointing straight up. Black and white panel paint scheme split lengthwise, prominent roof-mounted lightbar with red square on left half and blue square on right half. Black windshield and rear window, silver chrome bumpers."),
    ("gta/shop_convenience.png", TOPDOWN, "Voxel pixel art convenience store building, square footprint, bright red roof, white walls visible at edges of roof, large red blank signage panel mounted on roof front edge. Glass entrance doors shown as light cyan rectangles on one side. Small AC unit voxels on roof corner."),
    ("gta/shop_gasstation.png", TOPDOWN, "Voxel pixel art gas station, central yellow canopy roof covering two fuel pump islands. Each pump island shown as small grey rectangle with red pump voxel on top. Small white shop building attached to one side."),
    ("gta/shop_bank.png", TOPDOWN, "Voxel pixel art bank building, square footprint, light grey stone facade with a row of darker grey colonnade pillars along the front edge, dark slate roof. Heavy double-door entrance shown as dark rectangle centered on front edge."),
    ("gta/shop_jewelry.png", TOPDOWN, "Voxel pixel art jewelry store, small square footprint, gold awning canopy extending from front edge, large glass display window shown as light cyan rectangle along the front, dark purple walls. Tiny gem voxels visible inside the display window."),
    ("gta/shop_weapon.png", TOPDOWN, "Voxel pixel art weapon store building, square footprint, dark grey concrete walls, black corrugated metal roller shutter shown as horizontal banded rectangle covering most of the front face. Small dark windows with metal bars at the sides."),
    ("hero.moba.png", STYLE, "Voxel mage hero character, slim humanoid in flowing teal robe (#5af5e0), pointed hood pulled back, holding a long wooden staff with a glowing yellow orb (#fff080) at the top. Bright teal top face, mid teal front, dark teal side. Standing pose."),
    ("hero.fps.png", STYLE, "Voxel soldier hero character, blocky humanoid in teal tactical armor (#5af5e0), simple helmet, holding a small dark grey assault rifle diagonally across the chest. Bright teal armor highlights, mid teal base, dark teal shadow side. Standing pose."),
    ("hero.br.png", STYLE, "Voxel battle royale survivor hero, blocky humanoid in teal t-shirt (#5af5e0), dark grey cargo pants, small brown backpack on shoulders, holding a compact black pistol at hip level. Standing pose."),
    ("enemy.moba.mage.png", STYLE, "Voxel dark mage enemy character, slim humanoid in deep purple robe (#c070ff), pointed dark hood up and casting shadow over face, holding a glowing magenta orb (#ff60c0) in one hand. Standing pose."),
    ("enemy.moba.gunner.png", STYLE, "Voxel archer-gunner enemy character, blocky humanoid in burnt orange tunic (#ff9050), brown leather belt, holding a small dark wood crossbow at hip level. Standing pose."),
    ("enemy.moba.tank.png", STYLE, "Voxel armored knight tank enemy, bulky humanoid in heavy blue steel plate armor (#70a0ff), dark helmet with narrow visor slit, broad shoulder pauldrons, no visible weapon. Chunky armored proportions. Standing pose."),
    ("enemy.fps.png", STYLE, "Voxel soldier enemy character, blocky humanoid in burnt orange tactical vest (#ff8050), neutral grey helmet, holding a dark assault rifle diagonally. Standing pose."),
    ("bot.br.0.png", STYLE, "Voxel battle royale bot character, blocky humanoid in burnt orange t-shirt (#ff8050), dark grey cargo pants, holding a compact black pistol at hip. Standing pose."),
    ("bot.br.1.png", STYLE, "Voxel battle royale bot character, blocky humanoid in purple t-shirt (#a070ff), dark grey cargo pants, holding a compact black pistol at hip. Standing pose."),
    ("bot.br.2.png", STYLE, "Voxel battle royale bot character, blocky humanoid in olive green t-shirt (#80b050), dark grey cargo pants, holding a compact black pistol at hip. Standing pose."),
    ("minion.ally.png", STYLE, "Tiny voxel ally minion soldier, half-height chibi proportions, blocky body in cyan tunic (#5af5e0), oversized blocky head, holding a stubby short weapon. Chunky compact build. Standing pose."),
    ("minion.enemy.png", STYLE, "Tiny voxel enemy minion soldier, half-height chibi proportions, blocky body in orange tunic (#ff8050), small grey helmet, holding a stubby short weapon. Compact build. Standing pose."),
    ("dragon.png", STYLE, "Friendly squat voxel dragon creature, NOT scary, rounded chunky body in brown-orange (#aa5020), four short stubby legs, small wings tucked against back, short tail, blocky head with friendly yellow eyes (#ffe040), row of small jagged orange spines down the back. Standing pose."),
    ("tower.png", STYLE, "Stone voxel tower structure, three stacked grey-blue cuboid blocks (#a0a0b8) tapering slightly toward the top, dark mortar lines between blocks, small red triangular pennant flag mounted on a pole at the very top."),
    ("crate.common.png", STYLE, "Voxel treasure chest, wooden box with white trim banding around the lid edge and corners, simple metal latch on the front. Light beige wood top, mid beige sides, dark brown shadow side. Closed chest."),
    ("crate.rare.png", STYLE, "Voxel treasure chest, wooden box with cyan trim banding around lid edge and corners (#5af5e0), metal latch on front. Light beige wood top, mid beige sides, cyan accent trim. Closed chest."),
    ("crate.epic.png", STYLE, "Voxel treasure chest, wooden box with purple trim banding around lid edge and corners (#a070ff), metal latch on front. Light beige wood top, mid beige sides, vivid purple accent trim. Closed chest."),
    ("crate.legendary.png", STYLE, "Voxel legendary treasure chest, wooden box with bright gold trim banding around lid edge and corners (#ffd700), gold metal latch on front, subtle gold glimmer highlights on trim corners. Light beige wood top, mid beige sides. Closed chest."),
    ("grenade.png", STYLE, "Tiny voxel grenade, round chunky orange-red sphere (#e04030) made of voxel blocks, small metal pin loop on top with a flat ring, vertical line groove around the body."),
    ("vfx.muzzle.png", STYLE, "Voxel muzzle flash effect, bright yellow-white starburst (#fff8a0) with 4 to 6 jagged radial pixel spikes radiating from a hot white center. Only the starburst shape visible, everywhere else fully transparent."),
    ("vfx.skillshot.png", STYLE, "Voxel magic projectile bolt, vaguely arrow-shaped, cyan body (#5af5e0) with a yellow inner core (#fff080), one or two small sparkle pixels trailing behind. Single projectile shape centered."),
    ("vfx.pickup.png", STYLE, "Voxel pickup sparkle effect, soft green plus-sign motif (#80f060) centered, with 4 small radiating green sparkle pixels around it. Only the plus-and-sparkles shape visible, everywhere else fully transparent."),
]

assert len(PROMPTS) == 42, f"Expected 42 prompts, got {len(PROMPTS)}"

RAW.mkdir(exist_ok=True)
(RAW / "roblox").mkdir(exist_ok=True)
(RAW / "gta").mkdir(exist_ok=True)

client = genai.Client(api_key=API_KEY)


def generate_one(idx, total, filename, style, subject, max_retry=3):
    out_path = RAW / filename
    if out_path.exists():
        print(f"[{idx:2}/{total}] skip exists  {filename}")
        return True

    prompt = f"{style.strip()}\n\nSubject: {subject.strip()}"

    for attempt in range(1, max_retry + 1):
        try:
            r = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )
            for part in r.candidates[0].content.parts:
                if part.inline_data and part.inline_data.data:
                    out_path.write_bytes(part.inline_data.data)
                    kb = len(part.inline_data.data) // 1024
                    print(f"[{idx:2}/{total}] ok           {filename}  ({kb} KB)")
                    return True
            print(f"[{idx:2}/{total}] empty resp   {filename}  attempt {attempt}/{max_retry}")
        except Exception as e:
            msg = str(e)[:140]
            print(f"[{idx:2}/{total}] error        {filename}  attempt {attempt}/{max_retry}: {msg}")
            time.sleep(3 + attempt * 2)
    return False


failed = []
total = len(PROMPTS)
start = time.time()

print(f"Generating {total} sprites via {MODEL}")
print(f"Output dir: {RAW}")
print("-" * 60)

for idx, (filename, style, subject) in enumerate(PROMPTS, 1):
    if not generate_one(idx, total, filename, style, subject):
        failed.append(filename)

elapsed = int(time.time() - start)
print("-" * 60)
print(f"Done in {elapsed}s. {total - len(failed)}/{total} ok, {len(failed)} failed.")
if failed:
    print("\nFailed slots (rerun script to retry — existing files skipped):")
    for f in failed:
        print(f"  - {f}")
    sys.exit(1)
print("\nNext: python3 process.py   (downsample raw/ into sprites/)")
