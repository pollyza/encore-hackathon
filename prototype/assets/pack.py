#!/usr/bin/env python3
"""
Encore sprite atlas packer.

Modes:
  --placeholder  Procedural pixel-art sprites via Pillow (no AI required).
  (default)      Pack ./sprites/*.png (real AI sprites) into atlas.png+atlas.json.

Output: atlas.png + atlas.json next to this script.
The runtime loads `assets/atlas.png` + `assets/atlas.json` at boot.
Procedural draw is the fallback if the atlas is missing.
"""
import os, sys, json
from PIL import Image, ImageDraw

# (slot, w, h, ax, ay) — ay = foot pixel row, set so atlas foot lines up
# with the procedural fallback's foot (~sy+8 on canvas).
SLOTS = [
    ('hero.moba',         32, 40, 16, 31),
    ('hero.fps',          32, 40, 16, 31),
    ('hero.br',           32, 40, 16, 31),
    ('enemy.moba.mage',   32, 40, 16, 31),
    ('enemy.moba.gunner', 32, 40, 16, 31),
    ('enemy.moba.tank',   32, 40, 16, 31),
    ('enemy.fps',         32, 40, 16, 31),
    ('bot.br.0',          32, 40, 16, 31),
    ('bot.br.1',          32, 40, 16, 31),
    ('bot.br.2',          32, 40, 16, 31),
    ('minion.ally',       20, 24, 10, 21),
    ('minion.enemy',      20, 24, 10, 21),
    ('dragon',            80, 64, 40, 55),
    ('tower',             32, 64, 16, 63),
    ('crate.common',      24, 24, 12, 23),
    ('crate.rare',        24, 24, 12, 23),
    ('crate.epic',        24, 24, 12, 23),
    ('crate.legendary',   24, 24, 12, 23),
    ('grenade',           12, 12,  6,  6),
    ('vfx.muzzle',        24, 24, 12, 12),
    ('vfx.skillshot',     24, 24, 12, 12),
    ('vfx.pickup',        24, 24, 12, 12),
]

# ---- Color helpers ----
SKIN     = (255, 208, 160, 255)
SKIN_D   = (220, 168, 128, 255)
SHADE    = (20, 22, 30, 255)
OUTLINE  = (16, 18, 26, 255)
WHITE    = (255, 255, 255, 255)

def shade(c, amt):
    return tuple(max(0, int(v * (1 - amt))) for v in c[:3]) + (c[3] if len(c) > 3 else 255,)
def tint(c, amt):
    return tuple(min(255, int(v + (255 - v) * amt)) for v in c[:3]) + (c[3] if len(c) > 3 else 255,)

def fill_rect(d, x, y, w, h, c):
    if w <= 0 or h <= 0: return
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)
def pixel(d, x, y, c):
    d.point((x, y), fill=c)
def vline(d, x, y0, y1, c):
    if y1 < y0: return
    d.rectangle([x, y0, x, y1], fill=c)
def hline(d, x0, x1, y, c):
    if x1 < x0: return
    d.rectangle([x0, y, x1, y], fill=c)


# ============================================================
#  Shared humanoid helpers (32×40 bounds, foot at row 39)
# ============================================================

def _head(d, ox, oy, skin=SKIN, brow=False):
    """10×10 head at rows 5-14, with shaded chin + lit forehead + eyes."""
    fill_rect(d, ox + 13, oy + 14, 6, 1, SKIN_D)            # neck
    fill_rect(d, ox + 11, oy + 5, 10, 10, skin)
    fill_rect(d, ox + 11, oy + 13, 10, 1, shade(skin, 0.18)) # chin shadow
    fill_rect(d, ox + 11, oy + 5,  10, 1, tint(skin, 0.18))  # forehead hl
    if brow:
        hline(d, ox + 12, ox + 14, oy + 9, SHADE)
        hline(d, ox + 17, ox + 19, oy + 9, SHADE)
    pixel(d, ox + 13, oy + 10, SHADE)
    pixel(d, ox + 18, oy + 10, SHADE)
    # mouth dot
    pixel(d, ox + 16, oy + 12, shade(skin, 0.35))

def _legs(d, ox, oy, mid, dark, knee=None):
    """Two legs occupying rows 30-39, foot at row 39."""
    fill_rect(d, ox + 11, oy + 30, 4, 9, mid)
    fill_rect(d, ox + 17, oy + 30, 4, 9, mid)
    if knee:
        hline(d, ox + 11, ox + 14, oy + 33, knee)
        hline(d, ox + 17, ox + 20, oy + 33, knee)
    # boots
    fill_rect(d, ox + 10, oy + 37, 5, 2, dark)
    fill_rect(d, ox + 17, oy + 37, 5, 2, dark)
    # toe tips
    pixel(d, ox + 9, oy + 38, dark)
    pixel(d, ox + 22, oy + 38, dark)

def _torso(d, ox, oy, body, body_d, body_hl, arm_w=2, sleeve=None):
    fill_rect(d, ox + 9, oy + 15, 14, 14, body)
    fill_rect(d, ox + 9, oy + 15, 14, 2, body_hl)
    fill_rect(d, ox + 9, oy + 27, 14, 2, body_d)
    sleeve_c = sleeve if sleeve else body_d
    # arms (slim)
    fill_rect(d, ox + 9 - arm_w, oy + 16, arm_w, 11, sleeve_c)
    fill_rect(d, ox + 23, oy + 16, arm_w, 11, sleeve_c)
    # hands
    pixel(d, ox + 8 - (arm_w - 1), oy + 27, SKIN_D)
    pixel(d, ox + 23 + (arm_w - 1), oy + 27, SKIN_D)


# ============================================================
#  Heroes
# ============================================================

