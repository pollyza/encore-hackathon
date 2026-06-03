# Kenney assets — CC0 / Public Domain

Used in the Roblox (Obby) art + audio overhaul. Everything below is Creative Commons
Zero (CC0 1.0 Universal): public domain, no attribution required, free for any use
including commercial / redistribution. This file is provenance courtesy, not a license
obligation — which is exactly why CC0 was chosen (GitHub-clean, zero license risk).

## Visual — Kenney "Platformer Pack Deluxe" (CC0)
- Official: https://kenney.nl/assets/platformer-pack-deluxe
- Pulled via mirror: https://github.com/yodaco/kenney-platformer-deluxe
- Files: `p1_*` (character: stand/jump/walk/hurt), `grass*/dirt*/snow*/stone*/castle*`
  ground tiles, `coinGold`, `gemBlue/Yellow`, `springboardUp`, `spikes`, `flag*`,
  `star`, `cloud1-3`, `bush`, `plant`

## Audio — Kenney "Digital Audio" (CC0)  →  assets/kenney/audio/
- Official: https://kenney.nl/assets/digital-audio
- Pulled via mirror: https://github.com/Boyquotes/kenney-digital-audio-for-godot
- Renamed by in-game role: `jump`←phaser_up_1 · `bigjump`←high_up · `pickup`←pep_sound_1
  · `oof`←low_down · `warn`←low_three_tone

CC0 deed: https://creativecommons.org/publicdomain/zero/1.0/

## Audio — Kenney "Sci-Fi Sounds" (CC0)  ->  assets/kenney/audio/{gta,ff}/
- Official: https://kenney.nl/assets/sci-fi-sounds  ·  mirror: https://github.com/Boyquotes/kenney-sci-fi-sounds-for-godot
- GTA: qDash from engine_circular · hit from explosion_crunch · shot from laser_large (cash/win/lose from Digital pep/power_up/low_down; tire screech stays synth)
- FF: shot/shotLow from laser_small/large · hit/rBlast/death from explosion_crunch · wHit/qDash from force_field · zone from Digital high_down · pickup/pickupRare/win/lose from Digital pep/power_up/low_down

## Audio realism pass (v2) — replaced sci-fi/arcade clips for GTA + FF
- OGA "The Free Firearm Sound Library" (CC0): real guns, trimmed to ~0.5s mono. GTA shot=1911 pistol; FF shot=AR-15, shotLow=Mossberg shotgun, rBlast=AK-47. https://opengameart.org/content/the-free-firearm-sound-library
- OGA "Car Sound Effects Pack" (CC0): GTA nitro = real car acceleration. https://opengameart.org/content/car-sound-effects-pack-low-quality
- Kenney "Impact Sounds" (CC0): GTA crash + FF hit = metal clang, FF wHit = wood, FF qDash/death = impacts. https://github.com/Boyquotes/kenney-impact-sounds-for-godot
- Kept (neutral, not sci-fi): cash/win/lose/pickup/zone from Kenney Digital. Roblox audio unchanged (user OK).

## Audio realism pass (v3) — layered + synthesized, spectrally verified (audio-verify.py)
- Root cause found: the CC0 "real" firearm recordings are dull tonal mid-pops (92% energy 250-2kHz, no crack/body); my earlier 22kHz trim also killed the high-freq crack. Objectively measured.
- Guns (GTA shot, FF shot/shotLow/rBlast): rebuilt PUBG-style at 44.1kHz = recording (body) + synthesized high-passed-noise CRACK + sub-bass thump + room tail. Verified broadband (flat 0.06-0.08, full low+mid+high).
- GTA crash + FF zone: fully synthesized (metal crunch+thud+debris ; storm rumble). No copyright.
- FF pickup/pickupRare/win/lose: Kenney Impact Sounds (CC0) grab/glass/bell/thud, replacing the digital synth blips.
- All synthesis original; all samples CC0. Roblox + GTA(non-crash) unchanged.
