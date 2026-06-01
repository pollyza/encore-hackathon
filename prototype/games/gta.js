// ============================================================
//  GTA · HEIST RUN — 30s Subway-Surfers-style smash-and-grab runner
//  REWRITE v2 (marker: GTA_RUNNER_V2). Vertical top-down runner: the
//  player car is fixed low on screen, a 5-lane road scrolls bottom→top,
//  forward speed ramps over the round. Dodge moving traffic + static
//  roadblocks + chasing cops; pull into a shop's lane to rob (robber
//  pops out, grabs cash, hit-stop + screen punch). Survive the 30s run.
//
//  All feel constants live in TUNING (top). No magic numbers in logic —
//  change a number there, it takes effect everywhere.
//
//  Engine contract (window.Games.gta): name, badge, duration, showMP,
//  fxKey, pills, touchMode, skills(), init(), update(dt), draw(), refit().
//  Controls (engine 'runner' route, see encore_prototype.html onTouch*):
//    LEFT half  = floating joystick — Y up=accelerate / down=brake,
//                 X = steer (snap lane).
//    RIGHT half = tap = NITRO, horizontal swipe = change lane.
//
//  Obstacle shape (s.obstacles[i], also what the QA gate injects):
//    { wx, wy, lane:-2..2, type:'car'|'block', r, vy, w, color, hit }
//  Robbery signal for the gate: s._robberPop>0 + Juice._hitstop>0 on grab.
// ============================================================

