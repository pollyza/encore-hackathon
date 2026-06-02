// ============================================================
//  ROBLOX · CHAOS OBBY — Games.roblox  (PURE 2D SIDE-VIEW rewrite)
//
//  A clean 2D side-scroller obby: you SEE the scene from the side, platforms
//  are solid blocks, gravity pulls DOWN, you run + jump and land ON TOP of the
//  next block — landing is unambiguous (no 2.5D guessing). The challenge + the
//  novelty come from telegraphed CHAOS EVENTS (妖风/落雷/翻转/电话/变大变小/打滑/
//  地震): each warns first, then hits, and is survivable through a clear operation
//  — "不操作会死, 操作能活". Reach the flag in ~30s.
//
//  World coords:  x = horizontal progress (→ right), y = height (↑ up).
//  Camera scrolls horizontally to follow the player; vertical is fixed.
//  Engine globals: ctx, W, H, finishGame, pickTheme, getMoveVec, SFX, Juice,
//  spawnParticles, scoreEl, modeBadge, showBanner, state, Iso(presence only).
// ============================================================
(function robloxBoot() {
  if (typeof window === 'undefined') return;
  function tryRegister() { window.Games = window.Games || {}; window.Games.roblox = buildModule(); }
  tryRegister();
  let tries = 0;
  (function poll() { if (tries++ > 100) return; if (window.ctx && typeof window.finishGame === 'function' && window.Iso) { tryRegister(); return; } setTimeout(poll, 50); })();

  // ── Defensive accessors ──
  function $ctx()   { return window.ctx; }
  function $W()     { return window.W != null ? window.W : 360; }
  function $H()     { return window.H != null ? window.H : 640; }
  function $Iso()   { return window.Iso; }
  function $state() { return window.state; }
  function $setState(s) { window.state = s; }
  function $finish(won, sub) { if (typeof window.finishGame === 'function') window.finishGame(won, sub); }
  function $pickTheme(k) { if (typeof window.pickTheme === 'function') return window.pickTheme(k); return null; }
  function $sfx(n) { try { if (window.SFX && typeof window.SFX[n] === 'function') window.SFX[n](); } catch (_) {} }

  // ── Color helpers ──
  function mix(hex, w_, t) { const h = hex.replace('#',''), w = w_.replace('#','');
    const r1=parseInt(h.slice(0,2),16)||0,g1=parseInt(h.slice(2,4),16)||0,b1=parseInt(h.slice(4,6),16)||0;
    const r2=parseInt(w.slice(0,2),16)||0,g2=parseInt(w.slice(2,4),16)||0,b2=parseInt(w.slice(4,6),16)||0;
    const r=Math.round(r1*(1-t)+r2*t),g=Math.round(g1*(1-t)+g2*t),b=Math.round(b1*(1-t)+b2*t);
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
  function shade(b, t) { return mix(b, '#000000', t); }
  function tint(b, t)  { return mix(b, '#ffffff', t); }

  // ============================================================
  //  TUNING — single source for every feel constant.
  // ============================================================
  const T = {
    move:   { walk: 160 },                                  // px/s horizontal (player-paced)
    jump:   { vy: 540, gravity: 1900, doubleVy: 520,                       // tap = snappy fixed jump; mid-air tap = DOUBLE JUMP
              coyote: 0.18, buffer: 0.18,                                  // generous edge grace + pre-land buffer (kills "断触")
              stamMax: 100, stamCost: 55, stamRegen: 24 },                 // double jump regens ~every 2.3s — lifesaver, not infinite
    plat:   { count: 16, gapMin: 34, gapMax: 56, stepMax: 28, wMin: 84, wMax: 128, thick: 30 },   // easy footing — the challenge is the events, not the gaps
    cam:    { restX: 0.30, followLerp: 0.16, restY: 0.52, followLerpY: 0.12 },
    fall:   { deathY: -170 },                               // py below this = fell
    events: { firstRollAt: 8, rollGap: [4.5, 7], lastRollT: 26.5, warnDur: 0.95 },   // 8s safe intro (small白 learn longer); stop rolling at 26.5 so no lethal snatches a 95% win
    juice:  { landShake: 3, hardShake: 6, landHitstop: 0.03, hardHitstop: 0.07 },
    obby:   { moveRange: 48, moveSpeed: 1.5, vanishPeriod: 2.4, bounceVy: 900, checkpointEvery: 5 },
    respawn:{ immune: 0.8 },                                  // brief post-respawn grace so you don't instantly re-die
  };

  // ── 2D side-view camera. wx2sx scrolls with camX; wy2sy is fixed (ground line). ──
  const View = { W: 360, H: 640, camX: 0, camY: 0, SCALE: 1.7, restY: 400 };
  function fitView() { const W = $W(), H = $H(); View.W = W; View.H = H;
    View.SCALE = Math.max(1.9, Math.min(2.7, W / 185)); View.restY = H * T.cam.restY; }
  function wx2sx(x) { return Math.round(View.W * T.cam.restX + (x - View.camX) * View.SCALE); }
  function wy2sy(y) { return Math.round(View.restY - (y - View.camY) * View.SCALE); }   // camera follows Y too → player stays framed
  // read-only QA hook: the player's on-screen feet-y + canvas height (verify the
  // camera keeps the player in-frame on big jumps). Same pattern as __qaSet* hooks.
  try { window.__qaRobloxSY = () => { const s = $state(); return (s && s.player) ? { sy: wy2sy(s.player.py), H: View.H } : null; }; } catch (_) {}

  // ============================================================
  //  CHAOS EVENTS — the star. Each TELEGRAPHS (~0.95s warning that tells you HOW
  //  to survive), then hits; all survivable through a clear operation.
  // ============================================================
  // Each event TELEGRAPHS (a warning that tells you the dodge), then hits. The 5
  // LETHAL ones kill if you do nothing but each has a DISTINCT escape verb:
  //   WIND   → counter-walk into it     THUNDER → jump off the red block
  //   CRUSH  → step left/right out of the falling column   LASER → jump over the beam
  //   SLIP   → small careful taps, don't slide off
  // The 3 FLAVOR ones don't kill — they crank the pressure while a lethal looms.
  const EVENTS = {
    WIND:    { dur: 2.6, color: '#7fd6ff', warn: '妖风! 顶住方向走',   label: '妖风四起!', wind: true,    lethal: true },
    THUNDER: { dur: 0.8, color: '#ffe24a', warn: '落雷! 跳离红块',     label: '⚡落雷!',    thunder: true, lethal: true },
    CRUSH:   { dur: 0.7, color: '#ff5a5a', warn: '落石! 左右躲开',     label: '落石砸下!', crush: true,   lethal: true },
    LASER:   { dur: 0.7, color: '#ff3df0', warn: '激光! 起跳越过',     label: '激光横扫!', laser: true,   lethal: true },
    SLIP:    { dur: 2.4, color: '#5ae0ff', warn: '打滑! 轻推稳住',     label: '打滑啦!',   slip: true,    lethal: true },
    METEOR:  { dur: 0.7, color: '#ff7a3c', warn: '陨石! 踩开落点',     label: '陨石坠落!', crush: true, meteor: true, lethal: true },   // 《自然灾害生存》梗:地上落点阴影 → 踩开(复用落石机制 + 陨石皮)
    REDLIGHT:{ dur: 1.7, color: '#ff3b3b', warn: '红灯! 松手别动',     label: '红灯 · 别动!', redlight: true, lethal: true },   // 红灯绿灯 / Squid Game 梗:亮红灯就别动,动 = 死(全新"静止"动词)
    QUAKE:   { dur: 2.0, color: '#cc8844', warn: '地震! 站稳再跳',     label: '地震啦!',   quake: true },
    PHONE:   { dur: 2.4, color: '#7ac8ff', warn: '来电! 点屏幕接听',   label: '妈妈来电!', phone: true },   // kid-safe / 中性:不分性别、不教挂断长辈
    FLIP:    { dur: 2.0, color: '#b886ff', warn: '镜像! 反着走',       label: '左右颠倒!', invert: true, mirror: true },
    VFLIP:   { dur: 1.8, color: '#86c5ff', warn: '天翻地覆! 站稳别乱跳', label: '上下颠倒!', vflip: true },   // 比左右镜像更夸张:整屏垂直翻转
  };
  const LETHAL = ['WIND', 'THUNDER', 'CRUSH', 'LASER', 'SLIP', 'METEOR', 'REDLIGHT'];
  const FLAVOR = ['QUAKE', 'PHONE', 'FLIP', 'VFLIP'];

  // Per-RUN modifier: picked once at spawn so every 30s feels like a different
  // game. None of these kill on their own — they re-flavor the whole run, fair.
  const RUNMODS = [
    { key: 'NONE',    banner: null },
    { key: 'LOWGRAV', banner: '本局 · 月球重力', gravK: 0.6 },
    { key: 'WINDY',   banner: '本局 · 大风天',   windConst: 1 },
    { key: 'GIANT',   banner: '本局 · 巨人模式', scale: 1.45 },
    { key: 'MINI',    banner: '本局 · 迷你模式', scale: 0.62 },
    { key: 'STORM',   banner: '本局 · 混沌风暴', stormK: 0.62 },
  ];

  // Per-run BACKDROPS — make every 30s LOOK different, not just play different
  // (用户: "每局规则变了但背景都是蓝天白云"). Each special run-mod overrides the
  // sky + adds a weather layer; NONE keeps the theme's own sky so the 4 themes
  // still read distinctly. ALL weather renders BEHIND the platforms → it never
  // hides an event telegraph or a hazard (公平不偷袭).
  const BACKDROPS = {
    NONE:    { weather: 'clouds' },
    LOWGRAV: { skyTop:'#05030f', sky:'#241a4d', weather:'stars', moon:true, slab:'#6f6aa0', slabA:0.16 },   // 月球重力 → 星空/月面
    WINDY:   { skyTop:'#e8923f', sky:'#ffd98a', weather:'leaves', cloud:'#ffe9c8', slab:'#c0884a', slabA:0.18 }, // 大风天 → 斜风线+落叶
    GIANT:   { skyTop:'#5a1840', sky:'#ff8a5a', weather:'clouds', sun:true, cloud:'#ffd0b0', slab:'#a85a6a', slabA:0.18 }, // 巨人 → 落日
    MINI:    { skyTop:'#aacbe6', sky:'#eef7ff', weather:'snow', cloud:'#ffffff', slab:'#bcd0e0', slabA:0.20 }, // 迷你 → 下雪
    STORM:   { skyTop:'#161a22', sky:'#3a4250', weather:'rain', lightning:true, slab:'#566070', slabA:0.16 }, // 混沌风暴 → 压暗+雨+闪电
  };
  function bgOf(state) { const k = state && state.runMod && state.runMod.key; return BACKDROPS[k] || BACKDROPS.NONE; }
  function wrap(v, span) { return ((v % span) + span) % span; }   // positive modulo for looping particle fields

  // Escalation: a SCIENTIFIC difficulty curve tuned for a first-timer (小白/大妈).
  // First ~7s are danger-free (learn move+jump). Events then ease in with LONG
  // warnings + big gaps + mostly-survivable, ramping to a real challenge by ~25s.
  // k goes 0 (t≈8s) → 1 (t≈28s). storm run-mod tightens the gap further.
  // Tuned EASIER for 小白 (user: still a touch hard): longer warnings, sparser
  // events, lower lethality cap, slower ramp — still a real curve, just gentler.
  function difficulty(t, runMod) {
    const k = Math.max(0, Math.min(1, (t - 8) / 20));
    const storm = (runMod && runMod.stormK) || 1;
    return {
      gapMin:   (6.0 - 2.8 * k) * storm,   // 6.0s → 3.2s between events (sparser, less overwhelming)
      gapMax:   (8.0 - 3.6 * k) * storm,   // 8.0s → 4.4s
      warnDur:   1.9 - 0.8 * k,            // 1.9s → 1.1s reaction window (was 1.6→0.9 — more time to react)
      lethalBias: 0.12 + 0.58 * k,         // 12% → 70% lethal (was 15%→85% — more flavor, fewer deaths, lower late cap)
    };
  }

  // ── Palettes ── (sky / hills / block top+side / player) per theme
  const PALETTES = {
    grass: { sky:'#7ec0ff', skyTop:'#3aa1ff', hill:'#5aa53f', hill2:'#4a8c33',
             top:'#7fe26a', side:'#43ا'.replace('ا',''), end:'#ff77aa', player:'#ffcc44', head:'#ffe6a8' },
    snow:  { sky:'#cfeeff', skyTop:'#88c4ee', hill:'#a9c4d6', hill2:'#8fb0c4',
             top:'#ffffff', side:'#9fb9cc', end:'#ff99cc', player:'#ff6633', head:'#ffe6a8' },
    lava:  { sky:'#3a1410', skyTop:'#5a1414', hill:'#3a1810', hill2:'#27110a',
             top:'#ff7a3c', side:'#9c3a16', end:'#ffee44', player:'#ffee88', head:'#ffd49a' },
    space: { sky:'#0a0428', skyTop:'#1a0e44', hill:'#1a0e30', hill2:'#120a22',
             top:'#b48cff', side:'#5b3aa6', end:'#ffee44', player:'#88eeff', head:'#cfd6ff' },
  };
  // fix the grass.side typo above with a clean value
  PALETTES.grass.side = '#3f9a34';

  // THE classic Roblox "noob" — yellow head+arms, BLUE torso, GREEN legs. Kept
  // constant across themes because that exact tricolor IS the instant-recognition
  // signal (web-researched). Without it the blocky guy just reads as Mario.
  const NOOB = { skin: '#f7c93b', shirt: '#1f86e0', legs: '#4aab3e' };
  // 1/8 rare easter-egg skin: an all-gold noob (+ a tiny crown). Pure delight,
  // zero gameplay change — the "卧槽我抽到金色!" share-bait moment.
  const GOLD_NOOB = { skin: '#ffd23c', shirt: '#f5a623', legs: '#d98a1f' };

  function mulberry32(seed) { let a = seed >>> 0; return function() {
    a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function getScenario() { try { const s = $state(); if (s && s.scenario) return s.scenario; } catch (_) {}
    try { if (window.pendingConfig && window.pendingConfig.scenario) return window.pendingConfig.scenario; } catch (_) {} return {}; }
  function getThemeKey() {
    try { if (window.pendingConfig && window.pendingConfig.theme && PALETTES[window.pendingConfig.theme]) return window.pendingConfig.theme; } catch (_) {}
    const s = (getScenario().seed | 0) || 4242; const keys = Object.keys(PALETTES); return keys[s % keys.length]; }

  // ── Platform generator ── a chain of solid blocks with gaps + gentle height
  // steps, every gap clearable by a generous jump. Each: {x(center), y(top), w, type}.
  function generatePlatforms(scenario) {
    const seed = (scenario.seed | 0) || ((Math.random() * 1e9) | 0);   // no host seed → a FRESH random course every play (replays vary, not 写死的同一关)
    const rand = mulberry32(seed);
    // per-round CHARACTER so consecutive 30s feel different (not just shuffled): one course leans springy / shifty / crumbly / balanced. Difficulty CURVE stays the healthy one — this only changes WHICH obstacles, not how hard.
    const FLAVORS = ['balanced', 'springy', 'shifty', 'crumbly'], flavor = FLAVORS[(rand() * FLAVORS.length) | 0];
    const mB = flavor === 'shifty' ? 0.20 : 0, vB = flavor === 'crumbly' ? 0.20 : 0, bB = flavor === 'springy' ? 0.22 : 0;
    const P = [];
    let y = 30;
    P.push({ x: 0, y: y, w: 210, type: 'start' });           // LONG start runway — a first-timer learns to walk before the first hop
    let prevKill = false, sinceCp = 0;
    for (let i = 0; i < T.plat.count; i++) {
      const prev = P[P.length - 1];
      let w = T.plat.wMin + rand() * (T.plat.wMax - T.plat.wMin);
      let gap = T.plat.gapMin + rand() * (T.plat.gapMax - T.plat.gapMin);
      if (i < 3) gap = Math.min(gap, 26);                    // tiny first hops — build a beginner's confidence before real gaps
      if (prev.kind === 'kill') gap = Math.min(gap, 26);     // small gap AFTER a kill so prev→next clears it
      const prog = i / T.plat.count, r = rand();             // obstacles escalate with progress
      const blk = { type: 'normal' };
      if (i >= 4) {                                          // first FOUR after start stay plain — a safe runway for a first-timer to learn move+jump
        if (!prevKill && r < 0.12 + 0.13 * prog) { blk.kind = 'kill'; w = 34; gap = Math.min(gap, 26); prevKill = true; }   // narrow lava brick — JUMP over it (tap clears)
        else {
          prevKill = false;
          if (r < 0.30 + 0.16 * prog + mB) { blk.kind = 'move'; blk.move = { axis: (rand() < 0.5 ? 'x' : 'y'), range: T.obby.moveRange, speed: T.obby.moveSpeed * (0.8 + rand() * 0.5), phase: rand() * 6.28 }; }
          else if (r < 0.46 + 0.16 * prog + mB + vB) { blk.kind = 'vanish'; blk.vanish = { period: T.obby.vanishPeriod, phase: rand() * T.obby.vanishPeriod }; }
          else if (r < 0.56 + 0.10 * prog + mB + vB + bB) { blk.kind = 'bounce'; }
        }
      } else prevKill = false;
      const x = prev.x + prev.w / 2 + gap + w / 2;
      y = Math.max(-30, Math.min(170, y + (rand() - 0.5) * 2 * T.plat.stepMax * (i < 3 ? 0.3 : 1)));   // flat early so the first hops are dead simple
      blk.x = x; blk.y = y; blk.w = w; blk.baseX = x; blk.baseY = y;
      if (i > 1 && !blk.kind && rand() < 0.4) blk.coin = { dy: 28 + rand() * 18, taken: false };
      sinceCp++;
      if (!blk.kind && sinceCp >= T.obby.checkpointEvery) { blk.checkpoint = true; sinceCp = 0; }   // checkpoint on a safe block
      P.push(blk);
    }
    const prev = P[P.length - 1];
    P.push({ x: prev.x + prev.w / 2 + 80 + 75, y: y, w: 150, type: 'end' });
    return P;
  }

  // platform the player is standing on / directly above (for landing + shadow)
  function platformBelow(state, p) {
    let best = null;
    for (const pl of state.platforms) {
      if (p.px < pl.x - pl.w / 2 - 6 || p.px > pl.x + pl.w / 2 + 6) continue;
      if (pl.y <= p.py + 4 && (!best || pl.y > best.y)) best = pl;
    }
    return best;
  }
  function nextPlatform(state, p) {
    let best = null;
    for (const pl of state.platforms) { if (pl.x - pl.w / 2 > p.px + 4 && (!best || pl.x < best.x)) best = pl; }
    return best;
  }

  // ============================================================
  //  Module
  // ============================================================
  function buildModule() {
    return {
      name: 'ROBLOX · CHAOS OBBY', badge: 'OBBY', duration: 30, showMP: false, fxKey: 'roblox',
      pills: { distance: true, jumps: true },
      touchMode: 'platformer',            // LEFT = move stick, RIGHT/JUMP btn = tap jump
      skills() { return [null, null, null, null]; },   // jump = dedicated on-screen JUMP button (not a skill slot)

      applyGiftBoost(boost) {
        const state = $state(); if (!state || !state.player) return false;
        const p = state.player;
        // pick the gift — explicit pool key, else rotate so repeat sends differ
        let key = ROBLOX_GIFTS[boost] ? boost : null;
        if (!key) { state._giftRot = (state._giftRot || 0); key = ROBLOX_GIFT_KEYS[state._giftRot % ROBLOX_GIFT_KEYS.length]; state._giftRot++; }
        const g = ROBLOX_GIFTS[key];
        // every Roblox gift = the playground dream "I can fly" + ONE death-save
        // (a struggling player's second wind). Distinct VISUAL/meme per gift.
        p._giftShield = Math.max(p._giftShield || 0, 1);
        p.immuneT = Math.max(p.immuneT || 0, 2.2);
        p.stamina = T.jump.stamMax;
        if (key === 'wings') p._giftWingsT = g.dur;
        else if (key === 'oof') p._giftOofT = g.dur;
        else p._giftCoilT = g.dur;
        state.giftBoost = { key, name: g.name, ico: g.ico, tone: g.tone, t: g.dur, age: 0 };
        // gift name shows ONCE via the top DOM banner (no duplicate canvas popup)
        try { if (window.showBanner) window.showBanner(g.ico + ' ' + g.name, g.tone, 2.0); } catch (_) {}
        try { if (window.Juice) { window.Juice.flash(g.tone, 110); window.Juice.confetti($W()); window.Juice.addTrauma(0.4); } } catch (_) {}
        return true;
      },

      init() {
        const Iso = $Iso(); if (!Iso) return;
        const themeKey = getThemeKey();
        const palette = PALETTES[themeKey] || PALETTES.grass;
        const scenario = getScenario();
        let themeName = themeKey;
        try { const s = $pickTheme('roblox'); if (s && s.name) themeName = s.name; } catch (_) {}
        try { if (window.modeBadge) window.modeBadge.textContent = this.badge + ' · ' + themeName.toUpperCase(); } catch (_) {}
        fitView();
        const platforms = generatePlatforms(scenario);
        const finishX = platforms[platforms.length - 1].x;
        const start = platforms[0];
        const player = {
          px: 0, py: start.y, vy: 0, vx: 0,
          w: 12, h: 30,                          // half-width, body height (world units)
          onPlat: start, coyote: 0, jumpBuffer: 0, airJumped: false, stamina: T.jump.stamMax, spinT: 0, egg: Math.random() < 0.125,
          jumpsUsed: 0,
          alive: true, finished: false, facing: 1, squashT: 0, runPhase: 0,
          combo: 0, maxCombo: 0, coins: 0, dodges: 0, deaths: 0, immuneT: 0, lastSafe: null, lastSafePlat: null,
          hp: 100, maxHp: 100,
        };
        View.camX = player.px; View.camY = player.py;
        const fit = () => { fitView(); };
        const runMod = RUNMODS[(Math.random() * RUNMODS.length) | 0];   // 每局换规则: one modifier per spawn → each 30s feels different
        $setState({
          template: 'roblox', theme: palette, themeName, themeKey, scenario,
          platforms, player, finishX, startX: 0,
          time: 0, kills: 0, particles: [],
          skills: { q: { cd: 0, _cd: 0, cost: 0 }, w: { cd: 0.3, _cd: 0, cost: 0 } },   // engine reads state.skills.q
          evt: null, evtWarn: null, evtNextRoll: T.events.firstRollAt, evtCount: 0, thunderTarget: null,
          crushX: null, runMod, _announced: false,
          shakeT: 0, shakeMag: 0, _fit: fit,
          bg: null, mapW: finishX + 400, mapH: 1000, tiles: [], blocks: [],
        });
      },

      // PRESS fires the jump instantly (zero release-lag); HOLD while rising keeps
      // you climbing (variable height, capped); RELEASE just ends the hold-boost.
      // Move & jump are independent inputs now → 边走边跳 works (no drift cancel).
      // Coyote (edge grace) + pre-land buffer keep it forgiving, never "push".
      onActionDown() {
        const state = $state(); if (!state || !state.player) return;
        const p = state.player;
        if (!p.alive || p.finished) return;
        if (state.evt && state.evt.cfg && state.evt.cfg.phone) { state.evt = null; $sfx('pickup'); return; }  // 接电话: 按一下挂断
        const grounded = canJump(p);
        if (grounded) doJump(p);                                            // grounded (or coyote) → normal jump
        else if (!p.airJumped && p.stamina >= T.jump.stamCost) doDoubleJump(state, p);   // mid-air → DOUBLE JUMP if 耐力够
        else p.jumpBuffer = T.jump.buffer;                                  // can't jump now → buffer for landing
        if (p._giftOofT > 0) {                                              // OOF spring: BIG bouncy launch + the iconic meme
          p.vy = Math.max(p.vy, T.jump.vy * 1.5);
          try { if (window.Juice) window.Juice.popup('OOF!', wx2sx(p.px), wy2sy(p.py) - 30, { color: '#ffd24a', size: 20 }); } catch (_) {}
          $sfx('bigjump');
        }
      },
      onActionUp() {},
      castPress() {}, castRelease() {},

      update(dt) {
        const state = $state(); if (!state) return;
        const p = state.player;
        dt = Math.min(dt, 0.033);                                      // cap step → a frame-drop can't tunnel you THROUGH a platform
        state.time += dt;
        tickEvents(state, dt);
        tickPlatforms(state);                                          // move / vanish obby platforms
        if (state.shakeT > 0) state.shakeT = Math.max(0, state.shakeT - dt);
        if (!state._announced && state.time > 0.35) { state._announced = true;
          if (state.runMod && state.runMod.banner) { try { if (window.showBanner) window.showBanner(state.runMod.banner, '#ffe24a', 1.8); } catch (_) {} } }
        if (!state._climax && state.time >= 22 && p.alive && !p.finished) { state._climax = true;   // 30s arc → a clear escalating finale (上瘾峰值)
          try { if (window.showBanner) window.showBanner('⚡ 最后冲刺!', '#ff4655', 1.6); } catch (_) {} addShake(state, 7, 0.35); }

        if (p.alive && !p.finished) {
          const t = state.time;
          if (p.immuneT > 0) p.immuneT = Math.max(0, p.immuneT - dt);   // post-respawn grace
          if (p._giftCoilT > 0) p._giftCoilT = Math.max(0, p._giftCoilT - dt);
          if (p._giftWingsT > 0) p._giftWingsT = Math.max(0, p._giftWingsT - dt);   // GIFT: wings / OOF spring timers
          if (p._giftOofT > 0)   p._giftOofT   = Math.max(0, p._giftOofT - dt);
          let mvx = 0;
          try { if (typeof window.getMoveVec === 'function') { const mv = window.getMoveVec(); mvx = mv.x || 0; } } catch (_) {}
          const em = eventMod(state);
          const rm = state.runMod || {};
          let steerX = mvx;
          if (em.invert) steerX = -steerX;                              // 翻转: controls mirror
          const moveGate = em.freeze ? 0 : 1;
          if (em.redlight && Math.abs(mvx) > 0.12 && p.immuneT <= 0) killPlayer(state);   // 红灯! 动 = 死(站住别动才活)

          // ── horizontal move (player-paced) + slip momentum + wind push ──
          if (em.slip) { p.vx = (p.vx || 0) * 0.95 + steerX * T.move.walk * 0.06; p.px += p.vx * dt; }
          else { p.px += steerX * T.move.walk * moveGate * dt; p.vx = 0; }
          if (em.wind) p.px += em.windDir * em.windForce * dt;          // 妖风: counter-walk or get pushed off
          if (rm.windConst) p.px += -42 * dt;                           // 大风天 run-mod: gentle constant headwind, lean forward
          if (em.quake) addShake(state, 6, 0.1);
          if (Math.abs(steerX) > 0.1) p.facing = steerX > 0 ? 1 : -1;
          if (p.onPlat) p.runPhase += Math.abs(steerX) * dt * 16;

          // ── vertical physics (fixed-height jump; double-jump fires on press) ──
          const coil = p._giftCoilT > 0, wings = p._giftWingsT > 0, oof = p._giftOofT > 0;
          const gift = coil || wings || oof;
          // 3 real Roblox-obby gear feels: Gravity Coil = MOON jump (very low grav,
          // launch sky-high); Wings = floaty glide-fly; OOF Spring = bouncy.
          // (vy>0 = rising, vy<0 = falling — never clamp the rise, that was the 便秘 bug.)
          const gMul = coil ? 0.40 : wings ? 0.62 : oof ? 0.80 : 1;
          p.vy -= T.jump.gravity * (rm.gravK || 1) * gMul * dt;
          // Wings + OOF keep the air-jump primed → tap to FLAP/bounce and stay up.
          // Coil rides one big moon-jump (low grav does the lifting). Stamina topped up.
          if (wings || oof) p.airJumped = false;
          if (gift) p.stamina = T.jump.stamMax;
          // Wings GLIDE: cap only the DESCENT (vy<0) so you float down gently and
          // clear gaps — the jump itself stays full-power and snappy.
          if (wings && p.vy < -150) p.vy = -150;
          if (p.stamina < T.jump.stamMax) p.stamina = Math.min(T.jump.stamMax, p.stamina + T.jump.stamRegen * (gift ? 1.9 : 1) * dt);  // 耐力回充
          if (p.spinT > 0) p.spinT -= dt;                                    // double-jump flip anim
          p.py += p.vy * dt;
          if (p.squashT > 0) p.squashT -= dt;
          if (p.jumpBuffer > 0) p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

          // platform flash decay
          for (const pl of state.platforms) { if (pl._flash) pl._flash = Math.max(0, pl._flash - dt); }

          // ── landing: descending (vy<=0) and feet cross a block top within its span ──
          const wasAir = !p.onPlat;
          let landed = false;
          if (p.vy <= 0) {
            for (const pl of state.platforms) {
              if (pl._gone) continue;                                   // vanished block — nothing to land on
              if (p.px < pl.x - pl.w / 2 - p.w * 0.5 || p.px > pl.x + pl.w / 2 + p.w * 0.5) continue;
              if (p.py <= pl.y + 2 && p.py >= pl.y - 26) {                // crossing the top
                const landVy = p.vy;
                if (pl.kind === 'kill' && p.immuneT <= 0) { killPlayer(state); landed = true; break; }   // lava brick — JUMP over it
                if (pl.kind === 'bounce') {                              // trampoline → launch high
                  p.vy = T.obby.bounceVy; p.onPlat = null; p.coyote = 0; p.airJumped = false; p.jumpsUsed++; $sfx('bigjump');
                  addShake(state, 5, 0.05); pl._flash = 0.22;
                  try { if (window.Juice) { window.Juice.burst(wx2sx(pl.x), wy2sy(pl.y), 'spark', '#5af5e0'); window.Juice.popup('BOING!', wx2sx(pl.x), wy2sy(pl.y) - 24, { color:'#5af5e0', size:15 }); } } catch (_) {}
                  landed = true; break;
                }
                p.py = pl.y; p.vy = 0; p.onPlat = pl; p.coyote = T.jump.coyote;
                landed = true;
                if (!pl.kind) {                                          // solid ground → respawn anchor
                  p.lastSafe = { x: pl.x, y: pl.y }; p.lastSafePlat = pl;
                  if (pl.checkpoint && !pl._reached) { pl._reached = true; $sfx('pickup');
                    try { if (window.Juice) window.Juice.popup('✓ 存档', wx2sx(pl.x), wy2sy(pl.y) - 42, { color:'#5af5e0', size:14 }); } catch (_) {} }
                }
                if (wasAir) {
                  const hard = landVy < -480;
                  p.squashT = 0.16; pl._flash = hard ? 0.26 : 0.16;
                  p.combo = (p.combo || 0) + 1; p.maxCombo = Math.max(p.maxCombo || 0, p.combo);
                  addShake(state, hard ? T.juice.hardShake : T.juice.landShake, 0.06);
                  try { const sx = wx2sx(p.px), sy = wy2sy(pl.y);
                    if (window.Juice) { window.Juice.hitstop(hard ? T.juice.hardHitstop : T.juice.landHitstop);
                      window.Juice.burst(sx, sy, 'dust', palOf(state).top);
                      if (p.combo >= 3) window.Juice.popup('连跳 ×' + p.combo, sx, sy - 30, { color:'#ffe24a', size:16 + Math.min(10, p.combo) });
                    } else if (typeof window.spawnParticles === 'function') window.spawnParticles(state.particles, p.px, p.py, palOf(state).top, 6);
                  } catch (_) {}
                  if (pl.type === 'end' && !p.finished) { p.finished = true; doFinish(true); }
                  if (p.jumpBuffer > 0 && !p.finished) { p.jumpBuffer = 0; doJump(p); }
                }
                break;
              }
            }
          }
          if (!landed) { if (p.onPlat) { p.coyote = Math.max(p.coyote, T.jump.coyote); p.onPlat = null; } else p.coyote = Math.max(0, p.coyote - dt); }
          if (p.onPlat && p.onPlat._gone) p.onPlat = null;              // block vanished under you → fall
          if (!p.onPlat) p._lastAirT = state.time;                      // remember when last airborne (LASER forgives a recent jump)
          if (p.onPlat && p.onPlat._dx) p.px += p.onPlat._dx;           // ride horizontally-moving platforms

          // GIFT FLIGHT banks progress: wings/coil/OOF sail forward WITHOUT landing, so
          // p.lastSafe never advanced and a fall dumped you back at the takeoff point
          // (the "飞到 75% 摔下来又回到起点" bug). While a flight gift is active, advance the
          // respawn anchor to the furthest solid ground you've sailed OVER — a fall then
          // keeps the progress you flew to. (Reaching finishX still wins outright, below.)
          if (!p.onPlat && (p._giftWingsT > 0 || p._giftCoilT > 0 || p._giftOofT > 0)) {
            let best = p.lastSafe;
            for (const pl of state.platforms) {
              if (pl.kind || pl.vanish) continue;                       // solid, non-vanishing ground only
              if (pl.x <= p.px + 4 && pl.x > (best ? best.x : -1e9)) best = pl;
            }
            if (best && best !== p.lastSafe) {
              p.lastSafe = { x: best.x, y: best.y }; p.lastSafePlat = best;
              if (best.checkpoint && !best._reached) { best._reached = true; $sfx('pickup');
                try { if (window.Juice) window.Juice.popup('✓ 存档', wx2sx(best.x), wy2sy(best.y) - 42, { color:'#5af5e0', size:14 }); } catch (_) {} }
            }
          }

          // Reaching the finish line counts as a WIN even mid-air — so a gift flight
          // (wings/coil/OOF) that sails OVER the obstacles to the end actually wins,
          // instead of overshooting into the void and wasting the flight (白飞).
          // Checked BEFORE the fall-death so flying past the last platform still wins.
          if (!p.finished && p.px >= state.finishX) { p.finished = true; doFinish(true); }

          // fall → respawn at last safe ground (obby checkpoint), or game over if none
          else if (p.py < T.fall.deathY) killPlayer(state);

          // coins — grab them mid-jump (爽点 + reward).
          for (const pl of state.platforms) {
            if (!pl.coin || pl.coin.taken) continue;
            if (Math.abs(p.px - pl.x) < pl.w / 2 + 8 && Math.abs(p.py - (pl.y + pl.coin.dy)) < 18) {
              pl.coin.taken = true; p.coins = (p.coins || 0) + 1; $sfx('pickup');
              try { if (window.Juice) { const sx = wx2sx(pl.x), sy = wy2sy(pl.y + pl.coin.dy); window.Juice.popup('+1', sx, sy - 14, { color:'#ffe24a', size:16 }); window.Juice.burst(sx, sy, 'spark', '#ffe24a'); } } catch (_) {}
            }
          }

          // HUD score line + keep state.kills live (so a timer-end shows the real score)
          state.kills = scoreOf(p, state);
          try { if (window.scoreEl) window.scoreEl.textContent = '分 ' + (state.kills || 0); } catch (_) {}   // top-right = live score (clean, gives a "why")
        }

        // camera follows X (rest at restX). Vertical = DEAD-ZONE follow: keep the
        // player inside a comfort band on screen — stable on small hops, but it
        // tracks them UP into the sky on big gift launches (wings/coil/OOF) so the
        // paid effect is never lost off-screen (user: "宁可让视角跟着飞到天空").
        if (p.onPlat) p._groundY = p.py;
        View.camX += (p.px - View.camX) * T.cam.followLerp;
        const SC = View.SCALE, rY = View.restY;
        const sy = rY - (p.py - View.camY) * SC;          // player's current screen-y
        const topB = View.H * 0.20, botB = View.H * 0.72; // comfort band
        let camTY = View.camY;
        if (sy < topB)      camTY = p.py - (rY - topB) / SC;   // too high → pan up with them
        else if (sy > botB) camTY = p.py - (rY - botB) / SC;   // too low → pan down
        View.camY += (camTY - View.camY) * 0.22;
        // hard safety clamp — even a fast launch can never push the player off-screen
        const hardTop = View.H * 0.10, hardBot = View.H * 0.88;
        const syNow = rY - (p.py - View.camY) * SC;
        if (syNow < hardTop) View.camY = p.py - (rY - hardTop) / SC;
        else if (syNow > hardBot) View.camY = p.py - (rY - hardBot) / SC;
      },

      draw() { drawScene($state()); },
      refit() { const s = $state(); if (s && typeof s._fit === 'function') { s._fit(); if (s.player) { View.camX = s.player.px; View.camY = s.player.py; } } },
    };
  }
  function palOf(state) { return state.theme || PALETTES.grass; }

  // GIFT sky easter eggs — fly high enough (wings/coil/OOF) and the sky turns to
  // space, with Roblox-culture memes revealing the higher you go: MOON (嫦娥 + 玉兔 +
  // a Transformer) → DEEP SPACE (火星 + 🚀 + 马斯克 + a 👽 UFO). Pure cosmetic, driven
  // by altitude above your launch platform — the payoff for the "fly to the moon"
  // moment a paid gift creates (made to be screenshot/shared). Normal jumps never
  // reach the threshold, so it only shows on a gift flight.
  // ── Drawn (pixel-art) Roblox-culture icons — no emoji, instantly recognizable ──
  function drawRobux(c, x, y, r) {                  // the currency coin (R$) — flex
    c.save(); c.fillStyle = '#f5c542'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#c79a2e'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#7a5a12'; c.font = `bold ${Math.round(r * 1.05)}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('R$', x, y + 1); c.textBaseline = 'alphabetic'; c.restore();
  }
  function drawBaconNoob(c, x, y, s) {              // the iconic default avatar (Bacon Hair)
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#f3d22b'; c.fillRect(-12, -12, 24, 24); c.strokeStyle = '#b89a18'; c.lineWidth = 1.5; c.strokeRect(-12, -12, 24, 24);
    for (let i = 0; i < 4; i++) { const bx = -12 + i * 7; c.fillStyle = i % 2 ? '#b8432a' : '#e07a4a';
      c.beginPath(); c.moveTo(bx, -12); c.lineTo(bx + 7, -12); c.lineTo(bx + 5, -21); c.lineTo(bx - 2, -19); c.closePath(); c.fill(); }
    c.fillStyle = '#2a2a2a'; c.fillRect(-7, -4, 4, 5); c.fillRect(3, -4, 4, 5);
    c.strokeStyle = '#2a2a2a'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(-7, 5); c.quadraticCurveTo(0, 11, 7, 5); c.stroke(); c.lineCap = 'butt';
    c.restore();
  }
  function drawDominus(c, x, y, s) {                // the legendary status hat — the ultimate flex
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#e8b53a';                                                  // gold swept-back spikes
    [[-14,-6,-32,-20],[-6,-13,-15,-37],[6,-13,15,-37],[14,-6,32,-20],[0,-15,0,-42]].forEach(([x1,y1,x2,y2]) => {
      c.beginPath(); c.moveTo(x1 - 3, y1); c.lineTo(x1 + 3, y1); c.lineTo(x2, y2); c.closePath(); c.fill(); });
    c.fillStyle = '#1b1530'; c.beginPath(); c.arc(0, -2, 16, Math.PI, 0); c.fill(); c.fillRect(-16, -2, 32, 11);  // dark helmet
    c.fillStyle = '#6df0ff'; c.fillRect(-9, 1, 18, 5);                         // glowing face slot
    c.restore();
  }
  function drawOofStone(c, x, y, s) {               // the OOF death meme as a tombstone
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#9aa3ad'; c.beginPath(); c.moveTo(-16, 20); c.lineTo(-16, -6); c.arc(0, -6, 16, Math.PI, 0); c.lineTo(16, 20); c.closePath(); c.fill();
    c.strokeStyle = '#6e757e'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#3a4047'; c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.fillText('OOF', 0, 4); c.restore();
  }

  function drawSkyEasterEggs(ctx, state, W, H) {
    const p = state.player; if (!p) return;
    const ground = (p._groundY != null ? p._groundY : p.py);
    const alt = p.py - ground;
    if (alt < 220) return;                                            // still in the normal play area
    const cl = v => Math.max(0, Math.min(1, v));
    const sky   = cl((alt - 220) / 280);       // 220→500 : space + raining Robux
    const flex  = cl((alt - 450) / 300);       // 450→750 : Dominus + Bacon-Hair noob
    const top   = cl((alt - 850) / 350);       // 850→1200: OOF stone + THANKS FOR PLAYING
    const t = state.time || 0;
    ctx.save(); ctx.textAlign = 'center';
    ctx.globalAlpha = 0.62 * sky; ctx.fillStyle = '#0a0a26'; ctx.fillRect(0, 0, W, H);          // darken to space
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 44; i++) { const sxx = (i * 9973) % W, syy = (i * 6311) % Math.round(H * 0.72);
      ctx.globalAlpha = sky * (0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + i))); ctx.fillRect(sxx, syy, 2, 2); }
    if (sky > 0.05) {                                                  // raining Robux — "you're flying = flexing"
      ctx.globalAlpha = sky;
      for (let i = 0; i < 6; i++) { const cx = (i * 137 % W); const cy = ((t * 30 + i * 90) % (H * 0.6));
        drawRobux(ctx, cx, cy, 9); }
    }
    if (flex > 0.02) {                                                 // ── the FLEX tier ──
      ctx.globalAlpha = flex;
      drawDominus(ctx, W * 0.72, H * 0.24 + 3 * Math.sin(t * 1.6), 1.5);
      ctx.fillStyle = '#ffd86a'; ctx.font = 'bold 12px monospace'; ctx.fillText('DOMINUS', W * 0.72, H * 0.24 + 46);
      drawBaconNoob(ctx, W * 0.28, H * 0.30 + 3 * Math.sin(t * 2 + 1), 1.4);
      ctx.fillStyle = '#ffd0a0'; ctx.fillText('BACON', W * 0.28, H * 0.30 + 40);
      ctx.globalAlpha = 1;
    }
    if (top > 0.02) {                                                  // ── peak: OOF + obby finish meme ──
      ctx.globalAlpha = top;
      drawOofStone(ctx, W * 0.6, H * 0.16, 1.3);
      drawRobux(ctx, W * 0.2, H * 0.2 + 4 * Math.sin(t * 2.4), 13);
      ctx.fillStyle = '#9be7ff'; ctx.font = 'bold 13px monospace'; ctx.fillText('THANKS FOR PLAYING!', W * 0.5, H * 0.42);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ============================================================
  //  Render — pure 2D side view
  // ============================================================
  function drawScene(state) {
    if (!state) return;
    const ctx = $ctx(); if (!ctx) return;
    const W = $W(), H = $H(); const pal = palOf(state); const p = state.player;
    const em = eventMod(state); const scale = (em.scale || 1) * ((state.runMod && state.runMod.scale) || 1);   // GIANT/MINI run-mods

    ctx.save();
    if (state.shakeT > 0) { const m = state.shakeMag; ctx.translate((Math.random()-0.5)*m, (Math.random()-0.5)*m); }
    if (em.mirror) { ctx.translate(W/2, 0); ctx.scale(-1, 1); ctx.translate(-W/2, 0); }   // 左右镜像 event
    if (em.vflip) { ctx.translate(0, H/2); ctx.scale(1, -1); ctx.translate(0, -H/2); }    // 上下颠倒 event — 整屏垂直翻转(HUD 在 restore 后画,不受影响)

    // sky — per-run backdrop overrides the theme sky so every 30s LOOKS different
    const bd = bgOf(state);
    const topC = bd.skyTop || pal.skyTop, botC = bd.sky || pal.sky, gkey = topC + botC + H;
    if (state._skyGradKey !== gkey) {                              // cache — sky is constant within a run; don't realloc the gradient every frame (千元机 GC)
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, topC); g.addColorStop(1, botC);
      state._skyGrad = g; state._skyGradKey = gkey;
    }
    ctx.fillStyle = state._skyGrad; ctx.fillRect(-40, -40, W + 80, H + 80);
    drawSkyAccent(ctx, bd, state, W, H);                 // stars / moon / sun / lightning — sky-fixed, behind everything
    drawSkyEasterEggs(ctx, state, W, H);                 // GIFT: fly high → space + Roblox memes (moon嫦娥玉兔变形金刚 / 火星马斯克外星人)
    if (bd.weather === 'clouds') drawClouds(ctx, W, H, bd.cloud);
    drawHills(ctx, pal, W, H, bd);
    drawWeather(ctx, bd, state, W, H);                   // rain / snow / leaves — BEHIND platforms (never hides a hazard)

    // platforms (sorted far→near is irrelevant in 2D; draw in order)
    const landTgt = state.thunderTarget || null;
    for (const pl of state.platforms) {
      const sx = wx2sx(pl.x);
      if (sx < -260 || sx > W + 260) continue;
      drawPlatform(ctx, pl, pal, state.time, pl === landTgt);
      if (pl.coin && !pl.coin.taken) drawCoin(ctx, pl, state.time);
    }
    drawHazards(ctx, state);            // crush column / laser beam — telegraphed, world-aligned
    // landing shadow (always — shows the spot you'll land on)
    drawShadow(ctx, state, p);
    // player
    if (p.alive) drawPlayer(ctx, p, pal, scale); else drawDeath(ctx, p, pal);
    if (state.ring) { const r = state.ring; r.t += 0.016; const k = r.t / 0.4;   // double-jump shockwave
      if (k >= 1) state.ring = null; else { const rx = wx2sx(r.x), ry = wy2sy(r.y), rr = 8 + k * 48;
        ctx.save(); ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = '#9be7ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(rx, ry, rr, rr * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } }

    ctx.restore();   // end shake/mirror

    // screen-space overlays (upright)
    drawEventFx(ctx, state, W, H);
    drawEventOverlay(ctx, state, W, H);
    drawHud(ctx, p, pal, W, H);
    drawProgress(ctx, p, state, W, H);
    if (state.time < 7) drawStartHint(ctx, state.time, W, H);
  }

  function drawClouds(c, W, H, col) {
    c.save(); c.globalAlpha = 0.88; c.fillStyle = col || '#ffffff';
    const span = W + 240;
    for (let i = 0; i < 5; i++) {
      const cx = (((i * 337 - (View.camX * 0.25 + View.camY * -0.15) * View.SCALE) % span) + span) % span - 120;
      const cy = H * 0.08 + ((i * 71) % Math.round(H * 0.30));
      c.beginPath(); c.ellipse(cx, cy, 38, 17, 0, 0, Math.PI * 2);
      c.ellipse(cx + 30, cy + 6, 28, 14, 0, 0, Math.PI * 2);
      c.ellipse(cx - 26, cy + 5, 24, 12, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  // Obby backdrop: faint floating studded platforms drifting in the skybox.
  // (Replaced the rolling green hills — that grassy silhouette was the #1 "this
  // is Mario, not Roblox" tell. Floating obby slabs read as a Roblox skybox.)
  function drawHills(c, pal, W, H, bd) {
    const top = (bd && bd.slab) || pal.top; c.save();
    const baseA = (bd && bd.slabA != null) ? bd.slabA : 0.20;   // per-run dimming so night/storm slabs aren't garish
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.16 : 0.09, span = W + 280, sz = layer ? 1 : 0.72;
      const off = (((View.camX * par * View.SCALE) % span) + span) % span;
      c.globalAlpha = layer ? baseA : baseA * 0.6;
      for (let i = 0; i < 5; i++) {
        const bx = (((i * 257 - off) % span) + span) % span - 140;
        const by = H * (0.12 + ((i * 37 + layer * 60) % 100) / 100 * 0.30) + View.camY * 0.22 * View.SCALE;
        const bw = (56 + (i % 3) * 20) * sz, bh = 15 * sz;
        c.fillStyle = top; c.fillRect(bx, by, bw, bh);                       // floating slab
        c.fillStyle = shade(top, 0.3); c.fillRect(bx, by + bh, bw, 4 * sz);  // its underside
        c.fillStyle = tint(top, 0.34);                                       // tiny stud row
        for (let s = 4; s < bw - 4; s += 12 * sz) c.fillRect(bx + s, by + 2, 4 * sz, 2 * sz);
      }
    }
    c.restore();
  }

  // Sky-fixed accents drawn BEHIND the slabs: starfield + moon (月球重力夜),
  // low sun (巨人落日), ambient lightning veil (混沌风暴). Deterministic from
  // state.time → no RNG, no flicker, and "不输入不动" stays true.
  function drawSkyAccent(c, bd, state, W, H) {
    const t = state ? state.time : 0;
    if (bd.weather === 'stars' || bd.moon) {                       // twinkling starfield, slow parallax
      c.save(); const off = View.camX * 0.04 * View.SCALE;
      for (let i = 0; i < 46; i++) {
        const sx = wrap(i * 97.3 - off, W + 40) - 20, sy = (i * 53.7) % (H * 0.72);
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.7 + i));
        c.globalAlpha = 0.5 * tw; c.fillStyle = (i % 7 === 0) ? '#bfe0ff' : '#ffffff';
        const r = (i % 5 === 0) ? 1.7 : 1.0; c.fillRect(sx, sy, r, r);
      }
      c.restore();
    }
    if (bd.moon) {                                                 // big soft moon + a few craters
      const mx = W * 0.78, my = H * 0.10, r = 32; c.save();   // high in the sky — clear of the goal banner (~0.15-0.19) + runmod banner (0.30)
      c.globalAlpha = 0.25; c.fillStyle = '#cfd6ff'; c.beginPath(); c.arc(mx, my, r + 9, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1; c.fillStyle = '#e8ecff'; c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(150,160,200,0.5)';
      c.beginPath(); c.arc(mx - 9, my - 6, 6, 0, Math.PI * 2); c.arc(mx + 11, my + 8, 8, 0, Math.PI * 2); c.arc(mx + 3, my - 12, 4, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    if (bd.sun) {                                                  // low huge sunset disc (巨人模式)
      const sx = W * 0.5, sy = H * 0.42, r = 56; c.save();   // lower — clear of the runmod banner at 0.30 (sits behind the player)
      const gg = c.createRadialGradient(sx, sy, 6, sx, sy, r + 40);
      gg.addColorStop(0, 'rgba(255,238,180,0.95)'); gg.addColorStop(0.5, 'rgba(255,170,90,0.5)'); gg.addColorStop(1, 'rgba(255,140,80,0)');
      c.fillStyle = gg; c.beginPath(); c.arc(sx, sy, r + 40, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    if (bd.lightning) {                                            // STORM — brief bluish veil over the SKY only
      const f = lightningFlash(t);                                 // (NOT red → can't be confused with the THUNDER event,
      if (f > 0.01) {                                              //  NOT full-screen → won't read as the telegraph border)
        c.save(); c.globalAlpha = 0.5 * f; c.fillStyle = '#cdd6ff'; c.fillRect(-40, -40, W + 80, H * 0.55); c.restore();
        if (f > 0.6) {                                             // a thin branching bolt high in the sky on the strong strikes
          c.save(); c.globalAlpha = f; c.strokeStyle = '#eef2ff'; c.lineWidth = 2; c.beginPath();
          let bx = W * (0.2 + 0.5 * ((Math.floor(t / 3.2) * 0.37) % 1)), by = -10; c.moveTo(bx, by);
          for (let s = 0; s < 5; s++) { bx += (((s * 131) % 7) - 3) * 9; by += H * 0.07; c.lineTo(bx, by); }
          c.stroke(); c.restore();
        }
      }
    }
  }
  function lightningFlash(t) {                                     // sharp strike every ~3.2s + a dim afterflicker; no state/RNG
    const ph = t % 3.2;
    if (ph < 0.14) return 1 - ph / 0.14;
    if (ph > 1.5 && ph < 1.62) return (1 - (ph - 1.5) / 0.12) * 0.5;
    return 0;
  }

  // Falling weather — drawn BEHIND the platforms so it reads as atmosphere and
  // never covers the player, a hazard, or an event warning (公平不偷袭).
  function drawWeather(c, bd, state, W, H) {
    const t = state ? state.time : 0, w = bd.weather;
    if (w === 'rain') {                                            // 混沌风暴 — slanted downpour
      c.save(); c.strokeStyle = 'rgba(180,200,230,0.5)'; c.lineWidth = 1.4;
      for (let i = 0; i < 60; i++) {
        const x = wrap(i * 53.7 + t * 40, W + 40) - 20, y = wrap(i * 89.3 + t * 900, H + 40) - 20;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - 6, y + 18); c.stroke();
      }
      c.restore();
    } else if (w === 'snow') {                                     // 迷你模式 — gentle drifting snow
      c.save(); c.fillStyle = '#ffffff';
      for (let i = 0; i < 54; i++) {
        const sway = Math.sin(t * 1.3 + i) * 12;
        const x = wrap(i * 71.3 + sway, W + 40) - 20, y = wrap(i * 47.9 + t * (60 + (i % 3) * 24), H + 40) - 20;
        c.globalAlpha = 0.55 + 0.22 * (i % 3); const r = 1.4 + (i % 3) * 0.9;
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    } else if (w === 'leaves') {                                   // 大风天 — diagonal wind streaks + tumbling leaves (blow LEFT, matches headwind)
      c.save(); c.strokeStyle = 'rgba(255,240,210,0.18)'; c.lineWidth = 2;
      for (let i = 0; i < 7; i++) { const yy = wrap(i * 140 - t * 220, H + 80) - 40; c.beginPath(); c.moveTo(W + 20, yy); c.lineTo(-20, yy + 60); c.stroke(); }
      const cols = ['#e8a04a', '#d4762e', '#c4922a', '#b8602a'];
      for (let i = 0; i < 24; i++) {
        const x = wrap(i * 83.7 - t * 80, W + 60) - 30, y = wrap(i * 61.3 + t * 70 + Math.sin(t * 2 + i) * 20, H + 40) - 20;
        c.globalAlpha = 0.8; c.fillStyle = cols[i % 4];
        c.save(); c.translate(x, y); c.rotate(t * 3 + i); c.beginPath(); c.ellipse(0, 0, 4.5, 2.2, 0, 0, Math.PI * 2); c.fill(); c.restore();
      }
      c.restore();
    }
  }

  // a solid 3D-ish block seen from the side: bright TOP face + darker FRONT face.
  function drawPlatform(c, pl, pal, t, isThunder) {
    if (pl._shattered) return;                                   // 地震震碎 → block dropped (rebuilds when quake ends)
    let jx = 0, jy = 0;
    if (pl._crackUntil != null) { const s = t * 42 + (pl.baseX || pl.x); jx = Math.sin(s) * 1.8; jy = Math.cos(s * 1.3) * 1.3; }   // shudder while cracking
    const sx = wx2sx(pl.x) + jx, topY = wy2sy(pl.y) + jy;
    const halfW = Math.round((pl.w / 2) * View.SCALE);
    const x = sx - halfW, w = halfW * 2;
    const thick = T.plat.thick;
    let top = pal.top, side = pal.side;
    if (pl.type === 'end') { top = pal.end; side = shade(pal.end, 0.25); }
    if (pl.type === 'start') { top = tint(pal.top, 0.10); }
    if (pl.kind === 'kill')   { top = '#ff5a3c'; side = '#9c2c14'; }     // lava brick
    if (pl.kind === 'bounce') { top = '#62f1de'; side = '#1f9c8f'; }     // trampoline
    const va = (pl.kind === 'vanish') ? (pl._gone ? 0.15 : (pl._fade != null ? pl._fade : 1)) : 1;
    c.save(); c.globalAlpha = va;
    c.fillStyle = side; c.fillRect(x, topY, w, thick + 60);            // front/side face (extends down)
    c.fillStyle = shade(side, 0.35); c.fillRect(x, topY + thick + 56, w, 4);
    c.fillStyle = top; c.fillRect(x, topY - 8, w, 13);                 // TOP face — where you land
    c.fillStyle = tint(top, 0.42); c.fillRect(x, topY - 8, w, 3);      // top catch-light (plastic gloss)
    // STUDS — the Roblox signature: a row of little cylinders on the top surface
    const sd = Math.max(14, 16 * View.SCALE / 1.9), r = Math.max(3.2, 4.1 * View.SCALE / 1.9);
    const nStud = Math.max(1, Math.floor((w - 8) / sd)), padS = (w - nStud * sd) / 2 + sd / 2;
    const studTop = tint(top, 0.36), studLip = shade(top, 0.20);
    for (let i = 0; i < nStud; i++) { const cxp = x + padS + i * sd, cyp = topY - 4;
      c.fillStyle = studLip; c.beginPath(); c.ellipse(cxp, cyp + 1.6, r, r * 0.62, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = studTop; c.beginPath(); c.ellipse(cxp, cyp, r, r * 0.62, 0, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = 'rgba(0,0,0,0.32)'; c.lineWidth = 1.5; c.strokeRect(x + 0.5, topY - 8 + 0.5, w, thick + 64);
    c.restore();   // end vanish fade
    // ── obby obstacle markers (full alpha) ──
    if (pl.kind === 'kill') { c.save(); const pul = 0.5 + 0.5 * Math.sin(t * 9);   // DANGER at a glance: molten lava + spikes (Roblox spike-trap language — "don't step here")
      c.fillStyle = 'rgba(255,80,20,' + (0.30 + 0.35 * pul).toFixed(2) + ')'; c.fillRect(x, topY - 17, w, 13);   // heat-glow rising off the surface
      const sp = 12, n = Math.max(2, Math.round(w / sp)), bw0 = w / n;                                            // a row of sharp spikes
      for (let i = 0; i < n; i++) { const bx0 = x + i * bw0;
        c.fillStyle = '#2e1812'; c.beginPath(); c.moveTo(bx0, topY - 5); c.lineTo(bx0 + bw0 / 2, topY - 18); c.lineTo(bx0 + bw0, topY - 5); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.stroke();
        c.fillStyle = 'rgba(255,240,200,0.85)'; c.beginPath(); c.moveTo(bx0 + bw0 / 2 - 1.4, topY - 12); c.lineTo(bx0 + bw0 / 2, topY - 18); c.lineTo(bx0 + bw0 / 2 + 1.4, topY - 12); c.closePath(); c.fill(); }   // glint on each tip
      c.fillStyle = '#ffd24a'; for (let i = 0; i < 3; i++) { const bxp = x + w * (0.25 + 0.25 * i) + Math.sin(t * 4 + i) * 3; c.beginPath(); c.arc(bxp, topY + 1, 2, 0, Math.PI * 2); c.fill(); }   // bubbling lava
      c.restore(); }
    if (pl.kind === 'bounce') { c.save();   // SPRING: a coil down the front + bouncy arrow — "this launches you" at a glance
      c.strokeStyle = '#0a4a44'; c.lineWidth = 3; c.lineCap = 'round';
      const cw = Math.min(15, w * 0.28), cy0 = topY + 5, ch = 22, loops = 3;
      c.beginPath(); c.moveTo(sx - cw, cy0);
      for (let i = 0; i < loops; i++) { const yy = cy0 + (ch / loops) * i; c.lineTo(sx + cw, yy + (ch / loops) * 0.5); c.lineTo(sx - cw, yy + (ch / loops)); }
      c.stroke();
      c.strokeStyle = '#063a34'; c.beginPath(); c.moveTo(sx - 9, topY + 1); c.lineTo(sx, topY - 8); c.lineTo(sx + 9, topY + 1); c.stroke();   // bouncy up-arrow on the pad
      c.lineCap = 'butt'; c.restore(); }
    if (pl.kind === 'vanish' && !pl._gone) { c.save(); c.setLineDash([6, 4]);   // DASHED = temporary/unstable, it blinks out (Roblox disappearing-platform language)
      c.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.35 * Math.sin(t * 6 + pl.x)).toFixed(2) + ')'; c.lineWidth = 2;
      c.strokeRect(x + 2, topY - 7, w - 4, 11); c.setLineDash([]); c.restore(); }
    if (pl.kind === 'move') { c.save(); c.fillStyle = 'rgba(255,255,255,0.75)';   // movement axis arrows
      c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.fillText(pl.move && pl.move.axis === 'x' ? '↔' : '↕', sx, topY + 6); c.textAlign = 'left'; c.restore(); }
    if (pl.checkpoint) { const poleH = 40; c.fillStyle = '#cfd6dd'; c.fillRect(sx - 1, topY - 8 - poleH, 2, poleH);   // checkpoint flag (cyan)
      const wave = Math.sin(t * 5) * 3; c.fillStyle = pl._reached ? '#5af5e0' : '#9fb4c0';
      c.beginPath(); c.moveTo(sx + 1, topY - 8 - poleH); c.lineTo(sx + 20 + wave, topY - 8 - poleH + 6); c.lineTo(sx + 1, topY - 8 - poleH + 14); c.closePath(); c.fill(); }
    // spawn pad ring on the start block (classic Roblox spawn)
    if (pl.type === 'start') { c.save(); c.globalAlpha = 0.45 + 0.32 * Math.sin(t * 3);
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.ellipse(sx, topY - 1, 18, 6, 0, 0, Math.PI * 2); c.stroke(); c.restore(); }
    // landing flash
    if (pl._flash > 0) { c.save(); c.globalAlpha = Math.min(0.6, pl._flash * 3); c.fillStyle = '#fff'; c.fillRect(x, topY - 10, w, 16); c.restore(); }
    // thunder warning — pulsing red + ⚡, jump off!
    if (isThunder) { const pulse = 0.5 + 0.5 * Math.sin(t * 16); c.save();
      c.fillStyle = 'rgba(255,40,40,' + (0.3 + 0.4 * pulse).toFixed(2) + ')'; c.fillRect(x, topY - 8, w, thick + 64);
      c.fillStyle = '#fff'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.fillText('⚡', sx, topY + 16); c.textAlign = 'left'; c.restore(); }
    // end flag pole
    if (pl.type === 'end') { const poleH = 56; c.fillStyle = '#ddd'; c.fillRect(sx - 1, topY - 8 - poleH, 3, poleH);
      const wave = Math.sin(t * 4) * 4; c.fillStyle = pal.end; c.beginPath();
      c.moveTo(sx + 2, topY - 8 - poleH); c.lineTo(sx + 30 + wave, topY - 8 - poleH + 8); c.lineTo(sx + 2, topY - 8 - poleH + 18); c.closePath(); c.fill(); }
    // 地震 — cracking shudder overlay: jagged dark fissures + a red warning tint (then it drops)
    if (pl._crackUntil != null) { c.save();
      c.fillStyle = 'rgba(180,40,20,0.22)'; c.fillRect(x, topY - 8, w, thick + 20);
      c.strokeStyle = 'rgba(20,10,6,0.7)'; c.lineWidth = 1.6; c.beginPath();
      for (let k = -1; k <= 1; k++) { const cx0 = sx + k * (w * 0.28); c.moveTo(cx0, topY - 6);
        c.lineTo(cx0 + 4, topY + 6); c.lineTo(cx0 - 3, topY + 16); c.lineTo(cx0 + 5, topY + 28); }
      c.stroke(); c.restore(); }
  }

  function drawCoin(c, pl, t) {
    const sx = wx2sx(pl.x), sy = wy2sy(pl.y + pl.coin.dy);
    const spin = Math.abs(Math.cos(t * 4 + pl.x * 0.07));   // width oscillates → spinning coin
    c.fillStyle = '#ffd633'; c.beginPath(); c.ellipse(sx, sy, 6 * spin + 2, 8, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#b8860b'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#fff6c0'; c.beginPath(); c.ellipse(sx - 1, sy - 2, 2 * spin + 0.5, 3, 0, 0, Math.PI * 2); c.fill();
  }
  function drawShadow(c, state, p) {
    const below = platformBelow(state, p); if (!below) return;
    const sx = wx2sx(p.px), shy = wy2sy(below.y) - 6;
    const air = Math.max(0, p.py - below.y); const k = Math.max(0.45, 1 - air / 160);
    c.fillStyle = 'rgba(0,0,0,' + (0.16 + 0.22 * k).toFixed(2) + ')';
    c.beginPath(); c.ellipse(sx, shy, 13 * k * View.SCALE / 1.7, 5 * k, 0, 0, Math.PI * 2); c.fill();
  }

  // blocky Roblox-style avatar, side view, feet at (px,py)
  // ═══ GIFT "ENHANCE" SPECTACLE (Roblox) ═══════════════════════════════════
  // The playground fantasy: a TikTok gift makes you FLY. Each is a Roblox-culture
  // meme, big & shareable, strong-but-timed (12-14s) + a one-time death-save, so a
  // struggling player gets a dramatic second wind without it being auto-win.
  const ROBLOX_GIFTS = {
    wings: { ico: '🪽', name: 'Dominus 大翅膀', tone: '#b06bff', dur: 14 },   // giant glowing wings → glide/fly
    coil:  { ico: '🌀', name: '反重力线圈',      tone: '#5fe0ff', dur: 14 },   // low-grav float (classic Gravity Coil)
    oof:   { ico: '🚀', name: 'OOF 火箭弹簧',    tone: '#ffd24a', dur: 12 },   // mega-bounce spring + the iconic OOF
  };
  const ROBLOX_GIFT_KEYS = ['wings', 'coil', 'oof'];

  // Drawn BEHIND the avatar body (called early in drawPlayer). World-space, scaled.
  function drawGiftAvatar(c, p, X, F) {
    const t = (p._giftWingsT > 0) ? 'wings' : (p._giftOofT > 0) ? 'oof' : (p._giftCoilT > 0) ? 'coil' : null;
    if (!t) return;
    const now = performance.now();
    const tone = t === 'wings' ? '#b06bff' : t === 'oof' ? '#ffd24a' : '#5fe0ff';
    // radiant glow halo behind everyone
    c.save();
    const cy = F - 20, pulse = 0.5 + 0.5 * Math.sin(now / 150);
    const grad = c.createRadialGradient(X, cy, 4, X, cy, 40);
    grad.addColorStop(0, tone); grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.45 + 0.25 * pulse; c.fillStyle = grad;
    c.beginPath(); c.arc(X, cy, 38, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1; c.restore();
    if (t === 'wings') {
      // BIG majestic feathered wings — span ~2.5× the avatar, arching up & out, flapping.
      const flap = Math.sin(now / 120) * 16;
      for (const s of [-1, 1]) {
        c.save(); c.translate(X, F - 26);
        const wg = c.createLinearGradient(0, 0, s * 56, -40);
        wg.addColorStop(0, '#e9d6ff'); wg.addColorStop(0.6, '#b06bff'); wg.addColorStop(1, '#7a3fd0');
        c.fillStyle = wg; c.strokeStyle = '#5a2aa8'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(0, 2);
        c.quadraticCurveTo(s * 22, -34 - flap, s * 56, -30 - flap);     // top edge sweeping up & out
        c.quadraticCurveTo(s * 44, -10 - flap * 0.4, s * 50, 2);        // outer tip
        c.quadraticCurveTo(s * 40, 4, s * 34, 12);                      // lower feather 1
        c.quadraticCurveTo(s * 30, 4, s * 22, 14);                      // lower feather 2
        c.quadraticCurveTo(s * 18, 6, s * 8, 12);                       // lower feather 3
        c.closePath(); c.fill(); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.2;     // feather ribs
        for (const f of [0.45, 0.7, 0.92]) { c.beginPath(); c.moveTo(s * 6, 2); c.lineTo(s * 50 * f, (-32 - flap) * f + 4); c.stroke(); }
        c.restore();
      }
      // a couple of drifting feather sparkles for share-worthy flair
      c.save(); c.fillStyle = '#e9d6ff'; c.globalAlpha = 0.8;
      const fy = (now / 9) % 60; c.fillRect(X - 30, F - 50 + fy * 0.3, 2, 2); c.fillRect(X + 26, F - 60 + ((fy + 30) % 60) * 0.3, 2, 2);
      c.globalAlpha = 1; c.restore();
    } else if (t === 'oof') {                               // chunky coiled spring under the feet
      c.save(); c.strokeStyle = '#ffd24a'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath();
      for (let i = 0; i <= 6; i++) { const yy = F + i * 2.6; const xx = X + (i % 2 ? 9 : -9); if (i === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy); }
      c.stroke();
      c.fillStyle = '#ffe78a'; c.fillRect(X - 11, F + 16, 22, 4);       // spring base plate
      c.lineCap = 'butt'; c.restore();
    }
  }

  function drawPlayer(c, p, pal, scale) {
    const sx = wx2sx(p.px), feet = wy2sy(p.py);
    let sxk = 1, syk = 1;
    if (p.squashT > 0) { const k = p.squashT / 0.16; sxk = 1 + 0.35 * k; syk = 1 - 0.3 * k; }
    else if (!p.onPlat && p.vy > 120) { sxk = 0.86; syk = 1.14; }
    c.save(); c.translate(sx, feet); c.scale(scale * sxk, scale * syk); c.translate(-sx, -feet);
    if (p.spinT > 0) { const cy = feet - 19, ang = (1 - p.spinT / 0.42) * Math.PI * 2 * (p.facing || 1);   // double-jump flip
      c.translate(sx, cy); c.rotate(ang); c.translate(-sx, -cy); }
    const X = sx, F = feet, dir = p.facing;
    drawGiftAvatar(c, p, X, F);                                      // GIFT wings / spring / aura (behind the body)
    const C = p.egg ? GOLD_NOOB : NOOB;                              // 1/8 rare gold skin
    // legs — classic noob GREEN (running stagger on ground; tucked in air)
    const swing = p.onPlat ? Math.round(Math.sin(p.runPhase) * 3) : (p.vy > 0 ? -2 : 2);
    c.fillStyle = C.legs;
    c.fillRect(X - 7, F - 11 + swing, 5, 11 - swing); c.fillRect(X + 2, F - 11 - swing, 5, 11 + swing);
    c.fillStyle = shade(C.legs, 0.28); c.fillRect(X + 2, F - 11 - swing, 5, 3);
    // back arm (yellow skin, swings opposite the front leg)
    c.fillStyle = shade(C.skin, 0.18); c.fillRect(X - 10, F - 25 - swing, 4, 13);
    // torso — classic noob BLUE shirt + shaded edge + gloss
    c.fillStyle = C.shirt; c.fillRect(X - 8, F - 26, 16, 16);
    c.fillStyle = shade(C.shirt, 0.26); c.fillRect(X + (dir>0?3:-9), F - 26, 6, 16);
    c.fillStyle = tint(C.shirt, 0.32); c.fillRect(X - 7, F - 25, 2, 14);
    // front arm (yellow skin)
    c.fillStyle = C.skin; c.fillRect(X + 6, F - 25 + swing, 4, 13);
    // head — classic noob YELLOW + shaded edge + gloss
    c.fillStyle = C.skin; c.fillRect(X - 7, F - 40, 14, 14);
    c.fillStyle = shade(C.skin, 0.18); c.fillRect(X + (dir>0?2:-8), F - 40, 5, 14);
    c.fillStyle = tint(C.skin, 0.34); c.fillRect(X - 6, F - 39, 2, 12);
    // classic noob face: two eyes + a wide smile (faces travel direction)
    const ex = dir > 0 ? 1 : -8;
    c.fillStyle = '#2a2a2a'; c.fillRect(X + ex, F - 36, 3, 4); c.fillRect(X + ex + 6, F - 36, 3, 4);
    c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(X + ex, F - 30); c.quadraticCurveTo(X + ex + 4.5, F - 26.5, X + ex + 9, F - 30); c.stroke(); c.lineCap = 'butt';
    c.strokeStyle = 'rgba(0,0,0,0.42)'; c.lineWidth = 1; c.strokeRect(X - 8, F - 40, 16, 40);
    if (p.egg) {                                                     // tiny golden crown — the rare-skin tell
      c.fillStyle = '#ffe35a'; c.strokeStyle = '#b8860b'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(X - 6, F - 40); c.lineTo(X - 6, F - 46); c.lineTo(X - 3, F - 43); c.lineTo(X, F - 47);
      c.lineTo(X + 3, F - 43); c.lineTo(X + 6, F - 46); c.lineTo(X + 6, F - 40); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff6c0'; c.fillRect(X - 1, F - 45, 2, 2);
    }
    c.restore();
  }
  function drawDeath(c, p, pal) {
    const sx = wx2sx(p.px), feet = wy2sy(Math.max(p.py, T.fall.deathY));
    c.fillStyle = '#ff4655'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.fillText('×_×', sx, feet); c.textAlign = 'left';
  }

  // CLEAN HUD — three non-overlapping bands below the engine top bar (~0-40px):
  // progress (y~46-59), stats row (y~80), 二段跳 meter (y~94-102). No more pile-up.
  function drawHud(c, p, pal, W, H) {
    const pad = 14, y = 80;                                     // below the progress bar (by=52)
    c.textAlign = 'left'; c.font = 'bold 12px monospace';
    c.fillStyle = '#ffd633'; c.fillText('● ' + (p.coins || 0), pad, y);                 // 金币
    c.fillStyle = '#5af5e0'; c.fillText('躲过 ' + (p.dodges || 0), pad + 54, y);          // dodges survived
    // 二段跳 stamina on its own row — cyan when there's enough to air-jump
    const sm = T.jump.stamMax, ready = (p.stamina || 0) >= T.jump.stamCost;
    c.font = 'bold 11px monospace'; c.fillStyle = ready ? '#9be7ff' : '#ffffff88';
    c.fillText('二段跳', pad, y + 22);
    const bx = pad + 50, by = y + 14, bw = 66, bh = 7;
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(bx, by, bw, bh);
    c.fillStyle = ready ? '#5af5e0' : '#7a8a99'; c.fillRect(bx, by, bw * Math.max(0, Math.min(1, (p.stamina || 0) / sm)), bh);
    c.fillStyle = '#ffffff99'; c.fillRect(bx + bw * (T.jump.stamCost / sm) - 1, by - 1, 2, bh + 2);   // "enough" tick
  }
  function drawProgress(c, p, state, W, H) {
    const pct = Math.max(0, Math.min(1, p.px / Math.max(1, state.finishX)));
    const bx = 14, bw = W - 28 - 18, by = 52, bh = 7;           // just under the engine top bar — no overlap
    c.font = 'bold 11px monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffdd';
    c.fillText('到终点 ' + Math.floor(pct * 100) + '%', bx, by - 6);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(bx, by, bw, bh);
    c.fillStyle = (state.theme && state.theme.end) || '#ff77aa'; c.fillRect(bx, by, bw * pct, bh);
    const mx = bx + bw * pct; c.fillStyle = (state.theme && state.theme.player) || '#ffcc44';
    c.beginPath(); c.arc(mx, by + bh / 2, 5, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
    const fx = bx + bw + 4, fy = by - 2; c.fillStyle = '#fff'; c.fillRect(fx, fy, 12, 12); c.fillStyle = '#000';
    for (let r = 0; r < 3; r++) for (let cc = 0; cc < 3; cc++) if ((r + cc) % 2 === 0) c.fillRect(fx + cc * 4, fy + r * 4, 4, 4);
    c.strokeStyle = '#000'; c.strokeRect(fx, fy, 12, 12);
  }
  // Beginner-first onboarding (小白/大妈 must get goal+controls in <5s). Held the
  // full 7s danger-free window, then fades. GOAL stated huge + first, controls
  // pointed where they physically are, a persistent "→ 终点" so nobody gets lost.
  function drawStartHint(c, t, W, H) {
    if (t >= 7) return;
    const fade = t < 6 ? 1 : Math.max(0, 7 - t);
    c.save(); c.globalAlpha = fade; c.textAlign = 'center';
    const pulse = 0.55 + 0.45 * Math.sin(t * 6);
    // THE GOAL — huge, first, unmissable: run right to the flag = win
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, H * 0.15, W, 44);                 // own zone, ABOVE the 30% runmod banner — no more overlap
    c.fillStyle = '#ffe24a'; c.font = 'bold 20px monospace';
    c.fillText('目标:跑到最右边终点旗 = 赢!', W / 2, H * 0.195);
    // controls — pointed at where the thumbs actually go
    c.font = 'bold 16px monospace'; c.fillStyle = 'rgba(126,214,255,' + pulse.toFixed(2) + ')';
    c.fillText('← 按住左边拖着走', W * 0.28, H * 0.66);
    c.fillStyle = 'rgba(98,241,222,' + pulse.toFixed(2) + ')';
    c.fillText('点右边跳 →', W * 0.75, H * 0.66);
    if (t > 2.2) {                                                   // then layer in the next two ideas
      c.fillStyle = '#ffffff'; c.font = 'bold 13px monospace';
      c.fillText('空中再点一下 = 二段跳(跳更远)', W / 2, H * 0.45);
      c.fillStyle = '#ffd24a';
      c.fillText('看到 ⚠ 预警就照字躲 · 别踩红熔岩', W / 2, H * 0.49);
    }
    // persistent "this way →" toward the goal so a beginner never wonders where to go
    c.fillStyle = 'rgba(255,226,74,' + (0.45 + 0.55 * pulse).toFixed(2) + ')'; c.font = 'bold 34px monospace';
    c.fillText('→', W * 0.93, H * 0.40);
    c.textAlign = 'left'; c.restore();
  }

  // World-space hazard visuals so the player reads exactly WHERE + HOW to dodge.
  function drawHazards(c, state) {
    const warn = state.evtWarn, evt = state.evt, t = state.time;
    const gy0 = (state.player && state.player._groundY != null) ? state.player._groundY : 0;
    // CRUSH — falling-block column (step left/right out of it).
    const crush = (warn && warn.cfg.crush) ? warn : (evt && evt.cfg.crush) ? evt : null;
    if (crush && state.crushX != null) {
      const cx = wx2sx(state.crushX), halfW = CRUSH_W * View.SCALE, groundSy = wy2sy(gy0), active = !!(evt && evt.cfg.crush);
      const isMeteor = !!((warn && warn.cfg.meteor) || (evt && evt.cfg.meteor));
      const pul = 0.5 + 0.5 * Math.sin(t * 18);
      const k = active ? 1 : Math.min(1, (t - crush.startedAt) / Math.max(0.1, crush.activateAt - crush.startedAt));
      c.save();
      if (isMeteor) {
        // 陨石:地上一个落点阴影圈(预警)+ 一颗带火尾的陨石砸下来
        c.fillStyle = 'rgba(255,90,30,' + (active ? 0.40 : (0.18 + 0.22 * pul)).toFixed(2) + ')';
        c.beginPath(); c.ellipse(cx, groundSy - 2, halfW, halfW * 0.42, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#ff7a3c'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, groundSy - 2, halfW, halfW * 0.42, 0, 0, Math.PI * 2); c.stroke();
        const my = active ? groundSy - 26 : (-60 + (groundSy - 26 + 60) * k);
        c.fillStyle = 'rgba(255,180,80,0.5)'; c.beginPath(); c.moveTo(cx, my - 36); c.lineTo(cx - 8, my); c.lineTo(cx + 8, my); c.closePath(); c.fill();   // fire trail
        c.fillStyle = '#4a2a1a'; c.beginPath(); c.arc(cx, my, 12, 0, Math.PI * 2); c.fill();                          // rock
        c.fillStyle = '#ff7a3c'; c.beginPath(); c.arc(cx - 3, my - 3, 6, 0, Math.PI * 2); c.fill();                   // molten edge
      } else {
        c.fillStyle = 'rgba(255,70,70,' + (active ? 0.28 : (0.14 + 0.18 * pul)).toFixed(2) + ')';
        c.fillRect(cx - halfW, 0, halfW * 2, $H());
        const blockY = active ? groundSy - 44 : (-70 + (groundSy - 44 + 70) * k);
        c.fillStyle = active ? '#c83232' : '#ff5a5a'; c.fillRect(cx - halfW, blockY, halfW * 2, 46);
        c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(cx - halfW, blockY + 40, halfW * 2, 6);
        c.fillStyle = 'rgba(255,255,255,0.30)'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(cx + i * halfW * 0.5, blockY + 11, 4, 0, Math.PI * 2); c.fill(); }
      }
      c.restore();
    }
    // LASER — low sweep beam (JUMP over it).
    const laser = (warn && warn.cfg.laser) ? warn : (evt && evt.cfg.laser) ? evt : null;
    if (laser) {
      const active = !!(evt && evt.cfg.laser), gy = wy2sy(gy0) - 15, pul = 0.5 + 0.5 * Math.sin(t * 30);
      c.save();
      c.strokeStyle = active ? '#ff3df0' : 'rgba(255,61,240,' + (0.4 + 0.45 * pul).toFixed(2) + ')';
      c.lineWidth = active ? 9 : 4; c.beginPath(); c.moveTo(0, gy); c.lineTo($W(), gy); c.stroke();
      if (active) { c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, gy); c.lineTo($W(), gy); c.stroke(); }
      c.restore();
    }
  }

  // telegraph border + wind arrows + (active) overlays
  function drawEventFx(c, state, W, H) {
    const wn = state.evtWarn;
    if (wn) { const pul = 0.5 + 0.5 * Math.sin(state.time * 14); c.save();
      c.strokeStyle = wn.cfg.color; c.globalAlpha = 0.35 + 0.45 * pul; c.lineWidth = 12; c.strokeRect(6, 6, W - 12, H - 12); c.restore(); }
    const e = state.evt;
    if (e && e.cfg.wind) { const dir = e.windDir || 1; c.save(); c.fillStyle = e.cfg.color; c.globalAlpha = 0.55 + 0.3 * Math.sin(state.time * 8);
      for (let i = 0; i < 6; i++) { const yy = H * 0.16 + i * (H * 0.12); const xx = (dir > 0 ? W * 0.10 : W * 0.90) + Math.sin(state.time * 4 + i) * 12;
        c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + dir * 28, yy + 11); c.lineTo(xx, yy + 22); c.closePath(); c.fill(); }
      c.globalAlpha = 0.16; c.strokeStyle = e.cfg.color; c.lineWidth = 2;
      for (let i = 0; i < 9; i++) { const yy = (i * 99 + state.time * 130) % H; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy + dir * 26); c.stroke(); } c.restore(); }
    if (e && e.cfg.redlight) {   // 红灯:强红色暗角 + 巨大"别动!" —— 一眼 Red-Light-Green-Light,立刻松手站住
      const pul = 0.5 + 0.5 * Math.sin(state.time * 6); c.save();
      const g = c.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.64);
      g.addColorStop(0, 'rgba(255,40,40,0)'); g.addColorStop(1, 'rgba(220,20,20,' + (0.34 + 0.26 * pul).toFixed(2) + ')');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff'; c.font = 'bold 40px monospace'; c.textAlign = 'center'; c.fillText('别动!', W / 2, H * 0.30);
      c.fillStyle = '#ffd0d0'; c.font = 'bold 15px monospace'; c.fillText('松开手 · 站住不动', W / 2, H * 0.30 + 26);
      c.textAlign = 'left'; c.restore(); }
  }
  // active-event color wash + phone gag
  function drawEventOverlay(c, state, W, H) {
    const e = state.evt; if (!e) return; const cfg = e.cfg;
    const remain = Math.max(0, e.until - state.time), frac = Math.max(0, Math.min(1, remain / cfg.dur));
    c.save(); c.globalAlpha = 0.14; c.fillStyle = cfg.color; c.fillRect(0, 0, W, H); c.globalAlpha = 1; c.restore();
    const cw = Math.min(260, W - 40), cx = W / 2 - cw / 2, cy = 92;
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(cx, cy, cw, 32); c.strokeStyle = cfg.color; c.lineWidth = 2; c.strokeRect(cx, cy, cw, 32);
    c.fillStyle = cfg.color; c.font = 'bold 14px monospace'; c.textAlign = 'center'; c.fillText(cfg.label, W / 2, cy + 15);
    c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(cx + 8, cy + 23, cw - 16, 4); c.fillStyle = cfg.color; c.fillRect(cx + 8, cy + 23, (cw - 16) * frac, 4); c.textAlign = 'left';
    if (cfg.phone) { const pw = Math.min(220, W * 0.62), ph = pw * 1.45, px = W / 2 - pw / 2, py = H / 2 - ph / 2;
      c.fillStyle = 'rgba(0,0,0,0.82)'; c.fillRect(px, py, pw, ph); c.strokeStyle = '#7ac8ff'; c.lineWidth = 3; c.strokeRect(px, py, pw, ph);
      c.fillStyle = '#7ac8ff'; c.beginPath(); c.arc(W / 2, py + pw * 0.42, pw * 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold ' + Math.round(pw * 0.13) + 'px monospace'; c.textAlign = 'center'; c.fillText('妈妈', W / 2, py + pw * 0.78);
      c.fillStyle = '#aaa'; c.font = Math.round(pw * 0.08) + 'px monospace'; c.fillText('正在来电…', W / 2, py + pw * 0.95);
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 8); c.fillStyle = 'rgba(90,230,120,' + (0.5 + 0.5 * pulse) + ')'; c.fillRect(px + pw * 0.18, py + ph - pw * 0.34, pw * 0.64, pw * 0.22);
      c.fillStyle = '#000'; c.font = 'bold ' + Math.round(pw * 0.1) + 'px monospace'; c.fillText('☎ 点一下接听', W / 2, py + ph - pw * 0.19); c.textAlign = 'left'; }
  }

  // ============================================================
  //  Jump + events
  // ============================================================
  function canJump(p) { return !!p.onPlat || p.coyote > 0; }
  function doJump(p) { if (!canJump(p)) return; p.vy = T.jump.vy; p.onPlat = null; p.coyote = 0; p.jumpBuffer = 0; p.airJumped = false; p.jumpsUsed++; $sfx('jump'); }
  function doDoubleJump(state, p) {   // mid-air second jump — the lifesaver. Drains stamina; one per airtime.
    p.vy = T.jump.doubleVy; p.onPlat = null; p.jumpBuffer = 0; p.airJumped = true; p.jumpsUsed++;
    p.stamina = Math.max(0, p.stamina - T.jump.stamCost); p.spinT = 0.42;
    $sfx('bigjump'); doubleJumpFx(state, p);
  }
  function doubleJumpFx(state, p) {   // 周星驰"踩鸟起飞" — kick the air DOWN, launch UP
    addShake(state, 5, 0.08);
    try { const sx = wx2sx(p.px), sy = wy2sy(p.py);
      if (window.Juice) {
        window.Juice.hitstop(0.04);                                  // micro-freeze = punch
        window.Juice.flash('#9be7ff', 75);
        window.Juice.burst(sx, sy + 6, 'dust', '#dff6ff');           // air kicked DOWN at the feet (the "鸟")
        window.Juice.burst(sx, sy - 6, 'spark', '#9be7ff');          // launch sparks UP
        window.Juice.popup('二段跳!', sx, sy - 54, { color: '#9be7ff', size: 22 });
      } else if (typeof window.spawnParticles === 'function') window.spawnParticles(state.particles, p.px, p.py, '#9be7ff', 10);
    } catch (_) {}
    state.ring = { x: p.px, y: p.py, t: 0 };   // expanding shockwave ring drawn in drawScene
  }

  const CRUSH_W = 32;   // half-width (world units) of the falling-block kill column
  function sparkAt(state, wx, wy) { try { if (window.Juice) { window.Juice.burst(wx2sx(wx), wy2sy(wy), 'spark', '#ffe24a'); window.Juice.flash('#fff7c0', 70); } } catch (_) {} }
  // Survived a telegraphed lethal → the core dopamine beat: "I changed the outcome".
  function rewardDodge(state) {
    const p = state.player; if (!p || !p.alive) return;
    p.dodges = (p.dodges || 0) + 1;
    const milestone = (p.dodges % 5 === 0);                      // every 5th dodge = a "卧槽" beat
    const sx = wx2sx(p.px), sy = wy2sy(p.py);
    try { if (window.Juice) {
      if (milestone) { window.Juice.popup('连躲 ×' + p.dodges + '!', sx, sy - 50, { color: '#ffe24a', size: 26 });
        window.Juice.hitstop(0.06); window.Juice.flash('#ffe24a', 70); window.Juice.addTrauma(0.25); }
      else { window.Juice.popup('躲过! ×' + p.dodges, sx, sy - 48, { color: '#5af5e0', size: 15 + Math.min(11, p.dodges) }); window.Juice.flash('#5af5e0', 45); }
      window.Juice.burst(sx, sy - 18, 'spark', milestone ? '#ffe24a' : '#5af5e0');
    } } catch (_) {}
    $sfx(milestone ? 'cash' : 'pickup');
  }

  function triggerEvent(state, key) {
    const cfg = EVENTS[key]; if (!cfg) return; const now = state.time; const p = state.player;
    state.evt = { key, cfg, until: now + cfg.dur, startedAt: now }; state.evtCount = (state.evtCount || 0) + 1;
    if (cfg.wind) state.evt.windDir = state._windDir || (Math.random() < 0.5 ? -1 : 1);
    // ── instant-strike lethals: each kills ONLY if the telegraphed dodge was ignored ──
    let struck = false;
    if (cfg.thunder) {                                       // dodge: jump off / leave the red block
      const tgt = state.thunderTarget;
      if (tgt && p && p.onPlat === tgt && p.alive) struck = true; else if (tgt) sparkAt(state, tgt.x, tgt.y);
      state.thunderTarget = null;
    }
    if (cfg.crush) {                                         // dodge: step left/right out of the column
      const cx = (state.crushX != null) ? state.crushX : (p ? p.px : 0);
      if (p && p.alive && Math.abs(p.px - cx) < CRUSH_W) struck = true; else sparkAt(state, cx, p ? p.py : 0);
    }
    if (cfg.laser) {                                         // dodge: jump — airborne now OR jumped within the last 0.4s (forgiving for beginners)
      const recentlyAir = (state.time - (p && p._lastAirT != null ? p._lastAirT : -9)) <= 0.4;
      if (p && p.alive && p.onPlat && !recentlyAir) struck = true; else if (p) sparkAt(state, p.px, p.py - 30);
    }
    if (struck && p && p.immuneT > 0) struck = false;        // post-respawn grace — can't be re-killed instantly
    if (struck && p) { killPlayer(state); }
    else if (p && p.alive && (cfg.thunder || cfg.crush || cfg.laser)) rewardDodge(state);   // survived an instant-strike lethal
    addShake(state, cfg.lethal ? 11 : 6, 0.2);
    try { if (window.showBanner) window.showBanner(cfg.label, cfg.color, 1.1); } catch (_) {}
    if (cfg.mirror) { try { if (window.Juice) { window.Juice.flash('#b886ff', 95); window.Juice.hitstop(0.05); } } catch (_) {} }   // 镜像 → punch the flip
    if (cfg.vflip)  { try { if (window.Juice) { window.Juice.flash('#86c5ff', 110); window.Juice.hitstop(0.06); window.Juice.addTrauma(0.3); } } catch (_) {} }   // 上下颠倒 → bigger punch
    if (cfg.quake)  { try { if (window.Juice) window.Juice.flash('#caa07a', 70); } catch (_) {} }                                    // 地震 → dusty jolt
    if (cfg.redlight) { try { if (window.Juice) window.Juice.flash('#ff3b3b', 90); } catch (_) {} }                                  // 红灯 → red flash
    $sfx(cfg.lethal ? 'hit' : 'tower');
    try { if (p && typeof window.spawnParticles === 'function') window.spawnParticles(state.particles, p.px, p.py, cfg.color, 14); } catch (_) {}
  }
  function tickEvents(state, dt) {
    const now = state.time; const p = state.player;
    if (state.evt && now >= state.evt.until) { const c = state.evt.cfg; state.evt = null; if (c && (c.wind || c.slip || c.redlight) && p && p.alive) rewardDodge(state); }   // rode out a duration lethal (incl. 红灯:站住到结束)
    if (state.evtWarn && now >= state.evtWarn.activateAt) { const w = state.evtWarn; state.evtWarn = null; triggerEvent(state, w.key); }
    const grounded = p && p.onPlat;
    if (!state.evt && !state.evtWarn && grounded && now >= (state.evtNextRoll || 0) && now > T.events.firstRollAt && now < T.events.lastRollT) {
      const D = difficulty(now, state.runMod);
      let pool = (state.evtCount > 0 && Math.random() < D.lethalBias) ? LETHAL : FLAVOR;
      if (state.evtCount === 0) pool = ['QUAKE'];                        // first-ever event = ONE gentle taste (no kill, no phone)
      let cand = pool.filter(k => k !== state._lastEvtKey);             // never the same event twice in a row → kills the "又一遍" repeat feel
      if (now - (state._lastPhoneT != null ? state._lastPhoneT : -99) < 12) cand = cand.filter(k => k !== 'PHONE');   // phone cooldown ≥12s → rare, no spam (治"多次打电话")
      if (!cand.length) cand = pool;
      const key = cand[(Math.random() * cand.length) | 0]; const cfg = EVENTS[key];
      state._lastEvtKey = key; if (key === 'PHONE') state._lastPhoneT = now;
      state.evtWarn = { key, cfg, activateAt: now + D.warnDur, startedAt: now };
      if (cfg.thunder) state.thunderTarget = p.onPlat;
      if (cfg.crush)   state.crushX = p.px;                              // lock the impact at WARN (covers 落石 + 陨石)
      if (cfg.wind)    state._windDir = (Math.random() < 0.5 ? -1 : 1);
      addShake(state, 4, 0.12);
      try { if (window.showBanner) window.showBanner('⚠ ' + cfg.warn, cfg.color, D.warnDur); } catch (_) {}
      $sfx('warn');
      state.evtNextRoll = now + D.gapMin + Math.random() * (D.gapMax - D.gapMin);
    }
  }
  function eventMod(state) {
    const e = state && state.evt;
    if (!e) return { invert: false, slip: false, freeze: false, wind: false, windDir: 0, windForce: 0, quake: false, mirror: false, vflip: false, redlight: false, scale: 1 };
    const c = e.cfg;
    return { invert: !!c.invert, slip: !!c.slip, freeze: !!c.freeze, wind: !!c.wind, windDir: e.windDir || 0,
             windForce: c.wind ? 95 : 0, quake: !!c.quake, mirror: !!c.mirror, vflip: !!c.vflip, redlight: !!c.redlight, scale: c.scale || 1 };
  }
  function addShake(state, mag, dur) { state.shakeMag = Math.max(state.shakeMag || 0, mag); state.shakeT = Math.max(state.shakeT || 0, dur); }

  function scoreOf(p, state) { const pct = Math.max(0, Math.min(1, p.px / Math.max(1, state.finishX)));
    return Math.floor(pct * 100 + (p.maxCombo || 0) * 2 + (p.coins || 0) * 3 + (p.dodges || 0) * 5); }

  // Move / vanish the obby platforms each frame (before the landing check uses them).
  function tickPlatforms(state) {
    const t = state.time;
    // 事件改造地形 ①: 妖风 makes the obby itself sway — moving platforms swing
    // wider AND narrow solid ground rocks. Ramped so it eases in/out (no snap).
    // The player rides the sway via p.onPlat._dx, so footing moves under you.
    const windy = (state.evt && state.evt.cfg && state.evt.cfg.wind) || !!(state.runMod && state.runMod.windConst);
    state._windRamp = Math.max(0, Math.min(1, (state._windRamp || 0) + (windy ? 0.06 : -0.06)));
    const wf = state._windRamp;
    // 事件改造地形 ②: 地震 cracks eligible blocks (~0.55s shudder) then DROPS them;
    // everything REBUILDS when the quake ends → the path is never lost for good
    // (start/end/checkpoint/kill/bounce/vanish + the block you're on never crack).
    const quaking = !!(state.evt && state.evt.cfg && state.evt.cfg.quake);
    if (quaking && !state._quaking) {                       // quake just started → pick blocks to crack
      state._quaking = true; const p = state.player;
      for (const pl of state.platforms) {
        if (pl.vanish || pl.checkpoint || pl.type === 'start' || pl.type === 'end' || pl.kind === 'kill' || pl.kind === 'bounce') continue;
        if (p && p.onPlat === pl) continue;                 // never yank the floor you're standing on
        if (p && pl.x > p.px - 40 && pl.x < p.px + 240) continue;   // nor the block you're about to land on (next ~240px of the path)
        if (((pl.baseX * 7 | 0) % 10) < 5) pl._crackUntil = t + 0.55;   // ~half, deterministic by x (gate-stable)
      }
    } else if (!quaking && state._quaking) {                // quake ended → rebuild every cracked/dropped block
      state._quaking = false;
      for (const pl of state.platforms) { if (pl._crackUntil != null || pl._shattered) { pl._crackUntil = null; pl._shattered = false; pl._gone = false; pl._flash = 0.3; } }
    }
    if (quaking) for (const pl of state.platforms) {
      if (pl._crackUntil != null && t >= pl._crackUntil) {  // crack window over → drop it
        pl._crackUntil = null; pl._shattered = true; pl._gone = true;
        try { if (window.Juice) window.Juice.burst(wx2sx(pl.x), wy2sy(pl.y), 'dust', '#a06a44'); } catch (_) {}
      }
    }
    for (const pl of state.platforms) {
      if (pl.move) {
        const off = Math.sin(t * pl.move.speed + pl.move.phase) * pl.move.range * (1 + 0.6 * wf);   // 妖风 → wider swing
        if (pl.move.axis === 'x') { const nx = pl.baseX + off; pl._dx = nx - pl.x; pl.x = nx; }
        else { pl.y = pl.baseY + off; pl._dx = 0; }
      } else if (pl.baseX != null && pl.type !== 'start' && pl.type !== 'end' && pl.w < 300) {
        const off = wf > 0.001 ? Math.sin(t * 3.2 + pl.baseX * 0.05) * 11 * wf : 0;   // solid ground rocks in the wind
        const nx = pl.baseX + off; pl._dx = nx - pl.x; pl.x = nx;
      }
      if (pl.vanish) { const f = ((t + pl.vanish.phase) % pl.vanish.period) / pl.vanish.period;
        pl._gone = f > 0.66; pl._fade = (f > 0.5) ? Math.max(0.12, 1 - (f - 0.5) / 0.16) : 1; }   // blinks, then gone ~1/3 of the cycle
    }
  }

  // Death → respawn at the last safe ground (obby checkpoint). True game-over only
  // if no safe spot exists yet (can't happen — the start pad is always one).
  function killPlayer(state) {
    const p = state.player; if (!p || !p.alive || p.finished) return;
    if ((p._giftShield || 0) > 0) {
      p._giftShield -= 1;
      p.immuneT = Math.max(p.immuneT || 0, 1.6);
      p.stamina = T.jump.stamMax;
      p.airJumped = false;
      if (p.lastSafe) {
        p.px = p.lastSafe.x; p.py = p.lastSafe.y; p.vy = 0; p.vx = 0;
        p.onPlat = (p.lastSafePlat && !p.lastSafePlat._gone) ? p.lastSafePlat : null;
        p.coyote = T.jump.coyote;
      } else {
        p.vy = Math.max(p.vy, T.jump.doubleVy * 0.72);
      }
      try { if (window.Juice) { window.Juice.flash('#ff5a7a', 100); window.Juice.popup('护盾救命!', wx2sx(p.px), wy2sy(p.py) - 34, { color: '#ffe24a', size: 20 }); } } catch (_) {}
      $sfx('pickup');
      return;
    }
    p.deaths = (p.deaths || 0) + 1; p.combo = 0;
    try { if (window.Juice) { window.Juice.addTrauma(0.6); window.Juice.flash('#ff4655', 110);
      window.Juice.popup('OOF!', wx2sx(p.px), wy2sy(p.py) - 28, { color: '#ffffff', size: 30 }); } } catch (_) {}   // the iconic Roblox death meme
    $sfx('oof');
    if (p.lastSafe) {
      p.px = p.lastSafe.x; p.py = p.lastSafe.y; p.vy = 0; p.vx = 0; p.airJumped = false; p.stamina = T.jump.stamMax;
      p.onPlat = (p.lastSafePlat && !p.lastSafePlat._gone) ? p.lastSafePlat : null;
      p.coyote = T.jump.coyote; p.immuneT = T.respawn.immune;
      try { if (window.Juice) window.Juice.popup('摔了!', wx2sx(p.px), wy2sy(p.py) - 34, { color: '#ff6b6b', size: 16 }); } catch (_) {}
    } else { p.alive = false; doFinish(false); }
  }

  function doFinish(won) {
    try { const state = $state(); if (!state) return; const p = state.player;
      const pct = Math.max(0, Math.min(1, p.px / Math.max(1, state.finishX)));
      const score = scoreOf(p, state);
      let best = 0; try { best = parseInt(localStorage.getItem('roblox_best') || '0', 10) || 0; } catch (_) {}
      const isRecord = score > best; if (isRecord) { try { localStorage.setItem('roblox_best', String(score)); } catch (_) {} }
      const dodgePart = '躲过 ' + (p.dodges || 0) + ' 次';
      let sub = won ? ('通关! ' + dodgePart) : (pct >= 0.3 ? (dodgePart + ' · ' + Math.floor(pct * 100) + '%') : dodgePart);
      sub += isRecord ? ' · 新纪录!' : (' · 最佳 ' + Math.max(best, score));   // beat-your-best → 再来一局
      state.kills = score;
      try { if (window.Juice && won) { window.Juice.confetti($W()); window.Juice.popup('🎉 通关!', $W()/2, $H()*0.4, { color:'#ffe24a', size:28, dur:1.4 }); window.Juice.hitstop(0.1); }
            if (window.Juice && isRecord) window.Juice.popup('新纪录!', $W()/2, $H()*0.46, { color:'#5af5e0', size:22, dur:1.2 }); } catch (_) {}
      $finish(won, sub);
    } catch (_) {}
  }
})();
