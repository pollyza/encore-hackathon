// ============================================================
//  GTA HEIST — 30-second smash-and-grab mini-game
//  Implements Games.gta per prototype/games/_interface.md
//
//  Wiring note for main agent:
//    The engine IIFE in encore_prototype.html currently keeps `Games`,
//    `state`, `ctx`, `Iso`, `finishGame`, etc. in closure. This file
//    registers on `window.Games.gta`. To wire it in, the main agent must
//    either:
//      (a) expose `Games` on window inside the IIFE
//          ( `window.Games = Games;` after `const Games = {};` ),
//          and add `Object.assign(Games, window.Games||{});` after the
//          script tag loads — OR —
//      (b) paste the contents of `Games.gta = {...}` directly inside the
//          IIFE alongside Games.fps / Games.moba / Games.br.
//
//    Either way, this module is structured to be drop-in compatible: it
//    references engine helpers by name (state, ctx, W, H, finishGame,
//    Iso, spawnParticles, showBanner, SFX, scoreEl, modeBadge, pillKit,
//    pillWpn) and assumes they resolve in the IIFE scope at call time.
//
//  Game design (full heist mode, per playspec_gta.md):
//    - Top-down driving view (NOT iso — overrides projection per frame)
//    - Player car auto-moves down the road at 250 px/s world
//    - Swipe left/right to steer car ±200 px from road center
//    - 4 shops scattered along a 1500-px track; loiter 1s in front to rob
//    - Cops spawn from rear, chase player with dumb steering (Δ toward player)
//    - Cop touch = finishGame(false); all 4 shops + alive = finishGame(true)
//    - 4 themes: night / rain / sunset / snownight
// ============================================================