def draw_hero_moba(d, ox, oy):
    """Cyan mage — pointed hat, hair under, robe + cape, staff with glowing gem."""
    cyan = (90, 245, 224, 255)
    cyan_d = shade(cyan, 0.32)
    cyan_hl = tint(cyan, 0.18)
    hair = (90, 60, 30, 255)
    wood = (130, 80, 40, 255)
    wood_d = shade(wood, 0.3)
    gem = (255, 205, 117, 255)
    gem_hot = (255, 255, 200, 255)
    trim = (90, 80, 50, 255)
    # pointed hat triangle (rows 0-6)
    for i, w in enumerate([2, 4, 6, 8, 10, 12]):
        cx = ox + 16 - w // 2
        fill_rect(d, cx, oy + i, w, 1, cyan_d)
    # hat band
    fill_rect(d, ox + 10, oy + 5, 12, 2, trim)
    pixel(d, ox + 16, oy + 1, gem)  # tiny tip-gem
    # hair tufts under hat
    fill_rect(d, ox + 10, oy + 7, 2, 3, hair)
    fill_rect(d, ox + 20, oy + 7, 2, 3, hair)
    _head(d, ox, oy)
    # robe body
    _torso(d, ox, oy, cyan, cyan_d, cyan_hl)
    # robe collar V
    pixel(d, ox + 15, oy + 16, cyan_d)
    pixel(d, ox + 16, oy + 17, cyan_d)
    pixel(d, ox + 17, oy + 18, cyan_d)
    pixel(d, ox + 16, oy + 18, cyan_d)
    # belt with buckle
    fill_rect(d, ox + 9, oy + 24, 14, 2, trim)
    fill_rect(d, ox + 15, oy + 24, 2, 2, gem)
    # robe hem flares wider at bottom
    fill_rect(d, ox + 8, oy + 28, 16, 3, cyan_d)
    fill_rect(d, ox + 7, oy + 30, 18, 1, cyan_d)
    fill_rect(d, ox + 7, oy + 30, 18, 1, shade(cyan_d, 0.3))
    _legs(d, ox, oy, cyan_d, shade(cyan_d, 0.4))
    # staff held to right side: shaft + halo + gem
    fill_rect(d, ox + 25, oy + 4, 2, 32, wood)
    fill_rect(d, ox + 25, oy + 4, 1, 32, wood_d)
    fill_rect(d, ox + 23, oy + 2, 6, 5, gem)
    fill_rect(d, ox + 23, oy + 2, 6, 1, gem_hot)
    pixel(d, ox + 25, oy + 4, WHITE)
    # gem halo (4 corner sparkles)
    pixel(d, ox + 22, oy + 1, gem_hot)
    pixel(d, ox + 29, oy + 1, gem_hot)
    pixel(d, ox + 22, oy + 7, gem_hot)
    pixel(d, ox + 29, oy + 7, gem_hot)