(function bootGtaGame() {
  function engineReady() {
    return typeof window !== 'undefined'
        && typeof window.document !== 'undefined'
        && document.getElementById('game') != null
        && window.Iso && typeof window.bakeGround === 'function';
  }
  if (!engineReady()) return setTimeout(bootGtaGame, 50);

  // ─── TUNING — all feel constants (PRD-locked) ───────────────
  // wu = world unit. Screen scroll px/s ≈ wu/s × PXF (PXF≈1.864 on 430×932).
  const TUNING = {
    // ── speed ──
    baseSpeedWU:      195,   // cruise → ~363px/s at t=0 (old 100 → 186); fast enough that 爽感 doesn't read "grandpa"
    rampMul:          1.6,   // end-of-round speed multiplier (linear ramp)
    nitroMul:         1.8,   // nitro forward multiplier (stacks on throttle)
    throttleUpMul:    1.9,   // joystick full-up = accelerate
    throttleDnMul:    0.5,   // joystick full-down = brake (to dodge)
    robSlowMul:       0.4,   // forward slowdown while grabbing cash

    // ── camera follow (the WORLD scrolls via a steadily-advancing camera; the
    //    player moves WITHIN the frame by out-driving it with throttle. Keeping
    //    these DECOUPLED is what stops the whole map "jumping" when you push
    //    forward — the standard endless-runner camera). ──
    camNeutralFrac:   0.72,  // player's screen row at cruise (throttle = 1)
    camTopFrac:       0.46,  // highest row the player drives up to (full throttle)
    camBackFrac:      0.86,  // lowest row (braking)

    // ── lanes ──
    laneCount:        5,     // wider boulevard → real room to weave (was 3, "没得跑")
    laneMax:          2,     // lanes span -2..+2
    laneSnapWU:       520,   // lateral lerp speed → cross one lane in ~100ms
    laneSwipeThreshPx: 40,
    kbLaneCooldownS:  0.12,

    // ── body lunge (sells the surge) ──
    nitroLungePx:     34,    // car screen-y pop toward top on nitro
    nitroLungeDecay:  2.3,   // exp decay rate (1/s) — lunge stays ≥20px for ~0.2s
    boostHoldLiftPx:  14,    // sustained forward lift while boosting

    // ── nitro ──
    nitroDurationS:   2.0,
    nitroCount:       3,     // bursts per round
    nitroCooldownS:   6.0,

    // ── traffic / roadblocks (the dodge system) ──
    trafficIntervalS: 2.2,   // base gap between traffic spawns
    trafficRampCut:   0.45,  // interval shrinks up to this fraction as speed ramps
    trafficLaneBias:  0.55,  // P(spawn in player's current lane)
    trafficClosingMul: 0.30, // traffic drives forward at base×this (player overtakes)
    roadblockEveryS:  9.0,   // full roadblock cadence (blocks 2 lanes, leaves 1 open)
    roadblockQuietS:  1.6,   // suppress traffic this long after a block (keep open lane clear)
    trafficDmg:       25,

    // ── cops ──
    firstCopDelayS:   10.0,
    copIntervalS:     7.0,
    copSpeedMinWU:    200,   // > baseSpeed so chase closes; throttle-up (313) escapes
    copSpeedMaxWU:    240,
    copMaxActive:     3,
    copSpawnBehindWU: 90,
    copFireRangeWU:   280,
    copBulletSpeedWU: 260,
    copCollideDmg:    30,
    copBulletDmg:     12,
    copInvulnS:       1.2,

    // ── combat: shoot back & WASTE cop cars (干掉警车 = the GTA power high) ──
    copHp:            3,     // bullets to destroy a cruiser
    playerFireRateS:  0.28,  // auto drive-by fire cadence when a cop is behind
    playerBulletSpeedWU: 560,
    copKillReward:    260,   // $ per cruiser wasted (× the rampage multiplier)
    copFireBackRangeWU: 380, // auto-fire at cops within this far behind

    // ── wanted / heat (the GTA risk-reward chase loop) ──
    heatMax:          5,     // ★ cap
    heatPerRob:       1.5,   // stars added per heist
    heatPerCopHit:    0.6,
    heatPerSmash:     0.4,   // bulldozing a civilian car
    heatCalmDelayS:   3.0,   // no-crime time before heat starts dropping
    heatDecayPerS:    0.34,  // stars/sec lost while clean (evade)
    copRamHeat:       2.0,   // cops start ramming (steer into you) at this ★
    copRamAccelWU:    150,   // lateral ram acceleration toward player
    copsPerStar:      1.0,   // max active cops ≈ ceil(heat × this), 1..5
    copIntervalHeatCut: 0.5, // spawn interval shrinks this fraction at max heat
    evadeBonusPerStar: 150,  // $ paid out per ★ when you shake the cops

    // ── impact / knockback (make collisions FELT, not flat) ──
    copHitKnockWU:    230,   // lateral shove velocity on a cop slam
    copHitStunS:      0.35,  // steering stun after a slam (you fishtail)
    copHitstopS:      0.13,
    copHitTraumaBig:  26,
    smashKnockWU:     300,   // civilian car you bulldoze flies sideways this fast
    smashHpCost:      6,     // small HP cost to smash through (vs 25 to eat it)
    bigSlowmoS:       0.16,  // hitstop-as-slowmo on the big beats (rob / bust / evade)

    // ── robbery ──
    robWindowTiles:   2.0,   // ± shop forward window (× ws)
    robTimeS:         0.3,   // time to complete one grab (snappy)
    robberPopS:       0.9,   // gangster lean-out (head+gun+flash) visible this long after grab
    shopCountDefault: 4,
    // 抢店后被追 (random event #1, user-named): a guard chases — slower than your
    // throttle, gives up after a gap; catch = a bump, shake = relief + bonus.
    chaserSpeedWU:    205,
    chaserLifeS:      5.5,
    chaserDmg:        14,
    chaserGiveUpWU:   360,
    chaserBonus:      120,
    // 离谱追兵 KINDS (R8) — one chaser system, many absurd pursuers. All slower than
    // full throttle so you can ALWAYS outrun them (操作空间, never malice). label =
    // the shout bubble; fires = lobs a dodgeable projectile.
    chaserKinds: {
      clerk:   { speed: 210, dmg: 12, r: 0.32, body:'#d8c0a0', shirt:'#3a7ad0', label:'喂! 站住!',   fires:true,  fireCd:1.6, col:'#3a7ad0' },   // 店员持枪
      copFoot: { speed: 215, dmg: 14, r: 0.34, body:'#e8c0a0', shirt:'#16224a', label:'别跑!',       fires:true,  fireCd:1.8, col:'#2b6bff' },   // 警察徒步
      biker:   { speed: 235, dmg: 12, r: 0.34, body:'#e8c0a0', shirt:'#1a1a22', label:'给我等着!',    fires:false, fireCd:0,   col:'#39c06a' },   // 骑共享单车
      rpg:     { speed: 170, dmg: 26, r: 0.36, body:'#d8c0a0', shirt:'#5a4a2a', label:'吃我一炮!',    fires:true,  fireCd:2.6, col:'#ff6a3b' },   // 扛火箭筒(慢但狠,放冷炮可躲)
      owner:   { speed: 200, dmg: 8,  r: 0.32, body:'#e0b890', shirt:'#b03030', label:'你赔我车!',    fires:false, fireCd:0,   col:'#b03030' },   // 撞车车主挥扳手骂街
    },
    // 撒钱卡车 (random event #2, user-named): an armored truck spills a cash trail across lanes.
    cashFirstS:       4.0,    // R6: earlier — a 30s round should hit 2-3 events, not 0-1
    cashEveryS:       8.0,
    cashVal:          45,
    cashTrailN:       10,
    // 警车翻飞 (random event #3, user-named): a chasing cop randomly wipes out — comedic,
    // clears one cruiser + a little heat. Addresses "打警车/警车打我很无聊".
    copWipeChance:    0.012,  // per-second prob while chasing — RARE surprise (was 0.05: kept ★5 nearly cop-free, killed the high-heat tension the user wants). A flip is a delightful comedic beat, not a constant pressure valve.
    copWipeMinHeatGap: 6.0,   // a cop won't flip unless this long since the last flip (no chain-wipes that suppress the whole force)
    copWipeRelief:    0.3,    // ★heat shed when one flips (small — heat is the tension, don't bleed it fast)
    // 狂暴模式 (random event #4, user-named "变形/碾压"): rare glowing pickup → a few
    // seconds of smash-everything invincible rampage (abstract heavy-mode, no IP).
    tankFirstS:       12.0,   // R6: earlier
    tankEveryS:       17.0,
    tankDurS:         3.5,
    tankSmashReward:  60,
    // 直升机探照灯 (random event #5, user-named): at high heat a chopper sweeps a
    // spotlight across the road; staying IN the beam keeps you hot — dodge it. Chase张力.
    chopperHeat:      2.5,    // R6: lowered 3.5→2.5 so robbing 2 shops (★3) brings the chopper EVERY round — the GTA "🚁 出动了" escalation the user wants
    chopperSweepWU:   115,
    chopperBeamLanes: 0.9,
    chopperHeatRate:  0.22,
    // 爆胎漂移 (random event #6, user-named "开着开着爆胎"): a tyre blows → the car
    // drifts to one side & steering goes loose for a beat; counter-steer to save it
    // (操作空间, never an instant death). No damage — it's a skill check, not malice.
    tireFirstS:       8.0,    // R6: earlier
    tireEveryS:       15.0,   // avg gap between blowouts
    tireDriftS:       1.4,    // how long the drift lasts
    tireDriftWU:      230,    // sideways slide velocity during the blowout
    tireSteerCut:     0.18,   // snap authority is GUTTED during the drift so the slide actually carries the car (you FEEL it). Counter-steer = change lane → the car chases the new target as the drift eases.

    // ── 锁链拖 ATM (R8 · 速度与激情《8》梗): rob a shop → its safe/ATM is chained to
    //    your bumper, dragging behind with sparks. Tow it = bonus $ ticking up, but
    //    the car drags heavier (slight steer drag). Lasts a few s then the chain
    //    snaps → the safe bursts open in a cash explosion. ──
    towDurS:          4.5,    // how long you drag the loot before the chain snaps
    towSteerDrag:     0.82,   // lateral snap authority while towing (a touch heavier)
    towTickEveryS:    0.5,    // bonus $ cadence while towing
    towTickVal:       40,     // $ per tick
    towBurstVal:      300,    // $ when the safe finally bursts open

    // ── 整活彩蛋 (R8 · 脑壳疼级 meme): low-prob absurd one-offs — a chicken stampede
    //    crossing the road, a UFO buzzing over, a giant donut rolling down a lane.
    //    Pure spectacle; the chicken/donut are dodgeable nudges, never a cheap death. ──
    memeFirstS:       9.0,
    memeEveryS:       13.0,   // avg gap; still RARE enough to feel like a "刷到了哈哈" moment
    memeChickenN:     9,      // how many chickens stampede across

    // ── 爽感 / juice: a camera ZOOM-PUNCH on the big GTA power beats (waste a cop,
    //    shake the cops, deep rampage). A quick scale-in that eases back makes a
    //    kill feel WEIGHTY — the cinematic "卧槽好爽" the user is missing. ──
    zoomPunchAmt:     0.22,   // R9.2: peak extra scale (1.22×) on a big beat — user said the punch felt "一般", so HIT harder
    zoomPunchS:       0.40,   // R9.2: longer hold so the slam reads (was 0.32)

    // ── R10 屏震 = bounded TRAUMA model (was raw random jitter w/ no cap → "太晃很晕").
    //    pushShake adds trauma 0..1; screen offset = trauma² × maxPx (quadratic so small
    //    hits barely move, big hits punch then settle fast). Hard pixel cap kills the
    //    nausea from stacked events; hitstop carries the impact, not the shake. ──
    shakeMaxPx:       6,      // R12: cap 6px. Frequency is the fix (small events no longer shake),
    traumaDecayPerS:  2.6,    //      so the few REAL impacts can still punch without nausea.
    traumaSmall:      0.0,    // R12: small/frequent events NO LONGER shake (flash/sound instead — 降频)
    traumaMed:        0.55,   // R12: solid beats (WASTED cop, safe burst, blowout) → ~1.8px, felt but mild
    traumaBig:        0.90,   // R12: REAL collisions (car crash, cop slam, bust) → ~4.9px, a real punch

    // ── R10 难度曲线 (前松中紧末高潮). Speed/traffic/cop scale by a smoothstep over the
    //    round (see difficulty01); these extra knobs keep the INTRO gentle for a 小白. ──
    easyIntroS:       8.0,    // first 8s = onboarding zone: no roadblocks, sparser traffic, cops held off (firstCopDelayS)
    easyTrafficMul:   1.6,    // traffic gap widened up to ×(1+this) at t=0, easing to ×1 by easyIntroS

    // ── RAMPAGE combo (the arcade "keep the chain alive" addiction hook) ──
    comboWindowS:     4.0,   // chain expires if no rob/smash/near-miss within this
    comboCashStep:    0.5,   // each chain link adds this to the cash multiplier
    comboCashMax:     5.0,   // multiplier cap (×5 at a deep rampage)

    // ── feedback ──
    robHitstopS:      0.12,
    robTrauma:        18,    // local shake magnitude on grab
    copHitTrauma:     16,
    nearMissBonus:    50,
    nearMissPx:       [10, 30],

    // ── player / round ──
    hp:               100,
    durationS:        30,
    winMode:          'survive', // 'survive' (live to 30s) | 'reach' (drive to getaway)
    surviveFinishLeadS: 0.4,     // finish this early so engine TIME-UP (=lose) never fires
  };

  // ─── lazy global accessors ──────────────────────────────────
  function $ctx()    { return window.ctx; }
  function $W()      { return window.W || 360; }
  function $H()      { return window.H || 640; }
  function $state()  { return window.state; }
  function $setState(s){ try { window.state = s; } catch (_) {} }
  function $finish(won, sub) { if (window.finishGame) window.finishGame(won, sub); }
  function $pickTheme(k){ return window.pickTheme ? window.pickTheme(k) : null; }
  function $bakeGround(t, b, w, h){ return window.bakeGround(t, b, w, h); }
  function $modeBadge(){ return document.getElementById('mode-badge'); }
  function $scoreEl()  { return document.getElementById('score'); }
  function $Iso()      { return window.Iso; }
  function $keys()     { return window.keys || {}; }
  function $SFX()      { return window.SFX || {}; }
  function $J()        { return window.Juice || null; }

  // ─── color helpers ──────────────────────────────────────────
  function mix(hex, with_, t) {
    const h = hex.replace('#', ''), w = with_.replace('#', '');
    const r1 = parseInt(h.slice(0,2),16), g1 = parseInt(h.slice(2,4),16), b1 = parseInt(h.slice(4,6),16);
    const r2 = parseInt(w.slice(0,2),16), g2 = parseInt(w.slice(2,4),16), b2 = parseInt(w.slice(4,6),16);
    const r = Math.round(r1*(1-t)+r2*t), g = Math.round(g1*(1-t)+g2*t), b = Math.round(b1*(1-t)+b2*t);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  }
  const shade = (b, t) => mix(b, '#000000', t);
  const tint  = (b, t) => mix(b, '#ffffff', t);

  // ─── REGIONAL THEMES — every round is a visibly different GTA locale (the user
  //     wanted "每把不一样,一眼看出洛杉矶/迈阿密/纽约/墨西哥",招牌/警车/路边/配色
  //     因地制宜,戳到老玩家的怀旧点). Each region carries its full palette + a
  //     roadside `prop` style (palm/neon/skyscraper/cactus) + a place NAME. The
  //     low sun is kept (GTA cinematic) but tinted per region. ──
  const REGIONS = {
    losSantos: {
      name: 'LOS SANTOS', sub: '加州 · 黄昏大道', prop: 'palm',
      sky:'#ff8a4c', sky2:'#ffd79a', sun:'#fff0c0', sunGlow:'#ffd98a',
      road:'#37332e', roadEdge:'#f0c84a', offRoad:'#a98a5e',
      building:'#caa46a', buildingLit:'#e6c98c', palmTrunk:'#7a5a34', palmLeaf:'#2e7d3a',
      shopGlow:'#ff3b6b', car:'#c0392b', carGlass:'#bfe6ff',
      traffic:['#3f6fd0','#d8a32e','#e8e8e8','#2fa86a','#b03030'],
      cop:'#12161c', copGlass:'#2b7bff', copLight:['#ff2b2b','#2b6bff'],
      neonA:'#ff3b6b', neonB:'#ffd24a', bill:['#e23b6d','#3bb0e2','#f0c020','#7a4fd0','#ff6a3b'],
    },
    viceCity: {
      name: 'VICE CITY', sub: '迈阿密 · 霓虹海岸', prop: 'neon',
      sky:'#5b2a8c', sky2:'#ff79c8', sun:'#fff0a0', sunGlow:'#ff8ad6',
      road:'#2a2440', roadEdge:'#ff5fbf', offRoad:'#3a3060',
      building:'#3aa6c0', buildingLit:'#5ad6e0', palmTrunk:'#6a4a8a', palmLeaf:'#26c6a8',
      shopGlow:'#19e0e0', car:'#ff5fbf', carGlass:'#d0f5ff',
      traffic:['#19e0e0','#ff5fbf','#ffe14a','#a04fff','#ff8a3b'],
      cop:'#14123a', copGlass:'#19e0e0', copLight:['#ff2bd6','#19e0e0'],
      neonA:'#19e0e0', neonB:'#ff5fbf', bill:['#ff2bd6','#19e0e0','#ffe14a','#a04fff','#ff6ad6'],
    },
    libertyCity: {
      name: 'LIBERTY CITY', sub: '纽约 · 阴雨峡谷', prop: 'skyscraper',
      sky:'#3a4452', sky2:'#7b8a99', sun:'#c8d2dc', sunGlow:'#a8b6c4',
      road:'#24262b', roadEdge:'#c8b030', offRoad:'#3c4048',
      building:'#5a6470', buildingLit:'#7e8a98', palmTrunk:'#4a5058', palmLeaf:'#3a6a4a',
      shopGlow:'#ffb020', car:'#2a2e36', carGlass:'#aebccc',
      traffic:['#e8c020','#3a4250','#cdd4dc','#6a3030','#2a5a8a'],   // yellow cabs!
      cop:'#0c0e12', copGlass:'#2b7bff', copLight:['#ff2b2b','#2b6bff'],
      neonA:'#ffb020', neonB:'#5a8bff', bill:['#e8c020','#cdd4dc','#5a8bff','#b03030','#3aa06a'],
    },
    mexico: {
      name: 'BONITA', sub: '墨西哥 · 赤土烈日', prop: 'cactus',
      sky:'#ff9a3c', sky2:'#ffe0a0', sun:'#fff4d0', sunGlow:'#ffce80',
      road:'#4a3a30', roadEdge:'#e0a020', offRoad:'#c08a4a',
      building:'#d4884a', buildingLit:'#e6a86a', palmTrunk:'#7a5a34', palmLeaf:'#4a8a3a',
      shopGlow:'#ff6a3b', car:'#e07a2a', carGlass:'#ffe0b0',
      traffic:['#e07a2a','#3a8a5a','#e8d8c0','#b03030','#d0a020'],
      cop:'#1a1410', copGlass:'#3b7bff', copLight:['#ff2b2b','#ffce40'],
      neonA:'#ff6a3b', neonB:'#ffce40', bill:['#ff6a3b','#3a8a5a','#ffce40','#b03030','#e07a2a'],
    },
  };
  const REGION_KEYS = Object.keys(REGIONS);

  // Map an incoming themeKey (force_theme / pickTheme / a per-round pick) to a
  // region. Exact region key wins; then case-insensitive aliases; else rotate so
  // consecutive rounds look different.
  function pickRegionKey(themeKey) {
    if (REGIONS[themeKey]) return themeKey;                       // exact match (e.g. force_theme=viceCity)
    const lk = String(themeKey || '').toLowerCase();
    const byLower = REGION_KEYS.find(k => k.toLowerCase() === lk);
    if (byLower) return byLower;                                  // case-insensitive region key
    const alias = { vice:'viceCity', miami:'viceCity', vicecity:'viceCity',
      liberty:'libertyCity', ny:'libertyCity', newyork:'libertyCity', libertycity:'libertyCity',
      mexico:'mexico', bonita:'mexico', la:'losSantos', losantos:'losSantos', lossantos:'losSantos' };
    if (alias[lk] && REGIONS[alias[lk]]) return alias[lk];
    if (lk === 'night' || !lk) {                                  // generic/no theme → rotate each round
      window.__gtaRegionN = ((window.__gtaRegionN || 0) + 1) % REGION_KEYS.length;
      return REGION_KEYS[window.__gtaRegionN];
    }
    // any other unknown key → also rotate
    window.__gtaRegionN = ((window.__gtaRegionN || 0) + 1) % REGION_KEYS.length;
    return REGION_KEYS[window.__gtaRegionN];
  }

  function expandTheme(themeKey, base) {
    const rk = pickRegionKey(themeKey);
    const r = REGIONS[rk] || REGIONS.losSantos;
    return Object.assign({ key: rk, region: rk }, r);
  }

  // ─── vertical projection (player low, road scrolls up) ──────
  function gProj(s) {
    const Iso = $Iso(), W = $W(), H = $H(), p = s.player, ws = Iso.WS;
    const PXF = (H * 0.72) / 360;        // forward px per wu
    const PXW = (W * 0.96) / (6 * ws);   // lateral px per wu (wider road for 5 lanes)
    const CAM_SY = H * TUNING.camNeutralFrac;         // FIXED screen anchor — the world scrolls via camWY, never via the player's row
    const camWY = (s.camWY != null) ? s.camWY : (p ? p.wy : 0);
    return {
      ws, PXF, PXW, CAM_SY, camWY,
      sx: (wx) => W / 2 + (wx - s.roadCenterX) * PXW,
      sy: (wy) => CAM_SY - (wy - camWY) * PXF,        // anchored to the camera, not the player → no "whole map jumps" bug
    };
  }

  // ─── top-down car (player / cop / traffic) ──────────────────
  // Low-angle 2.5D car: a ground shadow + a raised body with a lit roof, darker
  // flanks, and a rounded shell — reads as a solid vehicle from a GTA-ish low
  // camera instead of a flat tile. Pure local draw (no projection change).
  function drawCarTopDown(c, sx, sy, w, body, glass) {
    sx = Math.round(sx); sy = Math.round(sy);
    const h = w * 1.7, rx = w*0.16;
    const rrect = (x,y,ww,hh,r) => { c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+ww,y,x+ww,y+hh,r); c.arcTo(x+ww,y+hh,x,y+hh,r); c.arcTo(x,y+hh,x,y,r); c.arcTo(x,y,x+ww,y,r); c.closePath(); };
    // ground shadow (offset down-right → implies a low sun / height)
    c.fillStyle = 'rgba(0,0,0,0.28)'; rrect(sx - w/2 + 2, sy - h/2 + 5, w, h, rx); c.fill();
    // dark flanks (the visible "sides" of the raised body)
    c.fillStyle = shade(body, 0.42); rrect(sx - w/2, sy - h/2, w, h, rx); c.fill();
    // top deck, inset → the lit roof sits above the flanks (the 2.5D pop)
    const inset = w*0.10;
    c.fillStyle = body; rrect(sx - w/2 + inset, sy - h/2 + inset*0.7, w - inset*2, h - inset*1.4, rx*0.7); c.fill();
    c.fillStyle = tint(body, 0.18); rrect(sx - w/2 + inset, sy - h/2 + inset*0.7, w - inset*2, h*0.18, rx*0.6); c.fill(); // roof sheen
    c.fillStyle = glass; c.fillRect(sx - w*0.30, sy - h*0.28, w*0.60, h*0.24);            // windshield (front=up)
    c.fillStyle = mix(body, '#000', 0.30); c.fillRect(sx - w*0.30, sy + h*0.08, w*0.60, h*0.20); // rear window
    c.fillStyle = '#fff6c0'; c.fillRect(sx - w*0.32, sy - h/2 + 1, w*0.18, 4); c.fillRect(sx + w*0.14, sy - h/2 + 1, w*0.18, 4); // headlights
  }

  // Input is fully handled by the engine 'runner' touch router (see
  // encore_prototype.html onTouch*): LEFT half = joystick → getMoveVec()
  // (Y throttle, X steer); RIGHT half = tap → onAction()=nitro, h-swipe →
  // onSwipe()=lane. No local pointer handler — a redundant one double-fired
  // nitro on vertical joystick drags.

  // ─── ramp: cruise speed multiplier grows 1.0 → rampMul over the round ─
  // R10 科学难度曲线 (前松→中紧→末高潮). 0..1 progress through the round mapped by a
  // gentle-start / accelerating-end ease (smootherstep-ish): the first ~8s stay easy so
  // a 小白 learns to drive + grab the first shop, then it climbs and peaks in the finale.
  function difficulty01(s) {
    const k = Math.min(1, (s.elapsed || 0) / TUNING.durationS);
    return k * k * (3 - 2 * k);                          // smoothstep: flat start, steep middle, eases into the peak
  }
  function rampFactor(s) {
    return 1 + (TUNING.rampMul - 1) * difficulty01(s);
  }

  // ─── spawners ───────────────────────────────────────────────
  function laneWX(s, lane) { return s.roadCenterX + lane * $Iso().WS; }

  // Each shop has a KIND → a recognisable pixel storefront (sign colour + icon +
  // facade) so a first-timer instantly reads "that's a shop with money to rob".
  const SHOP_KINDS = [
    { name: 'BANK',    icon: '🏦', sign: '#2e6bd0', wall: '#9fb4d8', accent: '#ffd24a' },
    { name: 'JEWELRY', icon: '💎', sign: '#16b5a8', wall: '#bfe6e2', accent: '#7af5e0' },
    { name: 'GOLD',    icon: '🪙', sign: '#e0a020', wall: '#e6cf9a', accent: '#fff0a0' },
    { name: 'LIQUOR',  icon: '🍾', sign: '#c0392b', wall: '#e0b0a8', accent: '#ff8a6b' },
    { name: 'PAWN',    icon: '💰', sign: '#7a4fd0', wall: '#cdbfe6', accent: '#d0b0ff' },
    { name: 'CASINO',  icon: '🎰', sign: '#d0246b', wall: '#e6b0c8', accent: '#ff7ab0' },
  ];
  function generateShops(count, ws, roadCenterX, startWY) {
    const shops = [];
    // Spread shops across the run. In survive mode the run is time-bounded, so
    // place them by forward distance from the start using the average ramp speed.
    const avgSpeed = TUNING.baseSpeedWU * (1 + TUNING.rampMul) / 2;
    const runWY = avgSpeed * TUNING.durationS * 0.92;   // forward distance covered in a round
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.45 : (i + 0.5) / count;   // 0.5..n-0.5 spread, first ~5s in
      const side = [-2, 2, -1, 1, -2, 1, 2, -1][i % 8];   // spread shops across the 5-lane road (skip center)
      const kind = SHOP_KINDS[i % SHOP_KINDS.length];
      shops.push({
        id: i, side, lane: side, kind,
        wy: startWY + 4 * ws + runWY * t,
        wx: laneWX({ roadCenterX }, side),                // shop sits in its lane (you rob from the lane)
        robbed: false, progress: 0,
        money: 250 + ((i * 137) % 4) * 80,                // deterministic 250/330/410/490 cycle
        name: kind.name,
        _isFirst: i === 0,                                // gets extra onboarding guidance
      });
    }
    return shops;
  }

  function spawnCop(s) {
    const lane = (Math.random() * (TUNING.laneMax * 2 + 1) | 0) - TUNING.laneMax;   // any of the 5 lanes
    return {
      wx: laneWX(s, lane), wy: s.player.wy - (TUNING.copSpawnBehindWU + Math.random() * 60),
      lane, r: $Iso().WS * 0.42,
      speed: TUNING.copSpeedMinWU + Math.random() * (TUNING.copSpeedMaxWU - TUNING.copSpeedMinWU),
      sirenPhase: Math.random() * Math.PI * 2, fireCd: 1.2, hp: TUNING.copHp,
    };
  }

  // 抢店后被追: a guard bursts out behind you on a scooter and chases for a few seconds.
  // spawnChaser(s, opts) — opts: { kind, wx, wy, banner }. kind picks the absurd
  // pursuer profile from TUNING.chaserKinds; falls back to a generic guard.
  function spawnChaser(s, opts) {
    opts = opts || {};
    const ws = $Iso().WS;
    const kind = opts.kind || 'clerk';
    const K = (TUNING.chaserKinds && TUNING.chaserKinds[kind]) || { speed: TUNING.chaserSpeedWU, dmg: TUNING.chaserDmg, r: 0.34, body:'#e8c0a0', shirt:'#3a3f4a', label:'站住!', fires:false, fireCd:0, col:'#ffca3a' };
    s.chasers.push({
      kind, wx: opts.wx != null ? opts.wx : s.player.wx,
      wy: opts.wy != null ? opts.wy : s.player.wy - ws * 2.5,
      r: ws * (K.r || 0.34), speed: K.speed, dmg: K.dmg, life: TUNING.chaserLifeS, hitCd: 0,
      fires: !!K.fires, fireCd: (K.fireCd || 1.6) * (0.6 + Math.random()*0.6),
      bob: Math.random() * Math.PI * 2, K,
    });
    const txt = opts.banner || ({ clerk:'🏪 店员拎枪追出来了!', copFoot:'🚓 警察弃车徒步追!', biker:'🚲 有人骑车追上来!', rpg:'🚀 扛火箭筒的来了! 躲冷炮', owner:'😡 车主下来追你了!' }[kind] || '🏃 有人追出来了!');
    if (window.showBanner) window.showBanner(txt, K.col || '#ffca3a', 1.2);
  }

  // 整活彩蛋: spawn one absurd meme. chicken=stampede across, ufo=buzzes over with a
  // tractor beam, donut=a giant pastry rolling down a lane (a dodgeable nudge).
  function spawnMeme(s, P) {
    const ws = P.ws, aheadWY = s.camWY + P.CAM_SY / P.PXF + ws * 2.5;
    const roll = Math.random();
    if (roll < 0.45) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const birds = [];
      for (let i = 0; i < TUNING.memeChickenN; i++) birds.push({ wx: s.roadCenterX - dir*(ws*3) + (Math.random()-0.5)*ws, wy: aheadWY + (Math.random()-0.5)*ws*2, ph: Math.random()*6 });
      s.meme = { kind: 'chicken', t: 4.0, dir, birds };
      if (window.showBanner) window.showBanner('🐔 一群鸡冲过马路!', '#ffd24a', 1.2);
    } else if (roll < 0.78) {
      s.meme = { kind: 'ufo', t: 4.5, x: s.roadCenterX, dir: Math.random()<0.5?1:-1, ph: 0 };
      if (window.showBanner) window.showBanner('🛸 那是个 UFO 吗?!', '#7af5e0', 1.4);
    } else {
      const lane = (Math.random() * (TUNING.laneMax*2+1) | 0) - TUNING.laneMax;
      s.meme = { kind: 'donut', t: 5.0, wx: laneWX(s, lane), wy: aheadWY, spin: 0 };
      if (window.showBanner) window.showBanner('🍩 巨型甜甜圈滚下来了!', '#ff9ad0', 1.3);
    }
    punchZoom(s, 0.08);
  }

  // 撒钱卡车: an armored truck spills a snaking trail of cash pickups across the lanes.
  function spawnCashTrail(s, P) {
    const ws = P.ws, baseWY = s.camWY + P.CAM_SY / P.PXF + ws * 2;
    let lane = (Math.random() * (TUNING.laneMax*2+1) | 0) - TUNING.laneMax;
    for (let i = 0; i < TUNING.cashTrailN; i++) {
      s.pickups.push({ wx: laneWX(s, lane), wy: baseWY + i * ws * 1.15, r: ws * 0.27, taken: false });
      if (Math.random() < 0.45) lane = Math.max(-TUNING.laneMax, Math.min(TUNING.laneMax, lane + (Math.random() < 0.5 ? -1 : 1)));
    }
    if (window.showBanner) window.showBanner('💸 撒钱卡车! 捡钱', '#ffd24a', 1.1);
  }

  // Pick a lane for traffic; bias toward the player's lane so the player must act.
  const ALL_LANES = () => { const a = []; for (let l = -TUNING.laneMax; l <= TUNING.laneMax; l++) a.push(l); return a; };
  function pickTrafficLane(s) {
    if (Math.random() < TUNING.trafficLaneBias) return s.player.playerLane;
    const others = ALL_LANES().filter(l => l !== s.player.playerLane);
    return others[(Math.random() * others.length) | 0];
  }

  function spawnTraffic(s, P) {
    const lane = pickTrafficLane(s);
    const ws = P.ws;
    const aheadWU = P.CAM_SY / P.PXF + ws * 1.5;        // just above the camera view-top → full reaction window
    s.obstacles.push({
      wx: laneWX(s, lane), wy: s.camWY + aheadWU, lane,
      type: 'car', r: ws * 0.40, vy: TUNING.baseSpeedWU * TUNING.trafficClosingMul,
      w: 0.62, color: s.theme.traffic[(s.trafficN++ ) % s.theme.traffic.length], hit: false,
    });
  }

  function spawnRoadblock(s, P) {
    const ws = P.ws;
    const lanes = ALL_LANES();
    const open = new Set(); while (open.size < 2) open.add(lanes[(Math.random() * lanes.length) | 0]);   // 2 lanes always stay open
    const aheadWU = P.CAM_SY / P.PXF + ws * 1.5;
    // R9.3 警匪花样: at high heat the roadblock becomes a SWAT BARRICADE — police
    // cruisers parked across lanes (block_swat) with light bars, not plain barrels.
    const swat = s.heat >= 3;
    for (const lane of lanes) {
      if (open.has(lane)) continue;
      s.obstacles.push({
        wx: laneWX(s, lane), wy: s.camWY + aheadWU, lane,
        type: 'block', swat, r: ws * 0.46, vy: 0, w: swat ? 1.0 : 0.92, color: swat ? (s.theme.cop || '#12161c') : '#caa23a', hit: false,
      });
    }
    s.trafficQuiet = TUNING.roadblockQuietS;     // keep the open lane clear briefly
    if (window.showBanner) window.showBanner(swat ? '🚧 SWAT 路障! 找空档冲' : '⚠ 前方路障', swat ? '#2b7bff' : '#ffcc44', 1100);
  }

  // ─── local particles / shake ────────────────────────────────
  function pushSpark(s, sx, sy, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
      s.sparks.push({ sx, sy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, life: 0.5 + Math.random()*0.3, color });
    }
  }
  function updateSparks(s, dt) {
    for (const sp of s.sparks) { sp.sx += sp.vx*dt; sp.sy += sp.vy*dt; sp.vy += 200*dt; sp.life -= dt; }
    s.sparks = s.sparks.filter(x => x.life > 0);
  }
  // R10: pushShake(s, mag) now feeds the bounded TRAUMA model. The legacy `mag`
  // (≈8..28) maps onto a trauma level so the ~18 existing call sites keep working
  // without edits: small <13, medium <20, big otherwise. Trauma accumulates (capped
  // at 1) and decays each frame; the draw step turns trauma² into a capped offset.
  function pushShake(s, mag) {
    const add = mag >= 20 ? TUNING.traumaBig : mag >= 13 ? TUNING.traumaMed : TUNING.traumaSmall;
    s.trauma = Math.min(1, (s.trauma || 0) + add);
  }
  // camera zoom-punch on big power beats (scale 1→1+amt→1, eased back) — the 爽感 hit
  function punchZoom(s, scale) { s._zoomT = TUNING.zoomPunchS; s._zoomAmt = (scale != null ? scale : TUNING.zoomPunchAmt); }

  // R12 中央大字通道: ONE managed event card at a time, at a fixed clean spot (clear of the
  // top HUD, the #banner at 30%, and the world floaters). Replaces the 13 scattered J.popup
  // calls that piled up at H*0.24-0.40 = "遮挡/bug感". A new toast replaces the old one.
  function gtaToast(s, text, color, big) {
    s.toast = { text, color: color || '#ffd24a', big: !!big, t: 1.1, t0: 1.1 };
  }
  function drawToast(c, W, H, s) {
    const to = s.toast; if (!to) return;
    const age = 1 - Math.max(0, Math.min(1, to.t / to.t0));
    const alpha = age < 0.12 ? age/0.12 : (1 - (age-0.12)/0.88);
    const scale = age < 0.14 ? 0.8 + 0.2*(age/0.14) : 1;
    const y = H * 0.52;                                  // fixed: below center car-zone, clear of #banner(30%) & HUD
    c.save(); c.globalAlpha = Math.max(0, Math.min(1, alpha));
    c.translate(W/2, y); c.scale(scale, scale);
    c.font = `bold ${to.big ? 22 : 17}px sans-serif`; c.textAlign='center'; c.textBaseline='middle';
    const w = c.measureText(to.text).width + 28, h = to.big ? 34 : 28;
    c.fillStyle = 'rgba(12,14,20,0.82)'; roundRectPath(c, -w/2, -h/2, w, h, 8); c.fill();
    c.strokeStyle = to.color; c.lineWidth = 1.5; roundRectPath(c, -w/2, -h/2, w, h, 8); c.stroke();
    c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(to.text, 0, 0);
    c.fillStyle = to.color; c.fillText(to.text, 0, 0);
    c.restore(); c.textAlign='left'; c.textBaseline='alphabetic';
  }
  function roundRectPath(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }

  // ─── wanted / heat: the escalate→evade risk-reward loop ─────
  function addHeat(s, amt) {
    const before = Math.ceil(s.heat - 1e-6);
    s.heat = Math.min(TUNING.heatMax, s.heat + amt);
    s.heatCalmT = 0;                                 // any crime resets the calm timer
    const now = Math.ceil(s.heat - 1e-6);
    s.stars = now;
    if (now > before) {                              // a new ★ → fanfare (R12: no shake, flash+hitstop only)
      s._heatFlashT = 0.5;
      const J = $J(); if (J) { J.hitstop(0.08); J.flash('#ff2b2b', 80); }
      gtaToast(s, '★'.repeat(now) + ' 通缉升级', '#ff3b3b', true);   // R12: 中央通道
      // (engine siren muted — its tone read as "难听"; chase tension is carried by
      //  the proximity heartbeat overlay instead. A cleaner siren can be synthesised later.)
    }
  }
  function updateHeat(s, dt) {
    if (s.heat <= 0) return;
    s.heatCalmT += dt;
    if (s.heatCalmT < TUNING.heatCalmDelayS) return;  // still "hot" — cops keep coming
    const before = Math.ceil(s.heat - 1e-6);
    s.heat = Math.max(0, s.heat - TUNING.heatDecayPerS * dt);
    s.stars = Math.ceil(s.heat - 1e-6);
    if (s.heat <= 0) {                                // SHOOK THE COPS → payoff
      const bonus = TUNING.evadeBonusPerStar * before;
      s.cash += bonus; s._evadeT = 1.4;
      const J = $J(); if (J) { J.confetti($W()); J.hitstop(0.14); }
      gtaToast(s, '甩掉警察! +$' + bonus, '#5af5e0', true);   // R12: 中央通道
      pushShake(s, 10); punchZoom(s, 0.10);                 // 爽感: the "got away" relief beat
      try { if (window.stopSiren) window.stopSiren(); } catch (_) {}
      if (window.showBanner) window.showBanner('🏁 WANTED EVADED · +$' + bonus, '#5af5e0', 1.2);
    }
  }
  // active-cop budget grows with the wanted level (★1≈1-2 cars, ★5≈5)
  function copBudget(s) { return Math.max(1, Math.min(TUNING.heatMax, Math.ceil(s.heat * TUNING.copsPerStar))); }

  // ── clean two-tone police siren, synthesised here (the engine's was "难听").
  //    Fully guarded: ANY audio failure is a silent no-op, never a console error
  //    and never a regression (worst case = no siren, same as muted). ──
  let _siren = null, _sirenInit = false;
  function siren() {
    if (_sirenInit) return _siren;
    _sirenInit = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return (_siren = null);
      const ctx = new AC();
      const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
      // Focused band-pass "wail" (the old sawtooth+lowpass read as a buzzy moan = 难听).
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 950; bp.Q.value = 4.5; bp.connect(gain);
      const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 900; osc.connect(bp);   // smoother carrier than saw
      const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 900; osc2.detune.value = 7; osc2.connect(bp); // a little body
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.7;   // wail sweep (sped up by proximity in sirenVol)
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 240; lfo.connect(lfoGain); lfoGain.connect(osc.frequency); lfoGain.connect(osc2.frequency);
      osc.start(); osc2.start(); lfo.start();
      _siren = { ctx, gain, lfo };
    } catch (_) { _siren = null; }
    return _siren;
  }
  // v = loudness (0..~0.08, driven by heat+proximity). prox = 0..1 nearest-cop
  // closeness. Real US siren escalation: a slow WAIL when cops are distant →
  // snaps to a fast YELP/chirp when one is right behind you (that's the 紧张感).
  function sirenVol(v, prox) {
    try { const s2 = siren(); if (!s2) return; if (s2.ctx.state === 'suspended') s2.ctx.resume();
      const vol = Math.max(0, Math.min(0.085, v));
      s2.gain.gain.setTargetAtTime(vol, s2.ctx.currentTime, 0.10);
      if (s2.lfo) {
        const p = Math.max(0, Math.min(1, prox == null ? (vol / 0.08) : prox));
        // wail ~0.7Hz when far → yelp ~4.5Hz when point-blank (non-linear ramp so
        // the "they're ON me" panic hits late and hard)
        const rate = 0.7 + Math.pow(p, 1.6) * 4.0;
        s2.lfo.frequency.setTargetAtTime(rate, s2.ctx.currentTime, 0.18);
      } } catch (_) {}
  }

  // RAMPAGE combo: every rob / smash / near-miss links the chain and refreshes
  // its window; the chain drives a cash multiplier and a big on-screen RAMPAGE
  // call. Getting hit (cop/traffic) breaks it — that's the risk in the reward.
  function comboMul(s) { return Math.min(TUNING.comboCashMax, 1 + (s.robCombo || 0) * TUNING.comboCashStep); }
  function bumpCombo(s) {
    s.robCombo = (s.robCombo || 0) + 1;
    s.comboT = TUNING.comboWindowS;
    s.comboBest = Math.max(s.comboBest || 0, s.robCombo);
    const c = s.robCombo;
    if (c === 3 || c === 5 || c === 8 || c === 12) {           // milestone fanfare
      s._comboFlashT = 0.6; if (c >= 5) punchZoom(s, 0.08 + Math.min(0.06, c*0.004));   // deeper rampage → bigger punch
      const J = $J(); if (J) { J.hitstop(0.05); J.flash(c >= 8 ? '#ff3bd6' : '#ffd24a', 60);
        J.popup((c >= 12 ? '🔥 UNREAL' : c >= 8 ? '🔥 INSANE' : c >= 5 ? '🔥 RAMPAGE' : '连击') + ' ×' + c, $W()/2, $H()*0.40, { color: c >= 8 ? '#ff3bd6' : '#ffd24a', size: 26, dur: 0.9 }); }
    }
  }

  // ─── module ─────────────────────────────────────────────────
  window.Games = window.Games || {};
  window.Games.gta = {
    name: 'GTA · HEIST RUN',
    badge: 'GTA',
    duration: TUNING.durationS,
    showMP: false,
    fxKey: 'gta',
    pills: { weapon: false, kit: false },   // GTA draws its own canvas HUD; the engine green kit-pill sat top-right ON TOP of COPS
    touchMode: 'runner',

    onSwipe(dir) {
      const s = $state(); if (!s || !s.player) return;
      const p = s.player;
      // R9 analog: a right-half swipe is a discrete one-lane nudge → set the lane target
      // and switch to lane-mode so the car glides there (analog joystick overrides next frame).
      const base = (p.targetLane != null) ? p.targetLane : p.playerLane;
      p.targetLane = dir === 'right' ? Math.min(TUNING.laneMax, base + 1) : Math.max(-TUNING.laneMax, base - 1);
      s._steerMode = 'lane'; s._analogX = null;
      p._lastInputT = s.elapsed;
      const SFX = $SFX(); try { if (SFX.screech) SFX.screech(); } catch (_) {}
    },
    onAction() { if (this.castPress) this.castPress('q'); },                 // tap (release-timed) path — kept as fallback
    onActionDown() { if (this.castPress) this.castPress('q'); },             // fire-on-press → nitro works while steering thumb is down

    skills() { return [ { key: 'q', ico: '⚡', label: '氮气', color: '#00f0ff' }, null, null, null ]; },

    init() {
      const cfgScenario = (window.pendingConfig && window.pendingConfig.scenario) || {};
      const themeFromConfig = (window.pendingConfig && window.pendingConfig.theme) || null;
      const shopCount = Math.max(1, Math.min(8, (cfgScenario.shop_count ?? TUNING.shopCountDefault) | 0));
      const copRate   = Math.max(0.0, Math.min(2.0, +cfgScenario.cop_spawn_rate || 1.0));

      const picked = $pickTheme('gta');
      // Region selection: an explicit ?region= or ?force_theme= naming a region wins
      // (for testing a specific locale); otherwise rotate each round so every play
      // looks like a different city. The engine's theme gate only knows night/rain/
      // snow, so we read the raw URL param ourselves to reach the GTA regions.
      let regionParam = null;
      try { const u = new URLSearchParams(location.search); regionParam = u.get('region') || u.get('force_theme'); } catch (_) {}
      const themeKey = regionParam || themeFromConfig || (picked && picked.name) || 'night';
      const baseTheme = (picked && picked.theme) || { sky:'#0a0d1a', sky2:'#1a1d28', ground:'#1e2230', accent:'#ff2bd6', wall:'#2a2e3c' };
      const theme = expandTheme(themeKey, baseTheme);

      // Weather physics modifier (kept from v1): rain=slick, snow=heavy drag.
      const weatherMod = (() => {
        switch (themeKey) {
          case 'rain':      return { fwd: 0.96, laneSpeed: 0.78, label: 'SLICK',  affect: 'rain' };
          case 'snownight': return { fwd: 0.90, laneSpeed: 0.70, label: 'HEAVY',  affect: 'snow' };
          default:          return { fwd: 1.00, laneSpeed: 1.00, label: 'CLEAR',  affect: null };
        }
      })();

      const badge = $modeBadge();
      if (badge) badge.textContent = this.badge + ' · ' + (theme.name || themeKey.toUpperCase()) + ' · R12a';   // shows the region + build stamp
      // place-name intro → "this round is somewhere NEW" (the GTA locale reveal)
      try { if (window.showBanner) window.showBanner('📍 ' + theme.name + ' · ' + theme.sub, theme.neonB || '#ffd24a', 1.8); } catch (_) {}

      // NITRO button → BOTTOM-RIGHT thumb arc (user-chosen R6). The shared #skills
      // box is sized for 4 keys (180px) with #s-q pinned bottom-left → on GTA's
      // single key that landed mid-screen and felt off. Here: shrink the box to one
      // button, drop it into the bottom-right thumb arc, enlarge #s-q to 76px, and
      // KILL the engine DOM pills (green kit-pill sat top-right on top of COPS).
      try {
        const sk = document.getElementById('skills');
        if (sk) {
          sk.style.width = '86px'; sk.style.height = '86px';
          sk.style.bottom = 'calc(16% + env(safe-area-inset-bottom, 0px))';
          sk.style.right = 'calc(14px + env(safe-area-inset-right, 0px))';
        }
        const q = document.getElementById('s-q');
        if (q) { q.style.top = 'auto'; q.style.left = 'auto'; q.style.bottom = '0'; q.style.right = '0';
                 q.style.width = '76px'; q.style.height = '76px'; q.style.fontSize = '15px'; }
        const pills = document.getElementById('pills'); if (pills) pills.style.display = 'none';
        // R9.1: make the steering joystick BIGGER + actually VISIBLE (user: "摇杆太小/看不到").
        // Bigger ring = more travel room (helps the 断触 feel too); brighter so the thumb finds it.
        const joy = document.getElementById('joy');
        if (joy) { joy.style.width = '150px'; joy.style.height = '150px';
          joy.style.background = 'rgba(255,255,255,0.10)'; joy.style.border = '3px solid rgba(255,255,255,0.40)'; }
        const knob = document.getElementById('joy-knob');
        if (knob) { knob.style.width = '70px'; knob.style.height = '70px'; knob.style.margin = '-35px 0 0 -35px';
          knob.style.background = 'rgba(90,245,224,0.55)'; knob.style.border = '3px solid #5af5e0'; }
      } catch (_) {}

      // Iso tile sizing only feeds ws (world step) for the vertical projection +
      // the vestigial bg bake (the vertical renderer draws its own road/scenery).
      const Iso = $Iso();
      const fitForGta = () => {
        const usableW = Math.max(200, $W() - 32);
        let TW = Math.max(20, Math.min(60, usableW / 7));
        let TH = Math.max(10, Math.min(38, TW * 0.55));
        Iso.setTile(TW, TH, 40);
      };
      fitForGta();
      const ws = Iso.WS;

      // Minimal iso ground so the interface contract (state.bg/tiles/blocks/_fit)
      // holds and refit() can rebake. NOT drawn by the vertical renderer.
      const mapW = 9, mapH = 24;
      const roadCenterTileI = Math.floor(mapW / 2);
      const roadCenterX = roadCenterTileI * ws + ws / 2;
      const tiles = [];
      for (let j = 0; j < mapH; j++) {
        const row = [];
        for (let i = 0; i < mapW; i++) {
          const onRoad = Math.abs(i - roadCenterTileI) <= 1;
          row.push(onRoad ? theme.road : theme.offRoad);
        }
        tiles.push(row);
      }
      const blocks = [];
      const bg = $bakeGround(tiles, blocks, mapW, mapH);

      const player = {
        wx: roadCenterX, wy: 2 * ws, targetX: roadCenterX, playerLane: 0, targetLane: 0,
        speed: TUNING.baseSpeedWU, hp: TUNING.hp, maxHp: TUNING.hp,
        r: ws * 0.30, boostT: 0, boostsLeft: TUNING.nitroCount, invulnT: 0,
        _kbCooldown: 0, _lunge: 0, _autoIdle: 0, _lastInputT: -99, _knock: 0, _stunT: 0,
        _robbing: false, _robSide: 0, _robberPop: 0, _tireT: 0, _tireDir: 0,
      };

      const halfRoadW = TUNING.laneMax * ws + ws * 0.4;
      const startWY = player.wy;

      const newState = {
        // contract
        mapW, mapH, bg, tiles, blocks, theme, themeName: themeKey.toUpperCase(),
        weatherMod, _fit: fitForGta,
        // game
        gtaActive: true, themeKey, copRate,
        roadCenterX, roadCenterTileI,
        latLeft: roadCenterX - halfRoadW, latRight: roadCenterX + halfRoadW,
        routeLengthWU: TUNING.baseSpeedWU * TUNING.durationS * 1.15,   // used only by winMode 'reach'
        elapsed: 0,
        camWY: player.wy,        // camera starts level with the player → player sits at the neutral row
        heat: 0, heatCalmT: 0, stars: 0, smashes: 0,   // wanted level / chaos
        _heatFlashT: 0, _evadeT: 0, robCombo: 0, comboT: 0, comboBest: 0, _comboFlashT: 0,
        _everManual: false, _autoCd: 0, _kbLeftPrev: false, _kbRightPrev: false,
        player,
        shops: generateShops(shopCount, ws, roadCenterX, startWY),
        obstacles: [], trafficN: 0, trafficAcc: 0, trafficQuiet: 0, roadblockAcc: 0,
        cops: [], copBullets: [], playerBullets: [], copSpawnAcc: 0, copCount: 0, copsMaxActive: TUNING.copMaxActive,
        chasers: [],   // 抢店后被追
        pickups: [], cashAcc: 0, cashNextS: TUNING.cashFirstS,   // 撒钱卡车
        powerups: [], tankAcc: 0, tankNextS: TUNING.tankFirstS,   // 狂暴模式
        chopper: null,   // 直升机探照灯
        tireAcc: 0, tireNextS: TUNING.tireFirstS,   // 爆胎漂移
        floaters: [], sparks: [], _engineOn: false, _speedLinesT: 0,
        shakeT: 0, shakeMag: 0, trauma: 0, robCombo: 0, _zoomT: 0, _zoomAmt: 0,
        tow: null, towAcc: 0,   // 锁链拖 ATM
        meme: null, memeAcc: 0, memeNextS: TUNING.memeFirstS,   // 整活彩蛋
        toast: null,   // R12 中央大字通道: one managed event card at a time (no overlap/bug感)
        kills: 0, cash: 0, robbedCount: 0, bots: [],
        skills: { q: { cd: TUNING.nitroCooldownS, _cd: 0 } },
        _autoDisable: false,   // QA hook: deterministic dodge test
      };
      $setState(newState);
    },

    castPress(k) {
      const s = $state(); if (!s || !s.gtaActive) return;
      if (k !== 'q') return;
      const p = s.player;
      p._lastInputT = s.elapsed;                 // a nitro tap counts as input (holds off autopilot)
      if (s.skills.q._cd > 0 || p.boostsLeft <= 0) return;
      p.boostsLeft -= 1;
      p.boostT = Math.max(p.boostT, TUNING.nitroDurationS);
      p._lunge = TUNING.nitroLungePx;             // visible body lunge (gate #4)
      s.skills.q._cd = s.skills.q.cd;
      const P = gProj(s);
      pushSpark(s, P.sx(p.wx), P.sy(p.wy) + 16, s.theme.neonB, 26);
      s._speedLinesT = 1.5;   // R12: nitro = lunge+sparks+speedlines, no shake (not an impact)
      const J = $J(); if (J) { J.flash('#bff7ff', 60); }
      if (window.showBanner) window.showBanner('⚡ NITRO!', '#00f0ff', 0.7);
      const SFX = $SFX(); try { if (SFX.qDash) SFX.qDash(); } catch (_) {}
    },
    castRelease() {},

    update(dt) {
      const s = $state(); if (!s || !s.gtaActive) return;
      const p = s.player;
      const Iso = $Iso(), ws = Iso.WS;
      const P = gProj(s);

      s.elapsed += dt;
      if (s._speedLinesT > 0) s._speedLinesT = Math.max(0, s._speedLinesT - dt);
      if (s.trafficQuiet > 0) s.trafficQuiet = Math.max(0, s.trafficQuiet - dt);
      if (s._heatFlashT > 0) s._heatFlashT = Math.max(0, s._heatFlashT - dt);
      if (s._evadeT > 0) s._evadeT = Math.max(0, s._evadeT - dt);
      if (s._zoomT > 0) s._zoomT = Math.max(0, s._zoomT - dt);
      if (s.toast && (s.toast.t -= dt) <= 0) s.toast = null;   // R12 中央通道倒计时
      if (s._comboFlashT > 0) s._comboFlashT = Math.max(0, s._comboFlashT - dt);
      if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.robCombo = 0; }   // RAMPAGE chain expires if you stop chaining
      updateHeat(s, dt);                                   // wanted-level decay → evade payoff
      Object.values(s.skills).forEach(sk => { if (sk._cd > 0) sk._cd = Math.max(0, sk._cd - dt); });

      // ── input: joystick Y = throttle (this drives the car forward WITHIN the
      //    frame via fwdSpeed + the camera below), X = steer lanes. A lane only
      //    flips on a clearly SIDEWAYS push (|x| > |y|) so driving forward no
      //    longer wobbles the car left/right. ──
      let manualInput = false;
      let throttle = 1.0;
      if (typeof window.getMoveVec === 'function') {
        const mv = window.getMoveVec(), mvy = mv.y || 0, mvx = mv.x || 0;
        throttle = mvy < 0 ? (1 + (-mvy) * (TUNING.throttleUpMul - 1)) : (1 - mvy * (1 - TUNING.throttleDnMul));
        if (Math.abs(mvy) > 0.15) manualInput = true;
        // Lane steer: ONE lane per clear sideways push, edge-latched. You CAN steer
        // while accelerating (the old "sideways must beat forward" gate made holding
        // up+right feel like the wheel was stuck = 便秘). Hysteresis (STEER>RESET) so a
        // steady diagonal push never wobbles — it's strictly one-lane-per-press.
        // R8.1: thresholds LOWERED (0.55→0.40) so a natural thumb push — even a
        // diagonal one while accelerating up — reliably flips the lane. The old
        // 0.55 ate gentle sideways intent → felt "断触/便秘" (user feedback). Still
        // edge-latched w/ hysteresis (STEER>RESET) so a held push = ONE lane, no wobble.
        // R9 ANALOG STEER: the joystick's sideways position maps DIRECTLY to where the
        // car sits across the road — push half-right, sit half-right; slam full-left,
        // glide to the far-left lane in one motion; rest between lanes. This is the
        // "从最左滑到最右、灵活" feel the user asked for (replaces the old one-lane-per-
        // push latch that felt 便秘). Keyboard a/d (web, no analog axis) keeps a clean
        // one-lane-per-press step so the web build still has discrete control.
        const K = $keys();
        const kbLeft = !!(K['a'] || K['arrowleft']), kbRight = !!(K['d'] || K['arrowright']);
        if (kbLeft || kbRight) {                                   // KEYBOARD = discrete step, edge-latched
          if (kbRight && s._kbLatch !== 'right') { p.targetLane = Math.min(TUNING.laneMax, (p.targetLane ?? 0) + 1); s._kbLatch = 'right'; manualInput = true; }
          else if (kbLeft && s._kbLatch !== 'left') { p.targetLane = Math.max(-TUNING.laneMax, (p.targetLane ?? 0) - 1); s._kbLatch = 'left'; manualInput = true; }
          s._steerMode = 'lane'; s._analogX = null;
        } else {
          s._kbLatch = null;
          const DZx = 0.12;
          if (Math.abs(mvx) > DZx) {                               // JOYSTICK = analog position
            s._analogX = Math.max(-1, Math.min(1, (mvx - Math.sign(mvx)*DZx) / (1 - DZx)));
            s._steerMode = 'analog'; manualInput = true;
          }
          // else: stick centered → HOLD current car position (no auto-recenter; targetX below keeps p.wx)
        }
        if (Math.abs(mvy) > 0.15) manualInput = true;
      }
      // NOTE: keyboard a/d/←/→ and ↑/↓ are ALREADY folded into getMoveVec() by
      // ── NO autopilot. With no input the car holds its current lateral position —
      // what you do is what happens, nothing auto-dodges/auto-robs/auto-recenters. ──
      if (manualInput) { p._lastInputT = s.elapsed; s._everManual = true; }

      // ── lateral target: ANALOG (joystick maps to a road x-position) OR LANE (keyboard
      //    steps to a discrete lane). Either way we drive p.wx toward a target; the car
      //    glides there so a full-tilt push slides all the way across in one motion. ──
      const halfRoad = TUNING.laneMax * ws;                       // far-lane center offset from road center
      if (s._steerMode === 'analog' && s._analogX != null) {
        p.targetX = s.roadCenterX + s._analogX * halfRoad;        // direct: stick position → car position
      } else {
        p.targetX = laneWX(s, p.targetLane ?? 0);                 // keyboard discrete lane
      }
      if (p._stunT > 0) p._stunT = Math.max(0, p._stunT - dt);
      const snapMul = (p._stunT > 0 ? 0.25 : (p._tireT > 0 ? TUNING.tireSteerCut : 1)) * (s.tow ? TUNING.towSteerDrag : 1);   // stun / blowout / towing-a-safe steer drag
      const latDelta = p.targetX - p.wx;
      const latStep = Math.sign(latDelta) * Math.min(Math.abs(latDelta), TUNING.laneSnapWU * s.weatherMod.laneSpeed * snapMul * dt);
      p.wx += latStep;
      if (p._knock) { p.wx += p._knock * dt; p._knock *= Math.max(0, 1 - 6 * dt); if (Math.abs(p._knock) < 8) p._knock = 0; }
      // playerLane is now a DERIVED quantity — the nearest lane to the car's real x —
      // used only by the HUD + rob/collision proximity checks below.
      p.playerLane = Math.max(-TUNING.laneMax, Math.min(TUNING.laneMax, Math.round((p.wx - s.roadCenterX) / ws)));
      p.wx = Math.max(s.latLeft - ws, Math.min(s.latRight + ws, p.wx));   // allow a little off-lane overshoot on a slam

      // ── body lunge decay (exp; held ~0.2s so the surge reads) ──
      if (p._lunge > 0) p._lunge = Math.max(0, p._lunge - p._lunge * TUNING.nitroLungeDecay * dt);
      if (p._robberPop > 0) p._robberPop = Math.max(0, p._robberPop - dt);

      // ── forward motion (ramp × throttle × nitro × weather × rob-slow) ──
      const boosting = p.boostT > 0;
      if (boosting) p.boostT -= dt;
      const rf = rampFactor(s);
      const robSlow = p._robbing ? TUNING.robSlowMul : 1.0;
      const fwdSpeed = TUNING.baseSpeedWU * rf * throttle * (boosting ? TUNING.nitroMul : 1.0) * s.weatherMod.fwd * robSlow;
      p.wy += fwdSpeed * dt;
      p._robbing = false;
      s._ramp = rf; s._fwdSpeed = fwdSpeed; s._throttle = throttle;   // observability for the QA gate

      // ── camera: advances STEADILY (throttle-independent) so the world scrolls
      //    smoothly; the player rises/sinks within the frame by out-driving it.
      //    Camera only catches up when the player tops out (= fast feel, no jump). ──
      const Hc = $H(), PXFc = (Hc * 0.72) / 360;
      const worldScroll = TUNING.baseSpeedWU * rf * s.weatherMod.fwd;
      s.camWY += worldScroll * dt;
      const leadMax = (TUNING.camNeutralFrac - TUNING.camTopFrac) * Hc / PXFc;   // furthest forward (top of screen)
      const leadMin = (TUNING.camNeutralFrac - TUNING.camBackFrac) * Hc / PXFc;  // furthest back (negative)
      const lead = p.wy - s.camWY;
      if (lead > leadMax) s.camWY = p.wy - leadMax;        // topped out → camera keeps pace (world rushes, smoothly)
      else if (lead < leadMin) p.wy = s.camWY + leadMin;   // bottomed out → hold player on screen
      s._lead = p.wy - s.camWY;                            // observability: how far forward the player is driving

      // ── shops: lane-gated grab → robber pop + cash + hit-stop + punch ──
      const HOVER_FWD = ws * TUNING.robWindowTiles;
      for (const shop of s.shops) {
        if (shop.robbed) continue;
        const dyw = Math.abs(shop.wy - p.wy);
        if (Math.abs(shop.wx - p.wx) < ws * 0.6 && dyw < HOVER_FWD) {   // R9 analog: rob when the car's real x is within the shop's lane band
          p._robbing = true; p._robSide = shop.side;
          shop.progress = Math.min(1, shop.progress + dt / TUNING.robTimeS);
          if (shop.progress >= 1) {
            shop.robbed = true; s.robbedCount += 1; s.kills = s.robbedCount;
            if (shop._isFirst) s._firstHintDone = true;                     // first heist done → retire the onboarding hint
            bumpCombo(s); p._robberPop = TUNING.robberPopS;                 // chain the rampage
            const mul = comboMul(s), gain = Math.round(shop.money * mul); s.cash += gain;   // chain → bigger payout
            addHeat(s, TUNING.heatPerRob);                 // 干坏事 → wanted level climbs
            spawnChaser(s, { kind: 'clerk', wx: shop.wx, wy: s.player.wy - $Iso().WS * 2.5 });   // 抢完店 → 店员拎枪追出来
            // 锁链拖 ATM (速度与激情梗): chain the shop's safe/ATM to your bumper. BANK/ATM
            //   shops drag a vault; others a cash crate. Replaces any prior tow.
            s.tow = { t: TUNING.towDurS, kind: (shop.kind && /BANK|GOLD|PAWN/.test(shop.kind.name)) ? 'safe' : 'crate', col: (shop.kind && shop.kind.sign) || '#caa46a', wx: p.wx, wy: p.wy - ws * 1.6 };
            s.towAcc = 0;
            punchZoom(s, 0.10);
            if (window.showBanner) window.showBanner('⛓️ 保险箱拴车上了! 拖着跑!', '#ffd24a', 1.3);
            pushShake(s, TUNING.robTrauma);
            const px = P.sx(shop.wx), py = P.sy(shop.wy);
            for (let i = 0; i < 5; i++) pushSpark(s, px + (Math.random()-0.5)*24, py + (Math.random()-0.5)*24, '#ffd24a', 26);
            s.floaters.push({ wx: shop.wx, wy: shop.wy, text: '💰 +$' + gain, color: '#ffd24a', life: 1.3 });
            const J = $J();
            if (J) { J.hitstop(TUNING.bigSlowmoS); J.flash('#fff3a0', 80); J.burst(px, py, 'cash', '#ffd24a'); if (J.vignettePulse) J.vignettePulse(0.4);
                     J.popup('抢到 $' + gain + (s.robCombo >= 2 ? '  ×' + mul.toFixed(1) : ''), $W()/2, $H()*0.34, { color:'#ffd24a', size: 22 + Math.min(14, s.robCombo*3), dur: 1.0 }); }
            const SFX = $SFX(); try { if (SFX.cash) SFX.cash(); } catch (_) {}
            if (window.showBanner) window.showBanner(`💰 +$${gain}` + (s.robCombo >= 2 ? ` 连击×${mul.toFixed(1)}` : ''), '#ffd24a', 0.9);
          }
        } else if (shop.progress > 0) shop.progress = Math.max(0, shop.progress - dt * 0.6);
      }

      // ── traffic + roadblock spawning (R10: gap follows the difficulty curve via rf;
      //    plus an extra EARLY-GAME widening so the first ~8s stay sparse for a 小白). ──
      const earlyEase = s.elapsed < TUNING.easyIntroS ? (1 + (1 - s.elapsed / TUNING.easyIntroS) * TUNING.easyTrafficMul) : 1;
      const trafficGap = TUNING.trafficIntervalS * (1 - TUNING.trafficRampCut * (rf - 1) / (TUNING.rampMul - 1)) * earlyEase;
      s.roadblockAcc += dt;
      if (s.elapsed > TUNING.easyIntroS && s.roadblockAcc >= TUNING.roadblockEveryS) { s.roadblockAcc = 0; spawnRoadblock(s, P); }   // no roadblocks in the intro
      s.trafficAcc += dt;
      if (s.trafficQuiet <= 0 && s.trafficAcc >= trafficGap) { s.trafficAcc = 0; spawnTraffic(s, P); }
      // 撒钱卡车: periodic cash-trail + pickup collection (greed vs dodge)
      s.cashAcc += dt;
      if (s.cashAcc >= s.cashNextS) { s.cashAcc = 0; s.cashNextS = TUNING.cashEveryS; spawnCashTrail(s, P); }
      for (const pk of s.pickups) {
        if (pk.taken) continue;
        if (Math.abs(pk.wx - p.wx) < p.r + pk.r && Math.abs(pk.wy - p.wy) < p.r + pk.r) {
          pk.taken = true; s.cash += TUNING.cashVal;
          const Jp = $J(); if (Jp) { Jp.burst(P.sx(pk.wx), P.sy(pk.wy), 'cash', '#ffd24a'); }
        }
      }
      s.pickups = s.pickups.filter(pk => !pk.taken && (pk.wy - p.wy) > -ws * 2);
      // 狂暴模式: a rare glowing power-up spawns ahead; grab it → smash-all invincible rampage
      if (p._tankT > 0) p._tankT = Math.max(0, p._tankT - dt);
      s.tankAcc += dt;
      if (s.tankAcc >= s.tankNextS) { s.tankAcc = 0; s.tankNextS = TUNING.tankEveryS;
        const tl = (Math.random()*(TUNING.laneMax*2+1)|0) - TUNING.laneMax;
        s.powerups.push({ wx: laneWX(s, tl), wy: s.camWY + P.CAM_SY/P.PXF + ws*2, r: ws*0.34 });
        if (window.showBanner) window.showBanner('⭐ 狂暴道具 在前面!', '#ff3bd6', 1.2);
      }
      for (const pu of s.powerups) {
        if (pu.taken) continue;
        if (Math.abs(pu.wx - p.wx) < p.r + pu.r && Math.abs(pu.wy - p.wy) < p.r + pu.r) {
          pu.taken = true; p._tankT = TUNING.tankDurS; s._speedLinesT = 1.5;   // R12: pickup = flash+zoom, no shake
          const Jt = $J(); if (Jt) { Jt.hitstop(0.08); Jt.flash('#ff3bd6', 90); if (Jt.vignettePulse) Jt.vignettePulse(0.6); }
          gtaToast(s, '🔥 狂暴模式!', '#ff3bd6', true);   // R12: 中央通道
        }
      }

      // 爆胎漂移: a random tyre blowout sends the car drifting sideways with loose
      // steering for a beat — counter-steer to save it (操作空间, no damage). Skill
      // check, not malice. Suppressed during 狂暴 (you're a tank, no flats).
      if (p._tireT > 0) p._tireT = Math.max(0, p._tireT - dt);
      s.tireAcc += dt;
      if (s.tireAcc >= s.tireNextS && p._tankT <= 0 && p._tireT <= 0) {
        s.tireAcc = 0; s.tireNextS = TUNING.tireEveryS;
        p._tireT = TUNING.tireDriftS; p._tireDir = Math.random() < 0.5 ? -1 : 1;
        pushShake(s, 16); s.robCombo = s.robCombo;   // a blowout does NOT break the rampage chain
        const Jb = $J(); if (Jb) { Jb.hitstop(0.05); Jb.chroma(70); }
        gtaToast(s, '💥 爆胎! 稳住方向', '#ffca3a', false);   // R12: 中央通道
        const SFXb = $SFX(); try { if (SFXb.hit) SFXb.hit(); } catch (_) {}
        if (window.showBanner) window.showBanner('💥 爆胎! 打方向稳住', '#ffca3a', 1.0);
      }
      if (p._tireT > 0) p.wx += p._tireDir * TUNING.tireDriftWU * (p._tireT / TUNING.tireDriftS) * dt;   // slide eases off as it ends
      s.powerups = s.powerups.filter(pu => !pu.taken && (pu.wy - p.wy) > -ws * 2);
      // 直升机探照灯: at high heat a chopper sweeps a spotlight; in the beam keeps you hot — dodge it
      if (s.heat >= TUNING.chopperHeat) {
        if (!s.chopper) { s.chopper = { x: s.roadCenterX, dir: 1, ph: 0 };   // 🚁 出动 — the escalation beat
          const Jc = $J(); if (Jc) { Jc.flash('#ffe070', 70); }   // R12: no shake (spawn event, flash only)
          gtaToast(s, '🚁 警用直升机出动!', '#ffe070', false);   // R12: 中央通道
          if (window.showBanner) window.showBanner('🚁 直升机出动 · 躲开探照灯', '#ffe070', 1.3); }
        s.chopper.ph += dt;
        s.chopper.x += s.chopper.dir * TUNING.chopperSweepWU * dt;
        if (s.chopper.x >= s.latRight) { s.chopper.x = s.latRight; s.chopper.dir = -1; }
        else if (s.chopper.x <= s.latLeft) { s.chopper.x = s.latLeft; s.chopper.dir = 1; }
        if (Math.abs(p.wx - s.chopper.x) < TUNING.chopperBeamLanes * ws) {
          s.heat = Math.min(TUNING.heatMax, s.heat + TUNING.chopperHeatRate * dt); s.heatCalmT = 0; s.stars = Math.ceil(s.heat - 1e-6);
        }
      } else if (s.chopper) s.chopper = null;

      // ── obstacles: advance + collision. Boosting through a CIVILIAN car
      // bulldozes it aside (干坏事 power fantasy); otherwise you eat it with a
      // real knockback (dodge matters). Concrete roadblocks always hurt. ──
      const boostingNow = p.boostT > 0;
      for (const o of s.obstacles) {
        o.wy += o.vy * dt;
        if (o.smashed) { o.wx += o.vx * dt; o.spin = (o.spin || 0) + dt * 12; continue; }
        if (o.hit) continue;
        if (Math.abs(o.wx - p.wx) < (p.r + o.r) && Math.abs(o.wy - p.wy) < (p.r + o.r) && (p.invulnT || 0) <= 0) {   // R9 analog: collide by real x-distance, not lane equality
          const px = P.sx(o.wx), py = P.sy(p.wy);
          if (p._tankT > 0) {                                    // 狂暴: smash ALL (cars + blocks) aside, no damage
            o.smashed = true; o.vx = (o.wx < p.wx ? -1 : 1) * TUNING.smashKnockWU * 1.4; o.vy = -TUNING.baseSpeedWU * 0.4;
            s.cash += TUNING.tankSmashReward;   // R12: 狂暴碾压频繁 → 不震(flash+debris 给反馈)
            const Jt2 = $J(); if (Jt2) { Jt2.flash('#ff3bd6', 36); Jt2.burst(px, py, 'debris', '#ff8adf'); }
            continue;
          }
          if (o.type === 'car' && boostingNow) {                 // SMASH — bulldoze it aside
            o.smashed = true; o.vx = (o.wx < p.wx ? -1 : 1) * TUNING.smashKnockWU; o.vy = -TUNING.baseSpeedWU * 0.3;
            p.hp = Math.max(0, p.hp - TUNING.smashHpCost); s.smashes = (s.smashes || 0) + 1;
            addHeat(s, TUNING.heatPerSmash);   // R12: boosting-smash 频繁 → 不震(hitstop+flash 给冲击)
            const J = $J(); if (J) { J.hitstop(0.06); J.flash('#ffffff', 50); J.burst(px, py, 'debris', '#cfd6e0'); }
            for (let i = 0; i < 8; i++) pushSpark(s, px, py, '#ffd24a', 16);
            bumpCombo(s);
            if (J) J.popup('💥 SMASH' + (s.robCombo >= 2 ? ' ×' + s.robCombo : ''), px, py - 20, { color: '#ffd24a', size: 18 });
            const SFX = $SFX(); try { if (SFX.hit) SFX.hit(); } catch (_) {}
            // 撞了人家的车 → 1/3 概率车主弹出来挥扳手骂街追你(搞笑骚扰,不致命)
            if (Math.random() < 0.34 && s.chasers.length < 4) spawnChaser(s, { kind: 'owner', wx: o.wx, wy: o.wy });
          } else {                                               // EAT IT — damage + knockback + slow-mo
            o.hit = true;
            p.hp = Math.max(0, p.hp - (o.type === 'block' ? TUNING.trafficDmg + 8 : TUNING.trafficDmg));
            p.invulnT = 0.9; s.robCombo = 0;
            p._knock = (o.wx < p.wx ? 1 : -1) * TUNING.copHitKnockWU * 0.7; p._stunT = TUNING.copHitStunS * 0.7;
            pushShake(s, 20); addHeat(s, TUNING.heatPerSmash);
            const J = $J(); if (J) { J.hitstop(0.08); J.flash('#ff5533', 70); J.chroma(55); J.burst(px, py, 'debris', '#aab2c0'); }   // R10: chroma 110→55 防晕
            for (let i = 0; i < 6; i++) pushSpark(s, px, py, '#ff7744', 18);
            const SFX = $SFX(); try { if (SFX.hit) SFX.hit(); } catch (_) {}
            if (window.showBanner) window.showBanner(`撞车! HP ${p.hp}`, '#ff7744', 0.6);
            if (p.hp <= 0) { return this._bust(s); }
          }
        }
      }
      s.obstacles = s.obstacles.filter(o => (o.wy - p.wy) > -ws * 3 && Math.abs(o.wx - s.roadCenterX) < ws * 9 && !(o.hit && (o.wy - p.wy) < 0));

      // ── cop spawning: driven by the WANTED level. Clean = they back off;
      // commit crime → ★ rises → more cruisers, spawning faster. ──
      const budget = Math.min(copBudget(s), Math.ceil(TUNING.heatMax * Math.max(0.5, s.copRate)));
      const copInterval = TUNING.copIntervalS * (1 - TUNING.copIntervalHeatCut * (s.heat / TUNING.heatMax));
      s.copSpawnAcc += dt;
      // R10 前松: hold cops back through the onboarding window (minus a 2s grace so an
      // early robber still sees heat build, just not an instant swarm) → 小白 learns first.
      const copsAllowed = s.elapsed > (TUNING.easyIntroS - 2);
      if (copsAllowed && s.heat > 0.3 && s.copSpawnAcc >= copInterval && s.cops.length < budget) {
        s.cops.push(spawnCop(s)); s.copCount += 1; s.copSpawnAcc = 0;
        if (window.showBanner) window.showBanner(s.cops.length === 1 ? '🚨 POLICE!' : '🚨 +1 COP', '#ff3344', 1.1);
        pushShake(s, 12);
      }

      // ── cop AI: chase, RAM at high heat, shoot, and SLAM (felt, not flat) ──
      const copSpeedMod = s.weatherMod.fwd;
      const ramming = s.heat >= TUNING.copRamHeat;
      for (const cop of s.cops) {
        if (cop._wipe > 0) { cop._wipe -= dt; cop._spin = (cop._spin || 0) + dt * 14;
          if (cop._wipe <= 0) { cop._dead = true;                       // car flips out → the cop EJECTS and keeps chasing on foot (荒诞)
            if (s.chasers.length < 4) { const roll = Math.random(); const kind = roll < 0.5 ? 'copFoot' : (roll < 0.8 ? 'biker' : 'rpg');
              spawnChaser(s, { kind, wx: cop.wx, wy: cop.wy }); } }
          continue; }
        s._copWipeCd = Math.max(0, (s._copWipeCd || 0) - dt);
        if (!cop._wipe && s._copWipeCd <= 0 && s.cops.length >= 2 && cop.fireCd < 1.0 && Math.random() < TUNING.copWipeChance * dt) {
          s._copWipeCd = TUNING.copWipeMinHeatGap;   // gate: rare, and only when ≥2 cops so a flip never empties the force
          cop._wipe = 0.7; s.heat = Math.max(0, s.heat - TUNING.copWipeRelief); s.stars = Math.ceil(s.heat - 1e-6);
          pushShake(s, 10); const Jw = $J(); if (Jw) { Jw.hitstop(0.05); }
          if (window.showBanner) window.showBanner('🚓💥 警车翻车!', '#ffca3a', 1.0);
          continue;
        }
        const dxw = p.wx - cop.wx, dyw = p.wy - cop.wy, len = Math.hypot(dxw, dyw) || 1;
        cop.wx += (dxw / len) * cop.speed * copSpeedMod * dt;
        cop.wy += (dyw / len) * cop.speed * copSpeedMod * dt;
        if (ramming) cop.wx += Math.sign(dxw) * Math.min(Math.abs(dxw), TUNING.copRamAccelWU * dt);   // line up to ram
        cop.sirenPhase += dt * 6;
        cop.fireCd -= dt;
        const behind = p.wy - cop.wy;
        if (cop.fireCd <= 0 && behind > 0 && behind < TUNING.copFireRangeWU) {
          cop.fireCd = 1.1 + Math.random() * 0.6;
          const ang = Math.atan2(p.wy - cop.wy, p.wx - cop.wx);
          s.copBullets.push({ wx: cop.wx, wy: cop.wy, vx: Math.cos(ang)*TUNING.copBulletSpeedWU, vy: Math.sin(ang)*TUNING.copBulletSpeedWU, life: 1.6, _minD: 1e9 });
          const SFX = $SFX(); try { if (SFX.shot) SFX.shot(); } catch (_) {}
        }
        if (p._tankT > 0 && Math.hypot(p.wx - cop.wx, p.wy - cop.wy) < p.r + cop.r) {   // 狂暴: ram cops dead
          cop._dead = true; s.cash += TUNING.copKillReward; bumpCombo(s); pushShake(s, 16);
          const Jt3 = $J(); if (Jt3) { Jt3.flash('#ff3bd6', 50); Jt3.burst(P.sx(cop.wx), P.sy(cop.wy), 'debris', '#ff8adf'); }
          continue;
        }
        if (Math.hypot(p.wx - cop.wx, p.wy - cop.wy) < p.r + cop.r && (p.invulnT || 0) <= 0) {
          // SLAM: knockback + steering stun + hitstop + debris — a real collision
          p.hp = Math.max(0, p.hp - TUNING.copCollideDmg); p.invulnT = TUNING.copInvulnS; s.robCombo = 0;
          p._knock = Math.sign(p.wx - cop.wx || 1) * TUNING.copHitKnockWU; p._stunT = TUNING.copHitStunS;
          cop.wy -= ws * 0.8;                                  // cop recoils back from the impact
          pushShake(s, TUNING.copHitTraumaBig); addHeat(s, TUNING.heatPerCopHit);
          const px = P.sx(p.wx), py = P.sy(p.wy);
          const J = $J(); if (J) { J.hitstop(TUNING.copHitstopS); J.flash('#ff2b2b', 80); J.chroma(70); J.burst(px, py, 'debris', '#9aa3b2'); if (J.vignettePulse) J.vignettePulse(0.5); }   // R10: chroma 150→70 flash 120→80 (防晕,冲击靠 hitstop)
          for (let i = 0; i < 10; i++) pushSpark(s, px, py, '#ffd24a', 22);
          const SFX = $SFX(); try { if (SFX.hit) SFX.hit(); } catch (_) {}
          if (window.showBanner) window.showBanner(`💥 警车撞击! HP ${p.hp}`, '#ff3344', 0.7);
          if (p.hp <= 0) { return this._bust(s); }
        }
      }

      // ── 离谱追兵: kinds pursue from behind; gun-kinds lob a dodgeable shot; catch
      //    = bump, outrun = relief + bonus. All slower than full throttle (操作空间). ──
      for (const ch of s.chasers) {
        ch.life -= dt; ch.bob = (ch.bob || 0) + dt * 12;
        const cdx = p.wx - ch.wx, cdy = p.wy - ch.wy, clen = Math.hypot(cdx, cdy) || 1;
        ch.wx += (cdx/clen) * ch.speed * dt; ch.wy += (cdy/clen) * ch.speed * dt;
        // gun / RPG kinds lob a slow, telegraphed projectile you can lane-dodge
        if (ch.fires) { ch.fireCd -= dt; const behind = p.wy - ch.wy;
          if (ch.fireCd <= 0 && behind > 0 && behind < TUNING.copFireRangeWU) {
            ch.fireCd = (ch.K && ch.K.fireCd || 1.8) + Math.random()*0.8;
            const rpg = ch.kind === 'rpg';
            const ang = Math.atan2(p.wy - ch.wy, p.wx - ch.wx);
            s.copBullets.push({ wx: ch.wx, wy: ch.wy, vx: Math.cos(ang)*TUNING.copBulletSpeedWU*(rpg?0.62:0.85), vy: Math.sin(ang)*TUNING.copBulletSpeedWU*(rpg?0.62:0.85), life: 2.0, _minD: 1e9, rpg });
            const SFXf=$SFX(); try { if (SFXf.shot) SFXf.shot(); } catch(_){}
          }
        }
        ch.hitCd = Math.max(0, ch.hitCd - dt);
        if (ch.hitCd <= 0 && Math.hypot(p.wx-ch.wx, p.wy-ch.wy) < p.r + ch.r && (p.invulnT||0) <= 0 && (p._tankT||0) <= 0) {
          ch.hitCd = 1.0; p.hp = Math.max(0, p.hp - (ch.dmg || TUNING.chaserDmg)); s.robCombo = 0;
          p._knock = Math.sign(p.wx-ch.wx||1)*TUNING.copHitKnockWU*0.5; p._stunT = TUNING.copHitStunS*0.5;
          pushShake(s, 12); const Jc=$J(); if(Jc){ Jc.hitstop(0.06); Jc.flash('#ffca3a',70); }
          if (window.showBanner) window.showBanner('被追上了! HP '+p.hp, '#ff7744', 0.6);
          if (p.hp <= 0) { return this._bust(s); }
        }
      }
      { const cbefore = s.chasers.length;
        s.chasers = s.chasers.filter(ch => ch.life > 0 && (p.wy - ch.wy) < TUNING.chaserGiveUpWU);
        if (cbefore > 0 && s.chasers.length === 0) {
          s.cash += TUNING.chaserBonus; gtaToast(s, '甩掉了! +$'+TUNING.chaserBonus, '#5af5e0', false);   // R12: 中央通道
          if (window.showBanner) window.showBanner('🏁 甩掉追兵 +$'+TUNING.chaserBonus, '#5af5e0', 1.0);
        }
      }

      // ── 锁链拖 ATM: drag the chained safe behind, tick bonus $, then it bursts open ──
      if (s.tow) {
        s.tow.t -= dt;
        // the loot trails ~1.6 tiles behind the car, easing toward that anchor
        const anchorY = p.wy - ws * 1.6, anchorX = p.wx;
        s.tow.wx += (anchorX - s.tow.wx) * Math.min(1, 8 * dt);
        s.tow.wy += (anchorY - s.tow.wy) * Math.min(1, 8 * dt);
        s.towAcc += dt;
        if (s.towAcc >= TUNING.towTickEveryS) { s.towAcc = 0; s.cash += TUNING.towTickVal;
          s.floaters.push({ wx: s.tow.wx, wy: s.tow.wy, text: '+$' + TUNING.towTickVal, color: '#ffd24a', life: 0.8 }); }
        // sparks dragging on the asphalt
        if (Math.random() < 0.6) { const tp = gProj(s); pushSpark(s, tp.sx(s.tow.wx) + (Math.random()-0.5)*10, tp.sy(s.tow.wy)+8, '#ffd24a', 2); }
        if (s.tow.t <= 0) {                                    // chain SNAPS → safe bursts open in a cash explosion
          const tp = gProj(s), bx = tp.sx(s.tow.wx), by = tp.sy(s.tow.wy);
          s.cash += TUNING.towBurstVal; pushShake(s, 18); punchZoom(s, 0.12);
          const Jb = $J(); if (Jb) { Jb.hitstop(0.10); Jb.flash('#fff3a0', 70); Jb.burst(bx, by, 'cash', '#ffd24a'); Jb.burst(bx, by, 'debris', '#9aa3b2'); }
          gtaToast(s, '💥 保险箱崩开 +$' + TUNING.towBurstVal, '#ffd24a', true);   // R12: 中央通道
          for (let i = 0; i < 20; i++) pushSpark(s, bx, by, i%2?'#ffd24a':'#fff3a0', 26);
          if (window.showBanner) window.showBanner('💥 保险箱崩开! 钱炸一地', '#ffd24a', 1.1);
          s.tow = null;
        }
      }

      // ── 整活彩蛋: rare absurd spectacle (chicken / UFO / giant donut) ──
      s.memeAcc += dt;
      if (!s.meme && s.memeAcc >= s.memeNextS) { s.memeAcc = 0; s.memeNextS = TUNING.memeEveryS; spawnMeme(s, P); }
      if (s.meme) {
        const m = s.meme; m.t -= dt;
        // R11: every meme is now REWARD or pure-background (no fake-out hazards). Chickens
        // SQUISH for points (comedic, no penalty), the donut is a tasty +$ pickup (matches
        // "甜点=好" instinct), the UFO is sky-only background — never touches the car.
        if (m.kind === 'chicken') { for (const bd of m.birds) { if (bd.gone) continue; bd.wx += m.dir * 90 * dt; bd.ph += dt*14;
          if (Math.abs(bd.wx - p.wx) < ws*0.4 && Math.abs(bd.wy - p.wy) < ws*0.4) { bd.gone = true; bd.poof = 0.4; s.cash += 15;   // 碾过去 = 加分,无惩罚
            s.floaters.push({ wx: bd.wx, wy: bd.wy, text: '+$15', color: '#9af59a', life: 0.7 });
            const Jk=$J(); if(Jk) Jk.popup('🐔 咻!', P.sx(bd.wx), P.sy(bd.wy)-16, {color:'#fff',size:13}); } } }
        else if (m.kind === 'ufo') { m.ph += dt; m.x += m.dir * 70 * dt; if (m.x > s.latRight+ws || m.x < s.latLeft-ws) m.dir *= -1; }   // sky only, no collision
        else if (m.kind === 'donut') { m.wy -= TUNING.baseSpeedWU * 0.2 * dt; m.spin += dt*6;
          if (!m.eaten && Math.abs(m.wx - p.wx) < ws*0.55 && Math.abs(m.wy - p.wy) < ws*0.55) {   // 吃到 = 加分 + 弹一下爽,无 knockback/stun
            m.eaten = true; m.t = Math.min(m.t, 0.25); s.cash += 80; p._lunge = Math.max(p._lunge||0, 12);
            s.floaters.push({ wx: m.wx, wy: m.wy, text: '🍩 +$80', color: '#9af59a', life: 1.0 });
            pushShake(s, 8); punchZoom(s, 0.06); const Jd=$J(); if(Jd){ Jd.hitstop(0.04); Jd.burst(P.sx(m.wx), P.sy(m.wy), 'cash', '#ffd24a'); } } }
        if (m.t <= 0) s.meme = null;
      }

      // ── PLAYER DRIVE-BY: auto-fire back at the nearest cop behind. Destroy a
      //    cruiser → explosion + rampage chain + big cash. The GTA power high. ──
      p._fireCd = Math.max(0, (p._fireCd || 0) - dt);
      if (p._muzzleT > 0) p._muzzleT -= dt;
      { let tgt = null, tB = Infinity;
        for (const cop of s.cops) { const d = p.wy - cop.wy; if (d >= -30 && d < TUNING.copFireBackRangeWU && d < tB) { tB = d; tgt = cop; } }
        if (tgt && p._fireCd <= 0 && !s._noPlayerFire) {
          p._fireCd = TUNING.playerFireRateS; p._muzzleT = 0.07; p._gunSide = (tgt.wx < p.wx ? -1 : 1);
          const ang = Math.atan2(tgt.wy - p.wy, tgt.wx - p.wx);
          s.playerBullets.push({ wx: p.wx, wy: p.wy, vx: Math.cos(ang)*TUNING.playerBulletSpeedWU, vy: Math.sin(ang)*TUNING.playerBulletSpeedWU, life: 1.1 });
          const SFX = $SFX(); try { if (SFX.shot) SFX.shot(); } catch (_) {}
        }
      }
      for (const b of s.playerBullets) {
        b.wx += b.vx * dt; b.wy += b.vy * dt; b.life -= dt;
        for (const cop of s.cops) {
          if (cop._dead) continue;
          if (Math.hypot(b.wx - cop.wx, b.wy - cop.wy) < cop.r + 7) {
            b.life = 0; cop.hp = (cop.hp != null ? cop.hp : TUNING.copHp) - 1; cop._hitFlash = 0.12;
            const px = P.sx(cop.wx), py = P.sy(cop.wy);
            for (let i = 0; i < 5; i++) pushSpark(s, px, py, '#ffd24a', 14);
            if (cop.hp <= 0) {                                  // WASTED COP — explode
              cop._dead = true; bumpCombo(s);
              const gain = Math.round(TUNING.copKillReward * comboMul(s)); s.cash += gain;
              pushShake(s, 28); punchZoom(s, 0.28);             // 爽感: camera SLAMS in on the kill (R9.2 harder)
              const J = $J(); if (J) { J.hitstop(0.14); J.flash('#ffd24a', 90); if (J.addTrauma) J.addTrauma(0.6); J.burst(px, py, 'debris', '#ff7a3b'); J.burst(px, py, 'cash', '#ffd24a'); J.popup('💥 干掉警车 +$' + gain, px, py - 26, { color:'#ffd24a', size: 20 }); }
              for (let i = 0; i < 16; i++) pushSpark(s, px, py, i % 2 ? '#ff7a3b' : '#ffd24a', 30);
              if (window.showBanner) window.showBanner('💥 WASTED COP +$' + gain, '#ffd24a', 0.9);
            }
            break;
          }
        }
      }
      s.playerBullets = s.playerBullets.filter(b => b.life > 0 && Math.abs(p.wy - b.wy) < 900);

      // ── cop bullets: travel, hit (dodge by lane), near-miss bonus ──
      for (const b of s.copBullets) {
        b.wx += b.vx * dt; b.wy += b.vy * dt; b.life -= dt;
        const d = Math.hypot(b.wx - p.wx, b.wy - p.wy); b._minD = Math.min(b._minD, d);
        if (d < p.r + 6 && (p.invulnT || 0) <= 0) {
          b.life = 0; p.hp = Math.max(0, p.hp - TUNING.copBulletDmg); p.invulnT = 0.6; s.robCombo = 0;
          pushShake(s, 8); pushSpark(s, P.sx(p.wx), P.sy(p.wy), '#ffd84a', 10);
          const J = $J(); if (J) { J.flash('#ff7744', 70); J.chroma(80); }
          const SFX = $SFX(); try { if (SFX.hit) SFX.hit(); } catch (_) {}
          if (window.showBanner) window.showBanner(`中枪! HP ${p.hp}`, '#ff7744', 0.6);
          if (p.hp <= 0) { return this._bust(s); }
        }
      }
      for (const b of s.copBullets) {
        if (b.life <= 0 && !b._scored && b._minD < p.r + TUNING.nearMissPx[1] && b._minD > p.r + TUNING.nearMissPx[0]) {
          b._scored = true; bumpCombo(s); const nm = Math.round(TUNING.nearMissBonus * comboMul(s)); s.cash += nm;
          const J = $J(); if (J) { J.hitstop(0.07); J.popup('好险! +' + nm, P.sx(p.wx), P.sy(p.wy) - 30, { color:'#5af5e0', size: 16 }); }
        }
      }
      s.copBullets = s.copBullets.filter(b => b.life > 0);
      if (p.invulnT > 0) p.invulnT -= dt;
      s.cops = s.cops.filter(cop => !cop._dead && (p.wy - cop.wy) < 800);
      if (s.cops.length === 0) { try { window.stopSiren && window.stopSiren(); } catch (_) {} }

      // ── engine sound ──
      if (!s._engineOn) { try { window.startEngine && window.startEngine(); } catch (_) {} s._engineOn = true; }
      try { window.setEngineThrottle && window.setEngineThrottle(boosting ? 1 : 0.45); } catch (_) {}
      // siren wails only while wanted; louder as the nearest cop closes in
      { let prox = 0; if (s.heat > 0 && s.cops.length) { let cl = Infinity; for (const c of s.cops) { const d = p.wy - c.wy; if (d > 0 && d < cl) cl = d; } if (cl !== Infinity) prox = Math.max(0, 1 - cl / (8 * ws)); }
        sirenVol(s.heat > 0.3 ? (0.022 + prox * 0.05) : 0, prox); }   // pass prox → wail escalates to yelp as the nearest cop closes in

      for (const f of s.floaters) f.life -= dt;
      s.floaters = s.floaters.filter(f => f.life > 0);
      updateSparks(s, dt);
      if (s.trauma > 0) s.trauma = Math.max(0, s.trauma - TUNING.traumaDecayPerS * dt);   // R10: trauma bleeds off → punch settles fast

      // ── win conditions (大白话结算: 抢光所有店 OR 活到 30 秒) ──
      const allHit = s.robbedCount >= s.shops.length;
      if (allHit) { return this._win(s, `抢光${s.shops.length}家店! 到手 $${s.cash}`); }
      if (TUNING.winMode === 'reach' && p.wy >= s.routeLengthWU) { return this._win(s, `成功跑路! 到手 $${s.cash}`); }
      if (TUNING.winMode === 'survive' && s.elapsed >= TUNING.durationS - TUNING.surviveFinishLeadS) {
        return this._win(s, `成功跑路! 抢了${s.robbedCount}家 · $${s.cash}`);
      }

      // ── HUD ── hide BOTH engine pills: the ⚡×N pill overlapped the canvas
      // COPS box top-right, so nitro charges now render on the canvas (top-left).
      const scoreEl = $scoreEl();
      if (scoreEl) scoreEl.textContent = `ROBBED ${s.robbedCount}/${s.shops.length} · $${s.cash}`;
      const pillKit = document.getElementById('pill-kit'); if (pillKit) pillKit.classList.add('hidden');
      const pillWpn = document.getElementById('pill-weapon'); if (pillWpn) pillWpn.classList.add('hidden');
    },

    _win(s, sub) {
      s.gtaActive = false; sirenVol(0);
      try { window.stopSiren && window.stopSiren(); window.stopEngine && window.stopEngine(); } catch (_) {}
      const J = $J(); if (J) { J.confetti($W()); J.hitstop(0.1); }
      const SFX = $SFX(); try { if (SFX.win) SFX.win(); } catch (_) {}
      $finish(true, sub);
    },
    _bust(s) {
      s.gtaActive = false; pushShake(s, 20); sirenVol(0);
      try { window.stopSiren && window.stopSiren(); window.stopEngine && window.stopEngine(); } catch (_) {}
      const SFX = $SFX(); try { if (SFX.lose) SFX.lose(); } catch (_) {}
      $finish(false, '被警察抓了! 抢了 $' + s.cash);
    },

    draw() {
      const s = $state(); if (!s) return;
      const ctx = $ctx(); if (!ctx) return;
      const W = $W(), H = $H(), t = s.theme, p = s.player;

      // R10 shake: offset = trauma² × maxPx (quadratic → small hits barely move, big hits
      // punch then settle), HARD-CAPPED at shakeMaxPx so stacked events never nauseate.
      let oX = 0, oY = 0;
      if (s.trauma > 0) {
        const amp = (s.trauma * s.trauma) * TUNING.shakeMaxPx;
        oX = (Math.random() * 2 - 1) * amp;
        oY = (Math.random() * 2 - 1) * amp;
      }

      // LA sunset sky: warm gradient + a low glowing sun + a hazy skyline strip
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, t.sky); grad.addColorStop(0.45, t.sky2); grad.addColorStop(1, mix(t.sky2, t.offRoad, 0.5));
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      {
        const sunY = H * 0.30;
        const sg = ctx.createRadialGradient(W*0.5, sunY, 6, W*0.5, sunY, W*0.45);
        sg.addColorStop(0, t.sun); sg.addColorStop(0.18, '#ffd98a'); sg.addColorStop(1, 'rgba(255,180,90,0)');
        ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H*0.62);
        ctx.fillStyle = '#fff3cf'; ctx.beginPath(); ctx.arc(W*0.5, sunY, 26, 0, Math.PI*2); ctx.fill();
        // distant hazy skyline silhouette near the horizon
        ctx.fillStyle = 'rgba(120,90,80,0.35)';
        for (let i = 0; i < 14; i++) { const bx = (i/14)*W, bw = W/14, bh = 14 + ((i*97)%26); ctx.fillRect(bx, H*0.40 - bh, bw - 2, bh); }
      }

      ctx.save(); ctx.translate(oX, oY);
      // 爽感 ZOOM-PUNCH: on a big beat, scale the world in around the player then ease
      // back (sin envelope). Anchored at the player's screen row so the punch reads
      // as "the camera slams in on the action", not a blind zoom.
      if (s._zoomT > 0) {
        const env = Math.sin(Math.PI * (s._zoomT / TUNING.zoomPunchS));   // 0→1→0 over the punch
        const z = 1 + (s._zoomAmt || TUNING.zoomPunchAmt) * env;
        const ax = W/2, ay = H * TUNING.camNeutralFrac;                   // anchor ≈ player's fixed screen row
        ctx.translate(ax, ay); ctx.scale(z, z); ctx.translate(-ax, -ay);
      }

      const P = gProj(s);
      const g2sx = P.sx, g2sy = P.sy, ws = P.ws;
      const laneW = ws * P.PXW;
      const roadHalf = (TUNING.laneMax + 0.5) * laneW;

      // off-road + road band + curbs
      ctx.fillStyle = t.offRoad; ctx.fillRect(0, 0, W, H);
      drawRoadsideScenery(ctx, W, H, s, P, roadHalf);
      ctx.fillStyle = t.road; ctx.fillRect(W/2 - roadHalf, 0, roadHalf*2, H);
      // low-angle DEPTH: the road hazes into warm distance up top + a soft sheen
      // band near the player (reads as a road receding under a low GTA camera —
      // pure overlay, no projection change so collision/lane math is untouched).
      { const dg = ctx.createLinearGradient(0, 0, 0, H);
        dg.addColorStop(0, mix(t.road, t.sky2, 0.5)); dg.addColorStop(0.32, 'rgba(0,0,0,0)'); dg.addColorStop(0.78, 'rgba(0,0,0,0)'); dg.addColorStop(1, shade(t.road, 0.3));
        ctx.fillStyle = dg; ctx.fillRect(W/2 - roadHalf, 0, roadHalf*2, H); }
      ctx.fillStyle = t.roadEdge; ctx.fillRect(W/2 - roadHalf - 3, 0, 3, H); ctx.fillRect(W/2 + roadHalf, 0, 3, H);
      // scrolling lane dashes
      const dashH = 26, gap = 22, period = dashH + gap;
      const scroll = ((p.wy * P.PXF) % period);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let li = -TUNING.laneMax; li < TUNING.laneMax; li++) { const x = g2sx(s.roadCenterX + (li + 0.5)*ws) - 2; for (let y = -period + scroll; y < H; y += period) ctx.fillRect(x, y, 4, dashH); }

      // shops — recognisable pixel storefronts + "drive into this lane to rob" guidance
      // find the NEXT unrobbed shop ahead of the player (the current objective)
      let target = null, tBest = Infinity;
      for (const shop of s.shops) { if (shop.robbed) continue; const d = shop.wy - p.wy; if (d > -ws && d < tBest) { tBest = d; target = shop; } }
      for (const shop of s.shops) {
        const sy = g2sy(shop.wy); if (sy < -140 || sy > H + 80) continue;
        const sx = g2sx(shop.wx);
        drawShopfront(ctx, sx, sy, laneW, shop, s.elapsed);
        if (!shop.robbed && shop === target) drawShopGuidance(ctx, W, H, sx, sy, laneW, shop, p, s, P);
      }

      // 狂暴 power-up (pulsing magenta orb)
      for (const pu of s.powerups) {
        if (pu.taken) continue; const usy = g2sy(pu.wy); if (usy < -40 || usy > H+40) continue; const usx = g2sx(pu.wx);
        const pr = 9 + Math.sin(s.elapsed*9)*2;
        ctx.fillStyle = 'rgba(255,59,214,0.35)'; ctx.beginPath(); ctx.arc(usx, usy, pr+5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff3bd6'; ctx.beginPath(); ctx.arc(usx, usy, pr, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign='center'; ctx.fillText('★', usx, usy+4); ctx.textAlign='left';
      }
      // 撒钱 pickups (glinting cash bundles)
      for (const pk of s.pickups) {
        if (pk.taken) continue; const psy = g2sy(pk.wy); if (psy < -40 || psy > H+40) continue; const psx = g2sx(pk.wx);
        const tw = Math.sin(s.elapsed*8 + pk.wy*0.1) * 2, gl = 0.5 + 0.5*Math.sin(s.elapsed*9 + pk.wy*0.07);
        ctx.save();
        ctx.shadowColor = `rgba(255,210,80,${0.5+0.4*gl})`; ctx.shadowBlur = 9;   // gold glow → reads as loot
        ctx.fillStyle = '#1e6b26'; ctx.fillRect(psx-10, psy-7+tw, 20, 14);          // bigger bundle
        ctx.fillStyle = '#39a443'; ctx.fillRect(psx-10, psy-7+tw, 20, 4);
        ctx.fillStyle = '#ffd24a'; ctx.fillRect(psx-10, psy-1+tw, 20, 2);           // gold band
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff3c0'; ctx.font = 'bold 11px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('$', psx, psy+tw); ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        ctx.restore();
      }
      // obstacles (traffic cars + roadblocks). R11 good/bad cue: when you CAN smash through
      // (nitro/tank), they get a GREEN "可碾" ring (good outcome); otherwise a subtle RED
      // danger underglow so a GTA player instantly reads "避开这个" (avoid).
      const canSmash = (p.boostT > 0) || (p._tankT > 0);
      for (const o of s.obstacles) {
        const sy = g2sy(o.wy); if (sy < -80 || sy > H + 80) continue;
        const sx = g2sx(o.wx);
        if (!o.smashed && !o.hit) {
          const bw0 = laneW * (o.w || 0.62);
          if (canSmash && o.type === 'car') { ctx.strokeStyle = 'rgba(120,245,140,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(sx - bw0/2 - 2, sy - bw0*0.85, bw0 + 4, bw0*1.7); }   // 可碾 = green
          else { ctx.fillStyle = 'rgba(255,40,40,0.16)'; ctx.beginPath(); ctx.ellipse(sx, sy, bw0*0.62, bw0*0.5, 0, 0, Math.PI*2); ctx.fill(); }                                  // 危险 = red underglow
        }
        if (o.type === 'block') {
          const bw = laneW * o.w;
          ctx.fillStyle = '#1a1a1a'; ctx.fillRect(sx - bw/2, sy - 10, bw, 20);
          for (let i = -2; i <= 2; i++) { ctx.fillStyle = (i & 1) ? '#f4c430' : '#222'; ctx.fillRect(sx - bw/2 + (i+2)*bw/5, sy - 10, bw/5, 20); }
          ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(sx - bw/2, sy - 10, bw, 20);
        } else if (o.smashed) {
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(o.spin || 0); drawCarTopDown(ctx, 0, 0, laneW * o.w, o.color, '#11151f'); ctx.restore();
        } else {
          drawCarTopDown(ctx, sx, sy, laneW * o.w, o.color, '#11151f');
        }
      }

      // cops + bullets
      for (const cop of s.cops) {
        const sy = g2sy(cop.wy); if (sy < -80 || sy > H + 80) continue;
        const sx = g2sx(cop.wx);
        if (cop._hitFlash > 0) { cop._hitFlash -= 0.016; }                  // white flash when shot
        if (cop._wipe > 0) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(cop._spin || 0); drawCarTopDown(ctx, 0, 0, laneW * 0.62, t.cop, t.copGlass); ctx.restore(); }
        else drawCarTopDown(ctx, sx, sy, laneW * 0.62, cop._hitFlash > 0 ? '#ffffff' : t.cop, t.copGlass);
        const fl = Math.sin(s.elapsed * 16 + cop.sirenPhase) > 0;
        const cl = t.copLight || ['#ff2b2b', '#2b6bff'];
        ctx.fillStyle = fl ? cl[0] : cl[1]; ctx.fillRect(sx - 8, sy - 4, 16, 4);
        if (cop.hp != null && cop.hp < TUNING.copHp) {                       // damage HP pips
          for (let i = 0; i < TUNING.copHp; i++) { ctx.fillStyle = i < cop.hp ? '#5af55a' : 'rgba(0,0,0,0.4)'; ctx.fillRect(sx - 9 + i*7, sy + laneW*0.5, 5, 3); }
        }
      }
      // 离谱追兵 — each kind drawn as a distinct absurd little figure + a shout bubble
      for (const ch of s.chasers) {
        const csy = g2sy(ch.wy); if (csy < -70 || csy > H + 70) continue; const csx = g2sx(ch.wx);
        drawChaser(ctx, csx, csy, ch, s.elapsed);
      }
      if (s.meme) drawMeme(ctx, W, H, s, g2sx, g2sy);   // 整活彩蛋
      for (const b of s.copBullets) { const sx = g2sx(b.wx), sy = g2sy(b.wy); ctx.fillStyle = '#ffe24a'; ctx.fillRect(sx-2, sy-5, 4, 10); }
      // player drive-by tracers (going backward toward cops)
      for (const b of s.playerBullets) { const sx = g2sx(b.wx), sy = g2sy(b.wy); ctx.fillStyle = '#bff7ff'; ctx.fillRect(sx-2, sy-5, 4, 11); ctx.fillStyle='#fff'; ctx.fillRect(sx-1, sy-2, 2, 4); }

      // 锁链拖 ATM — the chain + dragged safe behind the car (drawn UNDER the car)
      if (s.tow) {
        const cx = g2sx(p.wx), cyb = g2sy(p.wy) + laneW*0.5;          // chain anchor (rear bumper)
        const tx = g2sx(s.tow.wx), ty = g2sy(s.tow.wy);
        // chain (dashed links)
        ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 3; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(cx, cyb); ctx.lineTo(tx, ty - 6); ctx.stroke(); ctx.setLineDash([]);
        // the safe / cash crate
        const sz = laneW * 0.5;
        ctx.fillStyle = shade(s.tow.col || '#caa46a', 0.15); ctx.fillRect(tx - sz/2, ty - sz/2, sz, sz);
        ctx.fillStyle = tint(s.tow.col || '#caa46a', 0.2); ctx.fillRect(tx - sz/2, ty - sz/2, sz, 4);
        ctx.strokeStyle = '#15161b'; ctx.lineWidth = 2; ctx.strokeRect(tx - sz/2, ty - sz/2, sz, sz);
        if (s.tow.kind === 'safe') { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, sz*0.22, 0, Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + sz*0.16, ty - sz*0.12); ctx.stroke(); }   // dial
        else { ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 10px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('$', tx, ty); ctx.textAlign='left'; ctx.textBaseline='alphabetic'; }
      }

      // player car (headlights + nitro flame / brake lights + damage smoke + gangster)
      {
        const lift = (p._lunge || 0) + (p.boostT > 0 ? TUNING.boostHoldLiftPx : 0);
        const sx = g2sx(p.wx), sy = g2sy(p.wy) - lift;        // player's screen row comes from the camera projection
        // headlight cone — reads as night driving, lights the road ahead
        const hg = ctx.createLinearGradient(sx, sy - 14, sx, sy - 190);
        hg.addColorStop(0, 'rgba(255,244,200,0.16)'); hg.addColorStop(1, 'rgba(255,244,200,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(sx - laneW*0.20, sy - 14); ctx.lineTo(sx - laneW*0.66, sy - 190); ctx.lineTo(sx + laneW*0.66, sy - 190); ctx.lineTo(sx + laneW*0.20, sy - 14); ctx.closePath(); ctx.fill();
        // low-HP smoke (purely visual)
        if (p.hp < 35) { for (let i=0;i<3;i++){ const k=(s.elapsed*1.8+i*0.33)%1; ctx.globalAlpha=(0.45-0.4*k); ctx.fillStyle='#5a5a64'; ctx.beginPath(); ctx.arc(sx+(i-1)*5, sy+18+k*34, 4+k*7, 0, Math.PI*2); ctx.fill(); } ctx.globalAlpha=1; }
        if (p.boostT > 0) { ctx.fillStyle = '#37e0ff'; for (let i=0;i<3;i++){ const fw=8-i*2; ctx.globalAlpha=0.8-i*0.2; ctx.fillRect(sx-fw/2, sy+18+i*8, fw, 10); } ctx.globalAlpha=1; }
        else { ctx.fillStyle = 'rgba(255,40,40,0.9)'; ctx.fillRect(sx - laneW*0.30, sy + laneW*0.52, 5, 4); ctx.fillRect(sx + laneW*0.30 - 5, sy + laneW*0.52, 5, 4); } // brake lights
        // 爆胎: grey tyre smoke spraying from the blown wheel (the drift side)
        if (p._tireT > 0) { const ws2 = p._tireDir*laneW*0.30; for (let i=0;i<5;i++){ const k=(s.elapsed*3+i*0.2)%1; ctx.globalAlpha=0.5-0.45*k; ctx.fillStyle='#9aa0aa'; ctx.beginPath(); ctx.arc(sx+ws2 - p._tireDir*k*22, sy+laneW*0.40+k*10, 3+k*8, 0, Math.PI*2); ctx.fill(); } ctx.globalAlpha=1; }
        const inv = (p.invulnT||0) > 0 && Math.floor(s.elapsed*12)%2===0;
        if (p._tankT > 0) { ctx.save(); ctx.shadowColor = '#ff3bd6'; ctx.shadowBlur = 18; drawCarTopDown(ctx, sx, sy, laneW*0.80, '#ff3bd6', '#ffd0f5'); ctx.restore(); }
        else drawCarTopDown(ctx, sx, sy, laneW*0.66, inv ? '#ffffff' : t.car, t.carGlass);
        drawGangster(ctx, sx, sy, laneW, p._robSide, p._robberPop, s.elapsed);   // always-on driver head; leans out w/ gun on rob
        // drive-by muzzle flash (firing backward at the cops behind)
        if (p._muzzleT > 0) { const gs = p._gunSide || 1, mx = sx + gs*laneW*0.34, my = sy + laneW*0.42;
          ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + gs*4, my + 12); ctx.lineTo(mx - gs*4, my + 9); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI*2); ctx.fill(); }
      }

      // sparks + floaters
      for (const sp of s.sparks) { ctx.globalAlpha = Math.max(0, Math.min(1, sp.life*1.8)); ctx.fillStyle = sp.color; ctx.fillRect(sp.sx-2, sp.sy-2, 4, 4); }
      ctx.globalAlpha = 1;
      // R11 floaters: a clean pop — scale overshoot (1.3→1.0) at birth, smooth upward
      // drift, ease-out fade, and a black OUTLINE so the number reads on any background
      // (was a raw linear alpha + jump = "bug感/叠字"). age normalised by f.life0.
      for (const f of s.floaters) {
        const l0 = f.life0 || (f.life0 = Math.max(f.life, 0.6));   // remember spawn life once
        const age = 1 - Math.max(0, Math.min(1, f.life / l0));     // 0→1 over the lifetime
        const alpha = age < 0.15 ? age / 0.15 : (1 - (age - 0.15) / 0.85);   // quick in, eased out
        const scale = age < 0.18 ? 0.7 + (1.3 - 0.7) * (age / 0.18) : 1.3 - 0.3 * Math.min(1, (age - 0.18) / 0.25);   // 0.7→1.3→1.0 pop
        const sx = g2sx(f.wx), sy = g2sy(f.wy) - age * 34;         // smooth rise
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.translate(sx, sy); ctx.scale(scale, scale);
        ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(f.text, 0, 0);   // outline first
        ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

      ctx.restore();

      // 直升机探照灯 (high-heat chase tension): a swept spotlight + chopper silhouette
      if (s.chopper) {
        const bx = P.sx(s.chopper.x), beamR = TUNING.chopperBeamLanes * ws * P.PXW;
        // a full-height shaft (cone from the chopper down to the road) + a bright
        // ground pool — reads instantly as "搜捕" instead of a faint smear.
        const inBeam = Math.abs(p.wx - s.chopper.x) < TUNING.chopperBeamLanes * ws;
        const cy = 60, flick = 0.85 + 0.15 * Math.sin(s.elapsed * 22);   // searchlight buzz
        ctx.save();
        // light shaft (chopper → road), a narrow tapering cone — a FOCUSED beam to
        // dodge, not a screen-flood (R5 version washed the whole road out).
        const shaft = ctx.createLinearGradient(bx, cy, bx, H);
        shaft.addColorStop(0, `rgba(255,247,190,${0.18*flick})`); shaft.addColorStop(1, 'rgba(255,240,150,0.03)');
        ctx.fillStyle = shaft; ctx.beginPath(); ctx.moveTo(bx-8, cy); ctx.lineTo(bx+8, cy); ctx.lineTo(bx+beamR*0.85, H); ctx.lineTo(bx-beamR*0.85, H); ctx.closePath(); ctx.fill();
        // ground pool — tight + brighter only when the beam is ON you (the tension)
        const bg = ctx.createRadialGradient(bx, H*0.62, 0, bx, H*0.62, beamR*1.1);
        bg.addColorStop(0, `rgba(255,247,190,${(inBeam?0.34:0.22)*flick})`); bg.addColorStop(0.6, 'rgba(255,238,140,0.10)'); bg.addColorStop(1, 'rgba(255,238,140,0)');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(bx, H*0.62, beamR*0.7, H*0.30, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        // chopper silhouette (bigger, with spinning rotor + blinking tail light)
        const rot = (s.chopper.ph*18) % Math.PI;
        ctx.fillStyle = '#0e0f14'; ctx.fillRect(bx-15, cy-5, 30, 10); ctx.fillRect(bx-4, cy+5, 8, 9);   // body + tail boom
        ctx.fillStyle = '#0e0f14'; ctx.fillRect(bx+9, cy+10, 12, 3);                                     // tail fin
        ctx.strokeStyle = 'rgba(180,190,200,0.7)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(bx-22*Math.cos(rot), cy-10); ctx.lineTo(bx+22*Math.cos(rot), cy-10); ctx.stroke();   // main rotor
        if (Math.floor(s.elapsed*5)%2===0) { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(bx, cy, 2.5, 0, Math.PI*2); ctx.fill(); }   // blinking belly light
      }
      drawNoirOverlay(ctx, W, H, s);        // vignette + wanted-level red tint (noir, not candy)
      drawMiniHUD(ctx, W, H, s, t);
      drawWantedHUD(ctx, W, H, s);          // ★ wanted level
      drawRampageHUD(ctx, W, H, s);         // 连击 ×N rampage chain + cash multiplier
      drawLaneHUD(ctx, W, H, s, t);
      drawGhostJoystick(ctx, W, H, s);      // 常驻 ghost 摇杆: 小白第一眼知道"拇指放这开车"
      drawGoalBar(ctx, W, H, s);            // 常驻目标条: 抢光发光的店 · 进度 N/总
      drawToast(ctx, W, H, s);              // 中央大字通道: 一次一条事件卡片(不遮挡)
      drawIntroCoach(ctx, W, H, s);         // 开局序幕(前几秒): 怎么玩一句话教会
      const leadMaxWU = (TUNING.camNeutralFrac - TUNING.camTopFrac) * 360 / 0.72;   // H-independent
      const liftN = Math.min(1, Math.max(0, (s._lead || 0) / leadMaxWU));            // how far forward the player is driving
      const slInt = Math.max(Math.min(1, s._speedLinesT/0.4), p.boostT>0?0.75:0, liftN*0.7);
      if (slInt > 0.05) drawSpeedLines(ctx, W, H, slInt);
    },

    refit() { const s = $state(); if (!s || !s._fit) return; s._fit(); s.bg = $bakeGround(s.tiles, s.blocks, s.mapW, s.mapH); },
  };

  // ─── draw helpers ───────────────────────────────────────────

  // A recognisable pixel STOREFRONT (sign + icon + facade + windows + door) so a
  // first-time player instantly reads "shop with cash to rob" instead of a blank
  // pink tile. Robbed shops go dark + boarded. The big $amount + icon sell the loot.
  function drawShopfront(c, sx, sy, laneW, shop, elapsed) {
    sx = Math.round(sx);
    const k = shop.kind || { icon:'💰', sign:'#d0246b', wall:'#e6b0c8', accent:'#ffd24a', name: shop.name };
    const bw = Math.max(46, laneW * 1.02), bh = 66, x = sx - bw/2, top = sy - bh;
    const robbed = shop.robbed;
    // R12 真发光: an unrobbed shop GLOWS — a breathing gold halo behind the whole
    // storefront so a 小白 spots "有钱可抢的店" from far away. Robbed shops go dark.
    if (!robbed) {
      const gp = 0.55 + 0.45 * Math.sin(elapsed * 4);
      c.save();
      const halo = c.createRadialGradient(sx, top + bh*0.4, 6, sx, top + bh*0.4, bw*1.15);
      halo.addColorStop(0, `rgba(255,210,80,${0.34*gp})`); halo.addColorStop(0.55, `rgba(255,190,60,${0.14*gp})`); halo.addColorStop(1, 'rgba(255,190,60,0)');
      c.fillStyle = halo; c.fillRect(sx - bw*1.2, top - 24, bw*2.4, bh + 48);
      c.restore();
    }
    // facade (unrobbed = lit with a soft glow; robbed = dark)
    c.save();
    if (!robbed) { c.shadowColor = 'rgba(255,210,80,0.7)'; c.shadowBlur = 12; }
    c.fillStyle = robbed ? shade(k.wall, 0.55) : k.wall; c.fillRect(x, top, bw, bh);
    c.restore();
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, top, bw, 5);                 // top shade
    // sign board (lit) — the coloured banner that names the shop
    c.fillStyle = robbed ? shade(k.sign, 0.5) : k.sign; c.fillRect(x-2, top-15, bw+4, 15);
    c.fillStyle = robbed ? 'rgba(255,255,255,0.4)' : '#fff'; c.font = 'bold 9px monospace'; c.textAlign='center'; c.textBaseline='middle';
    c.fillText(k.name, sx, top-7);
    // windows (lit) + door
    c.fillStyle = robbed ? '#1a1a1f' : mix(k.accent, '#fff', 0.2);
    c.fillRect(x+5, top+12, bw*0.34, bh*0.42); c.fillRect(x+bw-5-bw*0.34, top+12, bw*0.34, bh*0.42);
    c.fillStyle = robbed ? '#0e0e12' : shade(k.sign, 0.2); c.fillRect(sx-bw*0.12, top+bh*0.42, bw*0.24, bh*0.55);   // door
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2; c.strokeRect(x, top, bw, bh);
    if (robbed) {
      // boarded up + ✓ stamp
      c.strokeStyle = '#6a5a3a'; c.lineWidth = 4; c.beginPath(); c.moveTo(x+4, top+bh*0.5); c.lineTo(x+bw-4, top+bh*0.72); c.stroke();
      c.fillStyle = '#5af5e0'; c.font = 'bold 13px monospace'; c.fillText('✓ 已抢', sx, top + bh*0.5);
    } else {
      // pulsing loot beacon above the sign: icon + big $amount (reads from afar)
      const pulse = 0.7 + 0.3 * Math.sin(elapsed * 6), by = top - 30;
      c.globalAlpha = pulse;
      c.font = '18px sans-serif'; c.fillText(k.icon, sx, by);
      c.globalAlpha = 1;
      c.fillStyle = '#101014'; c.fillRect(sx-26, by+8, 52, 16);
      c.fillStyle = '#ffd24a'; c.font = 'bold 14px monospace'; c.fillText('$' + shop.money, sx, by+16);
      // small bouncing ↓ over EVERY unrobbed shop so a 小白 sees the whole street's targets
      const ay = by - 12 + Math.sin(elapsed*5)*2;
      c.fillStyle = `rgba(255,210,80,${0.6+0.4*Math.sin(elapsed*5)})`;
      c.beginPath(); c.moveTo(sx, ay+6); c.lineTo(sx-5, ay-2); c.lineTo(sx+5, ay-2); c.closePath(); c.fill();
      // robbery progress ring (while you're hovering the lane)
      if (shop.progress > 0) {
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 5; c.beginPath(); c.arc(sx, sy-bh*0.5, 22, 0, Math.PI*2); c.stroke();
        c.strokeStyle = '#5af5e0'; c.lineWidth = 5; c.beginPath(); c.arc(sx, sy-bh*0.5, 22, -Math.PI/2, -Math.PI/2 + Math.PI*2*shop.progress); c.stroke();
        c.fillStyle = '#5af5e0'; c.font = 'bold 10px monospace'; c.fillText('抢劫中', sx, sy-bh*0.5);
      }
    }
    c.textAlign='left'; c.textBaseline='alphabetic';
  }

  // "Drive into THIS lane to rob" guidance for the current objective shop: a
  // glowing lane carpet from the player up to the shop + a bouncing arrow. The
  // first shop gets a louder call-out (onboarding). This is the fix for "第一次玩
  //完全 get 不到要抢".
  function drawShopGuidance(c, W, H, sx, sy, laneW, shop, p, s, P) {
    const sameLane = p.playerLane === shop.side;
    const beat = 0.6 + 0.4 * Math.sin(s.elapsed * 5);
    const carSy = P.sy(p.wy);
    // lane carpet (player row → shop), brighter when you're NOT yet in the lane
    const cg = c.createLinearGradient(0, carSy, 0, sy);
    const a = (sameLane ? 0.10 : 0.20) * beat;
    cg.addColorStop(0, `rgba(90,245,224,0)`); cg.addColorStop(1, `rgba(255,210,80,${a})`);
    c.fillStyle = cg; c.fillRect(sx - laneW*0.42, sy, laneW*0.84, carSy - sy);
    // bouncing down-arrow over the shop (points "come here")
    const ay = (shop.wy ? 0 : 0) + (sy + 4) + Math.sin(s.elapsed*6)*4;
    c.fillStyle = `rgba(255,210,80,${0.7+0.3*beat})`;
    c.beginPath(); c.moveTo(sx, ay+10); c.lineTo(sx-9, ay-4); c.lineTo(sx+9, ay-4); c.closePath(); c.fill();
    // call-out text
    c.font = 'bold 11px monospace'; c.textAlign='center';
    c.fillStyle = '#fff7d0';
    if (!sameLane) {
      const dir = shop.side < p.playerLane ? '← 往左' : '往右 →';
      c.fillText(`${dir} 开进这道抢`, sx, ay - 12);
    } else {
      c.fillStyle = '#5af5e0'; c.fillText('对准了! 别松油门', sx, ay - 12);
    }
    // first-shop onboarding: an extra banner-style hint high on screen
    if (shop._isFirst && !s._firstHintDone) {
      c.fillStyle = `rgba(0,0,0,0.55)`; c.fillRect(W/2-118, H*0.16, 236, 26);
      c.fillStyle = '#ffd24a'; c.font = 'bold 12px monospace';
      c.fillText('你的第一票:换到发光的车道,开过去自动抢', W/2, H*0.16+13);
    }
    c.textAlign='left';
  }

  // Roadside scenery, REGION-AWARE: the prop style (palm/neon/skyscraper/cactus)
  // + building palette come from the active region theme, so LA looks nothing like
  // Vice City / Liberty City / Mexico. Buildings + billboards are shared shapes
  // recoloured per region; the signature prop (t.prop) is what reads "where am I".
  function drawRoadsideScenery(c, W, H, s, P, roadHalf) {
    const t = s.theme, ws = P.ws, period = ws * 1.8, slot = 46;
    const scrollPx = ((s.player.wy * P.PXF) % (period * P.PXF));
    const billCols = t.bill || ['#e23b6d', '#3bb0e2', '#f0c020', '#7a4fd0', '#ff6a3b'];
    for (const side of [-1, 1]) {
      const edge = W/2 + side * (roadHalf + 6);
      for (let k = -1; k < H / (period * P.PXF) + 2; k++) {
        const y = k * period * P.PXF + scrollPx;
        const seed = (((k * 73856093) ^ (side < 0 ? 19349663 : 83492791)) >>> 0) % 1000 / 1000;
        const x = side < 0 ? edge - slot : edge;        // slot's outer edge
        const cx = x + slot / 2;
        if (seed < 0.42) {
          drawRegionProp(c, t, cx, y, x, slot, side, seed);     // the signature local prop
        } else if (seed < 0.82) {
          // BUILDING (region-recoloured) + rooftop billboard. Taller in Liberty City.
          const tall = t.prop === 'skyscraper' ? 1.9 : 1.0;
          const bw = slot - 6, bh = (56 + ((seed * 7919) % 78)) * tall;
          c.fillStyle = seed > 0.6 ? t.buildingLit : t.building; c.fillRect(x + 3, y - bh, bw, bh);
          c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(x + 3, y - bh, bw, 4);
          // lit windows (region neon tint at night-ish regions)
          c.fillStyle = (t.prop === 'neon' || t.prop === 'skyscraper') ? mix(t.neonA, '#000', 0.35) : 'rgba(70,55,38,0.45)';
          for (let r = 0; r < (bh / 17 | 0); r++) for (let cc = 0; cc < 3; cc++) { if (((r*3+cc+ (seed*97|0)) % 3) === 0) c.fillStyle = (t.prop==='neon'||t.prop==='skyscraper') ? t.neonB : 'rgba(70,55,38,0.45)'; else c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + 7 + cc * 11, y - bh + 9 + r * 17, 6, 9); }
          if (seed > 0.58) { c.fillStyle = '#15151a'; c.fillRect(x + 5, y - bh - 15, bw - 10, 12); c.fillStyle = billCols[(seed * 5 | 0) % billCols.length]; c.fillRect(x + 7, y - bh - 13, bw - 14, 8); }
        } else {
          // standalone BILLBOARD on posts
          const bw = slot + 4, bh = 24;
          c.strokeStyle = '#5a5450'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 10, y); c.lineTo(x + 10, y - 40); c.moveTo(x + bw - 12, y); c.lineTo(x + bw - 12, y - 40); c.stroke();
          c.fillStyle = '#15151a'; c.fillRect(x, y - 40 - bh, bw, bh);
          c.fillStyle = billCols[(seed * 5 | 0) % billCols.length]; c.fillRect(x + 3, y - 40 - bh + 3, bw - 6, bh - 6);
        }
      }
    }
  }

  // The region's SIGNATURE roadside prop — this is what makes you go "that's Miami /
  // that's NY". palm=LA, neon=Vice City palm+neon sign, skyscraper=Liberty City,
  // cactus=Mexico.
  function drawRegionProp(c, t, cx, y, x, slot, side, seed) {
    if (t.prop === 'cactus') {
      // SAGUARO CACTUS — trunk + two arms
      const h = 54 + ((seed * 9301) % 30);
      c.strokeStyle = t.palmLeaf; c.lineWidth = 8; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, y); c.lineTo(cx, y - h); c.stroke();
      c.beginPath(); c.moveTo(cx, y - h*0.55); c.lineTo(cx - 12, y - h*0.55); c.lineTo(cx - 12, y - h*0.8); c.stroke();
      c.beginPath(); c.moveTo(cx, y - h*0.4); c.lineTo(cx + 11, y - h*0.4); c.lineTo(cx + 11, y - h*0.62); c.stroke();
      c.lineCap = 'butt';
    } else if (t.prop === 'skyscraper') {
      // a tall slab tower (the prop slot also gets a high-rise → city canyon)
      const bw = slot - 10, bh = 120 + ((seed * 7919) % 90);
      c.fillStyle = t.building; c.fillRect(cx - bw/2, y - bh, bw, bh);
      c.fillStyle = mix(t.neonB, '#000', 0.2);
      for (let r = 0; r < (bh / 15 | 0); r++) for (let cc = 0; cc < 3; cc++) if (((r+cc+(seed*53|0))%2)===0) c.fillRect(cx - bw/2 + 4 + cc*((bw-8)/3), y - bh + 8 + r*15, 5, 8);
      c.fillStyle = '#ff3b3b'; c.fillRect(cx-1, y-bh-4, 2, 4);   // aircraft warning light
    } else {
      // PALM TREE — slim trunk + frond crown (LA + also Vice City beachfront)
      const th = 78 + ((seed * 9301) % 46);
      c.strokeStyle = t.palmTrunk; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, y); c.quadraticCurveTo(cx - side * 5, y - th * 0.6, cx - side * 8, y - th); c.stroke(); c.lineCap = 'butt';
      const tx = cx - side * 8, ty = y - th;
      c.strokeStyle = t.palmLeaf; c.lineWidth = 3.5;
      for (let a = 0; a < 7; a++) { const ang = -Math.PI/2 + (a - 3) * 0.5; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(ang) * 11, ty + Math.sin(ang) * 11, tx + Math.cos(ang) * 20, ty + Math.sin(ang) * 14 + 4); c.stroke(); }
      c.fillStyle = t.palmLeaf; c.beginPath(); c.arc(tx, ty, 4, 0, Math.PI * 2); c.fill();
      // Vice City: a glowing neon sign on a post next to the palm
      if (t.prop === 'neon' && seed > 0.20) { c.fillStyle = t.neonA; c.shadowColor = t.neonA; c.shadowBlur = 8; c.fillRect(cx - side*16, y - th*0.7, 4, 22); c.shadowBlur = 0; }
    }
  }

  // 离谱追兵 figures: a little running/riding person per kind + a shout bubble.
  // Legs bob (run cycle) so they read as frantically chasing — the comedic tone.
  function drawChaser(c, x, y, ch, elapsed) {
    const K = ch.K || {}, run = Math.sin(ch.bob || 0), kind = ch.kind;
    c.save();
    if (kind === 'biker') {
      // bicycle: two wheels + frame + a frantic rider
      c.strokeStyle = '#16171c'; c.lineWidth = 2;
      c.beginPath(); c.arc(x-6, y+8, 5, 0, Math.PI*2); c.arc(x+6, y+8, 5, 0, Math.PI*2); c.stroke();
      c.beginPath(); c.moveTo(x-6, y+8); c.lineTo(x, y); c.lineTo(x+6, y+8); c.moveTo(x, y); c.lineTo(x+2, y-4); c.stroke();
    } else if (kind === 'rpg') {
      // a heavy guy hoisting a launcher tube on his shoulder
      c.fillStyle = '#3a3228'; c.fillRect(x-3, y-2, 18, 4);                 // launcher tube
      c.fillStyle = '#ff6a3b'; c.fillRect(x+13, y-3, 4, 6);                 // warhead tip
    }
    // body (shirt) + legs bobbing
    c.fillStyle = K.shirt || '#3a3f4a';
    c.fillRect(x-4, y-6, 8, 12);
    c.strokeStyle = K.shirt || '#3a3f4a'; c.lineWidth = 2.5; c.lineCap='round';
    c.beginPath(); c.moveTo(x-2, y+6); c.lineTo(x-2 - run*3, y+13); c.moveTo(x+2, y+6); c.lineTo(x+2 + run*3, y+13); c.stroke(); c.lineCap='butt';
    // arms (clerk/cop point a pistol forward; owner waves a wrench)
    c.strokeStyle = K.body || '#e8c0a0'; c.lineWidth = 2.5; c.lineCap='round';
    if (ch.fires) { c.beginPath(); c.moveTo(x, y-2); c.lineTo(x+9, y-3); c.stroke(); c.fillStyle='#15161b'; c.fillRect(x+8, y-5, 6, 4); }   // gun arm
    else { c.beginPath(); c.moveTo(x, y-2); c.lineTo(x+5 + run*2, y-7); c.stroke(); if (kind==='owner'){ c.strokeStyle='#9aa0aa'; c.lineWidth=3; c.beginPath(); c.moveTo(x+5+run*2, y-7); c.lineTo(x+8+run*2, y-11); c.stroke(); } }   // raised arm / wrench
    c.lineCap='butt';
    // head
    c.fillStyle = K.body || '#e8c0a0'; c.beginPath(); c.arc(x, y-9, 4.2, 0, Math.PI*2); c.fill();
    if (kind === 'copFoot') { c.fillStyle = '#16224a'; c.beginPath(); c.arc(x, y-10, 4.2, Math.PI, Math.PI*2); c.fill(); }   // cop cap
    // shout bubble (only when reasonably on-screen + occasionally)
    if (K.label && (Math.floor(elapsed*1.5) % 2 === 0)) {
      c.font = 'bold 9px sans-serif'; const w = c.measureText(K.label).width + 8;
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillRect(x - w/2, y - 30, w, 13);
      c.fillStyle = '#15161b'; c.beginPath(); c.moveTo(x-3, y-17); c.lineTo(x+3, y-17); c.lineTo(x, y-13); c.closePath(); c.fill();
      c.fillStyle = K.col || '#c0392b'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(K.label, x, y - 23); c.textAlign='left'; c.textBaseline='alphabetic';
    }
    c.restore();
  }

  // 整活彩蛋 render. R11 visual language: chicken & donut are COLLECTIBLE (green reward
  // glow so a GTA player reads "drive through it, it's good"); the UFO sits clearly in
  // the SKY (small, no road-reaching beam) so it reads "background, can't touch it".
  function drawMeme(c, W, H, s, g2sx, g2sy) {
    const m = s.meme; if (!m) return;
    if (m.kind === 'chicken') {
      for (const bd of m.birds) {
        const x = g2sx(bd.wx), y = g2sy(bd.wy); if (y < -20 || y > H+20) continue;
        if (bd.gone) {   // squished → a quick feather poof, no bird
          if (bd.poof > 0) { bd.poof -= 0.03; c.globalAlpha = Math.max(0, bd.poof*2); for (let k=0;k<4;k++){ c.fillStyle='#fff'; c.fillRect(x+(k-2)*4, y-(1-bd.poof)*10, 3, 3); } c.globalAlpha=1; }
          continue;
        }
        const hop = Math.abs(Math.sin(bd.ph)) * 3;
        // soft green "collectible" glow under each chicken
        c.fillStyle = 'rgba(120,245,140,0.18)'; c.beginPath(); c.ellipse(x, y+3, 8, 4, 0, 0, Math.PI*2); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y - hop, 5, 4, 0, 0, Math.PI*2); c.fill();        // body
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x + m.dir*4, y - hop - 3, 2.6, 0, Math.PI*2); c.fill();   // head
        c.fillStyle = '#ff8c2a'; c.beginPath(); c.moveTo(x + m.dir*6, y - hop - 3); c.lineTo(x + m.dir*9, y - hop - 2); c.lineTo(x + m.dir*6, y - hop - 1); c.fill();   // beak
        c.fillStyle = '#ff8c2a'; c.fillRect(x-1, y - hop + 3, 2, 3);                                          // legs
      }
    } else if (m.kind === 'ufo') {
      // SKY-ONLY: high up, gently hovering, a THIN short shimmer (NOT a road-reaching
      // beam) so it clearly reads "background spectacle, not in your lane".
      const x = g2sx(m.x), y = H * 0.14 + Math.sin(m.ph*2)*6;
      const bg = c.createLinearGradient(x, y, x, H*0.30); bg.addColorStop(0, 'rgba(122,245,224,0.16)'); bg.addColorStop(1, 'rgba(122,245,224,0)');
      c.fillStyle = bg; c.beginPath(); c.moveTo(x-6, y); c.lineTo(x+6, y); c.lineTo(x+16, H*0.30); c.lineTo(x-16, H*0.30); c.closePath(); c.fill();
      c.fillStyle = '#9aa3b2'; c.beginPath(); c.ellipse(x, y, 22, 8, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = '#7af5e0'; c.beginPath(); c.ellipse(x, y-5, 11, 7, 0, Math.PI, 0); c.fill();              // dome
      for (let i=0;i<5;i++){ c.fillStyle = (Math.floor(s.elapsed*8)+i)%2 ? '#ff3bd6' : '#ffe14a'; c.beginPath(); c.arc(x-15+i*7.5, y+4, 1.6, 0, Math.PI*2); c.fill(); }   // blinking lights
    } else if (m.kind === 'donut') {
      const x = g2sx(m.wx), y = g2sy(m.wy);
      // green COLLECTIBLE halo + a small ↑ so it reads "good, eat it" (matches 甜点=好)
      const pulse = 0.6 + 0.4 * Math.sin(s.elapsed * 5);
      c.strokeStyle = `rgba(120,245,140,${0.5*pulse})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 26, 0, Math.PI*2); c.stroke();
      c.fillStyle = `rgba(120,245,140,${0.14*pulse})`; c.beginPath(); c.arc(x, y, 24, 0, Math.PI*2); c.fill();
      c.save(); c.translate(x, y); c.rotate(m.spin);
      c.fillStyle = '#d8884a'; c.beginPath(); c.arc(0,0, 18, 0, Math.PI*2); c.fill();                         // dough
      c.fillStyle = '#ff9ad0'; c.beginPath(); c.arc(0,0, 18, 0, Math.PI*2); c.arc(0,0, 7, 0, Math.PI*2, true); c.fill();   // pink icing ring
      for (let i=0;i<8;i++){ const a=i/8*Math.PI*2; c.fillStyle=['#fff','#ffe14a','#7af5e0','#ff4655'][i%4]; c.fillRect(Math.cos(a)*13-1, Math.sin(a)*13-1, 3, 2); }   // sprinkles
      c.restore();
      // bouncing ↑ above (eat-me cue)
      c.fillStyle = `rgba(154,245,154,${pulse})`; const ay = y - 32 + Math.sin(s.elapsed*6)*3;
      c.beginPath(); c.moveTo(x, ay-5); c.lineTo(x-6, ay+4); c.lineTo(x+6, ay+4); c.closePath(); c.fill();
    }
  }

  // The player IS a gangster: a head is ALWAYS visible at the wheel, and on a
  // heist (popT>0) he leans OUT toward the shop with a pistol + muzzle flash +
  // cash — the "人头露出来 / 人跟枪合一" drive-by the user asked for.
  function drawGangster(c, carSx, carSy, laneW, side, popT, elapsed) {
    const dir = (side >= 0) ? 1 : -1;
    const robbing = popT > 0;
    const lean = robbing ? Math.min(1, popT * 1.6) : 0;          // how far he leans out
    const headR = robbing ? 8 : 5.5;
    const hx = carSx + dir * laneW * 0.30 * lean;                // head slides toward the shop side
    const hy = carSy - 6 - 4 * lean;
    if (robbing) {
      // torso leaning out of the window
      c.fillStyle = '#23252e';
      c.beginPath(); c.moveTo(carSx, carSy + 2); c.lineTo(hx, hy + 2); c.lineTo(hx + dir*7, hy + 12); c.lineTo(carSx + dir*4, carSy + 8); c.closePath(); c.fill();
      // outstretched arm + pistol aimed at the shop
      const gx = hx + dir * 16, gy = hy + 1;
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(hx, hy + 2); c.lineTo(gx, gy); c.stroke(); c.lineCap = 'butt';
      c.fillStyle = '#15161b'; c.fillRect(Math.min(gx, gx+dir*10), gy - 3, 10, 5); c.fillRect(gx + dir*2, gy + 1, 3, 5);   // pistol slide + grip
      // muzzle flash (flickers during the first chunk of the pop)
      if (popT > 0.55 && (Math.floor(elapsed * 30) % 2 === 0)) {
        const mx = gx + dir * 11;
        c.fillStyle = '#fff3a0'; c.beginPath(); c.moveTo(mx, gy); c.lineTo(mx + dir*10, gy - 5); c.lineTo(mx + dir*6, gy); c.lineTo(mx + dir*10, gy + 5); c.closePath(); c.fill();
        c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(mx, gy, 3, 0, Math.PI*2); c.fill();
      }
      // cash bills bursting from the shop side
      for (let i=0;i<3;i++){ const bx=gx+dir*(8+i*5), by=gy-6-i*4+Math.sin(elapsed*12+i)*2; c.fillStyle='#7ad17a'; c.fillRect(bx-3,by-2,6,4); c.fillStyle='#2e7d32'; c.fillRect(bx-1,by-1,2,2); }
    }
    // head (skin + dark cap + mask slit), drawn last so it sits clearly on top
    c.fillStyle = '#caa07a'; c.beginPath(); c.arc(hx, hy, headR, 0, Math.PI*2); c.fill();
    c.fillStyle = '#16171c'; c.beginPath(); c.arc(hx, hy - headR*0.35, headR, Math.PI, Math.PI*2); c.fill();
    c.fillStyle = '#0c0d10'; c.fillRect(hx - headR*0.6, hy - 1, headR*1.2, 2);
  }

  // Noir vignette + a breathing red tint that intensifies with the wanted level.
  function drawNoirOverlay(c, W, H, s) {
    const g = c.createRadialGradient(W/2, H*0.5, Math.min(W,H)*0.34, W/2, H*0.5, Math.max(W,H)*0.74);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (s.heat > 0.2) {
      const inten = Math.min(0.30, 0.05 + 0.045 * s.heat) * (0.7 + 0.3 * Math.sin(s.elapsed * 5));
      const r = c.createRadialGradient(W/2, H*0.5, Math.min(W,H)*0.4, W/2, H*0.5, Math.max(W,H)*0.74);
      r.addColorStop(0, 'rgba(200,20,20,0)'); r.addColorStop(1, `rgba(200,20,20,${inten})`);
      c.fillStyle = r; c.fillRect(0, 0, W, H);
    }
  }
  // 常驻目标条 — a first-timer must always see "what am I doing + how do I win".
  // Sits just under the timer: "抢光发光的店 N/总" + a progress pips row.
  function drawGoalBar(c, W, H, s) {
    const done = s.robbedCount || 0, total = (s.shops && s.shops.length) || 4;
    const txt = done >= total ? '抢光了! 活到时间到就赢' : `抢光发光的店  ${done}/${total}`;
    // R11: sits at y=62 — in the CENTER gap between the left $ box and right COPS box
    // (drawMiniHUD top=60), BELOW the HP DOM bar (44-58px), so nothing overlaps.
    c.font = 'bold 12px monospace'; const w = Math.max(150, c.measureText(txt).width + 24), x = W/2 - w/2, y = 62;
    c.fillStyle = 'rgba(10,13,20,0.72)'; c.fillRect(x, y, w, 22);
    c.strokeStyle = 'rgba(255,210,80,0.6)'; c.lineWidth = 1; c.strokeRect(x, y, w, 22);
    c.fillStyle = '#ffd24a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, W/2, y + 11);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }

  // 开局序幕 — the first ~3.5s teach "怎么玩" by SHOWING it: a big centered call-out
  // that a 完全没玩过的小白 reads in 2 seconds. Fades out once they rob the first shop
  // or time passes. The lane carpet/arrow on the first shop (drawShopGuidance) does the
  // rest. This is the "大妈也能秒懂" onboarding.
  function drawIntroCoach(c, W, H, s) {
    if (s.robbedCount > 0) return;                  // already robbed → learned, stop coaching
    const t = s.elapsed || 0;
    // STUCK re-hint: still no heist by 5s → a louder, simpler nudge keeps a 小白 from
    // floundering (industrial onboarding: never leave the new player lost).
    if (t > 5.0) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 4);
      c.save(); c.globalAlpha = pulse;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, H*0.44, W, 38);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#ffd24a'; c.font = 'bold 16px sans-serif';
      c.fillText('👉 开进发光的店就能抢钱!', W/2, H*0.44 + 19);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.restore();
      return;
    }
    if (t > 4.0) return;
    const fade = t < 3.0 ? 1 : (4.0 - t) / 1.0;     // hold 3s, fade over 1s
    c.save(); c.globalAlpha = Math.max(0, fade);
    // dim band behind the text
    c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(0, H*0.40, W, 96);
    c.textAlign = 'center';
    c.fillStyle = '#ffd24a'; c.font = 'bold 22px sans-serif'; c.textBaseline = 'middle';
    c.fillText('开车去抢钱! 💰', W/2, H*0.40 + 26);
    c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif';
    c.fillText('滑左摇杆 → 开进发光的店,自动打劫', W/2, H*0.40 + 54);
    c.fillStyle = '#5af5e0'; c.font = 'bold 12px sans-serif';
    c.fillText('抢光所有店 或 活到 30 秒 = 赢', W/2, H*0.40 + 78);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.restore();
  }

  // 常驻 ghost 摇杆 — the engine's floating joystick is invisible until touched, so a
  // first-timer never sees WHERE to drive ("左摇杆没展示出来"). This draws a persistent
  // ghost stick in the left-bottom thumb zone: bright + "拖这里开车" during the intro,
  // dim after the first heist, hidden while you're actively steering (real knob takes over).
  function drawGhostJoystick(c, W, H, s) {
    const steering = (s._steerMode === 'analog' && s._analogX != null && Math.abs(s._analogX) > 0.05);
    if (steering) return;                                   // real joystick is active → don't double-draw
    const cx = W * 0.18, cy = H * 0.78, R = 42;
    const intro = (s.robbedCount === 0 && (s.elapsed || 0) < 6);
    const pulse = intro ? (0.6 + 0.4 * Math.sin(s.elapsed * 4)) : 0.4;
    c.save();
    // base ring
    c.strokeStyle = `rgba(255,255,255,${0.22*pulse + 0.12})`; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI*2); c.stroke();
    // thumb dot
    c.fillStyle = `rgba(90,245,224,${0.30*pulse + 0.20})`; c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI*2); c.fill();
    c.strokeStyle = `rgba(90,245,224,${0.5*pulse + 0.3})`; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI*2); c.stroke();
    // directional hint arrows (subtle) — shows it slides
    c.fillStyle = `rgba(255,255,255,${0.3*pulse})`;
    c.beginPath(); c.moveTo(cx-R-6, cy); c.lineTo(cx-R+2, cy-5); c.lineTo(cx-R+2, cy+5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx+R+6, cy); c.lineTo(cx+R-2, cy-5); c.lineTo(cx+R-2, cy+5); c.closePath(); c.fill();
    // label during intro
    if (intro) {
      c.globalAlpha = pulse; c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center';
      c.fillText('拖这里开车', cx, cy + R + 16); c.globalAlpha = 1; c.textAlign = 'left';
    }
    c.restore();
  }

  // ★ wanted level, top-center.
  function drawWantedHUD(c, W, H, s) {
    let str = ''; for (let i = 1; i <= TUNING.heatMax; i++) str += (i <= s.stars ? '★' : '☆');
    c.font = 'bold 17px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (s.stars > 0) { c.shadowColor = '#ff2b2b'; c.shadowBlur = 10; }
    c.fillStyle = s.stars > 0 ? '#ff3b3b' : 'rgba(255,255,255,0.3)';
    c.fillText(str, W/2, 86);
    c.shadowBlur = 0; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  // RAMPAGE chain: 连击 ×N + live cash multiplier + a draining "keep it alive" bar.
  function drawRampageHUD(c, W, H, s) {
    const n = s.robCombo || 0; if (n < 2) return;
    const mul = Math.min(TUNING.comboCashMax, 1 + n * TUNING.comboCashStep);
    const pop = s._comboFlashT > 0 ? 1.18 : 1;
    const col = n >= 8 ? '#ff3bd6' : n >= 5 ? '#ff8a3b' : '#ffd24a';
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${Math.round((15 + Math.min(11, n)) * pop)}px monospace`;
    c.shadowColor = col; c.shadowBlur = 8; c.fillStyle = col;
    c.fillText(`连击 ×${n}   现金×${mul.toFixed(1)}`, W/2, 112);
    c.shadowBlur = 0;
    const frac = Math.max(0, Math.min(1, s.comboT / TUNING.comboWindowS)), bw = 124, bx = W/2 - bw/2, by = 124;
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(bx, by, bw, 4);
    c.fillStyle = col; c.fillRect(bx, by, bw * frac, 4);
    c.restore(); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }

  function drawMiniHUD(c, W, H, s, t) {
    const pad = 10, boxW = 92, boxH = 26, top = pad + 50;
    c.fillStyle = 'rgba(10,13,20,0.72)'; c.fillRect(pad, top, boxW, boxH);
    c.strokeStyle = t.shopGlow; c.lineWidth = 1; c.strokeRect(pad, top, boxW, boxH);
    c.fillStyle = '#fff'; c.font = 'bold 12px monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`$${s.cash}`, pad + 6, top + boxH/2);
    c.fillStyle = t.shopGlow; c.fillText(`${s.robbedCount}/${s.shops.length}`, pad + 56, top + boxH/2);
    // nitro charges (moved off the overlapping DOM pill → canvas, stacked under $)
    const ny = top + boxH + 5;
    c.fillStyle = 'rgba(10,13,20,0.72)'; c.fillRect(pad, ny, boxW, 22);
    c.strokeStyle = '#00f0ff'; c.lineWidth = 1; c.strokeRect(pad, ny, boxW, 22);
    c.fillStyle = s.player.boostsLeft > 0 ? '#37e0ff' : 'rgba(120,120,130,0.7)';
    c.font = 'bold 12px monospace'; c.textBaseline = 'middle';
    c.fillText(`⚡ × ${s.player.boostsLeft}`, pad + 6, ny + 11);
    c.textBaseline = 'alphabetic';
    const cBoxW = 64;
    c.fillStyle = 'rgba(10,13,20,0.72)'; c.fillRect(W - cBoxW - pad, top, cBoxW, boxH);
    c.strokeStyle = '#ff3344'; c.strokeRect(W - cBoxW - pad, top, cBoxW, boxH);
    c.fillStyle = '#ff5566'; c.fillText(`COPS ${s.cops.length}`, W - cBoxW - pad + 6, top + boxH/2);
    c.textBaseline = 'alphabetic';
  }

  function drawLaneHUD(c, W, H, s, t) {
    const p = s.player, laneBoxW = 30, laneBoxH = 6, laneGap = 6, n = TUNING.laneCount;
    const totalW = laneBoxW*n + laneGap*(n-1), baseX = (W - totalW)/2, baseY = H - 22;
    for (let i = -TUNING.laneMax; i <= TUNING.laneMax; i++) {
      const x = baseX + (i+TUNING.laneMax)*(laneBoxW+laneGap), on = p.playerLane === i;
      c.fillStyle = on ? t.shopGlow : 'rgba(255,255,255,0.18)'; c.fillRect(x, baseY, laneBoxW, laneBoxH);
      if (on) { c.strokeStyle = t.shopGlow; c.lineWidth = 1; c.strokeRect(x-2, baseY-2, laneBoxW+4, laneBoxH+4); }
    }
    if (s.weatherMod && s.weatherMod.label) {
      c.fillStyle = s.weatherMod.affect ? '#ffcc66' : 'rgba(180,180,180,0.6)';
      c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(s.weatherMod.label, W/2, baseY - 10); c.textBaseline = 'alphabetic';
    }
    if (s.cops.length > 0) {
      let closest = Infinity; for (const cop of s.cops) { const d = p.wy - cop.wy; if (d > 0 && d < closest) closest = d; }
      const warn = 6 * $Iso().WS;
      if (closest < warn) {
        // chase HEARTBEAT — the closer the cop, the harder & faster the red pulse throbs
        const prox = 1 - closest / warn;                       // 0..1
        const beat = 0.55 + 0.45 * Math.sin(s.elapsed * (6 + prox * 10));
        const it = prox * beat;
        // edge-only pulse (radial, transparent center) so the road/car stay
        // readable — never a full-screen red wash, even at ★5 + point-blank.
        const v = c.createRadialGradient(W/2, H/2, W*0.42, W/2, H/2, W*0.74);
        v.addColorStop(0, 'rgba(255,40,40,0)'); v.addColorStop(1, `rgba(255,30,30,${0.34*it})`);
        c.fillStyle = v; c.fillRect(0, 0, W, H);
      }
    }
  }

  function drawSpeedLines(c, W, H, intensity) {
    c.save(); c.strokeStyle = `rgba(0,240,255,${0.5*intensity})`; c.lineWidth = 2;
    const cx = W/2, cy = H/2, r1 = Math.min(W,H)*0.35, r2 = r1 + 100*intensity;
    for (let i = 0; i < 16; i++) { const a = (i/16)*Math.PI*2 + intensity*0.5; c.beginPath(); c.moveTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1); c.lineTo(cx+Math.cos(a)*r2, cy+Math.sin(a)*r2); c.stroke(); }
    const g = c.createRadialGradient(cx,cy,Math.min(W,H)*0.2,cx,cy,Math.max(W,H)*0.6); g.addColorStop(0,'rgba(0,240,255,0)'); g.addColorStop(1,`rgba(0,240,255,${0.25*intensity})`); c.fillStyle = g; c.fillRect(0,0,W,H); c.restore();
  }

  function drawRain(c, W, H, elapsed) {
    c.strokeStyle = 'rgba(180,210,255,0.55)'; c.lineWidth = 1.5;
    for (let i = 0; i < 200; i++) { const seed = (i*9301 + Math.floor(elapsed*700)) % 233280 / 233280; const x = seed*W*1.2 - W*0.1; const y = ((elapsed*800 + i*47) % (H+40)) - 20; c.beginPath(); c.moveTo(x,y); c.lineTo(x-5, y+18); c.stroke(); }
    const lp = (elapsed*0.17) % 1; if (lp < 0.04) { const a = (1 - lp/0.04)*0.5; c.fillStyle = `rgba(220,230,255,${a})`; c.fillRect(0,0,W,H); }
  }
  function drawSnow(c, W, H, elapsed) {
    for (let i = 0; i < 150; i++) { const seed = (i*7919) % 233280 / 233280; const dx = Math.sin(elapsed*0.6+i)*25; const x = (seed*W+dx)%W; const y = ((elapsed*(50+seed*50)+i*31)%(H+20))-10; const sz = seed>0.7?3:seed>0.4?2:1; c.fillStyle = `rgba(235,240,255,${seed>0.7?0.95:0.7})`; c.fillRect(x,y,sz,sz); }
  }

})();
