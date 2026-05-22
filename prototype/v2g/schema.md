# V2G config schema

The single source of truth for what `observer.py` returns and what `encore_prototype.html` consumes. Change here first, code second.

## Top-level

```ts
type V2GResponse = {
  highlight: boolean;       // true if the frame contains a recognizable game-LIVE moment
  confidence: number;       // 0..1 — only act on highlight if >= CONFIDENCE_THRESHOLD (default 0.6, in streamer.html)
  template: TemplateKey;    // "fps" | "moba" | "br"
  theme: ThemeKey;          // see Themes section
  scenario: Scenario;
  _meta?: {
    tokens_in: number;
    tokens_out: number;
    model: string;
    cost_usd: number;       // optional, observer.py computes this
  };
};
```

## TemplateKey

```ts
type TemplateKey = "fps" | "moba" | "br";
```

| Template | Game module | When Vision should pick it |
|---|---|---|
| `fps` | `Games.fps` (Cover Strike) | First-person shooter LIVE (Valorant, CS, COD, R6, Apex first-person) |
| `moba` | `Games.moba` (Dragon Pit) | MOBA top-down LIVE (LoL, HoK, Dota, mobile MOBA) |
| `br` | `Games.br` (Final Circle) | Battle Royale LIVE (PUBG, Fortnite, Apex third-person) |

## ThemeKey (depends on template)

```ts
// 4 themes per template = 12 total
type FpsTheme  = "desert" | "snow" | "cyber" | "jungle";
type MobaTheme = "grass"  | "lava" | "ice"   | "twilight";
type BrTheme   = "forest" | "desert" | "island" | "wasteland";
```

Vision should match the dominant palette of the LIVE frame to the closest theme. If unclear, pass the closest match — the game will still render correctly.

## Scenario

```ts
type Scenario = {
  enemy_count?: number;     // 1..5, clamped — number of opposing units. Default per template.
  hp_start?: number;        // 10..100, clamped — player starting HP. Default 100.
  weapon?: WeaponKey;       // BR only — starting weapon rarity
  description?: string;     // ≤ 60 chars — human-readable summary, shown in mode badge
};

type WeaponKey = "pistol" | "smg" | "rifle" | "sniper";  // BR only
```

### Per-field overrides (`applyScenarioOverrides()` in `encore_prototype.html`)

- `enemy_count` → trims/extends `state.enemies` (FPS/MOBA) or `state.bots` (BR)
- `hp_start` → sets `state.player.hp` AND raises `state.player.maxHp` if needed
- `weapon` → BR only, maps to rarity: pistol=common, smg=rare, rifle=epic, sniper=legendary
- `description` → appended to the mode badge in HUD (first 30 chars, uppercased)

## Versioning

This schema is at **v1.0** (2026-05-22).

- v1.1+ candidate fields (not implemented): `time_of_day` (lighting tint), `audio_intensity` (tempo of FX), `winning_side` (which side did the highlight, for replay framing)
- Adding a field is non-breaking if the consumer treats it as optional
- Removing or renaming a field is breaking — bump to v2.0 and update both ends