def draw_hero_fps(d, ox, oy):
    """Teal soldier — tactical helmet w/ light, plate vest, equipment belt, rifle."""
    teal = (90, 245, 224, 255)
    teal_d = shade(teal, 0.32)
    teal_hl = tint(teal, 0.15)
    metal = (40, 44, 54, 255)
    barrel = (70, 74, 86, 255)
    belt = (60, 50, 30, 255)
    pouch = shade(teal, 0.45)
    light = (255, 250, 180, 255)
    # combat helmet
    fill_rect(d, ox + 9, oy + 3, 14, 6, teal_d)
    fill_rect(d, ox + 9, oy + 3, 14, 1, teal_hl)
    fill_rect(d, ox + 8, oy + 8, 16, 1, shade(teal_d, 0.4))   # brim
    # helmet rail w/ side light
    pixel(d, ox + 22, oy + 5, light)
    pixel(d, ox + 21, oy + 5, tint(light, 0.4))
    _head(d, ox, oy)
    # visor strip across upper face
    fill_rect(d, ox + 11, oy + 8, 10, 2, metal)
    pixel(d, ox + 13, oy + 9, teal)
    pixel(d, ox + 18, oy + 9, teal)
    # chinstrap
    pixel(d, ox + 11, oy + 11, belt)
    pixel(d, ox + 20, oy + 11, belt)
    # plate vest
    _torso(d, ox, oy, teal, teal_d, teal_hl)
    # chest plates (2 vertical panels)
    fill_rect(d, ox + 11, oy + 16, 4, 12, teal_d)
    fill_rect(d, ox + 17, oy + 16, 4, 12, teal_d)
    fill_rect(d, ox + 11, oy + 16, 4, 1, teal_hl)
    fill_rect(d, ox + 17, oy + 16, 4, 1, teal_hl)
    # pouches on belt
    fill_rect(d, ox + 9, oy + 26, 14, 2, belt)
    fill_rect(d, ox + 10, oy + 26, 3, 3, pouch)
    fill_rect(d, ox + 19, oy + 26, 3, 3, pouch)
    pixel(d, ox + 16, oy + 27, (255, 205, 117, 255))  # belt buckle
    # tactical pants
    _legs(d, ox, oy, teal_d, shade(teal_d, 0.4), knee=shade(teal_d, 0.5))
    # rifle diagonal across chest
    for i in range(20):
        pixel(d, ox + 5 + i, oy + 25 - i // 4, metal)
        pixel(d, ox + 5 + i, oy + 26 - i // 4, barrel)
    fill_rect(d, ox + 4, oy + 24, 3, 4, metal)   # stock
    pixel(d, ox + 5, oy + 25, teal_hl)            # sight
    fill_rect(d, ox + 23, oy + 19, 2, 2, barrel) # muzzle

def draw_hero_br(d, ox, oy):
    """Teal survivor — beanie, jacket, big backpack with straps, pistol."""
    teal = (90, 245, 224, 255)
    teal_d = shade(teal, 0.32)
    teal_hl = tint(teal, 0.15)
    bag = (110, 80, 50, 255)
    bag_d = shade(bag, 0.32)
    strap = (60, 50, 30, 255)
    pistol = (60, 64, 76, 255)
    hair = (90, 60, 30, 255)
    # beanie cap
    fill_rect(d, ox + 10, oy + 3, 12, 4, teal_d)
    fill_rect(d, ox + 10, oy + 3, 12, 1, teal_hl)
    fill_rect(d, ox + 10, oy + 6, 12, 1, shade(teal_d, 0.3))
    pixel(d, ox + 16, oy + 1, teal_d)  # pom-pom
    pixel(d, ox + 16, oy + 2, teal_d)
    # hair under cap
    fill_rect(d, ox + 11, oy + 7, 2, 2, hair)
    fill_rect(d, ox + 19, oy + 7, 2, 2, hair)
    _head(d, ox, oy)
    # jacket
    _torso(d, ox, oy, teal, teal_d, teal_hl)
    # zipper
    vline(d, ox + 16, oy + 16, oy + 28, teal_d)
    pixel(d, ox + 16, oy + 16, (255, 205, 117, 255))
    # chest strap (X across)
    for i in range(11):
        pixel(d, ox + 10 + i, oy + 17 + i // 2, strap)
        pixel(d, ox + 22 - i, oy + 17 + i // 2, strap)
    # backpack (right side of body)
    fill_rect(d, ox + 23, oy + 15, 4, 14, bag)
    fill_rect(d, ox + 23, oy + 15, 4, 2, tint(bag, 0.2))
    fill_rect(d, ox + 23, oy + 21, 4, 1, bag_d)
    pixel(d, ox + 24, oy + 17, strap)
    pixel(d, ox + 26, oy + 17, strap)
    # belt + holster
    fill_rect(d, ox + 9, oy + 26, 14, 2, strap)
    fill_rect(d, ox + 6, oy + 24, 4, 5, bag_d)  # holster
    # pistol in left hand
    fill_rect(d, ox + 5, oy + 22, 5, 3, pistol)
    pixel(d, ox + 5, oy + 23, pistol)
    pixel(d, ox + 10, oy + 22, shade(pistol, 0.4))
    _legs(d, ox, oy, teal_d, shade(teal_d, 0.4), knee=shade(teal_d, 0.5))


# ============================================================
#  MOBA enemy champions
# ============================================================

def draw_enemy_mage(d, ox, oy):
    """Dark mage — long pointed hood hides face, flowing cape, orb of magic."""
    purple = (192, 112, 255, 255)
    purple_d = shade(purple, 0.45)
    purple_hl = tint(purple, 0.18)
    cape = (90, 50, 130, 255)
    orb = (255, 80, 255, 255)
    orb_hot = (255, 200, 255, 255)
    glow = (220, 100, 255, 200)
    # tall pointed hood (rows 0-12)
    for i, w in enumerate([2, 4, 6, 8, 10, 12, 14]):
        cx = ox + 16 - w // 2
        fill_rect(d, cx, oy + i, w, 1, purple_d)
    fill_rect(d, ox + 9, oy + 7, 14, 8, purple_d)
    # hood interior shadow
    fill_rect(d, ox + 12, oy + 8, 8, 6, shade(purple_d, 0.6))
    # glowing eyes deep in hood
    pixel(d, ox + 13, oy + 11, orb_hot)
    pixel(d, ox + 18, oy + 11, orb_hot)
    pixel(d, ox + 13, oy + 12, orb)
    pixel(d, ox + 18, oy + 12, orb)
    # flowing wider robe
    fill_rect(d, ox + 7, oy + 15, 18, 14, purple)
    fill_rect(d, ox + 7, oy + 15, 18, 2, purple_hl)
    fill_rect(d, ox + 7, oy + 27, 18, 2, purple_d)
    # robe trim down the front
    vline(d, ox + 16, oy + 15, oy + 29, purple_hl)
    fill_rect(d, ox + 13, oy + 18, 6, 1, (255, 205, 117, 255))  # gold band
    # sleeves
    fill_rect(d, ox + 5, oy + 18, 2, 8, purple_d)
    fill_rect(d, ox + 25, oy + 18, 2, 8, purple_d)
    fill_rect(d, ox + 4, oy + 24, 3, 4, cape)
    # cape behind, visible at sides
    fill_rect(d, ox + 5, oy + 14, 2, 18, cape)
    fill_rect(d, ox + 25, oy + 14, 2, 18, cape)
    # robe hem flares
    fill_rect(d, ox + 6, oy + 30, 20, 3, purple_d)
    fill_rect(d, ox + 5, oy + 33, 22, 2, shade(purple_d, 0.4))
    # tiny visible feet
    fill_rect(d, ox + 12, oy + 35, 3, 4, shade(cape, 0.3))
    fill_rect(d, ox + 17, oy + 35, 3, 4, shade(cape, 0.3))
    # floating orb of magic + sparkle
    fill_rect(d, ox + 2, oy + 18, 5, 5, glow)
    fill_rect(d, ox + 3, oy + 19, 3, 3, orb)
    pixel(d, ox + 3, oy + 19, orb_hot)
    pixel(d, ox + 4, oy + 18, orb_hot)
    # orb trail sparkles
    pixel(d, ox + 0, oy + 24, orb)
    pixel(d, ox + 7, oy + 16, orb_hot)

def draw_enemy_gunner(d, ox, oy):
    """Orange archer — feathered cap, drawn bow with arrow, quiver."""
    orange = (255, 144, 80, 255)
    orange_d = shade(orange, 0.35)
    orange_hl = tint(orange, 0.18)
    leather = (130, 80, 40, 255)
    leather_d = shade(leather, 0.3)
    feather = (255, 70, 50, 255)
    bow = (90, 60, 30, 255)
    string = (200, 200, 180, 255)
    # ranger cap with feather
    fill_rect(d, ox + 11, oy + 3, 10, 4, orange_d)
    fill_rect(d, ox + 11, oy + 3, 10, 1, orange_hl)
    fill_rect(d, ox + 10, oy + 6, 12, 1, shade(orange_d, 0.4))
    # feather (3px tall, leaning back)
    pixel(d, ox + 20, oy + 1, feather)
    pixel(d, ox + 21, oy + 2, feather)
    pixel(d, ox + 22, oy + 3, feather)
    pixel(d, ox + 19, oy + 2, tint(feather, 0.3))
    _head(d, ox, oy, skin=(255, 200, 150, 255))
    # leather tunic (slightly narrower than 14-wide torso)
    fill_rect(d, ox + 10, oy + 15, 12, 14, orange)
    fill_rect(d, ox + 10, oy + 15, 12, 2, orange_hl)
    fill_rect(d, ox + 10, oy + 27, 12, 2, orange_d)
    # cross-strap (bandolier)
    for i in range(11):
        pixel(d, ox + 10 + i, oy + 16 + i // 2, leather)
    # quiver on back (right shoulder)
    fill_rect(d, ox + 22, oy + 12, 3, 12, leather)
    fill_rect(d, ox + 22, oy + 12, 3, 2, tint(leather, 0.2))
    # arrows in quiver (feather tops)
    pixel(d, ox + 22, oy + 11, feather)
    pixel(d, ox + 23, oy + 10, feather)
    pixel(d, ox + 24, oy + 11, feather)
    # arms
    fill_rect(d, ox + 8, oy + 16, 2, 11, orange_d)
    fill_rect(d, ox + 23, oy + 16, 2, 11, orange_d)
    # belt
    fill_rect(d, ox + 10, oy + 26, 12, 2, leather)
    pixel(d, ox + 16, oy + 27, (255, 205, 117, 255))
    _legs(d, ox, oy, orange_d, shade(orange_d, 0.4))
    # drawn bow on left side (vertical curved shape)
    bow_pts = [(7, 16), (6, 17), (5, 18), (5, 19), (5, 20), (5, 21), (5, 22), (5, 23),
               (5, 24), (6, 25), (7, 26)]
    for (x, y) in bow_pts: pixel(d, ox + x, oy + y, bow)
    # bowstring (straight vertical line)
    vline(d, ox + 8, oy + 17, oy + 25, string)
    # arrow nocked horizontally pointing right
    hline(d, ox + 9, ox + 14, oy + 21, bow)
    pixel(d, ox + 15, oy + 21, (200, 200, 200, 255))  # arrowhead
    pixel(d, ox + 7, oy + 21, feather)                # fletching

def draw_enemy_tank(d, ox, oy):
    """Blue knight — full helm with horns, pauldrons, big kite shield, mace."""
    blue = (112, 160, 255, 255)
    blue_d = shade(blue, 0.38)
    blue_hl = tint(blue, 0.2)
    metal = (160, 165, 180, 255)
    metal_hl = (210, 215, 230, 255)
    metal_d = (100, 105, 120, 255)
    shield = (70, 95, 150, 255)
    shield_em = (255, 205, 117, 255)
    crest = (255, 70, 85, 255)
    # full helm
    fill_rect(d, ox + 9, oy + 2, 14, 12, blue_d)
    fill_rect(d, ox + 9, oy + 2, 14, 2, blue_hl)
    # horns on each side of helm
    fill_rect(d, ox + 7, oy + 3, 2, 4, metal_d)
    fill_rect(d, ox + 23, oy + 3, 2, 4, metal_d)
    pixel(d, ox + 6, oy + 4, metal_d)
    pixel(d, ox + 25, oy + 4, metal_d)
    # crest plume
    fill_rect(d, ox + 15, oy + 0, 2, 4, crest)
    pixel(d, ox + 15, oy + 0, tint(crest, 0.3))
    # visor slit
    fill_rect(d, ox + 11, oy + 8, 10, 1, SHADE)
    pixel(d, ox + 13, oy + 8, (255, 70, 85, 200))  # glowing eyes
    pixel(d, ox + 18, oy + 8, (255, 70, 85, 200))
    # cheek guards
    fill_rect(d, ox + 9, oy + 10, 2, 4, blue_d)
    fill_rect(d, ox + 21, oy + 10, 2, 4, blue_d)
    # bulky plate torso
    fill_rect(d, ox + 8, oy + 14, 16, 16, blue)
    fill_rect(d, ox + 8, oy + 14, 16, 3, blue_hl)
    fill_rect(d, ox + 8, oy + 28, 16, 2, blue_d)
    # chest plate ridges
    fill_rect(d, ox + 14, oy + 16, 4, 12, blue_d)
    fill_rect(d, ox + 15, oy + 18, 2, 8, metal_hl)
    # pauldrons (shoulder plates)
    fill_rect(d, ox + 5, oy + 14, 4, 5, metal)
    fill_rect(d, ox + 5, oy + 14, 4, 1, metal_hl)
    fill_rect(d, ox + 23, oy + 14, 4, 5, metal)
    fill_rect(d, ox + 23, oy + 14, 4, 1, metal_hl)
    # arms (bulky)
    fill_rect(d, ox + 5, oy + 19, 4, 10, blue_d)
    fill_rect(d, ox + 23, oy + 19, 4, 10, blue_d)
    # gauntlets
    fill_rect(d, ox + 5, oy + 27, 4, 2, metal_d)
    fill_rect(d, ox + 23, oy + 27, 4, 2, metal_d)
    # large kite shield on left side
    fill_rect(d, ox + 0, oy + 16, 6, 14, shield)
    fill_rect(d, ox + 0, oy + 16, 6, 2, tint(shield, 0.3))
    fill_rect(d, ox + 0, oy + 28, 6, 2, shade(shield, 0.3))
    # shield emblem (cross)
    fill_rect(d, ox + 2, oy + 19, 2, 8, shield_em)
    fill_rect(d, ox + 1, oy + 22, 4, 2, shield_em)
    # shield boss (center stud)
    pixel(d, ox + 2, oy + 22, metal_hl)
    pixel(d, ox + 3, oy + 22, metal_hl)
    # heavy plated legs
    fill_rect(d, ox + 10, oy + 30, 5, 9, blue_d)
    fill_rect(d, ox + 17, oy + 30, 5, 9, blue_d)
    # knee plates
    hline(d, ox + 10, ox + 14, oy + 33, metal_d)
    hline(d, ox + 17, ox + 21, oy + 33, metal_d)
    # plate boots
    fill_rect(d, ox + 10, oy + 37, 5, 2, metal_d)
    fill_rect(d, ox + 17, oy + 37, 5, 2, metal_d)

def draw_enemy_fps(d, ox, oy):
    """Orange enemy soldier — slight mask + rifle (mirrored from hero.fps)."""
    orange = (255, 128, 80, 255)
    orange_d = shade(orange, 0.32)
    orange_hl = tint(orange, 0.15)
    metal = (40, 44, 54, 255)
    barrel = (70, 74, 86, 255)
    belt = (60, 40, 25, 255)
    fill_rect(d, ox + 9, oy + 3, 14, 6, orange_d)
    fill_rect(d, ox + 9, oy + 3, 14, 1, orange_hl)
    fill_rect(d, ox + 8, oy + 8, 16, 1, shade(orange_d, 0.4))
    # tactical mask (lower face cover)
    _head(d, ox, oy)
    fill_rect(d, ox + 11, oy + 11, 10, 3, metal)
    fill_rect(d, ox + 11, oy + 8, 10, 2, metal)
    pixel(d, ox + 13, oy + 9, (255, 80, 50, 255))  # red goggle
    pixel(d, ox + 18, oy + 9, (255, 80, 50, 255))
    # vest
    _torso(d, ox, oy, orange, orange_d, orange_hl)
    fill_rect(d, ox + 11, oy + 17, 4, 11, orange_d)
    fill_rect(d, ox + 17, oy + 17, 4, 11, orange_d)
    fill_rect(d, ox + 9, oy + 26, 14, 2, belt)
    pixel(d, ox + 16, oy + 27, (255, 205, 117, 255))
    _legs(d, ox, oy, orange_d, shade(orange_d, 0.4))
    # mirrored rifle, pointing left
    for i in range(20):
        pixel(d, ox + 26 - i, oy + 25 - i // 4, metal)
        pixel(d, ox + 26 - i, oy + 26 - i // 4, barrel)
    fill_rect(d, ox + 25, oy + 24, 3, 4, metal)
    fill_rect(d, ox + 5, oy + 19, 2, 2, barrel)


# ============================================================
#  BR squad bots — parametric color, slight per-squad variation
# ============================================================

def _draw_bot_br(d, ox, oy, shirt, band, hat_style):
    """hat_style: 'cap' / 'beanie' / 'helmet' to distinguish squads."""
    shirt_d = shade(shirt, 0.32)
    shirt_hl = tint(shirt, 0.15)
    bag = (110, 80, 50, 255)
    pistol = (60, 64, 76, 255)
    strap = (60, 50, 30, 255)
    if hat_style == 'cap':
        fill_rect(d, ox + 10, oy + 3, 12, 3, shirt_d)
        fill_rect(d, ox + 7, oy + 5, 18, 1, shade(shirt_d, 0.3))  # brim
        fill_rect(d, ox + 11, oy + 1, 10, 2, band)               # squad band
    elif hat_style == 'beanie':
        fill_rect(d, ox + 10, oy + 3, 12, 4, shirt_d)
        fill_rect(d, ox + 10, oy + 6, 12, 1, shade(shirt_d, 0.4))
        pixel(d, ox + 16, oy + 1, shirt_d)
        pixel(d, ox + 16, oy + 2, shirt_d)
        fill_rect(d, ox + 10, oy + 5, 12, 1, band)
    else:  # helmet
        fill_rect(d, ox + 9, oy + 3, 14, 5, shade(shirt_d, 0.2))
        fill_rect(d, ox + 9, oy + 3, 14, 1, tint(shirt_d, 0.2))
        fill_rect(d, ox + 8, oy + 7, 16, 1, shade(shirt_d, 0.5))
        fill_rect(d, ox + 12, oy + 4, 8, 2, band)               # band across helmet
    _head(d, ox, oy)
    _torso(d, ox, oy, shirt, shirt_d, shirt_hl)
    # shoulder patch (squad color)
    fill_rect(d, ox + 7, oy + 16, 2, 3, band)
    fill_rect(d, ox + 23, oy + 16, 2, 3, band)
    # zipper
    vline(d, ox + 16, oy + 16, oy + 28, shirt_d)
    pixel(d, ox + 16, oy + 16, (255, 205, 117, 255))
    # backpack
    fill_rect(d, ox + 23, oy + 15, 4, 14, bag)
    fill_rect(d, ox + 23, oy + 15, 4, 2, tint(bag, 0.2))
    pixel(d, ox + 24, oy + 17, strap)
    pixel(d, ox + 26, oy + 17, strap)
    # belt
    fill_rect(d, ox + 9, oy + 26, 14, 2, strap)
    # pistol
    fill_rect(d, ox + 5, oy + 22, 5, 3, pistol)
    _legs(d, ox, oy, shirt_d, shade(shirt_d, 0.4))

def draw_bot_br_0(d, ox, oy): _draw_bot_br(d, ox, oy, (255, 128, 80, 255), (255, 70, 85, 255),   'cap')
def draw_bot_br_1(d, ox, oy): _draw_bot_br(d, ox, oy, (160, 112, 255, 255), (160, 68, 255, 255), 'beanie')
def draw_bot_br_2(d, ox, oy): _draw_bot_br(d, ox, oy, (128, 176, 80, 255), (95, 245, 160, 255),  'helmet')


# ============================================================
#  Minions (20×24, foot at row 23)
# ============================================================

def _draw_minion(d, ox, oy, body):
    body_d = shade(body, 0.32)
    body_hl = tint(body, 0.15)
    metal = (140, 145, 160, 255)
    # helmet
    fill_rect(d, ox + 5, oy + 0, 10, 4, body_d)
    fill_rect(d, ox + 5, oy + 0, 10, 1, body_hl)
    fill_rect(d, ox + 4, oy + 3, 12, 1, shade(body_d, 0.4))
    # nose guard
    pixel(d, ox + 9, oy + 5, metal)
    pixel(d, ox + 10, oy + 5, metal)
    # head (smaller)
    fill_rect(d, ox + 7, oy + 4, 6, 5, SKIN)
    pixel(d, ox + 8, oy + 7, SHADE)
    pixel(d, ox + 11, oy + 7, SHADE)
    # body
    fill_rect(d, ox + 6, oy + 9, 8, 9, body)
    fill_rect(d, ox + 6, oy + 9, 8, 1, body_hl)
    fill_rect(d, ox + 6, oy + 17, 8, 1, body_d)
    # belt
    fill_rect(d, ox + 6, oy + 15, 8, 1, (60, 50, 30, 255))
    # arms
    fill_rect(d, ox + 4, oy + 10, 2, 6, body_d)
    fill_rect(d, ox + 14, oy + 10, 2, 6, body_d)
    # weapon stub (short sword to right)
    fill_rect(d, ox + 15, oy + 9, 2, 6, metal)
    fill_rect(d, ox + 14, oy + 14, 4, 2, (60, 50, 30, 255))  # hilt
    # legs
    fill_rect(d, ox + 7, oy + 18, 2, 5, body_d)
    fill_rect(d, ox + 11, oy + 18, 2, 5, body_d)
    # boots
    fill_rect(d, ox + 7, oy + 22, 2, 1, shade(body_d, 0.5))
    fill_rect(d, ox + 11, oy + 22, 2, 1, shade(body_d, 0.5))

def draw_minion_ally(d, ox, oy):  _draw_minion(d, ox, oy, (90, 245, 224, 255))
def draw_minion_enemy(d, ox, oy): _draw_minion(d, ox, oy, (255, 128, 80, 255))


# ============================================================
#  Dragon (80×64) — boss creature, imposing silhouette
# ============================================================

def draw_dragon(d, ox, oy):
    """Imposing dragon — spread wings, arched neck, open jaw with fire, claws."""
    body = (170, 70, 30, 255)
    body_d = (110, 40, 18, 255)
    body_hl = (220, 110, 50, 255)
    belly = (240, 180, 80, 255)
    belly_d = (200, 130, 50, 255)
    wing = (130, 50, 20, 255)
    wing_membrane = (180, 70, 35, 255)
    wing_hl = (210, 100, 50, 255)
    spine = (255, 140, 0, 255)
    eye = (255, 240, 60, 255)
    pupil = SHADE
    tooth = (255, 240, 220, 255)
    fire = (255, 180, 60, 255)
    fire_hot = (255, 230, 120, 255)
    claw = (255, 230, 200, 255)

    # ---- Tail (curls right-back) ----
    tail_points = [
        (58, 50, 6, 3), (62, 48, 6, 3), (66, 46, 6, 3), (70, 43, 6, 3),
        (72, 38, 4, 5),
    ]
    for tx, ty, tw, th in tail_points:
        fill_rect(d, ox + tx, oy + ty, tw, th, body_d)
    # tail barb
    fill_rect(d, ox + 72, oy + 34, 3, 4, spine)
    pixel(d, ox + 75, oy + 33, fire)

    # ---- Wings (spread outward, semi-transparent membrane) ----
    # LEFT wing — arc upward-outward
    wing_left_outline = [
        (4, 16), (3, 18), (2, 20), (2, 24), (3, 28), (5, 32),
        (8, 30), (12, 28), (14, 24), (12, 20), (10, 17), (7, 15),
    ]
    # fill left wing area
    for y in range(14, 33):
        for x in range(2, 18):
            # crude ellipse: include if within wing curve
            dx = x - 10
            dy = y - 22
            if (dx * dx) / 64 + (dy * dy) / 100 < 1:
                pixel(d, ox + x, oy + y, wing_membrane)
    # left wing bones
    for y0, y1, x in [(15, 32, 4), (14, 30, 8), (15, 28, 12), (17, 27, 15)]:
        vline(d, ox + x, oy + y0, oy + y1, wing)
    # left wing top edge highlight
    for x in range(4, 16):
        pixel(d, ox + x, oy + 14 + (x - 4) // 3, wing_hl)
    # claws on wing tips
    pixel(d, ox + 2, oy + 16, claw)
    pixel(d, ox + 4, oy + 14, claw)

    # RIGHT wing — mirror
    for y in range(14, 33):
        for x in range(62, 78):
            dx = x - 70
            dy = y - 22
            if (dx * dx) / 64 + (dy * dy) / 100 < 1:
                pixel(d, ox + x, oy + y, wing_membrane)
    for y0, y1, x in [(15, 32, 75), (14, 30, 71), (15, 28, 67), (17, 27, 64)]:
        vline(d, ox + x, oy + y0, oy + y1, wing)
    for x in range(64, 76):
        pixel(d, ox + x, oy + 14 + (75 - x) // 3, wing_hl)
    pixel(d, ox + 77, oy + 16, claw)
    pixel(d, ox + 75, oy + 14, claw)

    # ---- Back legs / haunches ----
    fill_rect(d, ox + 18, oy + 45, 10, 12, body_d)
    fill_rect(d, ox + 52, oy + 45, 10, 12, body_d)
    fill_rect(d, ox + 18, oy + 45, 10, 2, body_hl)
    fill_rect(d, ox + 52, oy + 45, 10, 2, body_hl)
    # foot pads
    fill_rect(d, ox + 17, oy + 55, 12, 4, (80, 30, 12, 255))
    fill_rect(d, ox + 51, oy + 55, 12, 4, (80, 30, 12, 255))
    # claws (3 per foot)
    for foot_x in [17, 51]:
        pixel(d, ox + foot_x, oy + 60, claw)
        pixel(d, ox + foot_x + 4, oy + 61, claw)
        pixel(d, ox + foot_x + 8, oy + 60, claw)

    # ---- Main body (rounded chest + back) ----
    fill_rect(d, ox + 22, oy + 28, 36, 22, body)
    fill_rect(d, ox + 22, oy + 28, 36, 4, body_hl)
    fill_rect(d, ox + 22, oy + 46, 36, 4, body_d)
    # rounded body sides
    fill_rect(d, ox + 18, oy + 32, 4, 14, body)
    fill_rect(d, ox + 58, oy + 32, 4, 14, body)
    fill_rect(d, ox + 18, oy + 32, 4, 2, body_hl)
    fill_rect(d, ox + 58, oy + 32, 4, 2, body_hl)
    # belly plates (horizontal stripes)
    fill_rect(d, ox + 26, oy + 38, 28, 10, belly)
    for y in [40, 44]:
        hline(d, ox + 26, ox + 53, oy + y, belly_d)

    # ---- Back spines (row of 5) ----
    for i, cx in enumerate([28, 35, 42, 49, 56]):
        h = 5 if i in (1, 2, 3) else 4
        fill_rect(d, ox + cx - 1, oy + 28 - h, 3, h, spine)
        pixel(d, ox + cx, oy + 28 - h - 1, fire)

    # ---- Neck arching forward + head ----
    # neck (curves from body up-forward)
    fill_rect(d, ox + 26, oy + 22, 12, 8, body)
    fill_rect(d, ox + 26, oy + 22, 12, 2, body_hl)
    # head (front, larger)
    fill_rect(d, ox + 22, oy + 30, 22, 16, body)
    fill_rect(d, ox + 22, oy + 30, 22, 3, body_hl)
    fill_rect(d, ox + 22, oy + 43, 22, 3, body_d)
    # head crown (horns)
    fill_rect(d, ox + 22, oy + 26, 3, 6, body_d)
    fill_rect(d, ox + 41, oy + 26, 3, 6, body_d)
    pixel(d, ox + 22, oy + 25, body_d)
    pixel(d, ox + 43, oy + 25, body_d)
    pixel(d, ox + 21, oy + 26, body_d)
    pixel(d, ox + 44, oy + 26, body_d)
    # eye ridges (angry brows)
    fill_rect(d, ox + 25, oy + 33, 5, 1, body_d)
    fill_rect(d, ox + 36, oy + 33, 5, 1, body_d)
    # eyes
    fill_rect(d, ox + 26, oy + 34, 4, 4, eye)
    fill_rect(d, ox + 37, oy + 34, 4, 4, eye)
    fill_rect(d, ox + 27, oy + 35, 2, 2, pupil)
    fill_rect(d, ox + 38, oy + 35, 2, 2, pupil)
    pixel(d, ox + 27, oy + 34, WHITE)
    pixel(d, ox + 38, oy + 34, WHITE)
    # snout (extends forward, lower)
    fill_rect(d, ox + 25, oy + 42, 18, 6, body)
    fill_rect(d, ox + 25, oy + 46, 18, 2, body_d)
    # nostrils
    fill_rect(d, ox + 27, oy + 43, 2, 1, SHADE)
    fill_rect(d, ox + 40, oy + 43, 2, 1, SHADE)
    # OPEN JAW with fangs + fire
    fill_rect(d, ox + 27, oy + 48, 14, 4, SHADE)              # mouth interior
    # upper fangs
    fill_rect(d, ox + 29, oy + 47, 2, 3, tooth)
    fill_rect(d, ox + 37, oy + 47, 2, 3, tooth)
    # lower fangs
    fill_rect(d, ox + 31, oy + 50, 2, 2, tooth)
    fill_rect(d, ox + 35, oy + 50, 2, 2, tooth)
    # fire breath puff (between snout & ground)
    fill_rect(d, ox + 29, oy + 52, 10, 4, fire)
    fill_rect(d, ox + 30, oy + 53, 8, 2, fire_hot)
    pixel(d, ox + 32, oy + 54, WHITE)
    pixel(d, ox + 36, oy + 54, WHITE)
    pixel(d, ox + 28, oy + 55, fire)
    pixel(d, ox + 39, oy + 55, fire)


# ============================================================
#  Tower (32×64) — multi-story stone tower with flag + light
# ============================================================

def draw_tower(d, ox, oy):
    stone = (160, 160, 184, 255)
    stone_d = shade(stone, 0.36)
    stone_hl = tint(stone, 0.18)
    stone_dark = shade(stone, 0.55)
    flag = (255, 70, 85, 255)
    flag_hl = tint(flag, 0.3)
    pole = (50, 40, 30, 255)
    window_glow = (255, 220, 100, 255)
    window_hot = (255, 240, 180, 255)
    moss = (60, 90, 50, 255)

    # ---- Base (foundation, wider) ----
    fill_rect(d, ox + 1, oy + 55, 30, 9, stone)
    fill_rect(d, ox + 1, oy + 55, 30, 2, stone_hl)
    fill_rect(d, ox + 1, oy + 61, 30, 3, stone_d)
    # base stone joins
    for x in [8, 16, 24]:
        vline(d, ox + x, oy + 55, oy + 60, stone_dark)
    hline(d, ox + 1, ox + 30, oy + 58, stone_dark)

    # ---- Lower column (story 1) ----
    fill_rect(d, ox + 4, oy + 42, 24, 13, stone)
    fill_rect(d, ox + 4, oy + 42, 24, 2, stone_hl)
    # arched doorway at story 1
    fill_rect(d, ox + 13, oy + 47, 6, 8, stone_dark)
    pixel(d, ox + 12, oy + 47, stone_dark)
    pixel(d, ox + 19, oy + 47, stone_dark)
    fill_rect(d, ox + 14, oy + 49, 4, 6, SHADE)
    # door planks
    for x in [15, 16]:
        vline(d, ox + x, oy + 50, oy + 54, (80, 50, 25, 255))
    # stone joins (story 1)
    for y in [48, 53]:
        hline(d, ox + 4, ox + 27, oy + y, stone_dark)
    for x, y0 in [(9, 42), (17, 42), (24, 42), (12, 48), (20, 48)]:
        vline(d, ox + x, oy + y0, oy + y0 + 5, stone_dark)

    # ---- Mid column (story 2) ----
    fill_rect(d, ox + 5, oy + 28, 22, 14, stone)
    fill_rect(d, ox + 5, oy + 28, 22, 2, stone_hl)
    fill_rect(d, ox + 5, oy + 40, 22, 2, stone_d)
    # window with glowing light + beam
    fill_rect(d, ox + 13, oy + 31, 6, 8, stone_dark)
    fill_rect(d, ox + 14, oy + 32, 4, 6, window_glow)
    fill_rect(d, ox + 15, oy + 33, 2, 4, window_hot)
    pixel(d, ox + 16, oy + 35, WHITE)
    # light beam coming out (subtle, going down-right)
    for i in range(6):
        pixel(d, ox + 19 + i, oy + 36 + i, (255, 220, 100, 60))
        pixel(d, ox + 19 + i, oy + 37 + i, (255, 200, 80, 40))
    # stone joins
    for x in [10, 14, 20, 24]:
        vline(d, ox + x, oy + 28, oy + 30, stone_dark)
    hline(d, ox + 5, ox + 26, oy + 34, stone_dark)
    for x in [10, 22]:
        vline(d, ox + x, oy + 35, oy + 41, stone_dark)

    # ---- Upper column (story 3) ----
    fill_rect(d, ox + 6, oy + 16, 20, 12, stone)
    fill_rect(d, ox + 6, oy + 16, 20, 2, stone_hl)
    fill_rect(d, ox + 6, oy + 26, 20, 2, stone_d)
    # arrow slit
    fill_rect(d, ox + 15, oy + 19, 2, 6, SHADE)
    pixel(d, ox + 15, oy + 19, window_glow)
    pixel(d, ox + 16, oy + 19, window_glow)
    # stone joins
    hline(d, ox + 6, ox + 25, oy + 22, stone_dark)
    for x in [11, 21]:
        vline(d, ox + x, oy + 23, oy + 28, stone_dark)
    # moss patch (lower-left)
    pixel(d, ox + 6, oy + 25, moss)
    pixel(d, ox + 7, oy + 25, moss)
    pixel(d, ox + 6, oy + 26, moss)

    # ---- Crenellation (battlements at top of column) ----
    fill_rect(d, ox + 5, oy + 13, 22, 4, stone)
    fill_rect(d, ox + 5, oy + 13, 22, 1, stone_hl)
    # 4 notches/teeth
    for x in [6, 12, 18, 24]:
        fill_rect(d, ox + x, oy + 10, 3, 3, stone)
        pixel(d, ox + x, oy + 10, stone_hl)
        pixel(d, ox + x + 1, oy + 10, stone_hl)

    # ---- Flagpole + flag ----
    vline(d, ox + 16, oy + 0, oy + 12, pole)
    pixel(d, ox + 16, oy + 0, (255, 205, 117, 255))  # gold finial
    pixel(d, ox + 17, oy + 0, (255, 205, 117, 255))
    # flag (slightly waving, larger)
    fill_rect(d, ox + 17, oy + 1, 10, 7, flag)
    fill_rect(d, ox + 17, oy + 1, 10, 1, flag_hl)
    fill_rect(d, ox + 17, oy + 7, 10, 1, shade(flag, 0.3))
    # flag emblem (skull-ish cross)
    pixel(d, ox + 21, oy + 3, WHITE)
    pixel(d, ox + 22, oy + 4, WHITE)
    pixel(d, ox + 23, oy + 3, WHITE)
    pixel(d, ox + 22, oy + 5, WHITE)
    # flag swallowtail (V cutout at trailing edge)
    fill_rect(d, ox + 26, oy + 4, 1, 2, (0, 0, 0, 0))
    fill_rect(d, ox + 25, oy + 3, 1, 1, (0, 0, 0, 0))
    fill_rect(d, ox + 25, oy + 6, 1, 1, (0, 0, 0, 0))


# ============================================================
#  Crates (24×24) — rarity-tinted with hardware + glow for high tiers
# ============================================================

def _draw_crate(d, ox, oy, accent, glow=False):
    wood = (130, 90, 50, 255)
    wood_d = shade(wood, 0.32)
    wood_hl = tint(wood, 0.18)
    plank_line = shade(wood, 0.5)
    metal = (90, 95, 105, 255)
    metal_hl = (180, 185, 200, 255)
    if glow:
        # outer glow rim
        for i, a in enumerate([90, 60, 35]):
            d.rectangle([ox + 2 - i, oy + 1 - i, ox + 21 + i, oy + 22 + i],
                        outline=(accent[0], accent[1], accent[2], a))
    # body
    fill_rect(d, ox + 3, oy + 6, 18, 16, wood)
    # plank vertical seams
    vline(d, ox + 9, oy + 6, oy + 21, plank_line)
    vline(d, ox + 15, oy + 6, oy + 21, plank_line)
    # lid (curved approximation)
    fill_rect(d, ox + 3, oy + 4, 18, 6, wood)
    fill_rect(d, ox + 4, oy + 3, 16, 1, wood)
    fill_rect(d, ox + 5, oy + 2, 14, 1, wood)
    fill_rect(d, ox + 3, oy + 4, 18, 1, wood_hl)
    # lid-body separator
    hline(d, ox + 3, ox + 20, oy + 10, wood_d)
    # rarity accent bands
    fill_rect(d, ox + 3, oy + 5, 18, 2, accent)
    fill_rect(d, ox + 3, oy + 5, 18, 1, tint(accent, 0.35))
    fill_rect(d, ox + 3, oy + 19, 18, 3, accent)
    fill_rect(d, ox + 3, oy + 21, 18, 1, shade(accent, 0.3))
    # metal corner reinforcements
    for cx, cy in [(3, 5), (20, 5), (3, 21), (20, 21)]:
        fill_rect(d, ox + cx, oy + cy, 2, 1, metal_hl)
        pixel(d, ox + cx, oy + cy + 1, metal)
    # lock plate (center top-front)
    fill_rect(d, ox + 10, oy + 9, 4, 5, metal)
    fill_rect(d, ox + 10, oy + 9, 4, 1, metal_hl)
    fill_rect(d, ox + 11, oy + 11, 2, 2, accent)
    pixel(d, ox + 12, oy + 12, SHADE)
    # handles on top
    fill_rect(d, ox + 5, oy + 2, 3, 1, metal)
    fill_rect(d, ox + 16, oy + 2, 3, 1, metal)
    # outline
    d.rectangle([ox + 3, oy + 2, ox + 20, oy + 22], outline=OUTLINE)

def draw_crate_common(d, ox, oy):    _draw_crate(d, ox, oy, (221, 221, 221, 255))
def draw_crate_rare(d, ox, oy):      _draw_crate(d, ox, oy, (90, 245, 224, 255))
def draw_crate_epic(d, ox, oy):      _draw_crate(d, ox, oy, (160, 68, 255, 255), glow=True)
def draw_crate_legendary(d, ox, oy):
    _draw_crate(d, ox, oy, (255, 205, 117, 255), glow=True)
    # extra sparkles around legendary
    for sx, sy in [(6, 6), (18, 8), (4, 14), (20, 18), (10, 4)]:
        pixel(d, ox + sx, oy + sy, WHITE)
    pixel(d, ox + 12, oy + 7, (255, 255, 200, 255))


# ============================================================
#  Grenade (12×12)
# ============================================================

def draw_grenade(d, ox, oy):
    body = (200, 50, 30, 255)
    body_d = shade(body, 0.42)
    body_hl = tint(body, 0.25)
    metal = (90, 95, 105, 255)
    # round body (3-tone)
    fill_rect(d, ox + 3, oy + 4, 6, 6, body)
    fill_rect(d, ox + 2, oy + 5, 8, 4, body)
    fill_rect(d, ox + 4, oy + 3, 4, 1, body)
    fill_rect(d, ox + 4, oy + 10, 4, 1, body_d)
    # highlights (top-left)
    pixel(d, ox + 4, oy + 4, body_hl)
    pixel(d, ox + 5, oy + 4, body_hl)
    pixel(d, ox + 3, oy + 5, body_hl)
    # cross-hatch (pineapple grenade)
    pixel(d, ox + 5, oy + 6, body_d)
    pixel(d, ox + 7, oy + 6, body_d)
    pixel(d, ox + 4, oy + 8, body_d)
    pixel(d, ox + 6, oy + 8, body_d)
    pixel(d, ox + 8, oy + 8, body_d)
    # neck + pin
    fill_rect(d, ox + 5, oy + 1, 3, 2, metal)
    fill_rect(d, ox + 7, oy + 0, 2, 1, metal)
    pixel(d, ox + 8, oy + 1, metal)
    d.rectangle([ox + 2, oy + 3, ox + 9, oy + 10], outline=OUTLINE)


# ============================================================
#  VFX (24×24)
# ============================================================

def draw_vfx_muzzle(d, ox, oy):
    core = (255, 255, 220, 255)
    glow = (255, 220, 120, 255)
    outer = (255, 180, 60, 240)
    fill_rect(d, ox + 11, oy + 4, 2, 16, glow)
    fill_rect(d, ox + 4, oy + 11, 16, 2, glow)
    for i in range(7):
        pixel(d, ox + 6 + i, oy + 6 + i, outer)
        pixel(d, ox + 17 - i, oy + 6 + i, outer)
    fill_rect(d, ox + 9, oy + 9, 6, 6, glow)
    fill_rect(d, ox + 10, oy + 10, 4, 4, core)
    pixel(d, ox + 12, oy + 12, WHITE)

def draw_vfx_skillshot(d, ox, oy):
    core = (200, 255, 255, 255)
    glow = (130, 240, 255, 255)
    edge = (60, 180, 220, 220)
    for i in range(14):
        pixel(d, ox + 5 + i, oy + 18 - i, glow)
        pixel(d, ox + 5 + i, oy + 17 - i, core)
        pixel(d, ox + 6 + i, oy + 18 - i, edge)
    for sx, sy in [(3, 19), (4, 17), (19, 4), (21, 5)]:
        pixel(d, ox + sx, oy + sy, core)
    pixel(d, ox + 12, oy + 11, WHITE)

def draw_vfx_pickup(d, ox, oy):
    core = (200, 255, 200, 255)
    glow = (140, 255, 140, 255)
    edge = (90, 200, 100, 220)
    fill_rect(d, ox + 11, oy + 6, 2, 12, glow)
    fill_rect(d, ox + 6, oy + 11, 12, 2, glow)
    fill_rect(d, ox + 11, oy + 7, 2, 10, core)
    fill_rect(d, ox + 7, oy + 11, 10, 2, core)
    pixel(d, ox + 12, oy + 12, WHITE)
    for sx, sy in [(4, 4), (19, 19), (4, 19), (19, 4)]:
        pixel(d, ox + sx, oy + sy, edge)


# ---------- Slot → draw function dispatch ----------

DRAW = {
    'hero.moba':         draw_hero_moba,
    'hero.fps':          draw_hero_fps,
    'hero.br':           draw_hero_br,
    'enemy.moba.mage':   draw_enemy_mage,
    'enemy.moba.gunner': draw_enemy_gunner,
    'enemy.moba.tank':   draw_enemy_tank,
    'enemy.fps':         draw_enemy_fps,
    'bot.br.0':          draw_bot_br_0,
    'bot.br.1':          draw_bot_br_1,
    'bot.br.2':          draw_bot_br_2,
    'minion.ally':       draw_minion_ally,
    'minion.enemy':      draw_minion_enemy,
    'dragon':            draw_dragon,
    'tower':             draw_tower,
    'crate.common':      draw_crate_common,
    'crate.rare':        draw_crate_rare,
    'crate.epic':        draw_crate_epic,
    'crate.legendary':   draw_crate_legendary,
    'grenade':           draw_grenade,
    'vfx.muzzle':        draw_vfx_muzzle,
    'vfx.skillshot':     draw_vfx_skillshot,
    'vfx.pickup':        draw_vfx_pickup,
}


# ---------- Packing ----------

def shelf_pack(sprites, atlas_w=256, pad=1):
    placements = []
    x, y, row_h = pad, pad, 0
    for slot, w, h, *_ in sprites:
        if x + w + pad > atlas_w:
            x = pad
            y += row_h + pad
            row_h = 0
        placements.append((slot, x, y, w, h))
        x += w + pad
        if h > row_h:
            row_h = h
    atlas_h = y + row_h + pad
    atlas_h = ((atlas_h + 31) // 32) * 32
    return placements, atlas_w, atlas_h


def make_placeholder(out_png, out_json):
    placements, aw, ah = shelf_pack(SLOTS)
    img = Image.new('RGBA', (aw, ah), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    manifest = {}
    spec_by_slot = {s[0]: s for s in SLOTS}
    for slot, x, y, w, h in placements:
        DRAW[slot](d, x, y)
        _, _, _, ax, ay = spec_by_slot[slot]
        manifest[slot] = {'x': x, 'y': y, 'w': w, 'h': h, 'ax': ax, 'ay': ay}
    img.save(out_png, optimize=True)
    with open(out_json, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'Wrote {out_png} ({aw}x{ah}) — {len(SLOTS)} procedural sprites')
    print(f'Wrote {out_json}')


def make_from_pngs(sprites_dir, out_png, out_json):
    placements, aw, ah = shelf_pack(SLOTS)
    img = Image.new('RGBA', (aw, ah), (0, 0, 0, 0))
    spec_by_slot = {s[0]: s for s in SLOTS}
    manifest = {}
    missing = []
    for slot, x, y, w, h in placements:
        path = os.path.join(sprites_dir, f'{slot}.png')
        if not os.path.exists(path):
            missing.append(slot)
            continue
        sprite = Image.open(path).convert('RGBA')
        if sprite.size != (w, h):
            sprite = sprite.resize((w, h), Image.NEAREST)
        img.paste(sprite, (x, y), sprite)
        _, _, _, ax, ay = spec_by_slot[slot]
        manifest[slot] = {'x': x, 'y': y, 'w': w, 'h': h, 'ax': ax, 'ay': ay}
    img.save(out_png, optimize=True)
    with open(out_json, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f'Wrote {out_png} ({aw}x{ah}) — {len(manifest)} slots packed')
    if missing:
        print(f'Skipped (missing PNGs in {sprites_dir}): {", ".join(missing)}')


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out_png = os.path.join(here, 'atlas.png')
    out_json = os.path.join(here, 'atlas.json')
    if '--placeholder' in sys.argv:
        make_placeholder(out_png, out_json)
    else:
        sprites_dir = os.path.join(here, 'sprites')
        if not os.path.isdir(sprites_dir):
            print(f'No sprites/ dir at {sprites_dir} — run with --placeholder, or '
                  'drop AI-generated PNGs into prototype/assets/sprites/ first.')
            sys.exit(1)
        make_from_pngs(sprites_dir, out_png, out_json)
