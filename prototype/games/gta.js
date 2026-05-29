// ============================================================
//  GTA · HEIST RUN — 30s Subway-Surfers-style smash-and-grab runner
//  REWRITE v2 (marker: GTA_RUNNER_V2). Vertical top-down runner: the
//  player car is fixed low on screen, a 3-lane road scrolls bottom→top,
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
//    { wx, wy, lane:-1|0|1, type:'car'|'block', r, vy, w, color, hit }
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
    laneCount:        3,
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
    copInvulnS:       1.5,

    // ── robbery ──
    robWindowTiles:   2.0,   // ± shop forward window (× ws)
    robTimeS:         0.3,   // time to complete one grab (snappy)
    robberPopS:       0.9,   // gangster lean-out (head+gun+flash) visible this long after grab
    shopCountDefault: 4,

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

  // ─── theme palette (from engine pickTheme('gta')) ───────────
  function expandTheme(themeKey, base) {
    return {
      key:       themeKey,
      sky:       base.sky,
      sky2:      base.sky2,
      road:      base.ground,
      roadEdge:  tint(base.accent, 0.10),
      offRoad:   shade(base.ground, 0.42),
      building:  shade(base.sky2, 0.10),
      buildingLit: tint(base.sky2, 0.28),
      shopGlow:  base.accent,
      car:       '#e8412b',
      carGlass:  '#9be7ff',
      traffic:   ['#3f6fd0', '#d8a32e', '#7a4fc0', '#2fa86a', '#c84f7a'],
      cop:       '#10131c',
      copGlass:  '#1e6fff',
      neonA:     base.accent,
      neonB:     tint(base.accent, 0.40),
    };
  }

  // ─── vertical projection (player low, road scrolls up) ──────
  function gProj(s) {
    const Iso = $Iso(), W = $W(), H = $H(), p = s.player, ws = Iso.WS;
    const PXF = (H * 0.72) / 360;        // forward px per wu
    const PXW = (W * 0.80) / (6 * ws);   // lateral px per wu
    const CAM_SY = H * TUNING.camNeutralFrac;         // FIXED screen anchor — the world scrolls via camWY, never via the player's row
    const camWY = (s.camWY != null) ? s.camWY : (p ? p.wy : 0);
    return {
      ws, PXF, PXW, CAM_SY, camWY,
      sx: (wx) => W / 2 + (wx - s.roadCenterX) * PXW,
      sy: (wy) => CAM_SY - (wy - camWY) * PXF,        // anchored to the camera, not the player → no "whole map jumps" bug
    };
  }

  // ─── top-down car (player / cop / traffic) ──────────────────
  function drawCarTopDown(c, sx, sy, w, body, glass) {
    sx = Math.round(sx); sy = Math.round(sy);
    const h = w * 1.7;
    c.fillStyle = body; c.fillRect(sx - w/2, sy - h/2, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; c.strokeRect(sx - w/2, sy - h/2, w, h);
    c.fillStyle = glass; c.fillRect(sx - w*0.34, sy - h*0.30, w*0.68, h*0.26);          // windshield (front=up)
    c.fillStyle = mix(body, '#000', 0.25); c.fillRect(sx - w*0.34, sy + h*0.06, w*0.68, h*0.22); // rear
    c.fillStyle = '#fff6c0'; c.fillRect(sx - w*0.34, sy - h/2, w*0.20, 4); c.fillRect(sx + w*0.14, sy - h/2, w*0.20, 4); // headlights
  }

  // Input is fully handled by the engine 'runner' touch router (see
  // encore_prototype.html onTouch*): LEFT half = joystick → getMoveVec()
  // (Y throttle, X steer); RIGHT half = tap → onAction()=nitro, h-swipe →
  // onSwipe()=lane. No local pointer handler — a redundant one double-fired
  // nitro on vertical joystick drags.

  // ─── ramp: cruise speed multiplier grows 1.0 → rampMul over the round ─
  function rampFactor(s) {
    const k = Math.min(1, s.elapsed / TUNING.durationS);
    return 1 + (TUNING.rampMul - 1) * k;
  }

  // ─── spawners ───────────────────────────────────────────────
  function laneWX(s, lane) { return s.roadCenterX + lane * $Iso().WS; }

  function generateShops(count, ws, roadCenterX, startWY) {
    const shops = [];
    const names = ['QUIK MART', 'GOLD SHOP', 'BANK', 'JEWELRY', 'LIQUOR', 'ATM', 'PAWN', 'CASINO'];
    // Spread shops across the run. In survive mode the run is time-bounded, so
    // place them by forward distance from the start using the average ramp speed.
    const avgSpeed = TUNING.baseSpeedWU * (1 + TUNING.rampMul) / 2;
    const runWY = avgSpeed * TUNING.durationS * 0.92;   // forward distance covered in a round
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.45 : (i + 0.5) / count;   // 0.5..n-0.5 spread, first ~5s in
      const side = (i % 2 === 0) ? -1 : 1;                // alternate L/R lane
      shops.push({
        id: i, side, lane: side,
        wy: startWY + 4 * ws + runWY * t,
        wx: laneWX({ roadCenterX }, side),                // shop sits in its lane (you rob from the lane)
        robbed: false, progress: 0,
        money: 250 + ((i * 137) % 4) * 80,                // deterministic 250/330/410/490 cycle
        name: names[i % names.length],
      });
    }
    return shops;
  }

  function spawnCop(s) {
    const lane = (Math.random() < 0.34) ? -1 : (Math.random() < 0.5 ? 0 : 1);
    return {
      wx: laneWX(s, lane), wy: s.player.wy - (TUNING.copSpawnBehindWU + Math.random() * 60),
      lane, r: $Iso().WS * 0.42,
      speed: TUNING.copSpeedMinWU + Math.random() * (TUNING.copSpeedMaxWU - TUNING.copSpeedMinWU),
      sirenPhase: Math.random() * Math.PI * 2, fireCd: 1.2,
    };
  }

  // Pick a lane for traffic; bias toward the player's lane so the player must act.
  function pickTrafficLane(s) {
    if (Math.random() < TUNING.trafficLaneBias) return s.player.playerLane;
    const others = [-1, 0, 1].filter(l => l !== s.player.playerLane);
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
    const openLane = [-1, 0, 1][(Math.random() * 3) | 0];   // exactly one lane stays open
    const aheadWU = P.CAM_SY / P.PXF + ws * 1.5;
    for (const lane of [-1, 0, 1]) {
      if (lane === openLane) continue;
      s.obstacles.push({
        wx: laneWX(s, lane), wy: s.camWY + aheadWU, lane,
        type: 'block', r: ws * 0.46, vy: 0, w: 0.92, color: '#caa23a', hit: false,
      });
    }
    s.trafficQuiet = TUNING.roadblockQuietS;     // keep the open lane clear briefly
    if (window.showBanner) window.showBanner('⚠ ROADBLOCK', '#ffcc44', 900);
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
  function pushShake(s, mag) {
    s.shakeT = Math.min(0.4, (s.shakeT || 0) + 0.15);
    s.shakeMag = Math.max(s.shakeMag || 0, mag);
  }

  // ─── module ─────────────────────────────────────────────────
  window.Games = window.Games || {};
  window.Games.gta = {
    name: 'GTA · HEIST RUN',
    badge: 'GTA',
    duration: TUNING.durationS,
    showMP: false,
    fxKey: 'gta',
    pills: { weapon: false, kit: true },
    touchMode: 'runner',

    onSwipe(dir) {
      const s = $state(); if (!s || !s.player) return;
      const p = s.player;
      p.playerLane = dir === 'right' ? Math.min(1, p.playerLane + 1) : Math.max(-1, p.playerLane - 1);
      p._lastInputT = s.elapsed;
      const SFX = $SFX(); try { if (SFX.screech) SFX.screech(); } catch (_) {}
    },
    onAction() { if (this.castPress) this.castPress('q'); },

    skills() { return [ { key: 'q', ico: '⚡', label: '氮气', color: '#00f0ff' }, null, null, null ]; },

    init() {
      const cfgScenario = (window.pendingConfig && window.pendingConfig.scenario) || {};
      const themeFromConfig = (window.pendingConfig && window.pendingConfig.theme) || null;
      const shopCount = Math.max(1, Math.min(8, (cfgScenario.shop_count ?? TUNING.shopCountDefault) | 0));
      const copRate   = Math.max(0.0, Math.min(2.0, +cfgScenario.cop_spawn_rate || 1.0));

      const picked = $pickTheme('gta');
      const themeKey = (picked && picked.name) || themeFromConfig || 'night';
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
      if (badge) badge.textContent = this.badge + ' · ' + themeKey.toUpperCase();

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
        wx: roadCenterX, wy: 2 * ws, targetX: roadCenterX, playerLane: 0,
        speed: TUNING.baseSpeedWU, hp: TUNING.hp, maxHp: TUNING.hp,
        r: ws * 0.30, boostT: 0, boostsLeft: TUNING.nitroCount, invulnT: 0,
        _kbCooldown: 0, _lunge: 0, _autoIdle: 0, _lastInputT: -99,
        _robbing: false, _robSide: 0, _robberPop: 0,
      };

      const halfRoadW = 1.5 * ws + ws * 0.4;
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
        player,
        shops: generateShops(shopCount, ws, roadCenterX, startWY),
        obstacles: [], trafficN: 0, trafficAcc: 0, trafficQuiet: 0, roadblockAcc: 0,
        cops: [], copBullets: [], copSpawnAcc: 0, copCount: 0, copsMaxActive: TUNING.copMaxActive,
        floaters: [], sparks: [], _engineOn: false, _speedLinesT: 0,
        shakeT: 0, shakeMag: 0, robCombo: 0,
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
      pushShake(s, 16);
      s._speedLinesT = 1.5;
      const J = $J(); if (J) { J.flash('#bff7ff', 60); }
      if (window.showBanner) window.showBanner('⚡ NITRO!', '#00f0ff', 700);
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
        const sideways = Math.abs(mvx) > Math.abs(mvy) + 0.1;     // steer only when the push is more sideways than forward
        if (mvx < -0.5 && sideways && s._joyLatched !== 'left')  { p.playerLane = Math.max(-1, p.playerLane - 1); s._joyLatched = 'left';  manualInput = true; }
        else if (mvx > 0.5 && sideways && s._joyLatched !== 'right') { p.playerLane = Math.min(1, p.playerLane + 1); s._joyLatched = 'right'; manualInput = true; }
        else if (Math.abs(mvx) < 0.2) s._joyLatched = null;
        if (Math.abs(mvx) > 0.2) manualInput = true;
      }
      p._kbCooldown = Math.max(0, p._kbCooldown - dt);
      const K = $keys();
      if (K) {
        if (K['w'])      { throttle = TUNING.throttleUpMul; manualInput = true; }   // desktop forward
        else if (K['s']) { throttle = TUNING.throttleDnMul; manualInput = true; }   // desktop back
        if (p._kbCooldown <= 0) {
          if (K['a'] || K['arrowleft'])  { p.playerLane = Math.max(-1, p.playerLane - 1); p._kbCooldown = TUNING.kbLaneCooldownS; manualInput = true; }
          else if (K['d'] || K['arrowright']) { p.playerLane = Math.min(1, p.playerLane + 1); p._kbCooldown = TUNING.kbLaneCooldownS; manualInput = true; }
        }
      }
      // ── passive autopilot (friendliness): only for a TRULY idle viewer. Was
      // 0.6s, which grabbed the wheel during an active player's pauses and made
      // the car "自己左右晃". Now 2.5s so real players never trigger it; a
      // hands-off viewer still gets auto-play within ~7s (gate covers it). ──
      if (manualInput) p._lastInputT = s.elapsed;
      if (!s._autoDisable && (s.elapsed - p._lastInputT) > 2.5) {
        let lane = p.playerLane;
        // 1) flee an imminent obstacle in our lane
        let danger = null, dBest = Infinity;
        for (const o of s.obstacles) {
          if (o.hit) continue; const dy = o.wy - p.wy;
          if (dy > 0 && dy < ws * 5 && o.lane === lane && dy < dBest) { dBest = dy; danger = o; }
        }
        if (danger) {
          const safe = [-1, 0, 1].filter(l => l !== lane && !s.obstacles.some(o => !o.hit && o.lane === l && Math.abs(o.wy - p.wy) < ws * 3));
          if (safe.length) lane = safe.reduce((a, b) => Math.abs(b - lane) < Math.abs(a - lane) ? b : a, safe[0]);
        } else {
          // 2) line up the next unrobbed shop
          let shop = null, sBest = Infinity;
          for (const sh of s.shops) { if (sh.robbed) continue; const dy = sh.wy - p.wy; if (dy < -ws) continue; if (dy < sBest) { sBest = dy; shop = sh; } }
          if (shop && sBest < ws * 3.5) lane = shop.side; else lane = 0;
        }
        p.playerLane = lane;
      }

      // ── lateral lane snap ──
      p.targetX = laneWX(s, p.playerLane);
      const latDelta = p.targetX - p.wx;
      const latStep = Math.sign(latDelta) * Math.min(Math.abs(latDelta), TUNING.laneSnapWU * s.weatherMod.laneSpeed * dt);
      p.wx = Math.max(s.latLeft, Math.min(s.latRight, p.wx + latStep));

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
        if (p.playerLane === shop.side && dyw < HOVER_FWD) {
          p._robbing = true; p._robSide = shop.side;
          shop.progress = Math.min(1, shop.progress + dt / TUNING.robTimeS);
          if (shop.progress >= 1) {
            shop.robbed = true; s.robbedCount += 1; s.kills = s.robbedCount; s.cash += shop.money;
            s.robCombo = (s.robCombo || 0) + 1; p._robberPop = TUNING.robberPopS;
            pushShake(s, TUNING.robTrauma);
            const px = P.sx(shop.wx), py = P.sy(shop.wy);
            for (let i = 0; i < 5; i++) pushSpark(s, px + (Math.random()-0.5)*24, py + (Math.random()-0.5)*24, '#ffd24a', 26);
            s.floaters.push({ wx: shop.wx, wy: shop.wy, text: '💰 +$' + shop.money, color: '#ffd24a', life: 1.3 });
            const J = $J();
            if (J) { J.hitstop(TUNING.robHitstopS); J.flash('#fff3a0', 70); J.burst(px, py, 'cash', '#ffd24a');
                     J.popup('抢到 $' + shop.money + (s.robCombo >= 2 ? '  连抢×' + s.robCombo : ''), $W()/2, $H()*0.34, { color:'#ffd24a', size: 22 + Math.min(14, s.robCombo*3), dur: 1.0 }); }
            const SFX = $SFX(); try { if (SFX.cash) SFX.cash(); } catch (_) {}
            if (window.showBanner) window.showBanner(`💰 抢到 $${shop.money}!`, '#ffd24a', 900);
          }
        } else if (shop.progress > 0) shop.progress = Math.max(0, shop.progress - dt * 0.6);
      }

      // ── traffic + roadblock spawning (interval shrinks as speed ramps) ──
      const trafficGap = TUNING.trafficIntervalS * (1 - TUNING.trafficRampCut * (rf - 1) / (TUNING.rampMul - 1));
      s.roadblockAcc += dt;
      if (s.roadblockAcc >= TUNING.roadblockEveryS) { s.roadblockAcc = 0; spawnRoadblock(s, P); }
      s.trafficAcc += dt;
      if (s.trafficQuiet <= 0 && s.trafficAcc >= trafficGap) { s.trafficAcc = 0; spawnTraffic(s, P); }

      // ── obstacles: advance + lane-gated collision + cull ──
      for (const o of s.obstacles) {
        o.wy += o.vy * dt;
        if (o.hit) continue;
        if (o.lane === p.playerLane && Math.abs(o.wy - p.wy) < (p.r + o.r) && (p.invulnT || 0) <= 0) {
          o.hit = true;
          p.hp = Math.max(0, p.hp - TUNING.trafficDmg);
          p.invulnT = 0.9; s.robCombo = 0;
          pushShake(s, 14);
          pushSpark(s, P.sx(o.wx), P.sy(p.wy), '#ff7744', 16);
          const J = $J(); if (J) { J.flash('#ff5533', 90); J.chroma(90); J.hitstop(0.05); }
          const SFX = $SFX(); try { if (SFX.hit) SFX.hit(); } catch (_) {}
          if (window.showBanner) window.showBanner(`撞车! HP ${p.hp}`, '#ff7744', 600);
          if (p.hp <= 0) { return this._bust(s); }
        }
      }
      s.obstacles = s.obstacles.filter(o => (o.wy - p.wy) > -ws * 3 && !(o.hit && (o.wy - p.wy) < 0));

      // ── cop spawning ──
      const spawnThreshold = s.cops.length === 0 ? TUNING.firstCopDelayS : TUNING.copIntervalS;
      s.copSpawnAcc += dt * Math.max(0.0001, s.copRate);
      if (s.copSpawnAcc >= spawnThreshold && s.cops.length < s.copsMaxActive) {
        s.cops.push(spawnCop(s)); s.copCount += 1; s.copSpawnAcc -= spawnThreshold;
        if (window.showBanner) window.showBanner(s.copCount === 1 ? '🚨 POLICE!' : `🚨 +1 COP (${s.copCount})`, '#ff3344', 1200);
        pushShake(s, 12);
        try { if (window.startSiren) window.startSiren(); } catch (_) {}
      }

      // ── cop AI: chase + shoot + collide ──
      const copSpeedMod = s.weatherMod.fwd;
      for (const cop of s.cops) {
        const dxw = p.wx - cop.wx, dyw = p.wy - cop.wy, len = Math.hypot(dxw, dyw) || 1;
        cop.wx += (dxw / len) * cop.speed * copSpeedMod * dt;
        cop.wy += (dyw / len) * cop.speed * copSpeedMod * dt;
        cop.sirenPhase += dt * 6;
        cop.fireCd -= dt;
        const behind = p.wy - cop.wy;
        if (cop.fireCd <= 0 && behind > 0 && behind < TUNING.copFireRangeWU) {
          cop.fireCd = 1.1 + Math.random() * 0.6;
          const ang = Math.atan2(p.wy - cop.wy, p.wx - cop.wx);
          s.copBullets.push({ wx: cop.wx, wy: cop.wy, vx: Math.cos(ang)*TUNING.copBulletSpeedWU, vy: Math.sin(ang)*TUNING.copBulletSpeedWU, life: 1.6, _minD: 1e9 });
          const SFX = $SFX(); try { if (SFX.shot) SFX.shot(); } catch (_) {}
        }
        if (Math.hypot(p.wx - cop.wx, p.wy - cop.wy) < p.r + cop.r && (p.invulnT || 0) <= 0) {
          p.hp = Math.max(0, p.hp - TUNING.copCollideDmg); p.invulnT = TUNING.copInvulnS; s.robCombo = 0;
          pushShake(s, TUNING.copHitTrauma);
          const J = $J(); if (J) { J.flash('#ff3344', 100); J.chroma(110); J.hitstop(0.06); }
          const SFX = $SFX(); try { if (SFX.hit) SFX.hit(); } catch (_) {}
          if (window.showBanner) window.showBanner(`撞上警车! HP ${p.hp}`, '#ff3344', 700);
          if (p.hp <= 0) { return this._bust(s); }
        }
      }

      // ── cop bullets: travel, hit (dodge by lane), near-miss bonus ──
      for (const b of s.copBullets) {
        b.wx += b.vx * dt; b.wy += b.vy * dt; b.life -= dt;
        const d = Math.hypot(b.wx - p.wx, b.wy - p.wy); b._minD = Math.min(b._minD, d);
        if (d < p.r + 6 && (p.invulnT || 0) <= 0) {
          b.life = 0; p.hp = Math.max(0, p.hp - TUNING.copBulletDmg); p.invulnT = 0.6; s.robCombo = 0;
          pushShake(s, 8); pushSpark(s, P.sx(p.wx), P.sy(p.wy), '#ffd84a', 10);
          const J = $J(); if (J) { J.flash('#ff7744', 70); J.chroma(80); }
          const SFX = $SFX(); try { if (SFX.hit) SFX.hit(); } catch (_) {}
          if (window.showBanner) window.showBanner(`中枪! HP ${p.hp}`, '#ff7744', 600);
          if (p.hp <= 0) { return this._bust(s); }
        }
      }
      for (const b of s.copBullets) {
        if (b.life <= 0 && !b._scored && b._minD < p.r + TUNING.nearMissPx[1] && b._minD > p.r + TUNING.nearMissPx[0]) {
          b._scored = true; s.cash += TUNING.nearMissBonus;
          const J = $J(); if (J) { J.hitstop(0.07); J.popup('好险! +' + TUNING.nearMissBonus, P.sx(p.wx), P.sy(p.wy) - 30, { color:'#5af5e0', size: 16 }); }
        }
      }
      s.copBullets = s.copBullets.filter(b => b.life > 0);
      if (p.invulnT > 0) p.invulnT -= dt;
      s.cops = s.cops.filter(cop => (p.wy - cop.wy) < 800);
      if (s.cops.length === 0) { try { window.stopSiren && window.stopSiren(); } catch (_) {} }

      // ── engine sound ──
      if (!s._engineOn) { try { window.startEngine && window.startEngine(); } catch (_) {} s._engineOn = true; }
      try { window.setEngineThrottle && window.setEngineThrottle(boosting ? 1 : 0.45); } catch (_) {}

      for (const f of s.floaters) f.life -= dt;
      s.floaters = s.floaters.filter(f => f.life > 0);
      updateSparks(s, dt);
      if (s.shakeT > 0) s.shakeT -= dt;

      // ── win conditions ──
      const allHit = s.robbedCount >= s.shops.length;
      if (allHit) { return this._win(s, `ALL ${s.shops.length} HIT · $${s.cash}`); }
      if (TUNING.winMode === 'reach' && p.wy >= s.routeLengthWU) { return this._win(s, `GOT AWAY · $${s.cash}`); }
      if (TUNING.winMode === 'survive' && s.elapsed >= TUNING.durationS - TUNING.surviveFinishLeadS) {
        return this._win(s, `GOT AWAY · ${s.robbedCount}/${s.shops.length} · $${s.cash}`);
      }

      // ── HUD ──
      const scoreEl = $scoreEl();
      if (scoreEl) scoreEl.textContent = `ROBBED ${s.robbedCount}/${s.shops.length} · $${s.cash}`;
      const pillKit = document.getElementById('pill-kit');
      if (pillKit) { pillKit.textContent = `⚡ × ${p.boostsLeft}`; pillKit.classList.remove('hidden'); }
      const pillWpn = document.getElementById('pill-weapon');
      if (pillWpn) pillWpn.classList.add('hidden');
    },

    _win(s, sub) {
      s.gtaActive = false;
      try { window.stopSiren && window.stopSiren(); window.stopEngine && window.stopEngine(); } catch (_) {}
      const J = $J(); if (J) { J.confetti($W()); J.hitstop(0.1); }
      const SFX = $SFX(); try { if (SFX.win) SFX.win(); } catch (_) {}
      $finish(true, sub);
    },
    _bust(s) {
      s.gtaActive = false; pushShake(s, 20);
      try { window.stopSiren && window.stopSiren(); window.stopEngine && window.stopEngine(); } catch (_) {}
      const SFX = $SFX(); try { if (SFX.lose) SFX.lose(); } catch (_) {}
      $finish(false, 'BUSTED · $' + s.cash);
    },

    draw() {
      const s = $state(); if (!s) return;
      const ctx = $ctx(); if (!ctx) return;
      const W = $W(), H = $H(), t = s.theme, p = s.player;

      // shake
      let oX = 0, oY = 0;
      if (s.shakeT > 0 && s.shakeMag > 0) { oX = (Math.random()-0.5)*s.shakeMag; oY = (Math.random()-0.5)*s.shakeMag; }

      // sky
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, t.sky); grad.addColorStop(1, t.sky2);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      if (s.themeKey === 'rain') drawRain(ctx, W, H, s.elapsed);
      else if (s.themeKey === 'snownight') drawSnow(ctx, W, H, s.elapsed);
      else {
        const neon = ctx.createRadialGradient(W*0.5, H*0.32, 20, W*0.5, H*0.32, W*0.7);
        neon.addColorStop(0, t.neonA + '33'); neon.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = neon; ctx.fillRect(0, 0, W, H*0.55);
      }

      ctx.save(); ctx.translate(oX, oY);

      const P = gProj(s);
      const g2sx = P.sx, g2sy = P.sy, ws = P.ws;
      const laneW = ws * P.PXW;
      const roadHalf = 1.5 * laneW;

      // off-road + road band + curbs
      ctx.fillStyle = t.offRoad; ctx.fillRect(0, 0, W, H);
      drawRoadsideScenery(ctx, W, H, s, P, roadHalf);
      ctx.fillStyle = t.road; ctx.fillRect(W/2 - roadHalf, 0, roadHalf*2, H);
      ctx.fillStyle = t.roadEdge; ctx.fillRect(W/2 - roadHalf - 3, 0, 3, H); ctx.fillRect(W/2 + roadHalf, 0, 3, H);
      // scrolling lane dashes
      const dashH = 26, gap = 22, period = dashH + gap;
      const scroll = ((p.wy * P.PXF) % period);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const lx of [-0.5, 0.5]) { const x = g2sx(s.roadCenterX + lx*ws) - 2; for (let y = -period + scroll; y < H; y += period) ctx.fillRect(x, y, 4, dashH); }

      // shops
      for (const shop of s.shops) {
        const sy = g2sy(shop.wy); if (sy < -120 || sy > H + 80) continue;
        const sx = g2sx(shop.wx), bw = laneW * 0.92, bh = 64;
        ctx.fillStyle = shop.robbed ? mix(t.shopGlow, '#000', 0.55) : t.shopGlow;
        ctx.fillRect(sx - bw/2, sy - bh, bw, bh);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(sx - bw/2, sy - bh, bw, bh);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        ctx.fillText(shop.name, sx, sy - bh - 5);
        if (!shop.robbed) {
          const pulse = 0.6 + 0.4 * Math.sin(s.elapsed * 6);
          ctx.strokeStyle = `rgba(255,210,80,${pulse})`; ctx.lineWidth = 3; ctx.strokeRect(sx - bw/2 - 3, sy - bh - 3, bw + 6, bh + 6);
          ctx.fillStyle = '#ffd24a'; ctx.font = 'bold 14px monospace'; ctx.fillText('$' + shop.money, sx, sy - bh/2);
          if (shop.progress > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - bw/2, sy - bh - 16, bw, 6); ctx.fillStyle = '#5af5e0'; ctx.fillRect(sx - bw/2, sy - bh - 16, bw * shop.progress, 6); }
        } else { ctx.fillStyle = '#5af5e0'; ctx.font = 'bold 12px monospace'; ctx.fillText('✓抢', sx, sy - bh/2); }
        ctx.textAlign = 'left';
      }

      // obstacles (traffic cars + roadblocks)
      for (const o of s.obstacles) {
        const sy = g2sy(o.wy); if (sy < -80 || sy > H + 80) continue;
        const sx = g2sx(o.wx);
        if (o.type === 'block') {
          const bw = laneW * o.w;
          ctx.fillStyle = '#1a1a1a'; ctx.fillRect(sx - bw/2, sy - 10, bw, 20);
          for (let i = -2; i <= 2; i++) { ctx.fillStyle = (i & 1) ? '#f4c430' : '#222'; ctx.fillRect(sx - bw/2 + (i+2)*bw/5, sy - 10, bw/5, 20); }
          ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(sx - bw/2, sy - 10, bw, 20);
        } else {
          drawCarTopDown(ctx, sx, sy, laneW * o.w, o.color, '#11151f');
        }
      }

      // cops + bullets
      for (const cop of s.cops) {
        const sy = g2sy(cop.wy); if (sy < -80 || sy > H + 80) continue;
        const sx = g2sx(cop.wx);
        drawCarTopDown(ctx, sx, sy, laneW * 0.62, t.cop, t.copGlass);
        const fl = Math.sin(s.elapsed * 16 + cop.sirenPhase) > 0;
        ctx.fillStyle = fl ? '#ff2b2b' : '#2b6bff'; ctx.fillRect(sx - 8, sy - 4, 16, 4);
      }
      for (const b of s.copBullets) { const sx = g2sx(b.wx), sy = g2sy(b.wy); ctx.fillStyle = '#ffe24a'; ctx.fillRect(sx-2, sy-5, 4, 10); }

      // player car (lunge + nitro flame + robber pop)
      {
        const lift = (p._lunge || 0) + (p.boostT > 0 ? TUNING.boostHoldLiftPx : 0);
        const sx = g2sx(p.wx), sy = g2sy(p.wy) - lift;        // player's screen row comes from the camera projection
        if (p.boostT > 0) { ctx.fillStyle = '#37e0ff'; for (let i=0;i<3;i++){ const fw=8-i*2; ctx.globalAlpha=0.8-i*0.2; ctx.fillRect(sx-fw/2, sy+18+i*8, fw, 10); } ctx.globalAlpha=1; }
        const inv = (p.invulnT||0) > 0 && Math.floor(s.elapsed*12)%2===0;
        drawCarTopDown(ctx, sx, sy, laneW*0.66, inv ? '#ffffff' : t.car, t.carGlass);
        drawGangster(ctx, sx, sy, laneW, p._robSide, p._robberPop, s.elapsed);   // always-on driver head; leans out w/ gun on rob
      }

      // sparks + floaters
      for (const sp of s.sparks) { ctx.globalAlpha = Math.max(0, Math.min(1, sp.life*1.8)); ctx.fillStyle = sp.color; ctx.fillRect(sp.sx-2, sp.sy-2, 4, 4); }
      ctx.globalAlpha = 1;
      for (const f of s.floaters) { ctx.globalAlpha = Math.max(0, Math.min(1, f.life*1.2)); ctx.fillStyle = f.color; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.fillText(f.text, g2sx(f.wx), g2sy(f.wy) - (1-f.life)*30); ctx.textAlign = 'left'; ctx.globalAlpha = 1; }

      ctx.restore();

      drawMiniHUD(ctx, W, H, s, t);
      drawLaneHUD(ctx, W, H, s, t);
      const leadMaxWU = (TUNING.camNeutralFrac - TUNING.camTopFrac) * 360 / 0.72;   // H-independent
      const liftN = Math.min(1, Math.max(0, (s._lead || 0) / leadMaxWU));            // how far forward the player is driving
      const slInt = Math.max(Math.min(1, s._speedLinesT/0.4), p.boostT>0?0.75:0, liftN*0.7);
      if (slInt > 0.05) drawSpeedLines(ctx, W, H, slInt);
    },

    refit() { const s = $state(); if (!s || !s._fit) return; s._fit(); s.bg = $bakeGround(s.tiles, s.blocks, s.mapW, s.mapH); },
  };

  // ─── draw helpers ───────────────────────────────────────────
  // Scrolling roadside buildings — the "scenery rushing at you" speed cue.
  function drawRoadsideScenery(c, W, H, s, P, roadHalf) {
    const t = s.theme, ws = P.ws, period = ws * 2.2;
    const scroll = ((s.player.wy * P.PXF) % (period * P.PXF));
    for (const sideSign of [-1, 1]) {
      const edgeX = W/2 + sideSign * (roadHalf + 6);
      for (let k = -1; k < H / (period * P.PXF) + 2; k++) {
        const y = k * period * P.PXF + scroll;
        const seed = ((k * 2654435761) >>> 0) % 1000 / 1000;
        const bw = (28 + seed * 26);
        const bh = (40 + ((seed * 7919) % 90));
        const x = sideSign < 0 ? edgeX - bw : edgeX;
        c.fillStyle = seed > 0.7 ? t.buildingLit : t.building;
        c.fillRect(x, y - bh, bw, bh);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y - bh, bw, 3);
        // a couple of lit windows
        c.fillStyle = seed > 0.5 ? 'rgba(255,220,120,0.6)' : 'rgba(140,200,255,0.45)';
        c.fillRect(x + 5, y - bh + 8, 5, 6); c.fillRect(x + bw - 12, y - bh + 18, 5, 6);
      }
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

  function drawMiniHUD(c, W, H, s, t) {
    const pad = 10, boxW = 92, boxH = 26, top = pad + 50;
    c.fillStyle = 'rgba(10,13,20,0.72)'; c.fillRect(pad, top, boxW, boxH);
    c.strokeStyle = t.shopGlow; c.lineWidth = 1; c.strokeRect(pad, top, boxW, boxH);
    c.fillStyle = '#fff'; c.font = 'bold 12px monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`$${s.cash}`, pad + 6, top + boxH/2);
    c.fillStyle = t.shopGlow; c.fillText(`${s.robbedCount}/${s.shops.length}`, pad + 56, top + boxH/2);
    const cBoxW = 64;
    c.fillStyle = 'rgba(10,13,20,0.72)'; c.fillRect(W - cBoxW - pad, top, cBoxW, boxH);
    c.strokeStyle = '#ff3344'; c.strokeRect(W - cBoxW - pad, top, cBoxW, boxH);
    c.fillStyle = '#ff5566'; c.fillText(`COPS ${s.cops.length}`, W - cBoxW - pad + 6, top + boxH/2);
    c.textBaseline = 'alphabetic';
  }

  function drawLaneHUD(c, W, H, s, t) {
    const p = s.player, laneBoxW = 38, laneBoxH = 6, laneGap = 6;
    const totalW = laneBoxW*3 + laneGap*2, baseX = (W - totalW)/2, baseY = H - 22;
    for (let i = -1; i <= 1; i++) {
      const x = baseX + (i+1)*(laneBoxW+laneGap), on = p.playerLane === i;
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
      if (closest < warn) { const it = 1 - closest/warn; const v = c.createRadialGradient(W/2,H/2,W*0.3,W/2,H/2,W*0.7); v.addColorStop(0,'rgba(255,50,50,0)'); v.addColorStop(1,`rgba(255,50,50,${0.4*it})`); c.fillStyle = v; c.fillRect(0,0,W,H); }
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