(function bootGtaGame() {
  // Defer until the engine globals exist. We probe for a few engine markers
  // (state may be null pre-startGame, but ctx and finishGame must exist).
  function engineReady() {
    return typeof window !== 'undefined'
        && typeof window.document !== 'undefined'
        && document.getElementById('game') != null;
  }
  if (!engineReady()) {
    return setTimeout(bootGtaGame, 50);
  }

  // Hoisted refs the engine should provide via closure — we read them lazily
  // from window in case main agent exposes them, otherwise the IIFE-closure
  // bind will resolve at call time when this module is copy-pasted inline.
  function $ctx()     { return window.ctx     != null ? window.ctx     : (typeof ctx     !== 'undefined' ? ctx     : null); }
  function $W()       { return window.W       != null ? window.W       : (typeof W       !== 'undefined' ? W       : 360); }
  function $H()       { return window.H       != null ? window.H       : (typeof H       !== 'undefined' ? H       : 640); }
  function $state()   { return window.state   != null ? window.state   : (typeof state   !== 'undefined' ? state   : null); }
  function $setState(s){ if ('state' in window) { try { window.state = s; } catch(_){} } try { state = s; } catch(_){} }
  function $finish(won, sub) {
    const f = window.finishGame || (typeof finishGame !== 'undefined' ? finishGame : null);
    if (f) f(won, sub);
  }
  function $pickTheme(k){
    const fn = window.pickTheme || (typeof pickTheme !== 'undefined' ? pickTheme : null);
    return fn ? fn(k) : null;
  }
  function $bakeGround(t,b,w,h){
    const fn = window.bakeGround || (typeof bakeGround !== 'undefined' ? bakeGround : null);
    return fn ? fn(t,b,w,h) : { canvas: document.createElement('canvas'), offX:0, offY:0 };
  }
  function $modeBadge() {
    return document.getElementById('mode-badge');
  }
  function $scoreEl() {
    return document.getElementById('score');
  }

  // ─── Theme palettes ─────────────────────────────────────────
  // Self-contained palette per scenario theme. We do not call pickTheme()
  // because the registry only knows fps/moba/br/td themes — GTA needs its
  // own. Theme is picked from state.scenario or randomized.
  const THEMES = {
    night: {
      name: 'NIGHT',
      sky:        '#0a0d1a',
      road:       '#1e2230',
      roadLine:   '#f7d046',
      sidewalk:   '#2a2e3c',
      building:   '#1a1d28',
      buildingLit:'#3a4055',
      shopGlow:   '#ffb84d',
      shopRobbed: '#5af5e0',
      cop:        '#1e6fff',
      copLight:   '#ff3344',
      car:        '#e23a45',
      carHighlight:'#ffd0d4',
      neonA:      '#ff2bd6',
      neonB:      '#00f0ff',
    },
    rain: {
      name: 'RAIN',
      sky:        '#0f1419',
      road:       '#252a36',
      roadLine:   '#ffeb8a',
      sidewalk:   '#1a1e26',
      building:   '#1f2330',
      buildingLit:'#3d4257',
      shopGlow:   '#7ec8ff',
      shopRobbed: '#5af5e0',
      cop:        '#3080ff',
      copLight:   '#ff2944',
      car:        '#b5263a',
      carHighlight:'#f0b0b8',
      neonA:      '#5ab8ff',
      neonB:      '#9dffe5',
    },
    sunset: {
      name: 'SUNSET',
      sky:        '#3b1d2a',
      road:       '#3a2a2a',
      roadLine:   '#fff0c0',
      sidewalk:   '#4a2e2a',
      building:   '#2e1d22',
      buildingLit:'#6e3a3a',
      shopGlow:   '#ffd460',
      shopRobbed: '#5af5e0',
      cop:        '#2050cc',
      copLight:   '#ffeb46',
      car:        '#ff5544',
      carHighlight:'#ffd0a0',
      neonA:      '#ffb347',
      neonB:      '#ff6b6b',
    },
    snownight: {
      name: 'SNOWNIGHT',
      sky:        '#1a2030',
      road:       '#2c3140',
      roadLine:   '#f0f4ff',
      sidewalk:   '#3a4055',
      building:   '#252b3a',
      buildingLit:'#4d556e',
      shopGlow:   '#a8e0ff',
      shopRobbed: '#5af5e0',
      cop:        '#1e80ff',
      copLight:   '#ff4060',
      car:        '#dc4050',
      carHighlight:'#ffe0e4',
      neonA:      '#7fcdff',
      neonB:      '#e0e8ff',
    },
  };
  const THEME_KEYS = ['night', 'rain', 'sunset', 'snownight'];

  function pickGtaTheme(scenarioTheme) {
    if (scenarioTheme && THEMES[scenarioTheme]) {
      return { key: scenarioTheme, theme: THEMES[scenarioTheme] };
    }
    const k = THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)];
    return { key: k, theme: THEMES[k] };
  }

  // ─── Input: swipe / drag steering ───────────────────────────
  // We attach pointer listeners to the canvas exactly once and store the
  // active drag delta in the gta-local input bag. Listeners are removed
  // when finishGame fires (best-effort — we also check gameOver inside).
  const Input = {
    pointerId: null,
    startX: 0,
    currentX: 0,
    active: false,
    boost: false,
    boostTriggered: false,
    _attached: false,
  };

  function attachInput() {
    if (Input._attached) return;
    const c = document.getElementById('game');
    if (!c) return;
    const down = (e) => {
      // Only register if the game is active (state.gtaActive is set in init)
      const s = $state();
      if (!s || !s.gtaActive) return;
      const t = ('touches' in e) ? e.touches[0] : e;
      Input.pointerId = ('pointerId' in t) ? t.pointerId : 0;
      Input.startX = t.clientX;
      Input.currentX = t.clientX;
      Input.active = true;
      Input.boostTriggered = false;
    };
    const move = (e) => {
      if (!Input.active) return;
      const t = ('touches' in e && e.touches.length) ? e.touches[0] : e;
      Input.currentX = t.clientX;
    };
    const up = (e) => {
      if (!Input.active) return;
      const dx = Input.currentX - Input.startX;
      // Short tap (no swipe) triggers nitro
      if (Math.abs(dx) < 12) {
        Input.boost = true;
      }
      Input.active = false;
      Input.startX = 0;
      Input.currentX = 0;
    };
    c.addEventListener('pointerdown', down, { passive: true });
    c.addEventListener('pointermove', move, { passive: true });
    c.addEventListener('pointerup', up, { passive: true });
    c.addEventListener('pointercancel', up, { passive: true });
    c.addEventListener('touchstart', down, { passive: true });
    c.addEventListener('touchmove', move, { passive: true });
    c.addEventListener('touchend', up, { passive: true });
    Input._attached = true;
  }

  // ─── World layout helpers ───────────────────────────────────
  // The "world" is a vertical strip: road runs from y=0 (top, future) to
  // y=mapH (bottom, past). The camera follows the player; we render in
  // screen space with the camera placing player.wy at ~70% screen height.
  //
  // Conventions:
  //   - World X: 0 at road center; ±roadHalfW are road edges; clamp ±220.
  //   - World Y: progress along the heist route; player advances as Y grows.
  //   - Screen X: W/2 + (worldX scaled to view width).
  //   - Screen Y: (H * 0.70) + (worldY - player.wy) * yScale, capped.
  //
  // We deliberately don't use Iso.w2s — GTA's view is straight top-down.

  const ROAD_HALF_W = 180;        // px from center to road edge
  const PLAYER_X_LIMIT = 200;     // player can drift slightly onto curb
  const VIEW_RATIO = 0.70;        // player sits at 70% screen height
  const Y_SCALE = 1.0;            // 1 world px = 1 screen px vertically

  function projectToScreen(wx, wy, player, W, H) {
    const sx = W / 2 + wx;
    const sy = (H * VIEW_RATIO) + (wy - player.wy) * Y_SCALE;
    return { sx, sy };
  }

  function generateShops(count, mapSize) {
    // Distribute shops along the track. Reserve first 300px for warm-up
    // (HOW TO PLAY tutorial reads), put final shop a bit before track end.
    const shops = [];
    const startY = 300;
    const endY = Math.max(startY + 200, mapSize - 200);
    const span = endY - startY;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const wy = startY + span * t + (Math.random() - 0.5) * 60;
      // Alternate sides for visual variety
      const side = (i % 2 === 0) ? -1 : 1;
      const wx = side * (ROAD_HALF_W + 80);
      shops.push({
        id: i,
        wx, wy,
        side,
        robbed: false,
        progress: 0,         // 0..1 loot meter
        robTime: 1.0,         // seconds to fully rob
        money: 250 + Math.floor(Math.random() * 250),
        name: ['QUIK MART', 'GOLD SHOP', 'BANK', 'JEWELRY', 'LIQUOR', 'ATM'][i % 6],
      });
    }
    return shops;
  }

  function spawnCop(state, side) {
    // Spawn cop somewhere behind the player; "side" -1 left, 1 right, 0 center
    const offset = side === 0 ? (Math.random() - 0.5) * 200 : side * (60 + Math.random() * 100);
    return {
      wx: state.player.wx + offset,
      wy: state.player.wy - (260 + Math.random() * 120),   // behind player
      vx: 0, vy: 0,
      r: 22,
      speed: 200 + Math.random() * 20,
      sirenPhase: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.5 ? 0 : 1,
    };
  }

  // ─── Mini particle/shake helpers (avoid relying on engine particles
  //     since iso projection won't match our top-down view) ───────────
  function pushShake(state, mag) {
    state.shakeT = Math.min(0.4, (state.shakeT || 0) + 0.15);
    state.shakeMag = Math.max(state.shakeMag || 0, mag);
  }

  function pushSpark(state, sx, sy, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      state.sparks.push({
        sx, sy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.3,
        color,
      });
    }
  }

  function updateSparks(state, dt) {
    for (const s of state.sparks) {
      s.sx += s.vx * dt;
      s.sy += s.vy * dt;
      s.vy += 200 * dt;
      s.life -= dt;
    }
    state.sparks = state.sparks.filter(s => s.life > 0);
  }

  // ─── The Games.gta module ───────────────────────────────────
  window.Games = window.Games || {};
  window.Games.gta = {
    name: 'GTA · HEIST RUN',
    badge: 'GTA',
    duration: 30,
    showMP: false,
    fxKey: 'gta',
    pills: { weapon: false, kit: true },     // reuse the kit pill slot for $/robbed

    skills() {
      return [
        { key: 'q', ico: '⚡', label: 'NITRO', color: '#00f0ff' },
        { key: 'w', ico: '$',  label: 'CASH',  color: null      },
        null,
        null,
      ];
    },

    init() {
      attachInput();

      // Engine probes pendingConfig for scenario; mirror to convenient locals.
      const cfgScenario = (window.pendingConfig && window.pendingConfig.scenario) || {};
      const themeFromConfig = (window.pendingConfig && window.pendingConfig.theme) || null;

      const shopCount   = Math.max(1, Math.min(8, (cfgScenario.shop_count ?? 4) | 0));
      const copRate     = Math.max(0.0, Math.min(2.0, +cfgScenario.cop_spawn_rate || 0.2));
      const mapSize     = Math.max(800, Math.min(3000, (cfgScenario.map_size ?? 1500) | 0));

      const { key: themeKey, theme } = pickGtaTheme(themeFromConfig);

      // Set mode badge — engine expects this
      const badge = $modeBadge();
      if (badge) badge.textContent = this.badge + ' · ' + theme.name;

      // Build a minimal "iso" stub so engine helpers (applyScenarioOverrides,
      // refit) don't crash. We don't render via iso at all.
      const mapW = 32, mapH = 32;
      const Iso = window.Iso || (typeof window !== 'undefined' && window.Iso);
      if (Iso && typeof Iso.setTile === 'function') {
        Iso.setTile(20, 14, 32);
      }

      // Empty tiles/blocks; we provide a tiny baked bg so engine code that
      // tries to drawImage(state.bg.canvas, ...) won't NPE. We draw our own
      // background in draw() anyway.
      const stubCanvas = document.createElement('canvas');
      stubCanvas.width = 8; stubCanvas.height = 8;

      const shops = generateShops(shopCount, mapSize);

      const player = {
        wx: 0,                          // road-center x
        wy: 0,                          // start at y=0
        targetX: 0,
        speed: 250,                     // forward px/sec (Y axis)
        maxLatSpeed: 320,               // lateral steer speed cap
        boostT: 0,                      // remaining seconds of nitro
        boostsLeft: 3,
        hp: 100,
        maxHp: 100,
        r: 22,
      };

      const fit = () => {
        // No iso fit needed; we project per-frame using window W/H.
      };

      const newState = {
        // Engine-contract fields
        mapW, mapH,
        bg: { canvas: stubCanvas, offX: 0, offY: 0 },
        tiles: [],
        blocks: [],
        theme,
        themeName: theme.name,
        _fit: fit,

        // Game-specific
        gtaActive: true,
        themeKey,
        mapSize,
        copRate,
        elapsed: 0,
        copSpawnAcc: 0,
        copCount: 0,
        copsMaxActive: 4,

        player,
        shops,
        cops: [],
        sparks: [],
        particles: [],
        shakeT: 0,
        shakeMag: 0,

        kills: 0,                       // count of shops robbed (reused for end-card stats)
        cash: 0,
        robbedCount: 0,
        bots: [],                       // alias so applyScenarioOverrides() doesn't mishandle

        skills: {
          q: { cd: 8.0, _cd: 0 },       // nitro cooldown (also gated by boostsLeft)
          w: { cd: 0,    _cd: 0 },
        },

        // For end-card compatibility (state.player.weapon etc. not used)
      };

      $setState(newState);
    },

    castPress(k) {
      const s = $state(); if (!s || !s.gtaActive) return;
      if (k === 'q') {
        const p = s.player;
        if (s.skills.q._cd > 0) return;
        if (p.boostsLeft <= 0) return;
        p.boostsLeft -= 1;
        p.boostT = Math.max(p.boostT, 1.2);
        s.skills.q._cd = s.skills.q.cd;
        pushSpark(s, $W()/2, $H()*VIEW_RATIO + 30, s.theme.neonB, 14);
        if (window.SFX && SFX.qDash) SFX.qDash();
      }
    },
    castRelease(k) {},

    update(dt) {
      const s = $state(); if (!s || !s.gtaActive) return;
      const p = s.player;
      const W = $W(), H = $H();

      s.elapsed += dt;

      // Apply skill cooldown ticks
      Object.values(s.skills).forEach(sk => { if (sk._cd > 0) sk._cd = Math.max(0, sk._cd - dt); });

      // ── Steering input ──────────────────────────────────────
      // Convert active swipe delta into target x. Drag distance maps 1:1.
      if (Input.active) {
        // The drag-relative target: targetX = current targetX at drag start
        // + (currentX - startX). We initialize per-drag by storing the
        // baseline on first move.
        if (Input._dragBaseTargetX == null) Input._dragBaseTargetX = p.targetX;
        p.targetX = Input._dragBaseTargetX + (Input.currentX - Input.startX);
      } else {
        Input._dragBaseTargetX = null;
      }

      // Keyboard fallback (A/D / ←/→) — keep passive-friendly contract
      if (typeof keys !== 'undefined' || window.keys) {
        const K = window.keys || (typeof keys !== 'undefined' ? keys : null);
        if (K) {
          if (K['a'] || K['arrowleft'])  p.targetX -= 250 * dt;
          if (K['d'] || K['arrowright']) p.targetX += 250 * dt;
        }
      }

      p.targetX = Math.max(-PLAYER_X_LIMIT, Math.min(PLAYER_X_LIMIT, p.targetX));

      // Smooth toward targetX (lateral)
      const latDelta = p.targetX - p.wx;
      const latStep = Math.max(-p.maxLatSpeed * dt, Math.min(p.maxLatSpeed * dt, latDelta * 6 * dt + Math.sign(latDelta) * Math.min(Math.abs(latDelta), p.maxLatSpeed * dt)));
      p.wx += latStep;

      // Tap-to-boost edge trigger
      if (Input.boost && !Input.boostTriggered) {
        Input.boostTriggered = true;
        Input.boost = false;
        // Same as castPress('q')
        if (s.skills.q._cd <= 0 && p.boostsLeft > 0) {
          p.boostsLeft -= 1;
          p.boostT = Math.max(p.boostT, 1.2);
          s.skills.q._cd = s.skills.q.cd;
          pushSpark(s, $W()/2, $H()*VIEW_RATIO + 30, s.theme.neonB, 14);
          if (window.SFX && SFX.qDash) SFX.qDash();
        }
      }

      // ── Forward motion (auto) ───────────────────────────────
      const boosting = p.boostT > 0;
      if (boosting) p.boostT -= dt;
      const fwdSpeed = p.speed * (boosting ? 1.8 : 1.0);
      p.wy += fwdSpeed * dt;

      // ── Friendliness floor: if player doesn't touch input for 8s+,
      //    the cops still win (passive players reach an outcome).
      //    The 30s timer will also end via finishGame(false, 'TIME UP')
      //    so we don't need a special handler here.

      // ── Shop interaction ────────────────────────────────────
      // Hover detection: player within X-window and a Y-window of shop
      const HOVER_X = 130;     // need to be in same lane as shop side
      const HOVER_Y = 80;      // forgiving along travel direction
      for (const shop of s.shops) {
        if (shop.robbed) continue;
        const dx = Math.abs(p.wx - shop.wx);
        const dy = Math.abs(p.wy - shop.wy);
        // The "in front of shop" zone: roughly centered on shop
        const inLane = (shop.side < 0 && p.wx < -40) || (shop.side > 0 && p.wx > 40);
        if (inLane && dx < HOVER_X && dy < HOVER_Y) {
          shop.progress = Math.min(1, shop.progress + dt / shop.robTime);
          if (shop.progress >= 1) {
            shop.robbed = true;
            s.robbedCount += 1;
            s.kills = s.robbedCount;     // reuse engine kills field for end-card
            s.cash += shop.money;
            pushShake(s, 8);
            const proj = projectToScreen(shop.wx, shop.wy, p, $W(), $H());
            pushSpark(s, proj.sx, proj.sy, s.theme.neonA, 22);
            if (window.SFX && SFX.pickup) SFX.pickup();
            if (window.showBanner) showBanner(`+${shop.money} · ${shop.name} ROBBED`, '#5af5e0', 1200);
          }
        } else {
          // Decay progress if we left the zone
          if (shop.progress > 0) shop.progress = Math.max(0, shop.progress - dt * 0.6);
        }
      }

      // ── Cop spawning ────────────────────────────────────────
      // Probability model: each second, copRate fresh cops attempted, but
      // capped by copsMaxActive and a difficulty ramp.
      s.copSpawnAcc += dt;
      const phaseRamp =
        s.elapsed < 3 ? 0.0 :
        s.elapsed < 10 ? 0.6 :
        s.elapsed < 20 ? 1.2 :
                          1.8;
      const effectiveRate = s.copRate * phaseRamp;
      // Try-spawn loop: chance per dt
      if (s.cops.length < s.copsMaxActive && Math.random() < effectiveRate * dt) {
        const sidePick = [-1, 0, 1][Math.floor(Math.random() * 3)];
        s.cops.push(spawnCop(s, sidePick));
        s.copCount += 1;
      }

      // ── Cop AI (dumb chase) ────────────────────────────────
      for (const cop of s.cops) {
        const dxw = p.wx - cop.wx;
        const dyw = p.wy - cop.wy;
        const len = Math.hypot(dxw, dyw) || 1;
        const vx = (dxw / len) * cop.speed;
        const vy = (dyw / len) * cop.speed;
        cop.wx += vx * dt;
        cop.wy += vy * dt;
        cop.sirenPhase += dt * 6;

        // Collision check (circle-circle)
        const dist = Math.hypot(p.wx - cop.wx, p.wy - cop.wy);
        if (dist < p.r + cop.r) {
          // BOOM
          pushShake(s, 18);
          const proj = projectToScreen(cop.wx, cop.wy, p, $W(), $H());
          pushSpark(s, proj.sx, proj.sy, s.theme.copLight, 30);
          pushSpark(s, proj.sx, proj.sy, '#ffd84a', 30);
          if (window.SFX && SFX.lose) SFX.lose();
          else if (window.SFX && SFX.hit) SFX.hit();
          s.gtaActive = false;
          $finish(false, 'BUSTED');
          return;
        }
      }

      // Cull cops that fell way behind (player outran them)
      s.cops = s.cops.filter(cop => (p.wy - cop.wy) < 700);

      // ── Win condition ───────────────────────────────────────
      // (a) Reached end of map alive: success scaled to robbed count
      if (p.wy >= s.mapSize) {
        // Auto-clamp so the player doesn't fly off forever — they "exit" the track
        p.wy = s.mapSize;
        if (s.robbedCount >= s.shops.length) {
          s.gtaActive = false;
          if (window.SFX && SFX.win) SFX.win();
          $finish(true, `ALL ${s.shops.length} HIT · $${s.cash}`);
        } else {
          // Didn't rob enough but reached end — survive partial win
          s.gtaActive = false;
          const enough = s.robbedCount > 0;
          if (enough && window.SFX && SFX.win) SFX.win();
          else if (window.SFX && SFX.lose) SFX.lose();
          $finish(enough, `${s.robbedCount}/${s.shops.length} HIT · $${s.cash}`);
        }
        return;
      }

      // (b) All shops robbed mid-track: instant victory
      if (s.robbedCount >= s.shops.length) {
        s.gtaActive = false;
        if (window.SFX && SFX.win) SFX.win();
        $finish(true, `ALL ${s.shops.length} HIT · $${s.cash}`);
        return;
      }

      // ── Sparks/shake update ─────────────────────────────────
      updateSparks(s, dt);
      if (s.shakeT > 0) s.shakeT -= dt;

      // ── HUD ─────────────────────────────────────────────────
      const scoreEl = $scoreEl();
      if (scoreEl) {
        scoreEl.textContent = `ROBBED ${s.robbedCount}/${s.shops.length} · $${s.cash}`;
      }
      // Repurpose the kit pill as the nitro/cash pill so the engine HUD has
      // *something* to show. We only set it if the element exists.
      const pillKit = document.getElementById('pill-kit');
      if (pillKit) {
        pillKit.textContent = `NITRO ${p.boostsLeft}`;
        pillKit.classList.remove('hidden');
      }
      const pillWpn = document.getElementById('pill-weapon');
      if (pillWpn) {
        pillWpn.classList.add('hidden');     // GTA has no weapon pill
      }
    },

    draw() {
      const s = $state(); if (!s) return;
      const ctx = $ctx(); if (!ctx) return;
      const W = $W(), H = $H();
      const t = s.theme;
      const p = s.player;

      // Screen shake offset
      let shakeOX = 0, shakeOY = 0;
      if (s.shakeT > 0 && s.shakeMag > 0) {
        shakeOX = (Math.random() - 0.5) * s.shakeMag;
        shakeOY = (Math.random() - 0.5) * s.shakeMag;
      }

      ctx.save();
      ctx.translate(shakeOX, shakeOY);

      // ── Sky / backdrop ──────────────────────────────────────
      ctx.fillStyle = t.sky;
      ctx.fillRect(0, 0, W, H);

      // Theme-specific environmental fx
      if (s.themeKey === 'rain') {
        drawRain(ctx, W, H, t, s.elapsed);
      } else if (s.themeKey === 'snownight') {
        drawSnow(ctx, W, H, t, s.elapsed);
      } else if (s.themeKey === 'sunset') {
        // Sun glow at horizon
        const grad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
        grad.addColorStop(0, t.sky);
        grad.addColorStop(1, '#ffb070');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H * 0.55);
      } else {
        // Night neon glow on horizon
        const grad = ctx.createRadialGradient(W/2, H*0.35, 20, W/2, H*0.35, W*0.7);
        grad.addColorStop(0, t.neonA + '33');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H * 0.55);
      }

      // ── Buildings (parallax background) ─────────────────────
      drawSkyline(ctx, W, H, t, p.wy);

      // ── Road ────────────────────────────────────────────────
      const roadLeft  = W/2 - ROAD_HALF_W;
      const roadRight = W/2 + ROAD_HALF_W;
      const sidewalkW = 40;

      // Sidewalks
      ctx.fillStyle = t.sidewalk;
      ctx.fillRect(roadLeft - sidewalkW, 0, sidewalkW, H);
      ctx.fillRect(roadRight, 0, sidewalkW, H);

      // Road body
      ctx.fillStyle = t.road;
      ctx.fillRect(roadLeft, 0, ROAD_HALF_W * 2, H);

      // Lane markers (scrolling dashes along center + lanes)
      const dashH = 36;
      const dashGap = 28;
      const cycle = dashH + dashGap;
      const yOff = (-p.wy) % cycle;
      ctx.fillStyle = t.roadLine;
      for (let y = yOff - cycle; y < H + cycle; y += cycle) {
        // Center
        ctx.fillRect(W/2 - 3, y, 6, dashH);
      }
      // Side lane lines (solid)
      ctx.fillStyle = t.roadLine;
      ctx.fillRect(roadLeft + 2, 0, 3, H);
      ctx.fillRect(roadRight - 5, 0, 3, H);

      // Road edge curb shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(roadLeft - 3, 0, 3, H);
      ctx.fillRect(roadRight, 0, 3, H);

      // ── Shops ───────────────────────────────────────────────
      for (const shop of s.shops) {
        const proj = projectToScreen(shop.wx, shop.wy, p, W, H);
        if (proj.sy < -100 || proj.sy > H + 100) continue;
        drawShop(ctx, proj.sx, proj.sy, shop, t, s.elapsed);
      }

      // ── Cops ────────────────────────────────────────────────
      for (const cop of s.cops) {
        const proj = projectToScreen(cop.wx, cop.wy, p, W, H);
        if (proj.sy < -80 || proj.sy > H + 80) continue;
        drawCop(ctx, proj.sx, proj.sy, cop, t);
      }

      // ── Player car ──────────────────────────────────────────
      const playerProj = projectToScreen(p.wx, p.wy, p, W, H);
      drawCar(ctx, playerProj.sx, playerProj.sy, p, t, s.elapsed);

      // ── Sparks ──────────────────────────────────────────────
      for (const sp of s.sparks) {
        ctx.globalAlpha = Math.max(0, Math.min(1, sp.life * 1.8));
        ctx.fillStyle = sp.color;
        ctx.fillRect(sp.sx - 2, sp.sy - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      // ── Top-of-screen mini HUD (custom, complements engine HUD) ──
      drawMiniHUD(ctx, W, H, s, t);

      ctx.restore();
    },

    refit() {
      // No iso fit needed; the projection uses live W/H per frame.
    },
  };

  // ─── Drawing helpers ────────────────────────────────────────

  function drawSkyline(ctx, W, H, t, playerWy) {
    // Scrolling silhouette of buildings on each sidewalk
    const baseY = H * 0.30;
    const buildingH = H * 0.42;
    // Pseudo-stable building positions seeded by integer slots
    const slotH = 90;
    const startSlot = Math.floor(playerWy / slotH) - 2;
    const endSlot = startSlot + Math.ceil(H / slotH) + 4;
    for (let slot = startSlot; slot < endSlot; slot++) {
      // Deterministic random from slot index
      const seedL = (slot * 9301 + 49297) % 233280 / 233280;
      const seedR = (slot * 7919 + 6151)  % 233280 / 233280;
      const yOnScreen = (slot * slotH - playerWy) + H * 0.55;
      // Left buildings
      const lh = 50 + seedL * 110;
      ctx.fillStyle = seedL > 0.6 ? t.buildingLit : t.building;
      ctx.fillRect(0, yOnScreen - lh, W/2 - ROAD_HALF_W - 40, lh);
      // Right buildings
      const rh = 50 + seedR * 110;
      ctx.fillStyle = seedR > 0.6 ? t.buildingLit : t.building;
      ctx.fillRect(W/2 + ROAD_HALF_W + 40, yOnScreen - rh, W, rh);
      // Window dots (lit buildings)
      if (seedL > 0.6) {
        ctx.fillStyle = t.neonA;
        for (let wy = yOnScreen - lh + 8; wy < yOnScreen - 6; wy += 12) {
          for (let wx = 8; wx < W/2 - ROAD_HALF_W - 50; wx += 14) {
            if (((wx + wy) | 0) % 23 < 7) ctx.fillRect(wx, wy, 3, 3);
          }
        }
      }
      if (seedR > 0.6) {
        ctx.fillStyle = t.neonB;
        for (let wy = yOnScreen - rh + 8; wy < yOnScreen - 6; wy += 12) {
          for (let wx = W/2 + ROAD_HALF_W + 50; wx < W - 8; wx += 14) {
            if (((wx + wy) | 0) % 19 < 7) ctx.fillRect(wx, wy, 3, 3);
          }
        }
      }
    }
  }

  function drawShop(ctx, sx, sy, shop, t, elapsed) {
    // Shop sits on the sidewalk; render as a building face with sign
    const shopW = 110;
    const shopH = 72;
    const px = sx - shopW / 2;
    const py = sy - shopH / 2;

    // Body
    ctx.fillStyle = shop.robbed ? '#2a3030' : t.buildingLit;
    ctx.fillRect(px, py, shopW, shopH);

    // Door
    ctx.fillStyle = shop.robbed ? '#101418' : '#2a1d10';
    ctx.fillRect(px + shopW * 0.4, py + shopH * 0.45, shopW * 0.2, shopH * 0.55);

    // Window
    ctx.fillStyle = shop.robbed ? '#1a1f25' : t.shopGlow;
    ctx.fillRect(px + 8, py + 8, shopW - 16, shopH * 0.30);

    // Sign / name
    ctx.fillStyle = shop.robbed ? '#666' : '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shop.name, sx, py - 6);

    // Trigger zone highlight (pulsing) when not yet robbed
    if (!shop.robbed) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4);
      ctx.strokeStyle = t.shopGlow;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4 + pulse * 0.4;
      ctx.beginPath();
      // Trigger zone is on the ROAD side of the shop, in front of it
      const triggerX = sx + (shop.side < 0 ? +30 : -30);
      ctx.rect(triggerX - 40, sy + 20, 80, 40);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Progress bar above shop
      if (shop.progress > 0) {
        const barW = shopW * 0.8;
        const barH = 4;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx - barW / 2, py - 14, barW, barH);
        ctx.fillStyle = t.shopGlow;
        ctx.fillRect(sx - barW / 2, py - 14, barW * shop.progress, barH);
      }
    } else {
      // "ROBBED" stamp
      ctx.fillStyle = t.shopRobbed;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ROBBED', sx, sy + shopH * 0.1);
    }
  }

  function drawCar(ctx, sx, sy, p, t, elapsed) {
    const carW = 32, carH = 56;
    const lean = Math.max(-0.3, Math.min(0.3, (p.targetX - p.wx) * 0.005));
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(lean);

    // Boost trail
    if (p.boostT > 0) {
      ctx.fillStyle = t.neonB;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-carW / 2 + 4, carH / 2, 6, 22);
      ctx.fillRect(carW / 2 - 10, carH / 2, 6, 22);
      ctx.globalAlpha = 1;
    }

    // Car body
    ctx.fillStyle = t.car;
    ctx.fillRect(-carW / 2, -carH / 2, carW, carH);
    // Highlight (light reflection on hood)
    ctx.fillStyle = t.carHighlight;
    ctx.fillRect(-carW / 2 + 4, -carH / 2 + 4, carW - 8, 8);
    // Windshield
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(-carW / 2 + 5, -carH / 2 + 16, carW - 10, 16);
    // Tail lights
    ctx.fillStyle = '#ff3344';
    ctx.fillRect(-carW / 2 + 3, carH / 2 - 4, 6, 3);
    ctx.fillRect(carW / 2 - 9, carH / 2 - 4, 6, 3);
    // Wheels (just dark rectangles)
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(-carW / 2 - 2, -carH / 2 + 8, 4, 12);
    ctx.fillRect(carW / 2 - 2, -carH / 2 + 8, 4, 12);
    ctx.fillRect(-carW / 2 - 2, carH / 2 - 20, 4, 12);
    ctx.fillRect(carW / 2 - 2, carH / 2 - 20, 4, 12);
    ctx.restore();
  }

  function drawCop(ctx, sx, sy, cop, t) {
    const carW = 30, carH = 52;
    // Siren color flash
    const sirenA = (Math.sin(cop.sirenPhase) > 0) ? t.cop : t.copLight;
    const sirenB = (Math.sin(cop.sirenPhase) > 0) ? t.copLight : t.cop;

    ctx.save();
    ctx.translate(sx, sy);

    // Glow halo
    ctx.fillStyle = sirenA;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Body
    ctx.fillStyle = '#16213a';
    ctx.fillRect(-carW / 2, -carH / 2, carW, carH);
    // White stripe (cop livery)
    ctx.fillStyle = '#f0f4ff';
    ctx.fillRect(-carW / 2, -6, carW, 12);
    // Windshield
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(-carW / 2 + 4, -carH / 2 + 8, carW - 8, 12);
    // Light bar
    ctx.fillStyle = sirenA;
    ctx.fillRect(-carW / 2 + 4, -carH / 2 + 3, (carW - 8) / 2, 4);
    ctx.fillStyle = sirenB;
    ctx.fillRect(0, -carH / 2 + 3, (carW - 8) / 2, 4);
    // Wheels
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(-carW / 2 - 2, -carH / 2 + 8, 4, 10);
    ctx.fillRect(carW / 2 - 2, -carH / 2 + 8, 4, 10);
    ctx.fillRect(-carW / 2 - 2, carH / 2 - 18, 4, 10);
    ctx.fillRect(carW / 2 - 2, carH / 2 - 18, 4, 10);

    ctx.restore();
  }

  function drawMiniHUD(ctx, W, H, s, t) {
    // Top-left robbed counter (visual reinforcement of engine HUD)
    const pad = 10;
    const boxW = 84, boxH = 26;
    ctx.fillStyle = 'rgba(10,13,20,0.7)';
    ctx.fillRect(pad, pad + 50, boxW, boxH);
    ctx.strokeStyle = t.shopGlow;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad + 50, boxW, boxH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${s.cash}`, pad + 6, pad + 50 + boxH / 2);
    ctx.fillStyle = t.shopGlow;
    ctx.fillText(`${s.robbedCount}/${s.shops.length}`, pad + 50, pad + 50 + boxH / 2);

    // Top-right cop count
    const cBoxW = 64;
    ctx.fillStyle = 'rgba(10,13,20,0.7)';
    ctx.fillRect(W - cBoxW - pad, pad + 50, cBoxW, boxH);
    ctx.strokeStyle = t.copLight;
    ctx.strokeRect(W - cBoxW - pad, pad + 50, cBoxW, boxH);
    ctx.fillStyle = t.copLight;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`COPS ${s.cops.length}`, W - cBoxW - pad + 6, pad + 50 + boxH / 2);
  }

  // Theme-specific ambient drawing
  function drawRain(ctx, W, H, t, elapsed) {
    ctx.strokeStyle = 'rgba(180,210,255,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const seed = (i * 9301 + Math.floor(elapsed * 700)) % 233280 / 233280;
      const x = (seed * W * 1.2) - W * 0.1;
      const y = ((elapsed * 800 + i * 47) % (H + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 14);
      ctx.stroke();
    }
  }

  function drawSnow(ctx, W, H, t, elapsed) {
    ctx.fillStyle = 'rgba(220,230,255,0.7)';
    for (let i = 0; i < 70; i++) {
      const seed = (i * 7919) % 233280 / 233280;
      const driftX = Math.sin(elapsed * 0.6 + i) * 18;
      const x = (seed * W + driftX) % W;
      const y = ((elapsed * (40 + seed * 30) + i * 31) % (H + 20)) - 10;
      ctx.fillRect(x, y, 2, 2);
    }
  }

})();
