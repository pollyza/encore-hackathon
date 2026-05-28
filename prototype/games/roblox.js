// ============================================================
//  ROBLOX · OBBY PARKOUR — Games.roblox
//  Side-scrolling parkour: 30s, tap-to-jump, long-press = big jump
//  (3 charges), auto-run forward. Platforms from state.scenario.seed.
//  See playspec_obby.md + prototype/games/_interface.md.
//
//  Engine globals (ctx/state/W/H/finishGame/pickTheme/keys/skillHeld
//  /modeBadge/scoreEl/SFX/spawnParticles) currently live inside the
//  encore_prototype.html IIFE. This file registers window.Games.roblox
//  using BARE engine-global names; the main agent integrates by either
//  (a) attaching engine globals to window before this script runs, or
//  (b) pasting the returned object body into the IIFE next to Games.br.
// ============================================================
(function robloxBoot() {
  if (typeof window === 'undefined') return;
  // Defer until engine globals exist on window, then expose. Also expose
  // immediately for the inline-paste integration path.
  function tryRegister() {
    window.Games = window.Games || {};
    window.Games.roblox = buildModule();
  }
  tryRegister();
  // Poll briefly so a late-loading engine still gets us registered after
  // it has attached its globals to window (no-op if already in inline mode).
  let tries = 0;
  (function poll() {
    if (tries++ > 100) return;
    if (window.ctx && typeof window.finishGame === 'function') {
      tryRegister();
      return;
    }
    setTimeout(poll, 50);
  })();

  // ============================================================
  //  Constants — playspec §6 tuning
  // ============================================================
  const RUN_SPEED        = 200;   // px/s auto-run
  const JUMP_VY          = -360;  // tap jump (~120px peak)
  const BIG_JUMP_VY      = -460;  // long-press (~240px peak)
  const GRAVITY          = 600;
  const PLAT_MIN_W       = 60;
  const PLAT_MAX_W       = 80;
  const FALL_DEATH_Y     = 220;   // below tallest platform = death
  const BIG_JUMP_CHARGES = 3;
  const HOLD_THRESHOLD   = 0.18;
  const COYOTE_TIME      = 0.08;
  const JUMP_BUFFER      = 0.12;

  // Roblox-style flat palettes (inline fallback — main agent: add a
  // Themes.roblox block in encore_prototype.html so pickTheme('roblox')
  // returns these instead).
  const PALETTES = {
    grass: { sky:'#7ec0ff', skyTop:'#3aa1ff', ground:'#4dbb44', groundShade:'#2a7a26',
             platform:'#6ad95a', platformTop:'#8de87a', platformShade:'#357a2c',
             movingPlatform:'#ffcc33', crackPlatform:'#c4a062', endZone:'#ff77aa',
             player:'#ffcc44', playerShade:'#aa7a00', cloud:'#ffffff', accent:'#ffffff' },
    snow:  { sky:'#cfeeff', skyTop:'#88c4ee', ground:'#e8f4ff', groundShade:'#a0bcd0',
             platform:'#dcebfb', platformTop:'#ffffff', platformShade:'#88a8bb',
             movingPlatform:'#aaddff', crackPlatform:'#b8d0e0', endZone:'#ff99cc',
             player:'#ff6633', playerShade:'#aa3311', cloud:'#ffffff', accent:'#88ccff' },
    lava:  { sky:'#3a1010', skyTop:'#5a1414', ground:'#1a0808', groundShade:'#2a1010',
             platform:'#6a2a18', platformTop:'#cc4422', platformShade:'#3a1408',
             movingPlatform:'#ff8822', crackPlatform:'#aa5522', endZone:'#ffee44',
             player:'#ffee88', playerShade:'#cc8822', cloud:'#ff6633', accent:'#ff4422' },
    space: { sky:'#0a0428', skyTop:'#1a0e44', ground:'#000010', groundShade:'#0a0820',
             platform:'#6644aa', platformTop:'#aa88ff', platformShade:'#332266',
             movingPlatform:'#44ffcc', crackPlatform:'#7755aa', endZone:'#ffee44',
             player:'#88eeff', playerShade:'#3388aa', cloud:'#ffffff', accent:'#ffcc66' },
  };

  // ----- Seeded LCG (mulberry32) — same seed = same level layout -----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Resolve V2G scenario from either state.scenario (playspec) or
  // pendingConfig.scenario (engine V2G path). Safe with typeof guards
  // because both names are IIFE-private at engine boot.
  function getScenario() {
    try { if (typeof state !== 'undefined' && state && state.scenario) return state.scenario; } catch (_) {}
    try { if (typeof pendingConfig !== 'undefined' && pendingConfig && pendingConfig.scenario) return pendingConfig.scenario; } catch (_) {}
    return {};
  }
  function getThemeKey() {
    try {
      if (typeof pendingConfig !== 'undefined' && pendingConfig && pendingConfig.theme && PALETTES[pendingConfig.theme]) {
        return pendingConfig.theme;
      }
    } catch (_) {}
    const s = (getScenario().seed | 0) || 4242;
    const keys = Object.keys(PALETTES);
    return keys[s % keys.length];
  }

  // ----- Platform generator — playspec §5 -----
  function generatePlatforms(scenario) {
    const seed   = (scenario.seed | 0) || 4242;
    const count  = Math.max(10, Math.min(25, (scenario.platform_count | 0) || 18));
    const gapMin = Math.max(40, (scenario.gap_range_min | 0) || 80);
    const gapMax = Math.max(gapMin + 10, (scenario.gap_range_max | 0) || 220);
    const rand   = mulberry32(seed);
    const platforms = [];

    // Start platform — wide, sits at y=0 so the player spawns standing.
    platforms.push({ x:-60, y:0, w:180, h:16, type:'normal', mover:null, broken:false, breakT:0 });

    // Tutorial: 3 tiny gaps to teach timing.
    let cursorX = 120;
    for (let i = 0; i < 3; i++) {
      const gap = 60 + rand() * 30;
      cursorX += gap;
      const w = PLAT_MIN_W + rand() * (PLAT_MAX_W - PLAT_MIN_W);
      platforms.push({ x:cursorX, y:Math.sin(i*0.5)*18, w, h:16, type:'normal', mover:null, broken:false, breakT:0 });
      cursorX += w;
    }

    // Mid + hard: lerp the gap window narrow→wide. 80/15/5 split for
    // normal/moving/broken kicks in after the tutorial section.
    for (let i = 3; i < count; i++) {
      const progress = (i - 3) / Math.max(1, count - 3);
      const localMin = gapMin + (gapMax - gapMin) * 0.2 * progress;
      const localMax = gapMin + (gapMax - gapMin) * Math.min(1, 0.4 + progress);
      const gap = localMin + rand() * (localMax - localMin);
      cursorX += gap;
      const w = PLAT_MIN_W + rand() * (PLAT_MAX_W - PLAT_MIN_W);
      const yOffset = Math.sin(i * 0.5) * 30 + (rand() - 0.5) * 16;
      let type = 'normal';
      if (progress > 0.25) {
        const r = rand();
        if (r < 0.05) type = 'broken';
        else if (r < 0.20) type = 'moving';
      }
      const p = { x:cursorX, y:yOffset, w, h:16, type, mover:null, broken:false, breakT:0 };
      if (type === 'moving') {
        p.mover = { anchorY:yOffset, amp:20+rand()*20, phase:rand()*Math.PI*2, speed:1.0+rand()*1.2 };
      }
      platforms.push(p);
      cursorX += w;
    }

    // End zone — wide unmistakable goal.
    cursorX += gapMin + 20;
    platforms.push({ x:cursorX, y:-10, w:220, h:16, type:'end', mover:null, broken:false, breakT:0 });
    return platforms;
  }

  // Ground line at 72% canvas height — leaves room for sky + clouds above.
  function computeFit() { return { groundY: Math.floor(H * 0.72) }; }

  // ----- Color mix util (engine has private `mix`; dup as mixHex) -----
  function mixHex(hex, w_, t) {
    const h = hex.replace('#',''); const w = w_.replace('#','');
    const r1 = parseInt(h.slice(0,2),16) || 0, g1 = parseInt(h.slice(2,4),16) || 0, b1 = parseInt(h.slice(4,6),16) || 0;
    const r2 = parseInt(w.slice(0,2),16) || 0, g2 = parseInt(w.slice(2,4),16) || 0, b2 = parseInt(w.slice(4,6),16) || 0;
    const r = Math.round(r1*(1-t)+r2*t), g = Math.round(g1*(1-t)+g2*t), b = Math.round(b1*(1-t)+b2*t);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  }

  // ============================================================
  //  Module factory — returns Games.roblox-shaped object
  // ============================================================
  function buildModule() {
    return {
      name:     'ROBLOX · OBBY PARKOUR',
      badge:    'OBBY',
      duration: 30,
      showMP:   false,
      fxKey:    'roblox',
      pills:    { distance: true, jumps: true },

      // Only Q (JUMP) + W (BIG JUMP) — minimal HUD per playspec.
      skills() {
        return [
          { key:'q', ico:'⤴', label:'JUMP',     cost:0, color:'cyan' },
          { key:'w', ico:'⚡', label:'BIG JUMP', cost:0, color:'orange' },
          null, null,
        ];
      },

      init() {
        const themeKey = getThemeKey();
        const palette  = PALETTES[themeKey];
        const scenario = getScenario();
        const fit      = computeFit();
        let themeName  = themeKey;
        try {
          if (typeof pickTheme === 'function') {
            const sample = pickTheme('roblox');
            if (sample && sample.name) themeName = sample.name;
          }
        } catch (_) {}
        try {
          if (typeof modeBadge !== 'undefined' && modeBadge) {
            modeBadge.textContent = this.badge + ' · ' + themeName.toUpperCase();
          }
        } catch (_) {}

        const platforms = generatePlatforms(scenario);
        const finishX = platforms[platforms.length - 1].x;

        // Player coords: x grows right; y is offset from groundY (negative = above).
        // y == platform.y means standing on that platform top.
        const player = {
          x:0, y:0, vx:RUN_SPEED, vy:0, w:22, h:28,
          onGround:true, coyote:0, jumpBuffer:0, holdT:0,
          bigJumps:BIG_JUMP_CHARGES, jumpsUsed:0,
          alive:true, finished:false, spritePhase:0,
        };

        // Cosmetic clouds — parallax background.
        const clouds = [];
        const rand = mulberry32(((scenario.seed | 0) || 4242) ^ 0x9E3779B9);
        for (let i = 0; i < 8; i++) {
          clouds.push({ x:rand()*1600-200, y:40+rand()*180, w:60+rand()*80, speed:8+rand()*14 });
        }

        // state contract: engine reads template/theme/themeName/skills/_fit;
        // we own platforms/player/clouds/finishX/time. mapW/mapH/tiles/blocks
        // exist for compatibility; bg=null because this is a flat 2D scroller
        // (engine's draw routine uses current.draw so it never touches bg).
        state = {
          template:'roblox', theme:palette, themeName, themeKey, scenario,
          platforms, player, clouds, finishX, startX:0, fit,
          time:0, kills:0, particles:[],
          skills: { q:{cd:0, _cd:0, cost:0}, w:{cd:0.3, _cd:0, cost:0} },
          _fit: () => { state.fit = computeFit(); },
          bg:null, mapW:finishX+400, mapH:400, tiles:[], blocks:[],
        };
      },

      // Q = primary jump (tap or hold→big). W = direct big-jump.
      castPress(k) {
        if (!state || !state.player) return;
        const p = state.player;
        if (!p.alive || p.finished) return;
        if (k === 'q') {
          p.holdT = 0;
          p.jumpBuffer = JUMP_BUFFER;
        } else if (k === 'w') {
          if ((p.onGround || p.coyote > 0) && p.bigJumps > 0) doBigJump(p);
        }
      },
      castRelease(k) {
        if (!state || !state.player) return;
        const p = state.player;
        if (k === 'q') {
          // Held past threshold + grounded + has charge → upgrade to big jump.
          if (p.holdT > HOLD_THRESHOLD && p.bigJumps > 0 && (p.onGround || p.coyote > 0)) {
            doBigJump(p);
            p.jumpBuffer = 0;
          }
          p.holdT = 0;
        }
      },

      update(dt) {
        if (!state) return;
        const p = state.player;
        state.time += dt;

        // Passive-friendliness: also accept Space, ArrowUp, W key, skillHeld.q.
        let pressing = false;
        try {
          if (typeof keys !== 'undefined') {
            pressing = !!(keys[' '] || keys['arrowup'] || keys['w']);
          }
          if (typeof skillHeld !== 'undefined') pressing = pressing || skillHeld.q;
        } catch (_) {}

        if (p.alive && !p.finished) {
          if (pressing) {
            p.holdT += dt;
            if (p.onGround && p.holdT < HOLD_THRESHOLD * 0.5) doJump(p);
          }
          if (p.jumpBuffer > 0) {
            p.jumpBuffer -= dt;
            if ((p.onGround || p.coyote > 0) && p.jumpBuffer > 0) {
              doJump(p);
              p.jumpBuffer = 0;
            }
          }
          Object.values(state.skills).forEach(s => { if (s._cd > 0) s._cd = Math.max(0, s._cd - dt); });

          // Auto-run + slight ramp so the last 5s feels urgent.
          const t = state.time;
          const speed = RUN_SPEED + Math.min(40, t * 1.2);
          p.x += speed * dt;
          p.vy += GRAVITY * dt;
          p.y  += p.vy * dt;

          // Animate moving platforms + tick broken-platform crumble.
          for (const plat of state.platforms) {
            if (plat.mover) plat.y = plat.mover.anchorY + Math.sin(t * plat.mover.speed + plat.mover.phase) * plat.mover.amp;
            if (plat.broken) plat.breakT += dt;
          }

          // Land-on-top collision. We only "land" if falling (vy >= 0) and
          // the feet crossed the platform top within a small tolerance band.
          let landed = false;
          for (let i = 0; i < state.platforms.length; i++) {
            const plat = state.platforms[i];
            if (plat.broken && plat.breakT > 0.25) continue;
            const left = plat.x, right = plat.x + plat.w, top = plat.y;
            if (p.x + p.w * 0.4 < left)  continue;
            if (p.x - p.w * 0.4 > right) continue;
            if (p.vy >= 0 && p.y >= top - 4 && p.y <= top + 18) {
              p.y = top; p.vy = 0;
              landed = true;
              p.onGround = true;
              p.coyote = COYOTE_TIME;
              if (plat.type === 'broken' && !plat.broken) { plat.broken = true; plat.breakT = 0; }
              if (plat.type === 'end') { p.finished = true; doFinish(true); }
              break;
            }
          }
          if (!landed) {
            if (p.onGround) { p.coyote = COYOTE_TIME; p.onGround = false; }
            else p.coyote = Math.max(0, p.coyote - dt);
          }

          if (p.y > FALL_DEATH_Y) { p.alive = false; doFinish(false); }

          p.spritePhase += dt * 14;

          // HUD score line — distance + %.
          try {
            const pct = Math.max(0, Math.min(1, p.x / Math.max(1, state.finishX)));
            const score = Math.floor(pct * 100);
            if (typeof scoreEl !== 'undefined' && scoreEl) {
              scoreEl.textContent = `D ${Math.floor(p.x)}px · ${score}%`;
            }
          } catch (_) {}
        }
      },

      draw() {
        if (!state) return;
        const p = state.player;
        const fit = state.fit || computeFit();
        const palette = state.theme;
        const camX = Math.max(0, p.x - W * 0.25);
        const groundY = fit.groundY;

        // Sky gradient.
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, palette.skyTop);
        grad.addColorStop(1, palette.sky);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Parallax background — clouds (or stars for space theme).
        if (state.themeKey === 'space') drawStars(palette, camX);
        else drawClouds(palette, camX);

        drawHorizon(palette, groundY, camX);

        for (const plat of state.platforms) drawPlatform(plat, camX, groundY, palette, state.time);

        if (p.alive) drawPlayer(p, camX, groundY, palette);
        else drawDeathPuff(p, camX, groundY);

        drawHud(p, palette);
        drawFinishFlag(state.finishX, camX, groundY, palette, state.time);
      },

      refit() { if (state && typeof state._fit === 'function') state._fit(); },
    };
  }

  // ============================================================
  //  Drawing helpers — call into engine globals (ctx, W, H, state)
  // ============================================================
  function drawClouds(palette, camX) {
    ctx.fillStyle = palette.cloud;
    ctx.globalAlpha = 0.85;
    for (const c of state.clouds) {
      c.x += c.speed * 0.016;
      const sx = c.x - camX * 0.3;
      const wrapped = ((sx % (W + 400)) + (W + 400)) % (W + 400) - 200;
      drawCloudPuff(wrapped, c.y, c.w);
    }
    ctx.globalAlpha = 1;
  }
  function drawCloudPuff(x, y, w) {
    const r = w * 0.3;
    ctx.beginPath();
    ctx.arc(x,         y,         r,     0, Math.PI * 2);
    ctx.arc(x + r*1.0, y - r*0.2, r*0.9, 0, Math.PI * 2);
    ctx.arc(x + r*1.9, y,         r*0.8, 0, Math.PI * 2);
    ctx.arc(x + r*0.7, y + r*0.2, r*0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawStars(palette, camX) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 137 - camX * 0.2) % (W + 100) + (W + 100)) % (W + 100) - 50;
      const sy = ((i * 53) % (H * 0.6));
      const r  = (i % 3) * 0.6 + 0.4;
      ctx.globalAlpha = 0.4 + (i % 5) * 0.12;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(W * 0.78, H * 0.22, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(W * 0.78 + 12, H * 0.22 - 4, 36, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawHorizon(palette, groundY, camX) {
    const y = groundY + 60;
    ctx.fillStyle = palette.groundShade;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 24) {
      const wx = x + camX * 0.5;
      const h = 24 + Math.sin(wx * 0.013) * 18 + Math.sin(wx * 0.04 + 1.7) * 8;
      ctx.lineTo(x, y - h);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, groundY + 60, W, H - (groundY + 60));
  }
  function drawPlatform(plat, camX, groundY, palette, t) {
    if (plat.broken && plat.breakT > 0.25) return;
    const sx = plat.x - camX;
    const sy = groundY + plat.y;
    if (sx + plat.w < -50 || sx > W + 50) return;

    let topColor = palette.platformTop;
    let sideColor = palette.platform;
    let shadeColor = palette.platformShade;
    let pushed = false;
    if (plat.type === 'moving') {
      topColor = palette.movingPlatform;
      sideColor = mixHex(palette.movingPlatform, '#000000', 0.15);
    } else if (plat.type === 'broken') {
      topColor = palette.crackPlatform;
      sideColor = mixHex(palette.crackPlatform, '#000000', 0.2);
      if (plat.broken) {
        ctx.save(); pushed = true;
        ctx.translate(Math.sin(plat.breakT * 60) * 2, 0);
      }
    } else if (plat.type === 'end') {
      topColor = palette.endZone;
      sideColor = mixHex(palette.endZone, '#000000', 0.2);
    }

    const h = plat.h;
    ctx.fillStyle = sideColor;  ctx.fillRect(sx, sy, plat.w, h + 14);
    ctx.fillStyle = shadeColor; ctx.fillRect(sx, sy + h, plat.w, 4);
    ctx.fillStyle = topColor;   ctx.fillRect(sx, sy - 2, plat.w, h);
    ctx.fillStyle = mixHex(topColor, '#ffffff', 0.3);
    ctx.fillRect(sx + 2, sy - 2, plat.w - 4, 3);

    if (plat.type === 'moving') {
      ctx.fillStyle = mixHex(palette.movingPlatform, '#000000', 0.4);
      ctx.beginPath();
      ctx.moveTo(sx + plat.w/2 - 6, sy + 4);
      ctx.lineTo(sx + plat.w/2 + 6, sy + 4);
      ctx.lineTo(sx + plat.w/2,     sy - 4);
      ctx.closePath(); ctx.fill();
    }
    if (plat.type === 'broken') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + 8 + i * (plat.w-16)/3, sy);
        ctx.lineTo(sx + 14 + i * (plat.w-16)/3, sy + h);
        ctx.stroke();
      }
    }
    if (plat.type === 'end') {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < Math.floor(plat.w / 16); i++) {
        if (i % 2 === 0) ctx.fillRect(sx + i * 16, sy - 2, 8, h);
      }
      ctx.fillStyle = '#222222';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FINISH', sx + plat.w / 2, sy + h + 12);
      ctx.textAlign = 'left';
    }
    if (pushed) ctx.restore();
  }
  function drawPlayer(p, camX, groundY, palette) {
    const sx = p.x - camX;
    const sy = groundY + p.y;
    const bob = p.onGround ? Math.sin(p.spritePhase) * 1.4 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, p.w * 0.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const bodyTop = sy - p.h - bob;
    ctx.fillStyle = palette.playerShade;
    ctx.fillRect(sx - p.w/2, bodyTop + p.h * 0.4, p.w, p.h * 0.6);
    ctx.fillStyle = palette.player;
    ctx.fillRect(sx - p.w/2 + 1, bodyTop + p.h * 0.4 - 1, p.w - 2, p.h * 0.55);
    ctx.fillStyle = '#ffeebb';
    ctx.fillRect(sx - p.w/2 + 3, bodyTop, p.w - 6, p.h * 0.4);
    ctx.fillStyle = '#222';
    ctx.fillRect(sx - 4, bodyTop + p.h * 0.18, 3, 3);
    ctx.fillRect(sx + 2, bodyTop + p.h * 0.18, 3, 3);
    ctx.fillRect(sx - 2, bodyTop + p.h * 0.28, 4, 1);
    ctx.fillStyle = palette.playerShade;
    const legSwing = p.onGround ? Math.sin(p.spritePhase * 0.7) * 4 : 2;
    ctx.fillRect(sx - p.w/2 + 2, sy - 4, p.w * 0.3,  4 + legSwing);
    ctx.fillRect(sx + p.w/2 - p.w * 0.3 - 2, sy - 4 - legSwing, p.w * 0.3, 4 + legSwing);
    if (!p.onGround) {
      ctx.fillStyle = mixHex(palette.player, '#ffffff', 0.5);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(sx - 4, sy - 6, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  function drawDeathPuff(p, camX, groundY) {
    const sx = p.x - camX;
    const sy = groundY + Math.min(p.y, FALL_DEATH_Y);
    ctx.fillStyle = '#ff4655';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('×_×', sx, sy);
    ctx.textAlign = 'left';
  }
  function drawHud(p, palette) {
    const pad = 14, baseY = 64;
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ffffffbb';
    ctx.fillText('BIG JUMPS', pad, baseY);
    for (let i = 0; i < BIG_JUMP_CHARGES; i++) {
      ctx.fillStyle = i < p.bigJumps ? palette.movingPlatform : '#444';
      ctx.fillRect(pad + i * 18, baseY + 6, 14, 14);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(pad + i * 18, baseY + 6, 14, 14);
    }
    ctx.fillStyle = '#ffffffbb';
    ctx.fillText(`JUMPS ${p.jumpsUsed}`, pad, baseY + 38);
  }
  function drawFinishFlag(finishX, camX, groundY, palette, t) {
    const sx = finishX - camX + 30;
    if (sx < -40 || sx > W + 40) return;
    const sy = groundY - 60;
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(sx, sy, 3, 80);
    ctx.fillStyle = palette.endZone;
    const wave = Math.sin(t * 4) * 4;
    ctx.beginPath();
    ctx.moveTo(sx + 3, sy);
    ctx.lineTo(sx + 38 + wave, sy + 6);
    ctx.lineTo(sx + 3, sy + 22);
    ctx.closePath(); ctx.fill();
  }

  // ============================================================
  //  Jump + finish helpers
  // ============================================================
  function doJump(p) {
    if (!(p.onGround || p.coyote > 0)) return;
    p.vy = JUMP_VY;
    p.onGround = false;
    p.coyote = 0;
    p.jumpsUsed++;
    try { if (typeof SFX !== 'undefined' && SFX.qDash) SFX.qDash(); } catch (_) {}
  }
  function doBigJump(p) {
    if (!(p.onGround || p.coyote > 0)) return;
    if (p.bigJumps <= 0) { doJump(p); return; }
    p.vy = BIG_JUMP_VY;
    p.onGround = false;
    p.coyote = 0;
    p.bigJumps--;
    p.jumpsUsed++;
    try {
      if (typeof SFX !== 'undefined' && SFX.snipe) SFX.snipe();
      if (typeof spawnParticles === 'function' && state) {
        spawnParticles(state.particles, p.x, p.y, '#ffaa00', 8);
      }
    } catch (_) {}
  }
  function doFinish(won) {
    try {
      const p = state.player;
      const pct = Math.max(0, Math.min(1, p.x / Math.max(1, state.finishX)));
      const score = Math.floor(pct * 100);
      let sub;
      if (won) sub = 'TO THE TOP';
      else if (score >= 60) sub = `SO CLOSE · ${score}%`;
      else if (score >= 30) sub = `${score}% OF THE WAY`;
      else sub = 'OOF';
      // End-card stats line shows 'Kills N' — repurpose for score.
      state.kills = score;
      if (typeof finishGame === 'function') finishGame(won, sub);
    } catch (_) {}
  }
})();
