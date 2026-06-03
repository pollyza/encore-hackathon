// ============================================================
//  BR · FINAL CIRCLE — Free Fire-style 30-second battle royale
//
//  Hejiangnan / Mario · 2026-05-28 · M1 polish iteration
//
//  Player controls (mobile):
//    LEFT  joystick — virtual joystick (engine getMoveVec; BR uses a tighter
//                     dead zone 0.06 + screen→world un-skew + response curve)
//    RIGHT tap/drag — aim pad + tap-to-fire override
//    Q / W / R      — skills (sprint / heal / dodge-roll); hold E = ADS
//
//  Desktop controls:
//    WASD/arrows    — move (engine getMoveVec; W reserved as skill)
//    Mouse move     — manual aim (mouseWorld)
//    Spacebar       — fire
//    Q / W / R      — skills (E held = ADS)
//
//  Win:   eliminate 3 AI bots inside 30s timer
//  Lose:  HP ≤ 0  (bullet / zone storm / falling crate)
//         OR  timer expires with kills < 3
//
//  Mechanics summary (M2 BR refactor — feel constants live in TUNING up top):
//    1. Free Fire feel: snappy left joystick + manual right-stick aim/fire
//    2. Smart AI: state machine (PATROL / ENGAGE / DODGE / FLEE), LOS-aware,
//       sidestep when shot at, flank player, stays inside zone
//    3. Shrinking zone: radius 11 → 3 tiles over 26s, DoT outside
//    4. Knife auto-switch when nearest visible enemy < 1.5 tiles
//    5. Airdrop power-gun drops at t=14s: grab it for ~45 piercing rounds
//       (dmg 38 / fireRate 0.10 → ≈3.4× the AR's DPS, punches through
//       enemies + destructible cover). No self-harm, no roulette.
//    6. Dodge-roll (R): short burst with i-frames — weave bullets / crates
//    7. Destructible brick cover (坦克大战式) + stone anchors; structured lanes
//    8. Environmental random damage: telegraphed crates (dodge-roll-able)
//
//  Engine globals consumed (window.*):
//    Iso, ctx, state, W, H, finishGame, pickTheme, bakeGround,
//    keys, SFX, modeBadge, scoreEl, getMoveVec, aimAngle, mouseWorld,
//    spawnParticles, updateParticles, drawParticles, flashFCT,
//    showBanner, skillHeld
//
//  Inlined here (mirror gta.js / roblox.js pattern): drawBlock, mix,
//  shade, tint, pushRender, flushRender, rectCircle, pointInRect,
//  segHitsAnyRect (LOS), pushSpark, updateSparks, pushShake.
// ============================================================

(function bootBrGame() {
  function engineReady() {
    return typeof window !== 'undefined'
        && typeof window.document !== 'undefined'
        && document.getElementById('game') != null
        && window.Iso
        && typeof window.bakeGround === 'function'
        && typeof window.getMoveVec === 'function';
  }
  if (!engineReady()) return setTimeout(bootBrGame, 50);

  // ─── Lazy global accessors ──────────────────────────────────
  function $ctx()       { return window.ctx; }
  function $W()         { return window.W || 360; }
  function $H()         { return window.H || 640; }
  function $state()     { return window.state; }
  function $setState(s) { try { window.state = s; } catch(_){} }
  function $finish(won, sub) { if (window.finishGame) window.finishGame(won, sub); }
  function $pickTheme(k){ return window.pickTheme ? window.pickTheme(k) : null; }
  function $bakeGround(t,b,w,h){ return window.bakeGround(t,b,w,h); }
  function $modeBadge() { return document.getElementById('mode-badge'); }
  function $scoreEl()   { return document.getElementById('score'); }
  function $Iso()       { return window.Iso; }
  function $keys()      { return window.keys || {}; }
  // ── Kenney CC0 audio (Free Fire BR) — sci-fi/digital samples (CC0; see
  //    assets/kenney/CREDITS.md) mapped to the game's sfx names. Overriding $SFX()
  //    routes every existing SFX.x() call through here: a real sample if mapped+loaded,
  //    else the shared synth SFX. BR-local — GTA/Roblox untouched.
  const FF_AUDIO = {
    base: 'assets/kenney/audio/ff/',
    files: { shot:'shot.wav', shotLow:'shotLow.wav', hit:'hit.ogg', wHit:'wHit.ogg', rBlast:'rBlast.wav', death:'death.ogg',
             lose:'lose.ogg', win:'win.ogg', pickup:'pickup.ogg', pickupRare:'pickupRare.ogg', qDash:'qDash.ogg', zone:'zone.wav' },
    vol:   { shot:0.3, shotLow:0.34, hit:0.4, wHit:0.4, rBlast:0.5, death:0.5, lose:0.5, win:0.55, pickup:0.42, pickupRare:0.5, qDash:0.4, zone:0.4 },
    pool: {}, ok: {},
    load() { try { for (const k in this.files) { const kk=k, arr=[]; for (let i=0;i<3;i++){ const a=new Audio(this.base+this.files[k]); a.preload='auto'; a.volume=this.vol[k]||0.4; if(i===0){ a.addEventListener('canplaythrough',()=>{this.ok[kk]=true;},{once:true}); a.addEventListener('error',()=>{this.ok[kk]=false;},{once:true}); } arr.push(a); } this.pool[kk]=arr; } } catch(_){} },
    play(n){ if(!this.ok[n]||!this.pool[n])return false; try { const arr=this.pool[n]; let a=arr.find(x=>x.paused||x.ended); if(!a){ a=arr[0].cloneNode(); a.volume=this.vol[n]||0.4; } a.currentTime=0; const pr=a.play(); if(pr&&pr.catch)pr.catch(()=>{}); return true; } catch(_){ return false; } },
  };
  try { FF_AUDIO.load(); window.__ffAudioOk = () => FF_AUDIO.ok; } catch (_) {}
  const FF_SFX_PROXY = (typeof Proxy !== 'undefined') ? new Proxy({}, { get(_, name) { if (typeof name !== 'string') return undefined;
    return function () { if (FF_AUDIO.play(name)) return; const s = window.SFX; if (s && typeof s[name] === 'function') { try { s[name](); } catch (_) {} } }; } }) : null;
  function $SFX()       { return FF_SFX_PROXY || window.SFX || {}; }
  function $moveVec()   { return window.getMoveVec ? window.getMoveVec() : {x:0,y:0}; }
  function $aimAngle()  { return window.aimAngle ? window.aimAngle() : null; }
  function $mouseWorld(){ return window.mouseWorld || null; }
  function $skillHeld() { return window.skillHeld || {}; }
  function $particles() { return window.spawnParticles; }
  function $flashFCT()  { return window.flashFCT; }
  function $showBanner(){ return window.showBanner; }
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const IS_EMBEDDED = URL_PARAMS.get('embedded') === '1';
  function compactHud(W, H) {
    return IS_EMBEDDED || W < 430 || H < 680;
  }

  // ─── TUNING ─────────────────────────────────────────────────
  // Single source of truth for every feel constant (no scattered magic
  // numbers). Change one value here → it takes effect everywhere. Reward
  // loop attacks the lowest-scoring dimension by nudging one field at a time.
  const TUNING = {
    // movement — fixes the "便秘": small per-game dead zone (engine global is
    // 0.14, shared with Roblox; BR overrides to 0.06 so a tiny push responds),
    // direct response (no accel ramp) with a mild low-end curve, slightly faster base.
    joyDead:          0.06,
    moveSpeed:        182,    // R3: 155→182 治便秘(28 格大图上 155 太肉, 跟手更快)
    moveResponseExp:  0.78,   // R3: 0.85→0.78 低位更跟手(轻推也走)
    sprintMul:        1.55,   // Q sprint speed multiplier
    adsSlowMin:       0.45,   // slowest move factor at full aim-down-sights (was 0.40)

    // normal gun (AR) — the shooting core stays as-is (user approved it)
    gunDmg:           18,
    gunFireRate:      0.18,
    gunRange:         320,
    gunAccuracy:      0.07,
    bulletSpeed:      520,
    aimAssistCone:    0.42,   // ~24° half-cone (a touch wider, FF-forgiving)
    aimAssistPull:    0.52,   // correct 52% of in-cone error → "point near it and you hit"

    // airdrop — the "007 强枪": clearly stronger than the AR, pierces enemies +
    // destructible cover. Replaces the old REVERSE/BOUNCE/RICOCHET roulette (a
    // gimmick that never actually raised DPS and could shoot the player).
    airdropSpawnT:    7,      // ⑤ s — first crate(更早给强枪 → 更快爽点)
    airdropRespawn:   9,      // ⑤ s — a fresh crate drops this long after the last is grabbed(更勤的 power spike)
    airdropDmg:       38,     // vs 18
    airdropFireRate:  0.10,   // vs 0.16  → DPS 380 vs 112 (≈3.4×)
    airdropRange:     400,
    airdropBulletSpeed: 640,
    airdropPierce:    2,      // passes through up to 2 enemies (hits a 3rd)
    airdropAmmo:      40,     // rounds before reverting to the AR

    // dodge-roll (翻滚闪避) — the new active skill on the R button
    dodgeDist:        95,     // wu burst distance
    dodgeDur:         0.30,   // s burst duration
    dodgeIFrames:     0.32,   // s invincible window (≥ dur so the whole roll is safe)
    dodgeCooldown:    1.2,    // s

    // map — destructible brick cover (坦克大战式) + indestructible anchors
    coverHpBrick:     40,
    coverDmgAirdrop:  60,     // airdrop bullet's cover damage (one shot breaks a brick)

    // AI (kept; light tune) — 9 bots + 玩家 = 真 10 人吃鸡大乱斗
    botCount:         9,
    botHp:            64,     // R14: small lift; behavior carries the difficulty, not HP sponge
    botSpeed:         88,     // R14: stronger movement + zone rotation, not HP sponge
    botDmg:           9,
    botAccuracy:      0.115,
    botRange:         265,
    aiIdealRange:     155,
    aiLosRange:       335,
    aiFireInterval:   0.72,

    // ── Difficulty curve (the "难度权"): a normal player beats the 6 REGULAR bots by
    //    skill, but the last 3 are ELITE "高手" — accurate, aggressive, tougher, like
    //    real players. You can ALMOST clear them solo → that "差一点" tension is what
    //    nudges a gift purchase. Tough-but-beatable, never a cheap bullet-sponge.
    eliteCount:       3,      // of botCount (9) → 6 regular + 3 elite
    eliteHpMul:       1.65,   // survive your first burst (≈106hp), not a sponge
    eliteAccMul:      0.42,   // MUCH tighter aim (they actually hit you)
    eliteDmgMul:      1.45,   // shots sting
    eliteFireMul:     1.55,   // fire faster (more pressure)
    eliteSpeedMul:    1.12,   // rotate/kite a touch faster
    eliteDodgeMul:    0.55,   // dodge-roll on a shorter cooldown (reads as "smart")

    // zone / round
    zoneStartR:       11,     // tiles
    zoneEndR:         3,
    zoneShrinkS:      21,     // R14: slightly tighter collapse to force real final-circle fights
    crateHazardEvery: 7,      // s — telegraphed, dodge-roll-able
    crateHazardDmg:   22,

    // chaos events — telegraphed, dodgeable, symmetric (everyone's affected).
    // NOT malicious: airstrike/lightning give a warn window to run/roll out of;
    // watergun is a comedy reset. The dodge-roll's i-frames also negate strikes.
    eventFirstAt:     6,      // ⑤ s — first event(更早开场混乱)
    eventGapMin:      5,      // ⑤ s — min gap between events
    eventGapMax:      8,      // ⑤ s — max gap(更密的爽点)
    strikeDmg:        30,     // airstrike/lightning hit damage (if you don't dodge)
    strikeRadius:     46,     // wu blast radius (telegraphed)
    waterGunDur:      4.5,    // s — all guns harmless → rush melee

    // R7 screen-shake restraint — keep the hit-feel (hitstop/particles/short
    // flash) but cut the violent camera shake that made combat unreadable
    // (user: 太晃太乱看不清). One knob each; tune here, applies everywhere.
    shakeScale:       0.5,    // every pushShake() magnitude ×this
    shakeMax:         9,      // hard cap on camera-shake amplitude (px)
    traumaScale:      0.5,    // every Juice.addTrauma() ×this (engine shake/chroma)
  };

  // ─── Color helpers (mirror engine mix/shade/tint) ───────────
  function mix(hex, with_, t) {
    const h = hex.replace('#',''); const w = with_.replace('#','');
    const r1 = parseInt(h.slice(0,2),16), g1 = parseInt(h.slice(2,4),16), b1 = parseInt(h.slice(4,6),16);
    const r2 = parseInt(w.slice(0,2),16), g2 = parseInt(w.slice(2,4),16), b2 = parseInt(w.slice(4,6),16);
    const r = Math.round(r1*(1-t)+r2*t), g = Math.round(g1*(1-t)+g2*t), b = Math.round(b1*(1-t)+b2*t);
    return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  function shade(base, t) { return mix(base, '#000000', t); }
  function tint(base, t)  { return mix(base, '#ffffff', t); }
  function hexToRgb(h) { h = h.replace('#', ''); return parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16); }

  // ─── Inlined drawBlock (iso voxel cube) ─────────────────────
  // R9: iso voxel cube with mature-game shading — lit top + 3-tone sides + front
  // seam + crisp outline + top-edge rim highlight. Cheap (no per-frame gradients →
  // stays 60fps on low-end). Every box prop built on this lifts at once.
  function drawBlock(c, sx, sy, h, baseColor) {
    const Iso = $Iso();
    const TW = Iso.TW, TH = Iso.TH;
    sx = Math.round(sx); sy = Math.round(sy);
    c.fillStyle = tint(baseColor, 0.10);   // top face (catches the light)
    c.beginPath();
    c.moveTo(sx, sy); c.lineTo(sx + TW, sy + TH); c.lineTo(sx, sy + 2*TH); c.lineTo(sx - TW, sy + TH);
    c.closePath(); c.fill();
    if (h > 0) {
      c.fillStyle = shade(baseColor, 0.20);   // right (lit) side
      c.beginPath();
      c.moveTo(sx + TW, sy + TH); c.lineTo(sx + TW, sy + TH + h); c.lineTo(sx, sy + 2*TH + h); c.lineTo(sx, sy + 2*TH);
      c.closePath(); c.fill();
      c.fillStyle = shade(baseColor, 0.42);   // left (shadow) side
      c.beginPath();
      c.moveTo(sx - TW, sy + TH); c.lineTo(sx - TW, sy + TH + h); c.lineTo(sx, sy + 2*TH + h); c.lineTo(sx, sy + 2*TH);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.20)'; c.lineWidth = 1;   // front vertical seam between the two faces
      c.beginPath(); c.moveTo(sx, sy + 2*TH); c.lineTo(sx, sy + 2*TH + h); c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,0.30)'; c.lineWidth = 1;     // top outline
    c.beginPath();
    c.moveTo(sx, sy); c.lineTo(sx + TW, sy + TH); c.lineTo(sx, sy + 2*TH); c.lineTo(sx - TW, sy + TH);
    c.closePath(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.42)'; c.lineWidth = 1.5;   // top-edge rim highlight (light from upper-left)
    c.beginPath(); c.moveTo(sx - TW, sy + TH); c.lineTo(sx, sy); c.lineTo(sx + TW, sy + TH); c.stroke();
  }

  // Sub-voxel humanoid (player / bot body). Shoulder-tall block + head + helmet.
  function drawVoxelMan(c, sx, sy, bodyColor, headColor, facing, helmetColor) {
    const Iso = $Iso();
    const TW = Iso.TW * 0.42, TH = Iso.TH * 0.42;
    const bodyH = 16;
    sx = Math.round(sx); sy = Math.round(sy);
    // Shadow
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath();
    c.ellipse(sx, sy + Iso.TH * 0.55, TW * 1.1, TH * 0.95, 0, 0, Math.PI*2);
    c.fill();
    // Body voxel
    c.fillStyle = bodyColor;
    c.beginPath();
    c.moveTo(sx, sy - bodyH);
    c.lineTo(sx + TW, sy - bodyH + TH);
    c.lineTo(sx, sy - bodyH + 2*TH);
    c.lineTo(sx - TW, sy - bodyH + TH);
    c.closePath(); c.fill();
    c.fillStyle = shade(bodyColor, 0.22);
    c.beginPath();
    c.moveTo(sx + TW, sy - bodyH + TH);
    c.lineTo(sx + TW, sy + TH);
    c.lineTo(sx, sy + 2*TH);
    c.lineTo(sx, sy - bodyH + 2*TH);
    c.closePath(); c.fill();
    c.fillStyle = shade(bodyColor, 0.38);
    c.beginPath();
    c.moveTo(sx - TW, sy - bodyH + TH);
    c.lineTo(sx - TW, sy + TH);
    c.lineTo(sx, sy + 2*TH);
    c.lineTo(sx, sy - bodyH + 2*TH);
    c.closePath(); c.fill();
    // Head
    const hx = Math.round(sx - 3), hy = Math.round(sy - bodyH - 6);
    c.fillStyle = headColor;
    c.fillRect(hx, hy, 6, 6);
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 1;
    c.strokeRect(hx + 0.5, hy + 0.5, 6, 6);
    // Combat helmet — a rounded cap over the top of the head (reads as a soldier)
    if (helmetColor) {
      c.fillStyle = helmetColor;
      c.beginPath(); c.ellipse(sx, hy + 1, 5, 4, 0, Math.PI, 0); c.fill();   // dome
      c.fillRect(hx - 1, hy, 8, 2);                                          // brim
      c.fillStyle = tint(helmetColor, 0.25);
      c.fillRect(hx + 1, hy - 1, 2, 2);                                      // highlight
    }
    // Facing marker (gun side)
    if (facing) {
      c.fillStyle = shade(bodyColor, 0.55);
      c.fillRect(Math.round(sx + facing * 4), Math.round(sy - bodyH - 2), 3, 2);
    }
  }

  // ─── Z-sort render buffer ───────────────────────────────────
  const renderBuf = [];
  function pushRender(zKey, fn) { renderBuf.push({ z: zKey, fn }); }
  function flushRender() {
    renderBuf.sort((a, b) => a.z - b.z);
    for (const r of renderBuf) r.fn();
    renderBuf.length = 0;
  }

  // ─── Collision helpers ──────────────────────────────────────
  function rectCircle(r, cx, cy, cr) {
    const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
    const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
    const dx = cx - nx, dy = cy - ny;
    return (dx*dx + dy*dy) < cr*cr;
  }
  function pointInRect(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
  function segHitsRect(x1, y1, x2, y2, r) {
    if (pointInRect(r, x1, y1) || pointInRect(r, x2, y2)) return true;
    return segSeg(x1,y1,x2,y2, r.x, r.y, r.x+r.w, r.y)
        || segSeg(x1,y1,x2,y2, r.x+r.w, r.y, r.x+r.w, r.y+r.h)
        || segSeg(x1,y1,x2,y2, r.x+r.w, r.y+r.h, r.x, r.y+r.h)
        || segSeg(x1,y1,x2,y2, r.x, r.y+r.h, r.x, r.y);
  }
  function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx-ax)*(dy-cy) - (by-ay)*(dx-cx);
    if (d === 0) return false;
    const t = ((cx-ax)*(dy-cy) - (cy-ay)*(dx-cx)) / d;
    const u = ((cx-ax)*(by-ay) - (cy-ay)*(bx-ax)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  // LOS check: does any cover block intersect segment (x1,y1)→(x2,y2)?
  function losBlocked(x1, y1, x2, y2, covers) {
    for (const c of covers) if (segHitsRect(x1, y1, x2, y2, c)) return true;
    return false;
  }

  // ─── Spark + screen-shake helpers ───────────────────────────
  function pushSpark(s, sx, sy, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 180;
      s.sparks.push({
        sx, sy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.45 + Math.random() * 0.3,
        color,
      });
    }
  }
  function updateSparks(s, dt) {
    for (const sp of s.sparks) {
      sp.sx += sp.vx * dt;
      sp.sy += sp.vy * dt;
      sp.vy += 220 * dt;
      sp.life -= dt;
    }
    s.sparks = s.sparks.filter(x => x.life > 0);
  }
  function pushShake(s, mag) {
    // R7: scale every shake call + clamp the peak so combat stays readable.
    s.shakeT = Math.min(0.30, (s.shakeT || 0) + 0.16);
    s.shakeMag = Math.min(TUNING.shakeMax, Math.max(s.shakeMag || 0, mag * TUNING.shakeScale));
  }
  // R7: route all engine-trauma through one scaled knob (traumaScale). Defined
  // before the addTrauma call-sites are rewritten to jTrauma() (no recursion —
  // this body's window.Juice.addTrauma is added AFTER that global rewrite).
  function jTrauma(a) { try { if (window.Juice) window.Juice['addTrauma'](a * TUNING.traumaScale); } catch (_) {} }
  // R9 scientific 30s difficulty curve — bot OFFENSE ramps over the round so a new
  // player gets an ease-in, then escalation, then an intense final-circle climax.
  // Multiplies bot fire-rate / aim-tightness / damage. (Round ≈ 30s.)
  function brAggro(t) {
    if (t < 7)  return 0.45 + (t / 7) * 0.30;             // 0–7s   0.45→0.75  gentle learn phase
    if (t < 18) return 0.75 + ((t - 7) / 11) * 0.25;      // 7–18s  0.75→1.00  escalate
    return Math.min(1.35, 1.00 + ((t - 18) / 12) * 0.35); // 18s+   1.00→1.35  finale climax
  }
  // Light aim-assist: nudge the player's raw aim a FRACTION toward the nearest
  // visible in-range bot that already sits within a small cone of where they're
  // pointing. Never picks a target outside the cone — the player stays in
  // control (this is "轻辅助", not auto-aim).
  function applyAimAssist(s, p, rawAng) {
    const CONE = TUNING.aimAssistCone;   // ~22° half-cone
    const PULL = TUNING.aimAssistPull;   // correct 35% of the in-cone error
    let best = null, bestAbs = CONE;
    for (const b of s.bots) {
      const d = Math.hypot(b.wx - p.wx, b.wy - p.wy);
      if (d > p.gun.range * 1.15) continue;
      if (losBlocked(p.wx, p.wy, b.wx, b.wy, s.covers)) continue;
      const ta = Math.atan2(b.wy - p.wy, b.wx - p.wx);
      const err = ((ta - rawAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(err) < bestAbs) { bestAbs = Math.abs(err); best = err; }
    }
    return best == null ? rawAng : rawAng + best * PULL;
  }
  // Convert a SCREEN-space aim direction into the WORLD angle whose bullet
  // trajectory projects to that same screen direction (inverse iso). Without
  // this, dragging "up" on the pad sent shots up-RIGHT (the iso skew).
  function screenDirToWorldAng(Iso, screenAng) {
    const dsx = Math.cos(screenAng), dsy = Math.sin(screenAng);
    const k1 = Iso.TW / Iso.WS, k2 = Iso.TH / Iso.WS;
    const vwx = (dsx / k1 + dsy / k2) / 2;
    const vwy = (dsy / k2 - dsx / k1) / 2;
    return Math.atan2(vwy, vwx);
  }

  // ─── Theme expansion ────────────────────────────────────────
  // R3+ 多生物群系: 每把随机一个 FF 梗地图(森林/火焰山/冰川/海底/村庄), 视觉大不一样。
  // R4: 不再只是调色板 —— 每个 biome 有专属 tile 规则(lava/ice/water/field)、专属
  // 招牌 props(枯树/冰柱/珊瑚/草垛)、专属 ambient FX(火星/雪/气泡/尘埃)。
  // forest = 基线热带丛林(base palette, 机检确定性, 保持不动)。
  // 其余 biome 的新键: lava/lavaHot/ash(火) · ice/iceLite/frozen/icePillar(冰) ·
  //   water/waterDeep/coral1-3(海) · soil/field/cobble/hay/hayLo/fence(村) · amb(氛围色)。
  const BIOMES = {
    forest:  {},   // 默认热带丛林(base palette)
    volcano: {
      sky:'#3a1410', sky2:'#160604',
      ground:'#37271f', groundAlt:'#2c1d17', dirtPatch:'#48342a', path:'#5a2a18', sand:'#6a4030',
      concrete:'#43302a', concreteLine:'#2e1f1a',           // 冷却熔岩岩盘(中央)
      lava:'#ff6a1f', lavaHot:'#ffd23a', lavaLo:'#c43a10', ash:'#4a3a34', basalt:'#2c1d17',
      trunk:'#241712', canopy:'#5a2c14', canopyHi:'#8a4420', canopyLo:'#3a1c0c',  // 焦树/余烬
      bush:'#5a3420', bushHi:'#8a5028',
      rock:'#4a3e38', rockLo:'#332824',
      crateWood:'#6a4434', crateLine:'#3a2418', sandbag:'#5a4a3a', sandbagLo:'#3e3228',
      hutWall:'#5a4438', hutRoof:'#4a2418',
      zoneFill:'rgba(255,120,40,0.16)', zoneRing:'#ff8a3a',
      amb:'#ff8a2a',                                          // ember orange
    },
    arctic:  {
      sky:'#acd0e2', sky2:'#5f8398',
      ground:'#e9f1f7', groundAlt:'#d6e4ee', dirtPatch:'#c2d4e0', path:'#cdddE8', sand:'#f0f6fa',
      concrete:'#d2e6f2', concreteLine:'#a8c4d6',            // 冰盘(中央)
      ice:'#c4e6f5', iceLite:'#e2f3fb', frozen:'#a8d6ec', icePillar:'#cdeeff', icePillarHi:'#ffffff',
      trunk:'#5a4a3c', canopy:'#356a4a', canopyHi:'#eaf5f9', canopyLo:'#274e38',   // 雪松(白雪顶)
      bush:'#d2e4ee', bushHi:'#ffffff',
      rock:'#b6c8d2', rockLo:'#90a6b2',
      crateWood:'#b3a384', crateLine:'#8a7a5e', sandbag:'#c2d2dc', sandbagLo:'#94a8b4',
      hutWall:'#dce8f0', hutRoof:'#b4ccda',                   // 雪屋
      zoneFill:'rgba(120,200,255,0.16)', zoneRing:'#7fd4ff',
      amb:'#ffffff',                                          // snow
    },
    seabed:  {
      sky:'#0d3a4e', sky2:'#04141e',
      ground:'#c9a866', groundAlt:'#b7955a', dirtPatch:'#a8854a', path:'#1d6a76', sand:'#d8bc86',
      concrete:'#d8bc86', concreteLine:'#b0945a',            // 沙地空地(中央)
      water:'#1f7a86', waterDeep:'#0f4a56', coralFloor:'#c47a86',
      coral1:'#ff8a6a', coral2:'#ffb24a', coral3:'#c87ad0',   // 珊瑚扇三色
      trunk:'#2a6a4a', canopy:'#1f9a8a', canopyHi:'#3ed0b0', canopyLo:'#147064',  // 海带
      bush:'#22a690', bushHi:'#3ed0b0',
      rock:'#7a9a96', rockLo:'#587a76',
      crateWood:'#8a7250', crateLine:'#5e4a30', sandbag:'#9aa86a', sandbagLo:'#7a885a',
      hutWall:'#6a8a84', hutRoof:'#3a5a54',
      zoneFill:'rgba(60,220,200,0.16)', zoneRing:'#4fe0d0',
      amb:'rgba(200,245,255,0.65)',                          // bubbles
    },
    village: {
      sky:'#84b4da', sky2:'#4a7aa0',
      ground:'#8fb84e', groundAlt:'#7fa844', dirtPatch:'#b58a52', path:'#c2a05e', sand:'#d6bc78',
      concrete:'#9a9488', concreteLine:'#787268',            // 石板广场(中央)
      soil:'#8a5a34', soilLo:'#6e4628', field:'#a87a44', cobble:'#9a9488',
      hay:'#e8c44a', hayLo:'#c49c32', fence:'#8a6038',
      trunk:'#6a4526', canopy:'#5a9a3a', canopyHi:'#7cc24c', canopyLo:'#3f7a2a',  // 茂密橡树
      bush:'#5a9a3a', bushHi:'#7cc24c',
      rock:'#9a9488', rockLo:'#7a746a',
      crateWood:'#b0824a', crateLine:'#7a5630',
      hutWall:'#cab084', hutRoof:'#a8442c',                   // 红顶农舍
      zoneFill:'rgba(255,210,120,0.14)', zoneRing:'#ffd060',
      amb:'rgba(255,238,196,0.55)',                          // warm dust
    },
  };
  function expandTheme(themeKey, base) {
    // Tropical-island battlefield palette (Free-Fire-recognisable): lush grass,
    // dirt trails, a concrete drop-pad at centre, wood/sandbag cover, jungle
    // foliage. All hand-tuned greens/browns — no grey-box look.
    const T = {
      key: themeKey,
      sky:        '#33514a',     // hazy jungle horizon
      sky2:       '#1c2b24',
      ground:     '#74c24e',     // R3: 鲜艳卡通草地(FF loud bright, 不再发暗)
      groundAlt:  '#67b443',     // grass clumps
      dirtPatch:  '#9c7340',     // dirt
      path:       '#b58a52',     // worn dirt trail
      sand:       '#d6bc78',     // sandy clearing
      concrete:   '#9aa0a8',     // centre drop-pad(提亮)
      concreteLine:'#787e86',
      // foliage(提饱和提亮 → 卡通)
      trunk:      '#6a4526',
      canopy:     '#43a336',
      canopyHi:   '#62cc4c',
      canopyLo:   '#2f7a27',
      bush:       '#4aa53a',
      bushHi:     '#68c451',
      // structures
      crateWood:  '#a9763e',
      crateLine:  '#6e4a24',
      sandbag:    '#c2a878',
      sandbagLo:  '#9d8456',
      hutWall:    '#9a7a52',
      hutRoof:    '#824a2c',
      rock:       '#8a8a80',
      rockLo:     '#6b6b62',
      // legacy keys still referenced elsewhere
      ruin:       '#8a8a80',
      tree:       '#357a2c',
      brick:      '#a9763e',
      brickDmg:   '#6e4a24',
      crateBase:  '#a9763e',
      // actors — YOU read as a blue hero; enemy squads warm/hostile
      playerBody: '#3da5ff',
      playerHead: '#ffd0a0',
      playerHelmet:'#1f5fa6',
      botSquad:   ['#e0533a', '#c8783a', '#b0466a'],
      botBand:    ['#ff5a3c', '#ffb24a', '#ff6f9a'],
      botHelmet:  ['#9a2f1c', '#8a4f1c', '#7a2a44'],
      knifeBlade: '#e8eaf2',
      knifeGrip:  '#7a3e20',
      zoneFill:   'rgba(40,120,200,0.18)',
      zoneRing:   '#4ad0ff',
      zoneTarget: 'rgba(255,255,255,0.3)',
      weirdGold:  '#ffd84a',
      weirdRed:   '#ff4655',
      weirdBlue:  '#5af5e0',
      weirdGreen: '#5ff5a0',
      hazardTele: 'rgba(255,69,69,0.45)',
      shadow:     'rgba(0,0,0,0.4)',
    };
    Object.assign(T, BIOMES[themeKey] || {});   // 叠加当前生物群系主色(火焰山/冰川/海底/村庄)
    return T;
  }

  // ─── Per-biome tile painter ─────────────────────────────────
  // Forest keeps the exact original rule (gate determinism). Each other biome
  // paints its own terrain — lava rivers / frozen lake / water channels / farm
  // field — so the ground itself reads as that FF-meme map, not a recolour.
  // Pure (i,j) math, no Math.random → deterministic (stable QA screenshots).
  function tileColorFor(T, key, i, j, mapW, mapH) {
    const dx = i - mapW / 2, dy = j - mapH / 2;
    const inCentre = Math.abs(dx) < 3 && Math.abs(dy) < 3;
    const onLane = (Math.abs(i - 3) <= 1 || Math.abs(i - (mapW - 4)) <= 1) ||
                   (Math.abs(i - mapW / 2) <= 1 && (j < 9 || j > 15));
    const h1 = (i * 5 + j * 3) % 11;     // ground clump variation
    const h2 = (i * 7 + j * 5) % 17;     // scuff scatter
    const h3 = (i * 13 + j * 11) % 23;   // biome feature scatter
    if (key === 'volcano') {
      if (inCentre) return T.concrete;                       // cooled-lava rock pad
      if (onLane) return (h2 < 2) ? T.lavaHot : T.lava;      // glowing lava rivers
      let col = (h1 < 3) ? T.groundAlt : T.ground;
      if (h3 === 0) col = T.lavaHot;                         // rare molten pool
      else if (h3 === 1 || h3 === 2) col = T.lavaLo;         // cooling crack
      else if (h2 < 1) col = T.ash;                          // ash scuff
      return col;
    }
    if (key === 'arctic') {
      if (inCentre) return T.concrete;                       // ice pad
      const lx = i - mapW * 0.30, ly = j - mapH * 0.62;      // off-centre frozen lake
      if (lx * lx + ly * ly * 1.7 < 26) return (h2 < 3) ? T.iceLite : T.frozen;
      if (onLane) return T.path;                             // packed-snow trail
      let col = (h1 < 3) ? T.groundAlt : T.ground;
      if (h3 < 2) col = T.ice;                               // scattered ice patches
      else if (h2 < 1) col = T.dirtPatch;                    // cracked-ice scuff
      return col;
    }
    if (key === 'seabed') {
      if (inCentre) return T.concrete;                       // sandy clearing
      if (onLane) return (h2 < 2) ? T.waterDeep : T.water;   // water channels
      let col = (h1 < 3) ? T.groundAlt : T.ground;
      if (h3 < 2) col = T.coralFloor;                        // coral-sand patches
      else if (h3 === 5) col = T.waterDeep;                  // deep pocket
      else if (h2 < 1) col = T.dirtPatch;
      return col;
    }
    if (key === 'village') {
      if (inCentre) return T.cobble;                         // cobble square
      if (onLane) return T.path;                             // dirt road
      if (i >= mapW * 0.55 && i <= mapW * 0.85 && j >= mapH * 0.20 && j <= mapH * 0.50)
        return (i % 2 === 0) ? T.soil : T.field;             // tilled farm field (rows)
      let col = (h1 < 3) ? T.groundAlt : T.ground;
      if (h2 < 1) col = T.dirtPatch;
      return col;
    }
    // forest (base) — original rule, byte-identical
    let col = T.ground;
    if (h1 < 3) col = T.groundAlt;
    if (onLane) col = T.path;
    if (h2 < 1) col = T.dirtPatch;
    if (inCentre) col = T.concrete;
    return col;
  }

  // ─── Free Fire tap-to-fire input ────────────────────────────
  // Engine already wires left joystick (#joy) + right aimpad (#aimpad).
  // We listen at the canvas level for *tap* gestures on the right half
  // (where aimpad sits) so player can tap-shoot without dragging an aim.
  // Tap = short pointerdown→up under 12px movement + under 220ms duration.
  const Input = {
    tapFire: false,
    holdFire: false,
    _attached: false,
    _downX: 0, _downY: 0, _downT: 0, _downId: null,
  };
  function attachInput() {
    if (Input._attached) return;
    const canvas = document.getElementById('game');
    if (!canvas) return;
    const isRightHalf = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      return clientX > rect.left + rect.width * 0.5;
    };
    const down = (e) => {
      const s = $state();
      if (!s || !s.brActive) return;
      const t = ('touches' in e && e.touches.length) ? e.touches[0] : e;
      if (!isRightHalf(t.clientX)) return;
      Input._downX = t.clientX;
      Input._downY = t.clientY;
      Input._downT = performance.now();
      Input._downId = ('identifier' in t) ? t.identifier : 'mouse';
      Input.holdFire = true;
    };
    const move = (e) => {
      if (Input._downId == null) return;
      const t = ('touches' in e && e.touches.length) ? e.touches[0] : e;
      const dx = t.clientX - Input._downX;
      const dy = t.clientY - Input._downY;
      // If dragged far, consider it an aim drag — release hold-fire flag
      if (Math.hypot(dx, dy) > 24) Input.holdFire = false;
    };
    const up = (e) => {
      if (Input._downId == null) return;
      const dt = performance.now() - Input._downT;
      const t = ('changedTouches' in e && e.changedTouches.length) ? e.changedTouches[0] : e;
      const dx = (t.clientX != null ? t.clientX : Input._downX) - Input._downX;
      const dy = (t.clientY != null ? t.clientY : Input._downY) - Input._downY;
      if (dt < 220 && Math.hypot(dx, dy) < 18) {
        Input.tapFire = true;  // single-shot edge trigger consumed in update()
      }
      Input.holdFire = false;
      Input._downId = null;
    };
    canvas.addEventListener('pointerdown',  down, { passive: true });
    canvas.addEventListener('pointermove',  move, { passive: true });
    canvas.addEventListener('pointerup',    up,   { passive: true });
    canvas.addEventListener('pointercancel',up,   { passive: true });
    canvas.addEventListener('touchstart',   down, { passive: true });
    canvas.addEventListener('touchmove',    move, { passive: true });
    canvas.addEventListener('touchend',     up,   { passive: true });
    Input._attached = true;
  }

  // ─── Smart AI step ──────────────────────────────────────────
  // Bot state machine:
  //   PATROL  — wander inside zone, slow fire
  //   ENGAGE  — close to ideal range, fire at player when LOS clear
  //   DODGE   — sidestep perpendicular to incoming fire line (0.5s burst)
  //   FLEE    — HP < 30%: retreat away from player toward map edge
  //
  // Auto-aim is mirrored on the bot side: they pick the nearest visible
  // hostile (player or other-squad bot) and lerp aim toward it.
  const AI_IDEAL_RANGE   = TUNING.aiIdealRange;
  const AI_DODGE_DUR     = 0.55;
  const AI_FLEE_HP_PCT   = 0.30;
  const AI_LOS_RANGE     = TUNING.aiLosRange;
  const AI_FIRE_INTERVAL = TUNING.aiFireInterval;
  const AI_DODGE_SPEED   = 1.5;
  const AI_FLEE_SPEED    = 1.25;
  const AI_DODGE_COOLDOWN = 1.0;

  function makeBot(wx, wy, id, theme) {
    return {
      wx, wy,
      r: 11,
      hp: TUNING.botHp, maxHp: TUNING.botHp,
      speed: TUNING.botSpeed,
      color: theme.botSquad[id % 3],
      bandColor: theme.botBand[id % 3],
      id,
      state: 'PATROL',
      stateT: 0,
      fireCd: 0.6 + Math.random() * 0.8,
      hitFlash: 0,
      lastHitFrom: null,
      lastHitT: 0,
      dodgeCooldown: 0,
      dodgeDir: 0,   // -1 or +1 (perpendicular sidestep direction)
      iframeT: 0,    // R13: brief i-frames during a dodge-ROLL (parity with player)
      wallCd: 3 + Math.random() * 4,   // R13: gloo-wall build cooldown (staggered start)
      frozenT: 0,    // 紧急来电 freeze
      patrolTarget: null,
      aimAng: 0,
      // ④ 大乱斗: 个性(rusher/lurker/looter/pack) + 当前交火对象(粘性, 防每帧切目标抖动)
      personality: 'rusher',
      targetId: null,
      meleeCd: 0,
      shrinkT: 0, treeT: 0, duckT: 0, iceT: 0, floatT: 0,   // 喜剧 CC 计时(缩小/种树/变鸭/冰冻/气球)
      airdropMode: 'strong',  // R2: bot 也开怪枪(spawn 时随机覆盖)
      dmg: TUNING.botDmg,
      accuracy: TUNING.botAccuracy,
      range: TUNING.botRange,
      elite: false,           // the difficulty-curve "高手" tier (boosted in the spawn loop)
      fireMul: 1,             // fire-rate multiplier (elites fire faster)
    };
  }

  function botPickPatrolTarget(s, b) {
    const Iso = $Iso();
    // looter: 优先扑向已落地的空投盲盒(捡漏个性)
    if (b.personality === 'looter' && s.airdrop && s.airdrop.spawned && !s.airdrop.collected && s.airdrop.dropT <= 0) {
      b.patrolTarget = { wx: s.airdrop.wx + (Math.random() - 0.5) * 30, wy: s.airdrop.wy + (Math.random() - 0.5) * 30, ttl: 2.0 };
      return;
    }
    const zr = s.zone.r * 0.7;
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * zr;
    b.patrolTarget = {
      wx: s.zone.cx + Math.cos(ang) * dist,
      wy: s.zone.cy + Math.sin(ang) * dist,
      ttl: 2.5 + Math.random() * 1.5,
    };
  }

  function nearestHostileForBot(s, b) {
    // ④ 真吃鸡大乱斗: 目标 = {存活玩家 + 其他存活 bot} 里按个性打分选一个(排除自己)。
    // 你不再是唯一目标 —— 有螳螂捕蝉/捡漏/末圈混战。粘性避免每帧切目标抖动。
    const p = s.player;
    const cands = [];
    if (p && p.hp > 0) cands.push(p);
    for (const o of s.bots) if (o !== b && o.hp > 0) cands.push(o);
    if (!cands.length) return null;
    let best = null, bestScore = Infinity;
    for (const c of cands) {
      const isPlayer = (c === p);
      let score = Math.hypot(c.wx - b.wx, c.wy - b.wy);
      if (b.personality === 'lurker') {
        // 苟: 挑最弱的打, 血厚时躲着玩家
        score *= 0.45 + (c.hp / (c.maxHp || 100)) * 0.9;
        if (isPlayer && b.hp > b.maxHp * 0.5) score *= 1.9;
      } else if (b.personality === 'rusher') {
        if (isPlayer) score *= 0.72;   // 激进: 偏好猎杀玩家, 保持压力
      } else if (b.personality === 'pack') {
        if (isPlayer) score *= 1.15;   // 抱团: 优先咬住 bot 群里的目标
      }
      // 粘性: 维持上一目标(只要还在候选里), 减少抖动
      const cid = isPlayer ? 'p' : c.id;
      if (b.targetId != null && cid === b.targetId) score *= 0.7;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    b.targetId = (best === p) ? 'p' : (best ? best.id : null);
    return best;
  }

  function botStep(b, dt, s) {
    if (b.frozenT > 0) { b.frozenT -= dt; b.hitFlash = Math.max(b.hitFlash, 0); return; }   // 📱 frozen
    if (b.hitFlash > 0) b.hitFlash -= dt;
    b.stateT += dt;
    b.fireCd -= dt;
    b.dodgeCooldown = Math.max(0, b.dodgeCooldown - dt);
    if (b.iframeT > 0) b.iframeT -= dt;     // R13: dodge-roll i-frames
    if (b.wallCd > 0) b.wallCd -= dt;       // R13: gloo-wall build cooldown
    if (b.shovedCd > 0) b.shovedCd -= dt;   // ① 冲刺击退冷却(防每帧重复撞飞)
    if (b.shrinkT > 0) b.shrinkT -= dt;     // 缩小恢复
    if (b.treeT > 0) b.treeT -= dt;         // 种树生根恢复
    if (b.duckT > 0) b.duckT -= dt;         // 变鸭恢复
    if (b.iceT > 0) b.iceT -= dt;           // 冰冻恢复
    if (b.floatT > 0) b.floatT -= dt;       // 气球飘浮恢复
    const evtSpd = (s.berserkT > 0 ? 1.35 : 1) * (s.meleeT > 0 ? 1.2 : 1);   // 暴走/拳击 speed

    const target = nearestHostileForBot(s, b);
    if (!target) return;
    const dxw = target.wx - b.wx;
    const dyw = target.wy - b.wy;
    const dist = Math.hypot(dxw, dyw);
    const losClear = !losBlocked(b.wx, b.wy, target.wx, target.wy, s.covers);

    // Smooth-lerp aim toward target (mirrors player auto-aim friendliness)
    const targetAng = Math.atan2(dyw, dxw);
    const aDiff = ((targetAng - b.aimAng + Math.PI*3) % (Math.PI*2)) - Math.PI;
    b.aimAng += Math.max(-Math.PI*2*dt, Math.min(Math.PI*2*dt, aDiff));

    // State transitions
    const lateAggro = Math.max(0, Math.min(1, (s.elapsed - 8) / 14));
    const engageRange = AI_LOS_RANGE * (1 + lateAggro * 0.22);
    if (b.hp / b.maxHp < AI_FLEE_HP_PCT) {
      if (b.state !== 'FLEE') { b.state = 'FLEE'; b.stateT = 0; }
    } else if (b.state === 'PATROL' && losClear && dist < engageRange) {
      b.state = 'ENGAGE'; b.stateT = 0;
    } else if (b.state === 'ENGAGE' && (!losClear || dist > engageRange * 1.35)) {
      b.state = 'PATROL'; b.stateT = 0; b.patrolTarget = null;
    }
    // Auto-trigger dodge if recently hit & cooldown elapsed
    if (b.lastHitT > 0 && performance.now() - b.lastHitT < 400 && b.dodgeCooldown <= 0 && b.state !== 'FLEE') {
      b.state = 'DODGE';
      b.stateT = 0;
      b.dodgeDir = Math.random() < 0.5 ? -1 : 1;
      b.dodgeCooldown = AI_DODGE_COOLDOWN * (b.elite ? TUNING.eliteDodgeMul : 1);   // elites juke more often (reads as "skilled")
      b.iframeT = 0.2;   // R13: brief dodge-ROLL i-frames — a quick juke, not a DPS shield (anti-恶心)
      b.lastHitT = 0;
      if ($particles()) $particles()(s.particles, b.wx, b.wy, '#9fefff', 6);   // roll dust
    }

    // Movement per state
    let mvx = 0, mvy = 0, spdMul = 1;
    const ndx = dist > 0 ? dxw / dist : 0;
    const ndy = dist > 0 ? dyw / dist : 0;

    if (b.state === 'PATROL') {
      if (!b.patrolTarget || b.patrolTarget.ttl <= 0) botPickPatrolTarget(s, b);
      const tdx = b.patrolTarget.wx - b.wx;
      const tdy = b.patrolTarget.wy - b.wy;
      const td = Math.hypot(tdx, tdy);
      if (td < 18) { b.patrolTarget = null; }
      else { mvx = tdx / td; mvy = tdy / td; spdMul = 0.55; }
      b.patrolTarget && (b.patrolTarget.ttl -= dt);
    } else if (b.state === 'ENGAGE') {
      // Maintain ideal range while strafing perpendicular for "smart" feel
      const strafe = Math.sin(b.stateT * 2.5) * 0.7;
      if (dist > AI_IDEAL_RANGE + 30) { mvx = ndx;  mvy = ndy;  spdMul = 1.0; }
      else if (dist < AI_IDEAL_RANGE - 30) { mvx = -ndx; mvy = -ndy; spdMul = 0.9; }
      else { mvx = -ndy * strafe; mvy = ndx * strafe; spdMul = 0.85; }
    } else if (b.state === 'DODGE') {
      // Sidestep perpendicular to target line
      mvx = -ndy * b.dodgeDir;
      mvy =  ndx * b.dodgeDir;
      spdMul = AI_DODGE_SPEED;
      if (b.stateT > AI_DODGE_DUR) { b.state = losClear && dist < AI_LOS_RANGE ? 'ENGAGE' : 'PATROL'; b.stateT = 0; }
    } else if (b.state === 'FLEE') {
      mvx = -ndx;
      mvy = -ndy;
      spdMul = AI_FLEE_SPEED;
    }

    // Zone IQ: bots begin rotating before the edge, and outside-zone movement
    // takes priority over fleeing/looting. This keeps the arena populated instead
    // of letting weak bots drift into storm and die without fighting.
    const dzc = Math.hypot(b.wx - s.zone.cx, b.wy - s.zone.cy);
    if (dzc > s.zone.r * 0.60) {                       // R15: rotate earlier (was .72) so the fast shrink can't farm them
      const zdx = s.zone.cx - b.wx, zdy = s.zone.cy - b.wy;
      const zd = Math.hypot(zdx, zdy) || 1;
      const zx = zdx / zd, zy = zdy / zd;
      // 0 at .60r → 1 at the edge. A bot caught OUTSIDE makes a near-straight
      // beeline in (pull .97) so it survives to FIGHT in the circle instead of
      // melting in the storm. .60 measured better than a harder .56 (which made
      // bots clump/jam on cover en route) — moderate rotate keeps them fighting.
      const urgent = Math.max(0, Math.min(1, (dzc / s.zone.r - 0.60) / 0.40));
      const outside = dzc > s.zone.r;
      const pull = outside ? 0.97 : (0.70 + urgent * 0.24);   // keep tactical maneuver in-band; hard rotate only when truly out
      mvx = mvx * (1 - pull) + zx * pull;
      mvy = mvy * (1 - pull) + zy * pull;
      const md = Math.hypot(mvx, mvy) || 1;
      mvx /= md; mvy /= md;
      spdMul = Math.max(spdMul, outside ? 2.1 : (1.42 + urgent * 0.18));   // beat a ~15px/s radius shrink
    }

    // Dodge incoming airstrike/lightning telegraphs — makes the AI feel smart
    // and keeps the event fair (bots flee the red circles, same as you should).
    if (s.evt && (s.evt.type === 'airstrike' || s.evt.type === 'lightning') && s.evt.t < s.evt.warn) {
      let near = null, nd = 1e9;
      for (const st of s.evt.strikes) { const d = Math.hypot(b.wx - st.wx, b.wy - st.wy); if (d < nd) { nd = d; near = st; } }
      if (near && nd < TUNING.strikeRadius + 34) { mvx = (b.wx - near.wx) / (nd || 1); mvy = (b.wy - near.wy) / (nd || 1); spdMul = 1.5; }
    }

    // Apply movement + cover collision
    const Iso = $Iso();
    const statusMul = ((b.treeT > 0 || b.iceT > 0) ? 0 : 1) * (b.shrinkT > 0 ? 0.6 : 1) * (b.duckT > 0 ? 0.45 : 1) * (b.floatT > 0 ? 0.4 : 1);   // 树/冰=生根0, 缩小=0.6, 鸭=0.45, 气球=0.4 飘
    let nx = b.wx + mvx * b.speed * spdMul * evtSpd * statusMul * dt;
    let ny = b.wy + mvy * b.speed * spdMul * evtSpd * statusMul * dt;
    for (const c of s.covers) {
      if (rectCircle(c, nx, ny, b.r)) { nx = b.wx; ny = b.wy; break; }
    }
    b.wx = Math.max(10, Math.min(s.mapW * Iso.WS - 10, nx));
    b.wy = Math.max(10, Math.min(s.mapH * Iso.WS - 10, ny));

    // Storm DoT on bot when outside zone (kept for parity with player rules)
    const dzAfterMove = Math.hypot(b.wx - s.zone.cx, b.wy - s.zone.cy);
    if (dzAfterMove > s.zone.r) {
      b.hp -= 7 * dt;
      if (b.hp <= 0) {
        if ($particles()) $particles()(s.particles, b.wx, b.wy, b.color, 14);
        s.eliminated += 1;   // ④ 毒圈淘汰也算一次 → last-man-standing 判定
        s.bots = s.bots.filter(x => x !== b);
        return;
      }
    }

    // 🥊 拳击时刻: bots holster guns and brawl — 打最近目标(bot 或玩家)。
    if (s.meleeT > 0) {
      b.meleeCd = Math.max(0, (b.meleeCd || 0) - dt);
      if (target && target.hp > 0 && Math.hypot(target.wx - b.wx, target.wy - b.wy) < b.r + (target.r || 11) + 6 && b.meleeCd <= 0) {
        b.meleeCd = 0.6;
        if (target === s.player) hurtPlayer(s, 10); else hurtBot(s, target, 10, 'b');
        pushSpark(s, ...Object.values(Iso.w2s(target.wx, target.wy)), '#ffb24a', 8);
      }
      return;   // no gunfire during the brawl
    }

    // R13: bot throws up a gloo wall for cover when hurt mid-fight (FF gloo-wall culture).
    // Gated by hp<78% + 7-11s cooldown + coin-flip so it's tactical, not wall-spam.
    if (b.state === 'ENGAGE' && b.wallCd <= 0 && losClear && dist < AI_LOS_RANGE && b.hp / b.maxHp < 0.78 && Math.random() < 0.5) {
      botDeployWall(s, b, b.aimAng);
      b.wallCd = 7 + Math.random() * 4;
    }

    // Fire — only when ENGAGE, LOS clear, in range, fireCd elapsed
    if (b.state === 'ENGAGE' && losClear && dist < b.range && b.fireCd <= 0 && !(b.treeT > 0) && !(b.iceT > 0) && !(b.duckT > 0) && !(b.floatT > 0)) {   // 变树/冰冻/变鸭/气球 不能开枪(null-safe)
      const aggro = brAggro(s.elapsed);   // R9: ease-in → escalate → finale
      b.fireCd = (AI_FIRE_INTERVAL + Math.random() * 0.6) / (aggro * (s.berserkT > 0 ? 1.7 : 1) * (b.fireMul || 1));   // slower early, faster late; elites fire faster
      const ang = b.aimAng + (Math.random() - 0.5) * b.accuracy * (1.7 - aggro);                    // wide spread early → tight late
      if (s.waterGunT > 0) {   // watergun: 无害水花
        s.bullets.push({ wx: b.wx, wy: b.wy, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360, life: 1.5, owner: 'b', ownerId: b.id, dmg: 0, color: '#7fd4ff', mode: 'water' });
      } else {   // R2: bot 也开怪枪(子集), 伤害缩放到 ≈ botDmg → 满地飞回旋镖/缩小线, 全员搞怪
        fireAirdrop(s, b, b.airdropMode || 'strong', ang, b.wx, b.wy, 'b', b.id, 0.42 * aggro);      // weaker early, harder late
      }
      const SFX = $SFX(); if (SFX.shot) SFX.shot();
    }
  }

  // ─── Destructible cover damage ──────────────────────────────
  // Bricks (type 'brick') take bullet damage; at 0 HP they break — removed from
  // the active cover list so they stop blocking movement / LOS / bullets, and
  // a rubble burst plays. Steel/stone anchors are not destructible (hp = Infinity).
  function damageCover(s, c, dmg, theme) {
    if (!c.destructible || c.destroyed) return;
    c.hp -= dmg;
    const Iso = $Iso();
    const ctr = Iso.w2s(c.x + c.w / 2, c.y + c.h / 2);
    pushSpark(s, ctr.sx, ctr.sy, '#d8a050', 4);
    if ($particles()) $particles()(s.particles, c.x + c.w / 2, c.y + c.h / 2, c.color || '#b06a3a', 4);
    if (c.hp <= 0) {
      c.destroyed = true;
      s.covers = s.covers.filter(x => x !== c);   // no longer blocks anything
      if (c.kind === 'barrel') { explodeBarrel(s, c, theme); return; }   // ③ 油桶: 击毁即爆炸 + 连锁
      pushShake(s, 6);
      if ($particles()) $particles()(s.particles, c.x + c.w / 2, c.y + c.h / 2, c.color || '#b06a3a', 18);
      pushSpark(s, ctr.sx, ctr.sy, '#b06a3a', 14);
      const SFX = $SFX(); if (SFX.rBlast) SFX.rBlast(); else if (SFX.hit) SFX.hit();
    }
  }
  // ③ 油桶爆炸: 范围伤害(玩家+bot) + 连锁点燃附近油桶 → 连环爆 viral
  function explodeBarrel(s, c, theme) {
    const wx = c.x + c.w / 2, wy = c.y + c.h / 2, R = 70, dmg = 34;
    pushShake(s, 16);
    if ($particles()) { $particles()(s.particles, wx, wy, '#ff8a3a', 26); $particles()(s.particles, wx, wy, '#ffd84a', 14); }
    try { const pr = $Iso().w2s(wx, wy); pushSpark(s, pr.sx, pr.sy, '#ff8a3a', 18); if (window.Juice) { jTrauma(0.4); window.Juice.flash('#ff7a2a', 80); } } catch (_) {}
    const p = s.player;
    if (p && p.hp > 0 && Math.hypot(p.wx - wx, p.wy - wy) < R) hurtPlayer(s, dmg);
    for (const b of s.bots.slice()) if (Math.hypot(b.wx - wx, b.wy - wy) < R) hurtBot(s, b, dmg, 'env');
    for (const o of s.covers.slice()) if (o.kind === 'barrel' && !o.destroyed && Math.hypot((o.x + o.w / 2) - wx, (o.y + o.h / 2) - wy) < R) { o.hp = 0; damageCover(s, o, 0, theme); }
    const SFX = $SFX(); if (SFX.rBlast) SFX.rBlast(); else if (SFX.hit) SFX.hit();
  }

  // ─── Falling crate hazard ───────────────────────────────────
  // Random crate falls from sky every 6-8s. Shadow telegraph for 1.5s,
  // then drops. Lands at a position inside the zone. Damages anyone
  // within 22 units (player or bot).
  function spawnFallingCrate(s) {
    const Iso = $Iso();
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * s.zone.r * 0.8;
    const wx = s.zone.cx + Math.cos(ang) * dist;
    const wy = s.zone.cy + Math.sin(ang) * dist;
    s.hazards.push({
      wx, wy,
      tele: 2.0,            // longer telegraph so the danger ring is readable
      landed: false,
      flashT: 0,
    });
  }
  function updateHazards(s, dt) {
    const Iso = $Iso();
    for (const h of s.hazards) {
      if (!h.landed) {
        h.tele -= dt;
        if (h.tele <= 0) {
          h.landed = true;
          h.flashT = 0.5;
          pushShake(s, 14);
          if ($particles()) $particles()(s.particles, h.wx, h.wy, '#ffd84a', 22);
          const SFX = $SFX(); if (SFX.rBlast) SFX.rBlast(); else if (SFX.hit) SFX.hit();
          // Damage check
          const p = s.player;
          if (Math.hypot(p.wx - h.wx, p.wy - h.wy) < 28) {
            hurtPlayer(s, TUNING.crateHazardDmg);
          }
          for (const b of s.bots) {
            if (Math.hypot(b.wx - h.wx, b.wy - h.wy) < 28) {
              hurtBot(s, b, 30, 'env');
            }
          }
        }
      } else {
        h.flashT -= dt;
      }
    }
    s.hazards = s.hazards.filter(h => !h.landed || h.flashT > -1.2);
  }

  // ─── Chaos events — telegraphed, dodgeable, symmetric ───────
  // The "不一样" layer: random world events that hit EVERYONE (you + bots), are
  // always telegraphed (a warn window to run / dodge-roll out of), and are never
  // a cheap insta-kill. Airstrike & lightning rain dodgeable blasts; watergun
  // turns every gun harmless for a comedy melee rush. More get added over time.
  const EVENTS = ['airstrike', 'lightning', 'watergun', 'call', 'berserk', 'melee', 'airstrike', 'berserk'];  // weighted
  function triggerEvent(s) {
    const type = EVENTS[(Math.random() * EVENTS.length) | 0];
    if (type === 'call') {
      // 紧急来电(中性, 全球安全): a couple of fighters freeze to answer the phone —
      // they can't act, but ALSO can't be hurt (comedy beat, never a free execution).
      const pool = [s.player].concat(s.bots);
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) { const a = pool[(Math.random() * pool.length) | 0]; if (a) a.frozenT = 2.3; }
      s.evt = { type, t: 0, warn: 0, dur: 2.5 };
      if ($showBanner()) $showBanner()('📱 紧急来电!接电话的人都僵住了', '#ffd84a', 1.9);
      const SFX = $SFX(); if (SFX.pickup) SFX.pickup();
    } else if (type === 'berserk') {
      // 全员暴走: everyone's hands + feet speed up for a chaotic brawl.
      s.berserkT = 5.5;
      s.evt = { type, t: 0, warn: 0, dur: 5.5 };
      if ($showBanner()) $showBanner()('🔥 全员暴走!手速移速翻倍 — 乱战开始', '#ff5a3c', 1.9);
      const SFX = $SFX(); if (SFX.qDash) SFX.qDash();
    } else if (type === 'melee') {
      // 拳击时刻: guns holster, everyone rushes with a buffed blade + extra speed.
      s.meleeT = 5;
      s.evt = { type, t: 0, warn: 0, dur: 5 };
      if ($showBanner()) $showBanner()('🥊 屋顶钢拳!收枪肉搏 FACTORY FIST FIGHT', '#ffb24a', 1.9);
      const SFX = $SFX(); if (SFX.pickup) SFX.pickup();
    } else if (type === 'airstrike' || type === 'lightning') {
      const n = type === 'airstrike' ? 4 : 5;
      const strikes = [];
      for (let k = 0; k < n; k++) {
        const ang = Math.random() * Math.PI * 2, rr = Math.random() * s.zone.r * 0.85;
        strikes.push({ wx: s.zone.cx + Math.cos(ang) * rr, wy: s.zone.cy + Math.sin(ang) * rr, boomed: false });
      }
      s.evt = { type, t: 0, warn: type === 'airstrike' ? 1.5 : 1.05, dur: type === 'airstrike' ? 2.4 : 1.9, strikes, flashT: 0 };
      if ($showBanner()) $showBanner()(type === 'airstrike' ? '⚠ 空袭来袭 · 躲开红圈!' : '⚡ 落雷预警 · 别站红点!', '#ff5a3c', 1.6);
      const SFX = $SFX(); if (SFX.zone) SFX.zone();
    } else if (type === 'watergun') {
      s.evt = { type, t: 0, warn: 0, dur: TUNING.waterGunDur };
      s.waterGunT = TUNING.waterGunDur;
      if ($showBanner()) $showBanner()('💦 全员水枪!子弹不疼 — 冲上去贴脸', '#5af5e0', 1.8);
      const SFX = $SFX(); if (SFX.pickup) SFX.pickup();
    }
    s.evtLog.push(type);
  }
  function applyStrikeDamage(s, wx, wy, radius, dmg) {
    const Iso = $Iso();
    pushShake(s, 14);
    if ($particles()) { $particles()(s.particles, wx, wy, '#ff8a3a', 22); $particles()(s.particles, wx, wy, '#ffd84a', 12); }
    try { const pr = Iso.w2s(wx, wy); pushSpark(s, pr.sx, pr.sy, '#ff8a3a', 16); if (window.Juice) { jTrauma(0.32); window.Juice.flash('#ff6a2a', 70); } } catch (_) {}
    const p = s.player;
    // hurtPlayer respects dodge-roll i-frames → rolling THROUGH a blast = clean.
    if (p.hp > 0 && Math.hypot(p.wx - wx, p.wy - wy) < radius) hurtPlayer(s, dmg);
    for (const b of s.bots.slice()) if (Math.hypot(b.wx - wx, b.wy - wy) < radius) hurtBot(s, b, dmg, 'env');
    const SFX = $SFX(); if (SFX.rBlast) SFX.rBlast(); else if (SFX.hit) SFX.hit();
  }
  function updateEvents(s, dt) {
    if (s.waterGunT > 0) s.waterGunT = Math.max(0, s.waterGunT - dt);
    if (s.berserkT > 0) s.berserkT = Math.max(0, s.berserkT - dt);
    if (s.meleeT > 0) s.meleeT = Math.max(0, s.meleeT - dt);
    if (!s.evt) {
      if (s.elapsed >= s.evtNextRoll) {
        triggerEvent(s);
        s.evtNextRoll = s.elapsed + TUNING.eventGapMin + Math.random() * (TUNING.eventGapMax - TUNING.eventGapMin);
      }
      return;
    }
    const e = s.evt;
    e.t += dt;
    if (e.type === 'airstrike' || e.type === 'lightning') {
      if (e.t >= e.warn) {
        for (const st of e.strikes) {
          if (st.boomed) continue;
          st.boomed = true; e.flashT = 0.2;
          applyStrikeDamage(s, st.wx, st.wy, TUNING.strikeRadius, TUNING.strikeDmg);
        }
      }
      if (e.flashT > 0) e.flashT -= dt;
    }
    if (e.t >= e.dur) s.evt = null;
  }

  // ─── 凌凌漆 airdrop modes — each crate rolls a random funny gun ──────
  // The "不一样" weapon: grab a crate and you might get a piercing cannon, a
  // shotgun, a wall-bouncer, a hop-gun that pogos you forward, or a grenade
  // launcher. All are FUN/upside (no self-harm punish) — variety = surprise.
  const AIRDROP_MODES = {
    strong: { label: '穿甲强枪', color: '#ffd84a' },
    spread: { label: '喷子散弹', color: '#ff9a3c' },
    bounce: { label: '弹弹弹枪', color: '#5ff5a0' },
    hop:    { label: '蹦蹦枪',   color: '#5af5e0' },
    nade:   { label: '榴弹枪',   color: '#ff6f9a' },
    // ② 凌凌漆怪枪(又强又搞笑又怪, downside 短+可恢复+可反制)
    rocket:    { label: '后坐力火箭', color: '#ff7a2a' },
    boomerang: { label: '回旋镖枪',   color: '#b98cff' },
    shrink:    { label: '缩小射线',   color: '#7af5c0' },
    tree:      { label: '种树枪',     color: '#6fdc5a' },
    duck:      { label: '变鸭枪',     color: '#ffd84a' },
    freeze:    { label: '冰冻枪',     color: '#7fd4ff' },
    balloon:   { label: '气球枪',     color: '#ff8ad0' },   // R5: 命中→敌人飘起来, 不能开枪
    magnet:    { label: '磁铁枪',     color: '#b98cff' },   // R5: 命中→把敌人吸到你面前
    // ── GIFT-only spectacle weapons (the "Enhance" gift layer) — huge & loud,
    //    strong but timed/limited so a skilled player never needs them. ──
    ff_tank:    { label: '装甲坦克炮', color: '#ffd24a' },  // 大炮: 慢速大弹 + 范围爆炸 + 重震屏
    ff_shotgun: { label: '黄金M1887', color: '#ffcf3a' },  // 金色双管: 近距离海量散弹 + 巨大枪口闪
  };
  const AIRDROP_KEYS = Object.keys(AIRDROP_MODES);
  // R2: 开局每人就有一把怪枪, 中途会变, bot 也用。BASE_WEIRD=玩家底枪轮换(去掉 rocket/nade 太吵);
  // BOT_WEIRD=bot 子集(少 AOE 刷屏); 金箱空投仍可抽全部 9 把(含 rocket/nade 当 treat)。
  const BASE_WEIRD = ['boomerang', 'shrink', 'tree', 'duck', 'freeze', 'balloon', 'magnet', 'bounce', 'hop', 'spread', 'strong'];
  const BOT_WEIRD  = ['boomerang', 'shrink', 'duck', 'freeze', 'tree', 'balloon', 'bounce', 'spread', 'strong'];   // R13: fuller arsenal (excl. magnet=player-pull, rocket/nade=AOE spam)
  function rollWeird(pool) { const a = pool || BASE_WEIRD; return a[(Math.random() * a.length) | 0]; }
  function fireAirdrop(s, p, mode, angle, mx, my, owner, ownerId, dmgMul) {
    owner = owner || 'p'; dmgMul = dmgMul || 1;
    const col = (AIRDROP_MODES[mode] || AIRDROP_MODES.strong).color;
    const push = (a, dmg, sp, life, extra) => s.bullets.push(Object.assign({
      wx: mx, wy: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, owner, ownerId, dmg: dmg * dmgMul, color: col, mode: 'normal', air: true,
    }, extra));
    if (mode === 'spread') { for (let k = -2; k <= 2; k++) push(angle + k * 0.13, 13, 560, 0.55, { coverDmg: 13 }); }
    else if (mode === 'bounce') push(angle, 26, 600, 1.7, { mode: 'bounce', bounces: 2, coverDmg: 30 });
    else if (mode === 'nade')   push(angle, 8, 460, 1.2, { mode: 'nade', coverDmg: 18 });
    else if (mode === 'hop')  { push(angle, 28, 620, 1.4, { pierce: 1, piercesCover: true, coverDmg: 40 }); p.dodgeVX = Math.cos(angle); p.dodgeVY = Math.sin(angle); p.dodgeT = Math.max(p.dodgeT, 0.10); }
    // ② 怪枪: 火箭(命中爆 mode:nade + 把自己往后弹) / 回旋镖(飞出再绕回, pierce 99 来回都打) / 缩小 / 种树
    else if (mode === 'rocket') { push(angle, 34, 540, 1.1, { mode: 'nade', coverDmg: 30 }); const ba = angle + Math.PI; p.dodgeVX = Math.cos(ba); p.dodgeVY = Math.sin(ba); p.dodgeT = Math.max(p.dodgeT, 0.16); pushShake(s, 11); }
    else if (mode === 'boomerang') push(angle, 22, 500, 2.2, { mode: 'boomerang', coverDmg: 20, pierce: 99, piercesCover: true });
    // R3 喜剧枪: ~0 伤害, 效果即玩法(名副其实 — 缩小就缩小, 种树就变树, 不靠掉血)
    else if (mode === 'shrink') push(angle, 1, 600, 1.3, { coverDmg: 8, pierce: 1, piercesCover: true, onHit: 'shrink' });
    else if (mode === 'tree')   push(angle, 1, 560, 1.3, { coverDmg: 8, pierce: 1, piercesCover: true, onHit: 'tree' });
    else if (mode === 'duck')   push(angle, 1, 560, 1.3, { coverDmg: 8, pierce: 1, piercesCover: true, onHit: 'duck' });
    else if (mode === 'freeze') push(angle, 1, 560, 1.3, { coverDmg: 8, pierce: 1, piercesCover: true, onHit: 'freeze' });
    else if (mode === 'balloon') push(angle, 1, 580, 1.3, { coverDmg: 8, pierce: 1, piercesCover: true, onHit: 'balloon' });
    else if (mode === 'magnet')  push(angle, 1, 600, 1.3, { coverDmg: 8, pierce: 1, piercesCover: true, onHit: 'magnet' });
    // ── GIFT spectacle guns ──
    else if (mode === 'ff_tank') {                              // 坦克炮: 慢速巨弹, 命中爆 AOE, 每发重震
      push(angle, 40, 360, 1.6, { mode: 'nade', pierce: 1, piercesCover: true, coverDmg: 60, big: 2.6, trail: '#ffd24a' });
      const ba = angle + Math.PI; p.dodgeVX = Math.cos(ba) * 0.6; p.dodgeVY = Math.sin(ba) * 0.6; p.dodgeT = Math.max(p.dodgeT, 0.10);
      pushShake(s, 16); try { if (window.Juice) { window.Juice.hitstop(0.05); jTrauma(0.35); } } catch (_) {}
    }
    else if (mode === 'ff_shotgun') {                           // 金色 M1887: 8 颗大散弹, 近距离秒人
      for (let k = -4; k <= 4; k++) push(angle + k * 0.085, 14, 600, 0.42, { coverDmg: 16, big: 1.5, trail: '#ffcf3a' });
      pushShake(s, 9);
    }
    else push(angle, TUNING.airdropDmg, TUNING.airdropBulletSpeed, 1.4, { pierce: TUNING.airdropPierce, piercesCover: true, coverDmg: TUNING.coverDmgAirdrop });
  }
  function explodeNade(s, bl, theme) {
    if (bl._exploded) return; bl._exploded = true;
    const R = 46, dmg = 30;
    pushShake(s, 12);
    if ($particles()) { $particles()(s.particles, bl.wx, bl.wy, '#ff8a3a', 20); $particles()(s.particles, bl.wx, bl.wy, '#ffd84a', 10); }
    try { const pr = $Iso().w2s(bl.wx, bl.wy); pushSpark(s, pr.sx, pr.sy, '#ff8a3a', 14); if (window.Juice) jTrauma(0.25); } catch (_) {}
    for (const b of s.bots.slice()) if (Math.hypot(b.wx - bl.wx, b.wy - bl.wy) < R) hurtBot(s, b, dmg, 'p');
    const SFX = $SFX(); if (SFX.rBlast) SFX.rBlast(); else if (SFX.hit) SFX.hit();
  }

  // ② 凌凌漆命中附加: 缩小/种树(downside 短+可恢复+不致命的喜剧 CC)
  function applyGunOnHit(s, b, kind) {
    if (kind === 'shrink') { b.shrinkT = 4.5; b.duckT = 0; b.iceT = 0; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '缩成小不点!', '#7af5c0'); if ($particles()) $particles()(s.particles, b.wx, b.wy, '#7af5c0', 12); }
    else if (kind === 'tree') { b.treeT = 4.5; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '🌳变成树!', '#6fdc5a'); if ($particles()) $particles()(s.particles, b.wx, b.wy, '#6fdc5a', 18); pushShake(s, 4); }
    else if (kind === 'duck') { b.duckT = 3.5; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '🦆变成鸭!', '#ffd84a'); if ($particles()) $particles()(s.particles, b.wx, b.wy, '#ffd84a', 12); }
    else if (kind === 'freeze') { b.iceT = 3.0; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '❄冻住了!', '#7fd4ff'); if ($particles()) $particles()(s.particles, b.wx, b.wy, '#bfefff', 14); }
    else if (kind === 'balloon') { b.floatT = 3.2; b.duckT = 0; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '🎈飘起来!', '#ff8ad0'); if ($particles()) $particles()(s.particles, b.wx, b.wy, '#ff8ad0', 14); }
    else if (kind === 'magnet') { const pp = s.player; const a = Math.atan2(pp.wy - b.wy, pp.wx - b.wx); b.wx += Math.cos(a) * 55; b.wy += Math.sin(a) * 55; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '🧲吸过来!', '#b98cff'); if ($particles()) $particles()(s.particles, b.wx, b.wy, '#b98cff', 12); }
  }
  // ② 命中随机搞笑层: 任意盲盒枪命中按 gagChance 概率触发一个 viral gag(每次"这什么鬼")
  function maybeGag(s, b) {
    const chance = (s.gagChance != null) ? s.gagChance : 0.12;
    if (Math.random() >= chance) return;
    s._gagCount = (s._gagCount || 0) + 1;
    const g = (Math.random() * 5) | 0;
    if (g === 0) { for (const o of s.bots.slice()) hurtBot(s, o, 5, 'p'); if ($flashFCT()) $flashFCT()(b.wx, b.wy, '群伤!', '#ff6f9a'); pushShake(s, 8); }
    else if (g === 1) { b.shrinkT = 4; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '缩小!', '#7af5c0'); }
    else if (g === 2) { b.duckT = 3; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '🦆变鸭!', '#ffd84a'); }
    else if (g === 3) { b.floatT = 2.6; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '🎈飘!', '#ff8ad0'); }
    else { const a = Math.random() * Math.PI * 2; b.wx += Math.cos(a) * 42; b.wy += Math.sin(a) * 42; if ($flashFCT()) $flashFCT()(b.wx, b.wy, '弹飞!', '#5af5e0'); }
  }

  // ─── Damage application ─────────────────────────────────────
  // R13: a bot's weird gun hitting YOU is a SAFE comedy beat — a brief stun + INVULN
  // (frozenT: can't act, but can't be hurt), funny FCT naming the gun. Bots "用得上"
  // their crazy guns on the player without it ever being a cheap kill (anti-恶心).
  function applyGunOnPlayer(s, kind) {
    const p = s.player;
    if (p.frozenT > 0 || p.iframeT > 0) return;   // no stacking / already safe
    p.frozenT = (kind === 'freeze') ? 1.1 : 0.85;
    const label = kind === 'freeze' ? '❄ 被冰冻!' : kind === 'tree' ? '🌳 被种树!' : kind === 'duck' ? '🦆 被变鸭!' : kind === 'balloon' ? '🎈 飘起来!' : kind === 'shrink' ? '被缩小!' : '中了怪枪!';
    if ($flashFCT()) $flashFCT()(p.wx, p.wy, label, '#7fd4ff');
    if ($particles()) $particles()(s.particles, p.wx, p.wy, '#7fd4ff', 10);
  }
  function hurtBot(s, b, dmg, source) {
    if (b.frozenT > 0 || b.iframeT > 0) return;   // 📱 freeze / R13 dodge-roll i-frames = can't be hit
    b.hp -= dmg;
    b.hitFlash = 0.18;
    if (source === 'p') {
      b.lastHitT = performance.now();
      b.lastHitFrom = s.player;
      s.player.hitMarkerT = 0.12;   // reticle flash → instant "I hit!" feedback
    }
    if ($flashFCT()) $flashFCT()(b.wx, b.wy, '-' + Math.round(dmg), source === 'p' ? '#ffcd75' : '#ff4655');
    if (b.hp <= 0) {
      // Big juice on kill: massive particle burst + screen shake + slow-mo banner
      if (source === 'p') {
        s.kills += 1;
        pushShake(s, 22);
        if ($flashFCT()) $flashFCT()(b.wx, b.wy, 'KILL +' + s.kills, '#ffd84a');
        // juice: kill hit-stop + debris + combo popup
        try {
          const Iso = $Iso(); const pr = Iso.w2s(b.wx, b.wy);
          if (window.Juice) {
            window.Juice.hitstop(0.09); jTrauma(0.4);
            window.Juice.burst(pr.sx, pr.sy, 'debris', b.color);
            // R13 FF kill-streak callouts: OP / RAMPAGE / BOOYAH — FF community slang
            const KS = ['击杀!', 'DOUBLE!', 'OP OP OP!', 'RAMPAGE!', 'UNSTOPPABLE!'];
            const ks = s.kills >= 6 ? 'BOOYAH 大神 ×' + s.kills : (KS[s.kills - 1] || '×' + s.kills);
            window.Juice.popup(ks, pr.sx, pr.sy - 26, { color: s.kills >= 3 ? '#ff6a3c' : '#ffd84a', size: 18 + s.kills * 3 });
          }
        } catch (_) {}
      } else {
        // bot-vs-bot / 环境击杀: 不计玩家击杀, 离玩家近才轻微震屏(避免视野外乱震), 飘个 ☠
        const pp = s.player;
        if (pp && Math.hypot(pp.wx - b.wx, pp.wy - b.wy) < 420) pushShake(s, 6);
        if ($flashFCT()) $flashFCT()(b.wx, b.wy, '☠', '#ff8a6b');
      }
      if ($particles()) {
        $particles()(s.particles, b.wx, b.wy, b.color, 32);
        $particles()(s.particles, b.wx, b.wy, '#ffd84a', 16);
      }
      // Screen-space spark burst for extra punch
      const Iso = $Iso();
      const proj = Iso.w2s(b.wx, b.wy);
      pushSpark(s, proj.sx, proj.sy, b.bandColor, 28);
      pushSpark(s, proj.sx, proj.sy, '#ffd84a', 18);
      const SFX = $SFX();
      if (SFX.death) SFX.death();
      if (source === 'p' && SFX.win && s.kills >= 3) {} // win sound fires in win check
      else if (source === 'p' && SFX.pickupRare) setTimeout(() => SFX.pickupRare && SFX.pickupRare(), 80);
      s.eliminated += 1;   // ④ 任何死法都算一次淘汰 → last-man-standing 判定基准
      // R2: 击杀 feed (FF 式) — 谁淘汰谁, 右上角滚动
      if (s.killFeed) {
        s.killFeed.unshift({ txt: source === 'p' ? '你淘汰了一名玩家' : '一名玩家被淘汰', col: source === 'p' ? '#ffd84a' : '#ff8a6b', t: 2.6 });
        if (s.killFeed.length > 5) s.killFeed.length = 5;
      }
      s.bots = s.bots.filter(x => x !== b);
    }
  }
  function hurtPlayer(s, dmg) {
    const p = s.player;
    if (p.iframeT > 0 || p.frozenT > 0) return;   // dodge i-frames / 📱 on the phone = safe
    p.hp -= dmg;
    p.flashT = 0.18;
    pushShake(s, 10);
    if ($flashFCT()) $flashFCT()(p.wx, p.wy, '-' + Math.round(dmg), '#ff4655');
    // juice: getting shot = chromatic aberration + red vignette pulse + trauma
    try { if (window.Juice) { window.Juice.chroma(48); window.Juice.vignettePulse(0.28); jTrauma(0.4); } } catch (_) {}   // R7: 中弹色差/暗角减弱→看得清
    const SFX = $SFX(); if (SFX.hit) SFX.hit();
    if (p.hp <= 0) {
      p.hp = 0;
      s.brActive = false;
      try { if (window.Juice) { window.Juice.flash('#ff4655', 120); jTrauma(0.7); } } catch (_) {}
      if (SFX.lose) SFX.lose();
      $finish(false, `#${s.bots.length + 1} / ${s.startPlayers || (s.bots.length + 1)} · ${s.kills} KILLS`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GIFT "ENHANCE" SPECTACLE — TikTok-gift-driven enhancements (Free Fire).
  // Each is an FF community meme, HUGE & loud on screen (built to be screenshot/
  // share-worthy), and STRONG-BUT-TIMED: a skilled player never needs them; a
  // struggling player gets a dramatic, funny second wind. A 3-gift pool means
  // every send looks different. This is the documented "Enhance" gift layer —
  // it embellishes a run, it never gates play.
  const BR_GIFTS = {
    tank:    { ico: '🚁', name: 'BOOYAH 装甲空投', tone: '#ffd24a', dur: 9, intro: 'crate',
      apply(s, p) { p.maxHp = Math.max(p.maxHp, 160); p.hp = p.maxHp; p.healKits = Math.max(p.healKits, 2);
        p.airdropMode = 'ff_tank'; p.airdropAmmo = Math.max(p.airdropAmmo, 22); p._giftGun = 'ff_tank'; } },
    eagle:   { ico: '🦅', name: '神鹰轰炸 · FALCO', tone: '#9ad8ff', dur: 7, intro: 'eagle',
      apply(s, p) { p.maxHp = Math.max(p.maxHp, 130); p.hp = p.maxHp; p.iframeT = Math.max(p.iframeT || 0, 1.4); } },
    shotgun: { ico: '🔫', name: '黄金 M1887', tone: '#ffcf3a', dur: 8, intro: 'crate',
      apply(s, p) { p.maxHp = Math.max(p.maxHp, 140); p.hp = p.maxHp;
        p.airdropMode = 'ff_shotgun'; p.airdropAmmo = Math.max(p.airdropAmmo, 18); p._giftGun = 'ff_shotgun'; } },
  };
  const BR_GIFT_KEYS = ['tank', 'eagle', 'shotgun'];

  function startGiftIntro(s, key, g) {
    const Iso = $Iso(); const pr = Iso.w2s(s.player.wx, s.player.wy);
    if (g.intro === 'eagle') s.giftFX = { type: 'eagle', tone: g.tone, t: 0, x: -90, y: $H() * 0.22, bombT: 0, bombs: [] };
    else s.giftFX = { type: 'crate', tone: g.tone, ico: g.ico, t: 0, sx: pr.sx, sy: pr.sy, burst: false };
  }

  function updateGiftFX(s, dt) {
    if (s.giftBoost) {                                   // active-gift timer + revert
      s.giftBoost.t -= dt; s.giftBoost.age += dt;
      if (s.giftBoost.t <= 0) {
        const p = s.player;
        if (p._giftGun && p.airdropMode === p._giftGun) { p.airdropAmmo = 0; p.airdropMode = 'strong'; }
        p._giftGun = null; s.giftBoost = null;
      }
    }
    const fx = s.giftFX; if (!fx) return;
    fx.t += dt;
    if (fx.type === 'crate') {
      if (!fx.burst && fx.t >= 0.62) {                   // crate slams down → bursts open
        fx.burst = true; pushShake(s, 14);
        if ($particles()) { $particles()(s.particles, s.player.wx, s.player.wy, fx.tone, 30); $particles()(s.particles, s.player.wx, s.player.wy, '#fff', 14); }
        try { if (window.Juice) { window.Juice.hitstop(0.06); jTrauma(0.5); window.Juice.flash(fx.tone, 90); } } catch (_) {}
        const SFX = $SFX(); if (SFX.pickupRare) SFX.pickupRare();
      }
      if (fx.t > 1.5) s.giftFX = null;
    } else if (fx.type === 'eagle') {                    // eagle crosses screen, carpet-bombs nearby bots
      const W = $W(); fx.x += dt * (W + 180) / 1.6; fx.bombT -= dt;
      if (fx.bombT <= 0 && fx.x > 40 && fx.x < W - 40) {
        fx.bombT = 0.16; const Iso = $Iso();
        let tgt = null, nd = 1e9;
        for (const b of s.bots) { const d = Math.hypot(b.wx - s.player.wx, b.wy - s.player.wy); if (d < 380 && d < nd) { nd = d; tgt = b; } }
        if (tgt) {
          const pr = Iso.w2s(tgt.wx, tgt.wy); fx.bombs.push({ sx: pr.sx, sy: pr.sy, t: 0 });
          for (const b of s.bots.slice()) if (Math.hypot(b.wx - tgt.wx, b.wy - tgt.wy) < 62) hurtBot(s, b, 34, 'p');
          if ($particles()) $particles()(s.particles, tgt.wx, tgt.wy, '#ff8a3a', 16);
          pushShake(s, 8); const SFX = $SFX(); if (SFX.rBlast) SFX.rBlast();
        }
      }
      for (const bm of fx.bombs) bm.t += dt;
      fx.bombs = fx.bombs.filter(b => b.t < 0.5);
      if (fx.x > W + 120 && fx.bombs.length === 0) s.giftFX = null;
    }
  }

  function drawGiftFX(c, s, theme, W, H) {
    const Iso = $Iso();
    if (s.giftBoost && s.player) {                       // aura ring + giant gun barrel
      const pr = Iso.w2s(s.player.wx, s.player.wy);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 140);
      c.save(); c.globalAlpha = 0.45 + 0.3 * pulse; c.strokeStyle = s.giftBoost.tone; c.lineWidth = 3;
      c.beginPath(); c.ellipse(pr.sx, pr.sy + 8, 26 + 4 * pulse, 13 + 2 * pulse, 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1; c.restore();
      const gun = s.giftBoost.key;
      if (gun === 'tank' || gun === 'shotgun') {
        const ang = s.player.aimAng || 0;
        c.save(); c.translate(pr.sx, pr.sy - 6); c.rotate(ang);
        if (gun === 'tank') { c.fillStyle = '#2c2616'; c.fillRect(0, -7, 46, 14); c.fillStyle = '#ffd24a'; c.fillRect(0, -5, 40, 10); c.fillStyle = '#8a6a1a'; c.fillRect(38, -9, 9, 18); }
        else { c.fillStyle = '#ffcf3a'; c.fillRect(0, -7, 34, 5); c.fillRect(0, 2, 34, 5); c.fillStyle = '#8a6a1a'; c.fillRect(30, -9, 7, 18); }
        c.restore();
      }
    }
    const fx = s.giftFX; if (!fx) return;
    if (fx.type === 'crate') {
      const drop = Math.min(1, fx.t / 0.62); const y = fx.sy - 230 * (1 - drop);
      c.save();
      if (!fx.burst) {
        c.fillStyle = fx.tone; c.beginPath(); c.arc(fx.sx, y - 28, 27, Math.PI, 0); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(fx.sx - 23, y - 28); c.lineTo(fx.sx - 10, y - 6); c.moveTo(fx.sx + 23, y - 28); c.lineTo(fx.sx + 10, y - 6); c.stroke();
        c.fillStyle = '#6b4a22'; c.fillRect(fx.sx - 15, y - 6, 30, 26);
        c.font = 'bold 17px sans-serif'; c.textAlign = 'center'; c.fillText(fx.ico, fx.sx, y + 13);
      } else {
        const r = (fx.t - 0.62) / 0.88; c.globalAlpha = Math.max(0, 1 - r); c.strokeStyle = fx.tone; c.lineWidth = 4;
        c.beginPath(); c.arc(fx.sx, fx.sy, 10 + r * 72, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
    } else if (fx.type === 'eagle') {
      c.save(); c.translate(fx.x, fx.y + 8 * Math.sin(fx.t * 6));
      const flap = Math.sin(performance.now() / 90) * 18;
      c.fillStyle = '#9ad8ff';
      c.beginPath(); c.moveTo(-4, 0); c.lineTo(-42, -10 - flap); c.lineTo(-10, 5); c.fill();
      c.beginPath(); c.moveTo(4, 0); c.lineTo(42, -10 - flap); c.lineTo(10, 5); c.fill();
      c.fillStyle = '#cfe8ff'; c.beginPath(); c.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(24, -2, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffb24a'; c.beginPath(); c.moveTo(30, -2); c.lineTo(41, 0); c.lineTo(30, 3); c.fill();
      c.restore();
      for (const bm of fx.bombs) {
        const r = bm.t / 0.5; c.save();
        c.globalAlpha = Math.max(0, 1 - r); c.fillStyle = '#ff8a3a'; c.beginPath(); c.arc(bm.sx, bm.sy, 6 + r * 42, 0, Math.PI * 2); c.fill();
        c.globalAlpha = Math.max(0, 0.8 - r); c.fillStyle = '#fff'; c.beginPath(); c.arc(bm.sx, bm.sy, 3 + r * 22, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    }
  }

  // ─── The Games.br module ────────────────────────────────────
  window.Games = window.Games || {};
  window.Games.br = {
    name: 'BR · FINAL CIRCLE',
    badge: 'BR',
    duration: 30,
    showMP: false,
    fxKey: 'br',
    pills: { weapon: true, kit: true },
    // Shooter controls: left floating joystick = move; right side = aim
    // (auto-aim + auto-fire fallback so you always shoot the nearest enemy).
    touchMode: 'shooter',
    // Per-game dead-zone override read by the engine (getMoveVec path). BR is a
    // twin-stick shooter that needs a snappy stick; the engine global (0.14,
    // shared with Roblox) made a small push do nothing ("便秘"). Roblox/GTA
    // don't set this → they keep 0.14, so this is zero-regression for them.
    joyDead: TUNING.joyDead,

    skills() {
      // q 冲刺 / w 回血 / (e slot = keyboard hold-ADS, no button) / r 翻滚闪避.
      // Dodge sits on R — a fresh key, no clash with the hold-E aim-down-sights.
      if (IS_EMBEDDED) {
        return [
          { key: 'q', ico: '⚡', label: '冲刺', color: 'cyan' },
          { key: 'w', ico: '➕', label: 'KIT', color: null   },
          { key: 'e', ico: '🧱', label: 'Gloo', color: null },
          { key: 'r', ico: '🌀', label: '翻滚', color: 'cyan' },
        ];
      }
      return [
        { key: 'q', ico: '⚡', label: '冲刺', color: 'cyan' },
        { key: 'w', ico: '➕', label: '回血', color: null   },
        { key: 'e', ico: '🧱', label: '速建墙', color: null },   // R3: FF 招牌 Gloo 速建掩体墙(取代无用的 ADS)
        { key: 'r', ico: '🌀', label: '翻滚', color: 'cyan' },
      ];
    },

    applyGiftBoost(boost) {
      const s = $state(); if (!s || !s.brActive || !s.player) return false;
      const p = s.player;
      // pick the gift: an explicit pool key, else rotate so repeat sends differ
      let key = BR_GIFTS[boost] ? boost : null;
      if (!key) { s._giftRot = (s._giftRot || 0); key = BR_GIFT_KEYS[s._giftRot % BR_GIFT_KEYS.length]; s._giftRot++; }
      const g = BR_GIFTS[key];
      g.apply(s, p);
      if (s.skills && s.skills.q) { s.skills.q._cd = 0; }   // refresh dash → the comeback feels instant
      s.giftBoost = { key, name: g.name, ico: g.ico, tone: g.tone, t: g.dur, age: 0 };
      startGiftIntro(s, key, g);
      // gift name shows ONCE, via the top DOM banner — no canvas popup of the same
      // text (that double-printed it and collided with the coach/start-hint).
      if ($showBanner()) $showBanner()(g.ico + ' ' + g.name, g.tone, 2.2);
      try { if (window.Juice) { window.Juice.flash(g.tone, 120); window.Juice.confetti($W()); jTrauma(0.45); } } catch (_) {}
      return true;
    },

    init() {
      attachInput();

      // Hide the global ENCORE brand wordmark — its position overlaps the
      // mode-badge area, causing visible text overlap during play.
      const brandEl = document.getElementById('brand');
      if (brandEl) brandEl.style.display = 'none';

      const Iso = $Iso();
      const cfg = (window.pendingConfig && window.pendingConfig.scenario) || {};
      const themeFromConfig = (window.pendingConfig && window.pendingConfig.theme) || null;

      // ── Theme palette ──────────────────────────────────────
      const picked = $pickTheme('br');
      // R3+ BR 自己选生物群系(忽略引擎只认 desert/forest 的 picked, 否则火焰山/冰川被覆盖回丛林)。
      // force_theme=X 固定一个(gate 用 forest → 确定性); 没 force 时每把随机一个 FF 梗地图。
      const BIOME_KEYS = ['forest', 'volcano', 'arctic', 'seabed', 'village'];
      const themeKey = (themeFromConfig && BIOMES[themeFromConfig]) ? themeFromConfig : BIOME_KEYS[(Math.random() * BIOME_KEYS.length) | 0];
      const baseTheme = (picked && picked.theme) || {
        sky:'#0a0d1a', sky2:'#1a1d28', ground:'#3a4b2a',
        accent:'#ffcd75', wall:'#8a7a5a',
      };
      const theme = expandTheme(themeKey, baseTheme);

      const badge = $modeBadge();
      if (badge) badge.textContent = this.badge + ' · ' + themeKey.toUpperCase();

      // ── Map dimensions (square arena, follow-camera) ───────
      const mapW = 28, mapH = 28;   // ③ 扩大地图给 10 人大乱斗留厮杀空间

      const fitForBr = () => {
        const targetTilesWide = 13;
        const sidePad = 18;
        const usableW = Math.max(200, $W() - 2 * sidePad);
        let TW = usableW / targetTilesWide;
        let TH = TW * 0.65;
        TW = Math.max(14, Math.min(46, TW));
        TH = Math.max(10, Math.min(32, TH));
        Iso.setTile(TW, TH, 40);
      };
      fitForBr();
      const ws = Iso.WS;

      // ── Build tile grid — per-biome terrain (forest=jungle, volcano=lava
      //    rivers, arctic=snow+frozen lake, seabed=sand+water, village=farm). ──
      const tiles = [];
      for (let j = 0; j < mapH; j++) {
        const row = [];
        for (let i = 0; i < mapW; i++) row.push(tileColorFor(theme, themeKey, i, j, mapW, mapH));
        tiles.push(row);
      }

      // ── Cover & scenery — all drawn dynamically (themed sprites, not grey
      //    cubes). Landmarks (trees/huts/rocks) are indestructible; crates &
      //    sandbags are destructible (坦克大战式: shoot them out to open lanes).
      //    Decor (bushes/grass/pebbles) is pure scenery, no collision. Layout
      //    keeps three lanes + an open centre drop-pad + a clear spawn bubble.
      const spawnI = Math.round(mapW / 2), spawnJ = mapH - 3;
      const blocks = [];   // nothing baked into the ground image now — tiles only

      // Indestructible landmarks (from the old anchor positions, re-skinned).
      const props = [];
      // ③ 经典吃鸡地标(坦克大战式方格布局, 28×28 居中 14): 货柜/瞭望塔/二层楼/载具残骸 + 丛林
      let _ci = 0;
      [ [6,6,'container'], [21,6,'container'], [6,21,'container'], [21,21,'container'],
        [14,4,'tower'],
        [4,14,'building'], [23,14,'building'],
        [9,10,'wreck'], [19,18,'wreck'],
        [10,19,'tree'], [18,9,'tree'], [8,12,'tree'], [20,16,'tree'],
        [12,9,'rock'], [16,19,'rock'],
      ].forEach(([i, j, kind]) => props.push({
        i, j, kind, x: i*ws, y: j*ws, w: ws, h: ws, wy: (j + 0.55) * ws, destructible: false,
        tint: kind === 'container' ? (_ci++ % 3) : 0,
      }));

      // Destructible crates / sandbags — structured cover at the lanes/chokepoints.
      const brickTiles = [
        [10,11],[11,11], [17,11],[18,11],     // 中央停机坪两侧 沙袋/木箱碉堡
        [10,17],[11,17], [17,17],[18,17],
        [13,6],[15,6],   [13,22],[15,22],      // 上下 lane
        [5,18],[6,18],   [22,10],[23,10],      // 侧翼
      ];
      const bricks = [];
      brickTiles.forEach(([i, j], idx) => {
        if (Math.abs(i - mapW/2) < 3 && Math.abs(j - mapH/2) < 3) return;
        if (Math.abs(i - spawnI) <= 2 && Math.abs(j - spawnJ) <= 2) return;
        if (props.some(b => b.i === i && b.j === j)) return;
        bricks.push({
          i, j, kind: (idx % 3 === 0) ? 'sandbag' : 'crate', type: 'brick', h3d: 14,
          color: theme.crateWood, hp: TUNING.coverHpBrick, maxHp: TUNING.coverHpBrick,
          destructible: true, destroyed: false,
          x: i*ws, y: j*ws, w: ws, h: ws, wy: (j + 0.5) * ws,
        });
      });
      // ③ 油桶(可破坏 + 击毁爆炸连锁) — 燃料堆放在货柜角落, 制造连环爆的 viral 名场面
      [ [7,7],[8,7], [20,7],[21,8], [7,20],[8,21], [20,20],[21,20] ].forEach(([i, j]) => {
        if (props.some(b => b.i === i && b.j === j)) return;
        bricks.push({
          i, j, kind: 'barrel', type: 'brick', h3d: 16, explosive: true,
          color: '#c23a2a', hp: 14, maxHp: 14, destructible: true, destroyed: false,
          x: i*ws, y: j*ws, w: ws, h: ws, wy: (j + 0.5) * ws,
        });
      });

      // Scenery decor — bushes / grass tufts / pebbles (deterministic scatter so
      // QA stays stable). No collision; just makes the jungle read as a jungle.
      const decor = [];
      const occupied = (i, j) => props.some(p => p.i===i && p.j===j) || bricks.some(b => b.i===i && b.j===j);
      for (let j = 2; j < mapH - 2; j++) {
        for (let i = 2; i < mapW - 2; i++) {
          if (Math.abs(i - mapW/2) < 3 && Math.abs(j - mapH/2) < 3) continue;
          if (Math.abs(i - spawnI) <= 1 && Math.abs(j - spawnJ) <= 1) continue;
          if (occupied(i, j)) continue;
          const hsh = (i*13 + j*29) % 41;
          let kind = null;
          if (hsh < 3) kind = 'bush';
          else if (hsh < 6) kind = 'grass';
          else if (hsh === 11) kind = 'pebble';
          else if (themeKey !== 'forest' && hsh < 9) kind = 'grass';     // R5: 非森林地图装饰密度 +1 档
          else if (themeKey !== 'forest' && (hsh === 19 || hsh === 27)) kind = 'pebble';
          if (kind) decor.push({ i, j, kind, x: i*ws, y: j*ws, wy: (j + 0.5) * ws });
        }
      }

      const bg = $bakeGround(tiles, blocks, mapW, mapH);

      // ── Cover rects (collision + LOS) = landmarks + live crates/sandbags ──
      const covers = [];
      props.forEach(p => covers.push({ x: p.x, y: p.y, w: p.w, h: p.h, destructible: false }));
      bricks.forEach(b => covers.push(b));   // each brick object IS its own cover rect (shared ref)

      // ── Player spawn (south edge of map) ───────────────────
      const player = {
        wx: mapW * ws / 2,
        wy: (mapH - 3) * ws,
        r: 11,
        hp: 100, maxHp: 100,
        speed: TUNING.moveSpeed,
        flashT: 0,
        spdBuff: 0,
        healKits: 2,
        fireCd: 0,
        aimAng: -Math.PI / 2,
        facing: 1,
        // Weapon system: gun + knife auto-swap
        gun:   { name: 'AR',     dmg: TUNING.gunDmg, fireRate: TUNING.gunFireRate, range: TUNING.gunRange, accuracy: TUNING.gunAccuracy, color: '#5af5e0' },
        knife: { name: 'KNIFE',  dmg: 55, fireRate: 0.45, range: 36,  accuracy: 0.00, color: '#e8eaf2' },
        usingKnife: false,
        // QA fix: the engine end-card (encore_prototype.html:3122) reads
        // `state.player.weapon.name` for the BR stats line, but BR uses
        // gun/knife — without this getter the VICTORY/DEFEAT card threw
        // "Cannot read properties of undefined (reading 'name')" on every
        // round end. Getter keeps it pointed at the active weapon. Lives in
        // br.js (our module) so we don't touch Polly's shared engine file.
        get weapon() { return this.usingKnife ? this.knife : this.gun; },
        adsT: 0,
        // Airdrop 凌凌漆 gun: rounds remaining (0 = normal AR) + the rolled mode.
        airdropAmmo: 0, airdropMode: rollWeird(BASE_WEIRD), baseGun: true, gunRollT: 7,   // R2: 开局就有怪枪 + 每 7s 自动换枪
        // Dodge-roll (R skill): active-burst timer, i-frame timer, locked world dir.
        dodgeT: 0, iframeT: 0, dodgeVX: 0, dodgeVY: 0,
        // Hit-marker: brief flash on the reticle when a player shot connects.
        hitMarkerT: 0,
        // 紧急来电: frozen-to-answer-the-phone timer (can't act, but can't be hurt).
        frozenT: 0,
        // HP regen idle timer (slow regen when not hit for 4s)
        idleT: 0,
      };

      // ── Bots: 9 个 AI 环绕生成 (+玩家 = 10 人大乱斗) ────────
      const N_BOTS = TUNING.botCount;
      const PERS = ['rusher', 'lurker', 'looter', 'pack'];
      const bots = [];
      for (let id = 0; id < N_BOTS; id++) {
        const ang = (id / N_BOTS) * Math.PI * 2 + Math.PI / 6;
        const rr = (5.8 + (id % 3) * 0.9) * ws;   // 半径微抖 = 有机散布, 不是死板一圈
        const cx = mapW * ws / 2 + Math.cos(ang) * rr;
        const cy = mapH * ws / 2 + Math.sin(ang) * rr;
        const b = makeBot(cx, cy, id, theme);
        b.personality = PERS[id % PERS.length];
        b.airdropMode = rollWeird(BOT_WEIRD);   // R2: 每个 bot 开局随机怪枪
        // ── ELITE "高手" tier: the last `eliteCount` bots play like real players —
        //    tougher, accurate, aggressive. The other 6 fall to skill; these 3 are
        //    the "差一点打不过" wall that nudges a gift. (gold band tell in drawBot)
        if (id >= N_BOTS - TUNING.eliteCount) {
          b.elite = true;
          b.maxHp = b.hp = Math.round(TUNING.botHp * TUNING.eliteHpMul);
          b.accuracy = TUNING.botAccuracy * TUNING.eliteAccMul;
          b.dmg = Math.round(TUNING.botDmg * TUNING.eliteDmgMul);
          b.speed = Math.round(TUNING.botSpeed * TUNING.eliteSpeedMul);
          b.fireMul = TUNING.eliteFireMul;
          b.airdropMode = 'strong';   // elites carry the piercing power-gun, not a comedy gun
        }
        bots.push(b);
      }

      // ── Zone (shrinks 14 → 3.5 tiles over 26s) ─────────────
      const zone = {
        cx: mapW * ws / 2,
        cy: mapH * ws / 2,
        r: TUNING.zoneStartR * ws,
        targetR: TUNING.zoneEndR * ws,
        t: 0,
      };

      // ── Airdrop power-gun (telegraphed drop at t=airdropSpawnT, map centre) ──
      const airdrop = {
        wx: zone.cx,
        wy: zone.cy,
        spawned: false,
        collected: false,
        spawnAt: TUNING.airdropSpawnT,
        bobT: 0,
        warned: false,   // pre-drop "inbound" alert fired
        dropT: 0,        // >0 = crate still parachuting in (descend animation)
        mode: AIRDROP_KEYS[(Math.random() * AIRDROP_KEYS.length) | 0],   // 凌凌漆 surprise
        count: 0,        // how many crates have dropped this match
      };

      const newState = {
        mapW, mapH, bg, tiles, blocks, bricks, covers, props, decor,
        theme, themeName: themeKey.toUpperCase(),
        themeKey,
        _fit: fitForBr,

        brActive: true,
        elapsed: 0,
        player,
        bots,
        bullets: [],
        particles: [],
        sparks: [],
        hazards: [],
        airdrop,
        zone,

        kills: 0,
        startPlayers: bots.length + 1,   // ④ 吃鸡总人数(含玩家) → end card 名次 #N / startPlayers
        eliminated: 0,                   // ④ 已淘汰的其他玩家数; == startPlayers-1 → 你 #1
        finalCircle: false,              // ⑤ 决赛圈高潮触发一次性标志
        killFeed: [],                    // R2: FF 式击杀 feed(谁淘汰谁)
        walls: [],                       // R3: FF 速建墙(临时掩体)
        hazardSpawnAcc: 0,
        hazardInterval: TUNING.crateHazardEvery,

        // Chaos-event state. evt/evtNextRoll naming lets the no-input invariant
        // gate disable events (it sets evt=null, evtNextRoll=9999).
        evt: null, evtNextRoll: TUNING.eventFirstAt, evtLog: [], waterGunT: 0, berserkT: 0, meleeT: 0,

        shakeT: 0, shakeMag: 0,

        // R7 onboarding coach marks: ~5s of in-play hints so a brand-new player
        // gets the core loop in 2-3s. Each hint clears once the player does it.
        coachT: 5.0, coachMoved: false, coachFired: false,

        skills: {
          q: { cd: 5.0, _cd: 0 },
          w: { cd: 0,   _cd: 0, ammoCheck: () => $state().player.healKits > 0 },
          e: { cd: 7,   _cd: 0 },
          r: { cd: TUNING.dodgeCooldown, _cd: 0 },
        },
      };

      $setState(newState);
    },

    castPress(k) {
      const s = $state(); if (!s || !s.brActive) return;
      const p = s.player;
      const S = s.skills[k]; if (!S) return;
      if (S._cd > 0) return;
      if (k === 'q') {
        S._cd = S.cd;
        p.spdBuff = 2.5;
        // 冲刺起手: 尾焰粒子 + 轻震 + 飘字, 让加速"看得见"(以前没反馈)
        if ($particles()) { $particles()(s.particles, p.wx, p.wy, '#5af5e0', 16); $particles()(s.particles, p.wx, p.wy, '#aef7ff', 10); }
        pushShake(s, 5);
        try { if (window.Juice) jTrauma(0.15); } catch (_) {}
        if ($flashFCT()) $flashFCT()(p.wx, p.wy, '冲刺!', '#5af5e0');
        const SFX = $SFX(); if (SFX.qDash) SFX.qDash();
      } else if (k === 'w') {
        if (p.healKits <= 0) return;
        p.healKits -= 1;
        p.hp = Math.min(p.maxHp, p.hp + 40);
        if ($particles()) $particles()(s.particles, p.wx, p.wy, '#90ff90', 14);
        if ($flashFCT()) $flashFCT()(p.wx, p.wy, '+40', '#90ff90');
        const SFX = $SFX(); if (SFX.pickup) SFX.pickup();
      } else if (k === 'e') {
        S._cd = S.cd;
        deployWall(s, p);   // R3: FF 招牌速建掩体墙
      } else if (k === 'r') {
        // Dodge-roll: short i-frame burst in the current move direction (or the
        // aim/facing direction when standing still). Weave through bullets, roll
        // out from under a falling crate — the "操作空间" skill. update() moves
        // the player during p.dodgeT and grants invincibility during p.iframeT.
        const Iso = $Iso();
        const mv = $moveVec();
        let ang;
        if (Math.hypot(mv.x, mv.y) > 0.1) ang = screenDirToWorldAng(Iso, Math.atan2(mv.y, mv.x));
        else if (p.aiming) ang = p.aimAng;
        else ang = p.facing > 0 ? 0 : Math.PI;
        p.dodgeVX = Math.cos(ang); p.dodgeVY = Math.sin(ang);
        p.dodgeT  = TUNING.dodgeDur;
        p.iframeT = TUNING.dodgeIFrames;
        S._cd = S.cd;
        // 翻滚起手: cyan 残影粒子 + 扬尘 + 极短 hitstop + 飘字 → "我躲了一下"肉眼可见
        if ($particles()) { $particles()(s.particles, p.wx, p.wy, '#9fefff', 16); $particles()(s.particles, p.wx, p.wy, '#cdbfa0', 12); }
        pushShake(s, 7);
        try { if (window.Juice) { window.Juice.hitstop(0.05); jTrauma(0.18); } } catch (_) {}
        if ($flashFCT()) $flashFCT()(p.wx, p.wy, '翻滚!', '#9fefff');
        const SFX = $SFX(); if (SFX.qDash) SFX.qDash();
      }
    },
    castRelease(k) {},

    update(dt) {
      const s = $state(); if (!s || !s.brActive) return;
      const Iso = $Iso();
      const p = s.player;
      const theme = s.theme;

      s.elapsed += dt;
      updateGiftFX(s, dt);    // GIFT "Enhance" spectacle timer + eagle bombing run + crate drop
      // ⑤ 决赛圈高潮: 最后阶段全员暴走 + 横幅, 把残局推成快节奏 last-man 收尾
      if (!s.finalCircle && s.elapsed >= 20 && s.bots.length > 1) {
        s.finalCircle = true;
        s.berserkT = Math.max(s.berserkT, 11);
        if ($showBanner()) $showBanner()('🔥 决赛圈 · 全员暴走!', '#ff5a3c', 2.0);
        pushShake(s, 14);
      }
      // R2: 底枪每 7s 自动换一把怪枪(没金箱强枪时) → 每次玩都不一样 + 中途变, "我操又变了"
      if (p.baseGun && p.airdropAmmo <= 0) {
        p.gunRollT -= dt;
        if (p.gunRollT <= 0) {
          p.airdropMode = rollWeird(BASE_WEIRD); p.gunRollT = 7;
          const lbl = (AIRDROP_MODES[p.airdropMode] || AIRDROP_MODES.strong).label;
          if ($showBanner()) $showBanner()('🎲 换枪 · ' + lbl + '!', '#b98cff', 1.3);
          if ($flashFCT()) $flashFCT()(p.wx, p.wy, lbl + '!', '#b98cff');
        }
      }
      if (s.killFeed && s.killFeed.length) { for (const k of s.killFeed) k.t -= dt; if (s.killFeed.some(k => k.t <= 0)) s.killFeed = s.killFeed.filter(k => k.t > 0); }
      if (s.walls && s.walls.length) { for (const w of s.walls) w.life -= dt; for (const w of s.walls) if ((w.life <= 0 || w.destroyed) && s.covers.includes(w)) s.covers = s.covers.filter(c => c !== w); s.walls = s.walls.filter(w => w.life > 0 && !w.destroyed); }
      Object.values(s.skills).forEach(sk => { if (sk._cd > 0) sk._cd = Math.max(0, sk._cd - dt); });

      // ── ADS (hold E for aim-down-sights) ────────────────────
      const sh = $skillHeld();
      const K = $keys();
      const ads = false;   // R3: 纯自动锁敌取消 ADS; e 键改为速建墙(不再 hold-to-aim)
      p.adsT = ads ? Math.min(1, p.adsT + dt*5) : Math.max(0, p.adsT - dt*5);
      const adsSlow = 0.4 + 0.6 * (1 - p.adsT);

      // ── Movement (left joystick / arrows) + dodge-roll burst ───────
      // Twin-stick contract: no input → no movement (the no-input invariant
      // gate checks this). Screen→world un-skew so pushing UP on the stick moves
      // the character UP on screen — the old code fed the raw screen vector into
      // world space, so "up" drifted diagonally (the "向上不灵") and the big
      // engine dead zone (0.14) ate small pushes (the "便秘"). BR now overrides
      // the dead zone to 0.06 and applies a mild low-end response curve.
      let mv = $moveVec();
      const mvMag = Math.hypot(mv.x, mv.y);
      const frozen = p.frozenT > 0;       // 📱 紧急来电: can't act (but can't be hurt)
      if (frozen) p.frozenT -= dt;
      const evtSpdMul = (s.berserkT > 0 ? 1.35 : 1) * (s.meleeT > 0 ? 1.2 : 1);

      let wvx = 0, wvy = 0, moveSpd;
      if (frozen) {
        moveSpd = 0;
      } else if (p.dodgeT > 0) {
        // Dodge-roll: fixed burst along the locked dodge direction (i-frames on).
        p.dodgeT -= dt;
        wvx = p.dodgeVX; wvy = p.dodgeVY;
        moveSpd = TUNING.dodgeDist / TUNING.dodgeDur;
        if (p.dodgeT <= 0) { if ($particles()) $particles()(s.particles, p.wx, p.wy, '#cdbfa0', 12); pushShake(s, 4); }   // 落地扬尘
      } else if (mvMag > 0.001) {
        const worldAng = screenDirToWorldAng(Iso, Math.atan2(mv.y, mv.x));
        const resp = Math.pow(Math.min(1, mvMag), TUNING.moveResponseExp);
        wvx = Math.cos(worldAng) * resp;
        wvy = Math.sin(worldAng) * resp;
        const sprinting = p.spdBuff > 0;
        const adsMul = sprinting ? 1 : adsSlow;   // 冲刺免疫瞄准减速 → 边打边推进(和翻滚区分)
        moveSpd = p.speed * adsMul * (sprinting ? TUNING.sprintMul : 1) * evtSpdMul;
      } else {
        moveSpd = 0;
      }
      if (p.iframeT > 0) p.iframeT -= dt;

      // Slide along cover (resolve each axis independently so a wall press
      // doesn't freeze you solid). Applies to both normal move and dodge burst.
      const tryMove = (vx, vy, spd) => {
        const tx = p.wx + vx * spd * dt;
        const ty = p.wy + vy * spd * dt;
        let rx = p.wx, ry = p.wy;
        // R3+: 玩家穿过自己的速建墙(根除粘墙卡死); 子弹/bot 仍被墙挡(掩体不变)。
        if (!s.covers.some(c => c.kind !== 'gloowall' && rectCircle(c, tx, p.wy, p.r))) rx = tx;
        if (!s.covers.some(c => c.kind !== 'gloowall' && rectCircle(c, rx, ty, p.r)))   ry = ty;
        return { rx, ry, moved: Math.abs(rx - p.wx) + Math.abs(ry - p.wy) };
      };
      let res = tryMove(wvx, wvy, moveSpd);
      // Unstick: boxed in by cover on both axes → steer perpendicular to slide out.
      const trying = (Math.abs(wvx) > 0.1 || Math.abs(wvy) > 0.1);
      if (trying && res.moved < 0.5) {
        const perp = tryMove(-wvy, wvx, moveSpd);
        const perp2 = perp.moved < 0.5 ? tryMove(wvy, -wvx, moveSpd) : null;
        res = (perp.moved >= 0.5) ? perp : (perp2 && perp2.moved >= 0.5 ? perp2 : res);
      }
      p.wx = Math.max(10, Math.min(s.mapW * Iso.WS - 10, res.rx));
      p.wy = Math.max(10, Math.min(s.mapH * Iso.WS - 10, res.ry));
      if (Math.abs(mv.x) > 0.1) p.facing = mv.x > 0 ? 1 : -1;
      if (mvMag > 0.1) p.moveScreenAng = Math.atan2(mv.y, mv.x);   // for sprint streaks
      p.movingNow = (moveSpd > 0 && res.moved > 0.5);

      // 冲刺撞人: 冲刺中贴脸 bot → 击退 50wu + 轻伤(进攻位移; 翻滚是防御闪避, 二者区分)
      if (p.spdBuff > 0 && p.movingNow) {
        for (const b of s.bots) {
          if ((b.shovedCd || 0) > 0) continue;
          const ddx = b.wx - p.wx, ddy = b.wy - p.wy, dd = Math.hypot(ddx, ddy);
          if (dd < p.r + b.r + 8) {
            const nx = dd > 0 ? ddx / dd : 1, ny = dd > 0 ? ddy / dd : 0;
            b.wx += nx * 50; b.wy += ny * 50;
            b.shovedCd = 0.5;
            hurtBot(s, b, 6, 'p');
            pushShake(s, 9);
            const pr = Iso.w2s(b.wx, b.wy); pushSpark(s, pr.sx, pr.sy, '#5af5e0', 12);
            if ($flashFCT()) $flashFCT()(b.wx, b.wy, '撞飞!', '#5af5e0');
            const SFX = $SFX(); if (SFX.hit) SFX.hit();
          }
        }
      }

      if (p.flashT > 0) p.flashT -= dt;
      if (p.spdBuff > 0) p.spdBuff -= dt;
      if (p.fireCd > 0) p.fireCd -= dt;

      // No passive HP regen — Free Fire / PUBG don't auto-heal you for standing
      // still. Recover only via the heal kit (W) or a gift. Keeps the tension real.

      // ── R3 纯自动锁敌(去掉拖动瞄准, 消除"两套瞄准"冲突) ──────────────────────
      // 按住右下角开火键(右侧触摸)/空格 = 开火; 枪永远自动打最近"可见"敌人, 玩家不用瞄准。
      // 没敌人时朝移动/朝向打。拖动不再影响瞄准(根除冲突)。
      const mouseW = $mouseWorld();
      const rightHeld = !!(window.aimActive && window.aimActive());   // 右侧按住 = 开火意图
      const spaceFire = K && K[' '];
      let nearestEnemy = null, nearestEnemyDist = Infinity;   // 最近(给小刀切换用)
      let lockTarget = null, lockDist = Infinity;             // 最近"可见且在射程"= 自动锁敌目标
      for (const b of s.bots) {
        const d = Math.hypot(b.wx - p.wx, b.wy - p.wy);
        if (d < nearestEnemyDist) { nearestEnemyDist = d; nearestEnemy = b; }
        if (d < p.gun.range && d < lockDist && !losBlocked(p.wx, p.wy, b.wx, b.wy, s.covers)) { lockDist = d; lockTarget = b; }
      }
      const firing = rightHeld || spaceFire || Input.holdFire;   // 只这几样 = 开火(没有拖动瞄准)
      if (lockTarget) {
        p.aimAng = Math.atan2(lockTarget.wy - p.wy, lockTarget.wx - p.wx);   // 自动锁最近可见敌人
      } else if (firing) {
        const mvv = $moveVec();   // 没敌人: 朝移动方向打, 站定则朝 facing
        if (Math.hypot(mvv.x, mvv.y) > 0.1) p.aimAng = screenDirToWorldAng(Iso, Math.atan2(mvv.y, mvv.x));
        else p.aimAng = p.facing > 0 ? 0 : Math.PI;
      } else if (mouseW) {
        p.aimAng = Math.atan2(mouseW.wy - p.wy, mouseW.wx - p.wx);   // 桌面悬停朝向(不开火)
      }
      p.aiming = firing || !!mouseW;
      p.lockTarget = (firing && lockTarget) ? lockTarget : null;   // 锁定红环画在它身上

      // R7 onboarding: fade the coach hints over ~5s; clear each once the player
      // does that action (moved / fired) so it teaches fast then gets out of the way.
      if (s.coachT > 0) {
        s.coachT -= dt;
        if (firing) s.coachFired = true;
        const _cmv = $moveVec(); if (Math.hypot(_cmv.x, _cmv.y) > 0.2) s.coachMoved = true;
      }

      // ── Knife auto-switch at close range to nearest visible bot ─
      const KNIFE_TRIG_R = Iso.WS * 1.6;
      if (s.meleeT > 0) {
        p.usingKnife = true;   // 🥊 拳击时刻: guns holstered, everyone brawls
      } else if (nearestEnemy && nearestEnemyDist < KNIFE_TRIG_R
          && !losBlocked(p.wx, p.wy, nearestEnemy.wx, nearestEnemy.wy, s.covers)) {
        if (!p.usingKnife) p.usingKnife = true;
      } else if (p.usingKnife && nearestEnemyDist > KNIFE_TRIG_R * 1.4) {
        p.usingKnife = false;
      }

      // ── Fire trigger: firing(按住右侧/拖摇杆/空格) 已含开火意图; tap-fire 也开火。
      //    锁敌交给上面的 lockTarget, 这里只决定"开不开火"。
      const wantsFire = firing || Input.tapFire;
      Input.tapFire = false;

      if (!frozen && p.fireCd <= 0 && wantsFire) {
        if (p.usingKnife) {
          // Melee swing — instant damage to nearest enemy in knife range.
          // 🥊 拳击时刻 buffs the blade (longer reach + harder hit + faster swing).
          const meleeBuff = s.meleeT > 0;
          const kRange = p.knife.range * (meleeBuff ? 1.9 : 1);
          if (nearestEnemy && nearestEnemyDist < kRange) {
            hurtBot(s, nearestEnemy, p.knife.dmg * (meleeBuff ? 1.5 : 1), 'p');
            pushSpark(s, ...Object.values(Iso.w2s(nearestEnemy.wx, nearestEnemy.wy)), theme.knifeBlade, 12);
            pushShake(s, 5);
            const SFX = $SFX(); if (SFX.wHit) SFX.wHit(); else if (SFX.hit) SFX.hit();
            p.fireCd = p.knife.fireRate / ((meleeBuff ? 1.5 : 1) * (s.berserkT > 0 ? 1.7 : 1));
          }
        } else {
          // Gun shot in the AIMED direction. When the airdrop power-gun is up
          // (p.airdropAmmo > 0) it fires a stronger, faster, piercing round that
          // also punches through destructible cover — and burns one round.
          const air = p.airdropAmmo > 0;
          const water = s.waterGunT > 0;   // watergun event: every gun is harmless
          const accuracy = p.gun.accuracy / (p.adsT > 0.5 ? 4 : 1.5);
          const angle = p.aimAng + (Math.random() - 0.5) * accuracy;
          const muzzleX = p.wx + Math.cos(angle) * 12;
          const muzzleY = p.wy + Math.sin(angle) * 12 - 4;
          if (water) {
            s.bullets.push({ wx: muzzleX, wy: muzzleY, vx: Math.cos(angle)*420, vy: Math.sin(angle)*420,
              life: 1.1, owner: 'p', dmg: 1, color: '#7fd4ff', mode: 'water', pierce: 0, piercesCover: false, coverDmg: 0 });
          } else {
            // R2: 永远开怪枪 — premium 金箱满威力, 底枪 0.6x。没有无聊 AR 了, 开局就搞怪。
            fireAirdrop(s, p, p.airdropMode, angle, muzzleX, muzzleY, 'p', undefined, air ? 1 : 0.6);
            if (air) p.airdropAmmo = Math.max(0, p.airdropAmmo - 1);
          }
          p.fireCd = (air ? TUNING.airdropFireRate : p.gun.fireRate) / ((p.adsT > 0.5 ? 1.5 : 1) * (s.berserkT > 0 ? 1.7 : 1));
          // Juice: muzzle flash + VISUAL-only recoil kick (p.muzzleT).
          try {
            const ms = Iso.w2s(muzzleX, muzzleY);
            pushSpark(s, ms.sx, ms.sy, air ? '#ffd84a' : '#fff3a0', air ? 9 : 6);
            p.muzzleT = 0.06; p.muzzleAng = angle;
          } catch (_) {}
          pushShake(s, air ? 3 : 2);
          const SFX = $SFX();
          if (air && SFX.shotLow) SFX.shotLow();
          else if (SFX.shot) SFX.shot();
        }
      }
      if (p.muzzleT > 0) p.muzzleT -= dt;
      if (p.hitMarkerT > 0) p.hitMarkerT -= dt;

      // ── Airdrop power-gun: telegraphed drop, grab to arm the strong gun ──
      const wp = s.airdrop;
      // Pre-drop "inbound" alert ~3s early — builds the anticipation peak.
      if (!wp.warned && !wp.spawned && s.elapsed >= wp.spawnAt - 3) {
        wp.warned = true;
        if ($showBanner()) $showBanner()('⚠ 空投盲盒来袭 · 冲过去抽怪枪', theme.weirdGold, 1.8);
        const SFX = $SFX(); if (SFX.zone) SFX.zone();
      }
      if (!wp.spawned && s.elapsed >= wp.spawnAt) {
        wp.spawned = true;
        wp.bobT = 0;
        wp.dropT = 1.0;   // crate parachutes in over ~1s before it can be grabbed
        if ($showBanner()) $showBanner()('✈ 空投降落!落地开盲盒', theme.weirdGold, 1.5);
        pushShake(s, 8);
        const SFX = $SFX(); if (SFX.pickupRare) SFX.pickupRare();
      }
      if (wp.dropT > 0) wp.dropT = Math.max(0, wp.dropT - dt);
      if (wp.spawned && !wp.collected) {
        wp.bobT += dt;
        if (wp.dropT <= 0 && Math.hypot(p.wx - wp.wx, p.wy - wp.wy) < 26) {
          wp.collected = true;
          const md = AIRDROP_MODES[wp.mode] || AIRDROP_MODES.strong;
          p.airdropMode = wp.mode;
          p.airdropAmmo = TUNING.airdropAmmo;
          // Peak moment: shockwave + flash + hit-stop + the rolled gun's name.
          if ($particles()) { $particles()(s.particles, wp.wx, wp.wy, md.color, 34); $particles()(s.particles, wp.wx, wp.wy, '#ffffff', 14); }
          const Iso2 = $Iso(); const ps2 = Iso2.w2s(wp.wx, wp.wy);
          pushSpark(s, ps2.sx, ps2.sy, md.color, 22);
          if ($showBanner()) $showBanner()('🎁 抽到「' + md.label + '」· ' + TUNING.airdropAmmo + ' 发', md.color, 1.7);
          pushShake(s, 16);
          try { if (window.Juice) { window.Juice.flash(md.color, 120); jTrauma(0.55); window.Juice.hitstop(0.07); if (window.Juice.popup) window.Juice.popup(md.label + '!', ps2.sx, ps2.sy - 30, { color: md.color, size: 26, dur: 1.2 }); } } catch (_) {}
          const SFX = $SFX(); if (SFX.pickupRare) SFX.pickupRare();
          // 多空投: re-arm the crate to drop again later — fresh random mode + spot.
          const a = Math.random() * Math.PI * 2, rr = s.zone.r * (0.2 + Math.random() * 0.45);
          wp.spawned = false; wp.collected = false; wp.warned = false; wp.dropT = 0;
          wp.spawnAt = s.elapsed + TUNING.airdropRespawn;
          wp.mode = AIRDROP_KEYS[(Math.random() * AIRDROP_KEYS.length) | 0];
          wp.wx = s.zone.cx + Math.cos(a) * rr; wp.wy = s.zone.cy + Math.sin(a) * rr;
        }
      }

      // ── Hazard scheduling (falling crates inside zone) ──────
      s.hazardSpawnAcc += dt;
      if (s.hazardSpawnAcc >= s.hazardInterval && s.hazards.length < 2) {
        spawnFallingCrate(s);
        s.hazardSpawnAcc = 0;
        s.hazardInterval = 6 + Math.random() * 2;
      }
      updateHazards(s, dt);

      // ── Chaos events (random, telegraphed, dodgeable, everyone-affected) ──
      updateEvents(s, dt);

      // ── Zone shrink + damage ────────────────────────────────
      s.zone.t += dt;
      const shrinkDur = TUNING.zoneShrinkS;
      const k = Math.min(1, s.zone.t / shrinkDur);
      s.zone.r = TUNING.zoneStartR * Iso.WS + (s.zone.targetR - TUNING.zoneStartR * Iso.WS) * k;
      const dzc = Math.hypot(p.wx - s.zone.cx, p.wy - s.zone.cy);
      if (dzc > s.zone.r) {
        const dmg = (5 + s.zone.t * 0.25) * dt;
        p.hp -= dmg;
        p.idleT = 0;
        if (Math.random() < 0.04) {
          const SFX = $SFX(); if (SFX.zone) SFX.zone();
        }
        if (p.hp <= 0) {
          p.hp = 0;
          s.brActive = false;
          const SFX = $SFX(); if (SFX.lose) SFX.lose();
          $finish(false, `#${s.bots.length + 1} / ${s.startPlayers || (s.bots.length + 1)} · 毒圈吞噬 · ${s.kills} KILLS`);
          return;
        }
      }

      // ── Bot AI tick ─────────────────────────────────────────
      for (const b of s.bots) botStep(b, dt, s);

      // ── Bullet step (straight-line; airdrop rounds pierce enemies + cover) ─
      for (const bl of s.bullets) {
        bl.wx += bl.vx * dt;
        bl.wy += bl.vy * dt;
        bl.life -= dt;
        if (bl.mode === 'boomerang') { bl._t = (bl._t || 0) + dt; if (!bl._back && bl._t > 0.55) { bl.vx = -bl.vx; bl.vy = -bl.vy; bl._back = true; } }   // ② 回旋镖: 飞出去再绕回
        if (bl.life <= 0) { if (bl.mode === 'nade') explodeNade(s, bl, theme); continue; }

        // Cover collision — bricks take damage; airdrop rounds punch through; the
        // bounce gun ricochets; the grenade gun detonates on contact.
        let blocked = false;
        for (const c of s.covers) {
          if (!pointInRect(c, bl.wx, bl.wy)) continue;
          // R8: FF gloo wall = HARD barrier. Stops EVERY bullet (even AP/piercing
          // weird guns) + takes damage. This is what makes it real cover (挡子弹).
          if (c.kind === 'gloowall') {
            if (bl.mode === 'nade') explodeNade(s, bl, theme);
            damageCover(s, c, bl.coverDmg || bl.dmg, theme);
            bl.life = 0; blocked = true;
            if ($particles()) $particles()(s.particles, bl.wx, bl.wy, '#7fd4ff', 6);
            break;
          }
          if (bl.mode === 'bounce' && (bl.bounces || 0) > 0) {
            const cxm = c.x + c.w/2, cym = c.y + c.h/2;
            if (Math.abs(bl.wx - cxm) > Math.abs(bl.wy - cym)) bl.vx = -bl.vx; else bl.vy = -bl.vy;
            bl.bounces--; bl.wx += bl.vx * dt * 1.6; bl.wy += bl.vy * dt * 1.6;
            damageCover(s, c, bl.coverDmg || bl.dmg, theme);
            if ($particles()) $particles()(s.particles, bl.wx, bl.wy, bl.color, 5);
            break;   // keep flying (don't die / don't continue to enemy check this tile)
          }
          if (bl.mode === 'nade') { explodeNade(s, bl, theme); bl.life = 0; blocked = true; break; }
          if (c.destructible) {
            damageCover(s, c, bl.coverDmg || bl.dmg, theme);
            if (!bl.piercesCover) { bl.life = 0; blocked = true; }
          } else {
            bl.life = 0; blocked = true;
            if ($particles()) $particles()(s.particles, bl.wx, bl.wy, '#aaa', 3);
          }
          break;
        }
        if (blocked || bl.life <= 0) continue;

        if (bl.owner === 'p') {
          for (const b of s.bots) {
            if (Math.hypot(b.wx - bl.wx, b.wy - bl.wy) < b.r + 4) {
              if (bl._hit && bl._hit.has(b)) continue;   // don't double-hit one bot
              if (bl.mode === 'nade') { explodeNade(s, bl, theme); bl.life = 0; break; }
              hurtBot(s, b, bl.dmg, 'p');
              if ($particles()) $particles()(s.particles, bl.wx, bl.wy, theme.weirdRed, 6);
              if (bl.onHit) applyGunOnHit(s, b, bl.onHit);   // ② 缩小/种树
              if (bl.air) maybeGag(s, b);                    // ② 命中随机搞笑层
              if (bl.pierce > 0) { bl.pierce--; (bl._hit || (bl._hit = new Set())).add(b); }
              else bl.life = 0;
              break;
            }
          }
        } else {
          // ④ bot 子弹打 玩家 OR 另一个 bot(真大乱斗交火)。用 ownerId 跳过射手自己。
          let hit = false;
          if (p.hp > 0 && Math.hypot(p.wx - bl.wx, p.wy - bl.wy) < p.r + 4) {
            hurtPlayer(s, bl.dmg); if (bl.onHit) applyGunOnPlayer(s, bl.onHit); hit = true;   // R13: bot 怪枪也对玩家生效(安全短 CC)
          } else {
            for (const b of s.bots) {
              if (b.id === bl.ownerId) continue;
              if (Math.hypot(b.wx - bl.wx, b.wy - bl.wy) < b.r + 4) {
                hurtBot(s, b, bl.dmg, 'b'); if (bl.onHit) applyGunOnHit(s, b, bl.onHit); hit = true; break;   // R2: bot 怪枪命中效果(缩小/种树)
              }
            }
          }
          if (hit) {
            bl.life = 0;
            if ($particles()) $particles()(s.particles, bl.wx, bl.wy, theme.weirdRed, 5);
          }
        }
      }
      s.bullets = s.bullets.filter(bl => bl.life > 0);

      // ── Particles + sparks + shake decay ────────────────────
      if (window.updateParticles) {
        s.particles = window.updateParticles(s.particles, dt);
      }
      updateSparks(s, dt);
      if (s.shakeT > 0) s.shakeT -= dt;
      // Decay magnitude too — the old code only decayed shakeT, so shakeMag
      // ratcheted up and held, producing the "全程狂震" constant jitter.
      if (s.shakeMag > 0) s.shakeMag = Math.max(0, s.shakeMag - dt * 26);

      // ── Camera follow (lerp toward player) ──────────────────
      const ctr = Iso.w2s(p.wx, p.wy);
      const targetCamX = Iso.camX + ($W() / 2 - ctr.sx);
      const targetCamY = Iso.camY + ($H() * 0.58 - ctr.sy);
      Iso.camX += (targetCamX - Iso.camX) * 0.16;
      Iso.camY += (targetCamY - Iso.camY) * 0.16;

      // ── 吃鸡 placement: 其他人全被淘汰 = #1 大吉大利 (last-man-standing) ──
      // 用 eliminated 计数(不是单纯 bots 空), gate 合成清空 bots 不会误判吃鸡。
      if (s.bots.length === 0 && s.eliminated >= s.startPlayers - 1) {
        s.brActive = false;
        const SFX = $SFX(); if (SFX.win) SFX.win();
        try { if (window.Juice) { window.Juice.confetti($W()); window.Juice.popup('BOOYAH! 🏆', $W()/2, $H()*0.4, { color:'#ffd84a', size: 30, dur: 1.5 }); window.Juice.hitstop(0.1); } } catch (_) {}
        $finish(true, `#1 / ${s.startPlayers} · BOOYAH · ${s.kills} KILLS`);
        return;
      }
      // 超时: BR 在引擎通用 "TIME UP" 前一帧自己收尾 → end card 显示名次。
      // 撑到决赛圈按存活数排名; finishGame 翻 gameOver 标志, 不会和引擎双触发。
      if (s.elapsed >= (this.duration - 0.12)) {
        const place = s.bots.length + 1;
        const won = place <= 3;
        s.brActive = false;
        const SFX = $SFX(); if (won && SFX.win) SFX.win(); else if (SFX.lose) SFX.lose();
        if (won) { try { if (window.Juice) window.Juice.popup('撑到决赛圈!', $W()/2, $H()*0.4, { color:'#ffd84a', size: 22, dur: 1.2 }); } catch (_) {} }
        $finish(won, `#${place} / ${s.startPlayers} · ${s.kills} KILLS`);
        return;
      }

      // ── HUD strings (override every frame to keep clean — applyScenarioOverrides
      //    appends scenario.description at startGame which makes the badge wrap) ─
      const modeBadgeEl = $modeBadge();
      if (modeBadgeEl) modeBadgeEl.textContent = this.badge + ' · ' + (s.themeName || '');
      const scoreEl = $scoreEl();
      if (scoreEl) scoreEl.textContent = `ALIVE ${s.bots.length + 1}/${s.startPlayers} · K ${s.kills}`;
      const pillWpn = document.getElementById('pill-weapon');
      if (pillWpn) {
        const air = p.airdropAmmo > 0;
        if (air) pillWpn.textContent = (AIRDROP_MODES[p.airdropMode] || AIRDROP_MODES.strong).label + ' · ' + p.airdropAmmo + '发';
        else { const w = p.usingKnife ? p.knife : p.gun; pillWpn.textContent = w.name + ' ×' + w.dmg; }
        pillWpn.classList.remove('hidden');
        pillWpn.className = 'pill weapon ' + (air ? 'legendary' : (p.usingKnife ? 'epic' : 'rare'));
      }
      const pillKit = document.getElementById('pill-kit');
      if (pillKit) {
        pillKit.textContent = 'KIT ' + p.healKits;
        pillKit.classList.remove('hidden');
      }
    },

    draw() {
      const s = $state(); if (!s) return;
      const c = $ctx(); if (!c) return;
      const Iso = $Iso();
      const W = $W(), H = $H();
      const theme = s.theme;
      const p = s.player;

      // Sky gradient
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, theme.sky);
      grad.addColorStop(1, theme.sky2);
      c.fillStyle = grad;
      c.fillRect(0, 0, W, H);

      // Screen shake offset
      let shakeOX = 0, shakeOY = 0;
      if (s.shakeT > 0 && s.shakeMag > 0) {
        shakeOX = (Math.random() - 0.5) * s.shakeMag;
        shakeOY = (Math.random() - 0.5) * s.shakeMag;
      }

      c.save();
      c.translate(shakeOX, shakeOY);

      // Baked ground (tiles + cover blocks)
      const bg = s.bg;
      c.drawImage(bg.canvas, bg.offX + Iso.camX, bg.offY + Iso.camY);

      // Zone overlay (dark outside the ellipse)
      drawZone(c, s, theme);

      // Hazard telegraphs (red shadow circles forecasting falling crates)
      for (const h of s.hazards) drawHazard(c, h, theme);

      // Airdrop crate (if dropped + not yet grabbed)
      const wp = s.airdrop;
      if (wp.spawned && !wp.collected) drawAirdrop(c, wp, theme);

      // Z-sorted scene: ground decor → landmarks → cover → actors → bullets, all
      // ordered by world-Y so trees/huts/crates occlude correctly. Themed sprites
      // (not grey cubes) so it reads as a jungle battlefield.
      if (s.decor) for (const d of s.decor) pushRender(d.wy - 2, () => drawDecor(c, d, theme));
      if (s.props) for (const pr of s.props) pushRender(pr.wy, () => drawCoverObj(c, pr, theme));
      for (const bk of s.bricks) if (!bk.destroyed) pushRender(bk.wy, () => drawCoverObj(c, bk, theme));
      if (s.walls) for (const wl of s.walls) if (!wl.destroyed) pushRender(wl.wy, () => drawGlooWall(c, wl, theme));   // R3: FF 速建墙
      for (const b of s.bots) pushRender(b.wy, () => drawBot(c, b, theme));
      pushRender(p.wy, () => drawPlayer(c, p, theme));
      for (const bl of s.bullets) pushRender(bl.wy + 100, () => drawBullet(c, bl, theme));
      flushRender();

      // Particles (engine-style)
      if (window.drawParticles) window.drawParticles(s.particles);

      // Screen sparks
      for (const sp of s.sparks) {
        c.globalAlpha = Math.max(0, Math.min(1, sp.life * 1.8));
        c.fillStyle = sp.color;
        c.fillRect(sp.sx - 2, sp.sy - 2, 4, 4);
      }
      c.globalAlpha = 1;

      // R4 biome atmosphere (embers / snow / bubbles+caustics / dust) — over the
      // world, under the aim reticle + lock ring so gameplay UI stays readable.
      drawAmbient(c, theme);

      // Manual-aim indicator — a dashed aim line + reticle from the player in
      // the AIMED world-direction so you can SEE where shots go (user: 瞄准没反馈).
      if (p.aiming || p.adsT > 0.05) {
        const D = 95 + p.adsT * 80;                       // world units ahead
        const ps = Iso.w2s(p.wx, p.wy);
        const pe = Iso.w2s(p.wx + Math.cos(p.aimAng) * D, p.wy + Math.sin(p.aimAng) * D);
        c.save();
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.setLineDash([5, 5]);
        c.beginPath(); c.moveTo(ps.sx, ps.sy - 6); c.lineTo(pe.sx, pe.sy - 6); c.stroke();
        c.setLineDash([]);
        c.strokeStyle = '#ffffff'; c.lineWidth = 2;
        c.beginPath(); c.arc(pe.sx, pe.sy - 6, 7, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#ff4655'; c.beginPath(); c.arc(pe.sx, pe.sy - 6, 2.2, 0, Math.PI * 2); c.fill();
        // Hit-marker — four corner ticks that pop + fade when a shot connects.
        if (p.hitMarkerT > 0) {
          const k = Math.max(0, p.hitMarkerT / 0.12);   // 1 → 0
          const r = 9 + (1 - k) * 7;
          c.strokeStyle = '#ff3b3b'; c.lineWidth = 2.5; c.globalAlpha = Math.min(1, k * 1.5);
          for (const a of [Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4]) {
            c.beginPath();
            c.moveTo(pe.sx + Math.cos(a)*r,     pe.sy - 6 + Math.sin(a)*r);
            c.lineTo(pe.sx + Math.cos(a)*(r+5), pe.sy - 6 + Math.sin(a)*(r+5));
            c.stroke();
          }
          c.globalAlpha = 1;
        }
        c.restore();
      }

      // R2: 自动锁定准星 — 在被锁的最近敌人身上画 FF 式红色锁定环 + 角标, 看清在打谁
      if (p.lockTarget && p.lockTarget.hp > 0) {
        const ls = Iso.w2s(p.lockTarget.wx, p.lockTarget.wy);
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 55);
        const r = 15 + (1 - pulse) * 4;
        c.save();
        c.strokeStyle = `rgba(255,70,85,${0.85 * pulse})`; c.lineWidth = 2.5;
        c.beginPath(); c.arc(ls.sx, ls.sy - 8, r, 0, Math.PI * 2); c.stroke();
        for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
          c.beginPath();
          c.moveTo(ls.sx + Math.cos(a) * r, ls.sy - 8 + Math.sin(a) * r);
          c.lineTo(ls.sx + Math.cos(a) * (r + 6), ls.sy - 8 + Math.sin(a) * (r + 6));
          c.stroke();
        }
        c.restore();
      }

      // Chaos-event telegraphs / blasts / lightning (world space)
      if (s.evt) drawEventStrikes(c, s, theme);

      // ADS reticle overlay (vignette + crosshair)
      if (p.adsT > 0.6) drawAdsReticle(c, s, theme);

      c.restore();

      // Event screen tints — quick read on which chaos beat is live.
      if (s.waterGunT > 0 || s.berserkT > 0 || s.meleeT > 0) {
        c.save();
        const tcol = s.berserkT > 0 ? '#ff5a3c' : (s.meleeT > 0 ? '#ffb24a' : '#3fb0ff');
        c.globalAlpha = 0.09 + 0.05 * Math.sin(performance.now() / 120);
        c.fillStyle = tcol; c.fillRect(0, 0, W, H);
        c.globalAlpha = 1; c.restore();
      }

      // GIFT "Enhance" spectacle (crate drop / eagle bombing run / giant gun + aura)
      drawGiftFX(c, s, theme, W, H);

      // Mini HUD (timer ring + zone radar + airdrop indicator)
      drawHUD(c, s, theme, W, H);
    },

    refit() {
      const s = $state(); if (!s || !s._fit) return;
      s._fit();
      s.bg = $bakeGround(s.tiles, s.blocks, s.mapW, s.mapH);
    },
  };

  // ─── Voxel entity drawers ───────────────────────────────────
  function drawPlayer(c, p, theme) {
    const Iso = $Iso();
    const { sx, sy } = Iso.w2s(p.wx, p.wy);
    // Dodge-roll after-image trail behind the burst direction (reads as a roll).
    if (p.dodgeT > 0) {
      // 大残影: 6 段渐隐拖影(更大更亮), 翻滚的"嗖"一下肉眼可见
      for (let k = 1; k <= 6; k++) {
        const tx = sx - p.dodgeVX * 13 * k, ty = sy - p.dodgeVY * 8 * k;
        c.globalAlpha = Math.max(0, 0.4 - k * 0.055);
        c.fillStyle = k % 2 ? '#9fefff' : '#d7f7ff';
        c.beginPath(); c.ellipse(tx, ty, 15 - k, 9 - k * 0.5, 0, 0, Math.PI*2); c.fill();
      }
      c.globalAlpha = 1;
    }
    if (p.spdBuff > 0) {
      // Sprint: ground glow + motion streaks trailing behind the move direction —
      // makes the speed boost actually FEEL fast (was: no feedback at all).
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 60);
      c.fillStyle = `rgba(90,245,224,${0.22 + pulse * 0.12})`;
      c.beginPath(); c.ellipse(sx, sy + 8, 24, 11, 0, 0, Math.PI*2); c.fill();
      if (p.movingNow) {
        const a = (p.moveScreenAng != null ? p.moveScreenAng : 0) + Math.PI;   // trail = opposite of travel
        c.strokeStyle = 'rgba(140,250,235,0.7)'; c.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const off = (k - 1.5) * 6;
          const ox = Math.cos(a + Math.PI/2) * off, oy = Math.sin(a + Math.PI/2) * off * 0.5;
          const len = 14 + (k % 2) * 8;
          c.globalAlpha = 0.6 - k * 0.08;
          c.beginPath();
          c.moveTo(sx + ox, sy - 6 + oy);
          c.lineTo(sx + ox + Math.cos(a) * len, sy - 6 + oy + Math.sin(a) * len * 0.5);
          c.stroke();
        }
        c.globalAlpha = 1;
      }
    }
    if (p.airdropAmmo > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 80);
      c.fillStyle = theme.weirdGold;
      c.globalAlpha = 0.18 + pulse * 0.22;
      c.beginPath();
      c.ellipse(sx, sy + 8, 26, 12, 0, 0, Math.PI*2);
      c.fill();
      c.globalAlpha = 1;
    }
    // I-frame 护盾环: 翻滚无敌帧期间画明显脉冲护盾环 → "我现在无敌/躲过了"一眼可见
    if (p.iframeT > 0) {
      const t = Math.max(0, Math.min(1, p.iframeT / TUNING.dodgeIFrames));   // 1→0
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 32);
      const grow = (1 - t);   // 环随无敌帧扩张 = 冲击波, "我躲了/无敌"一眼可见
      c.save();
      c.fillStyle = `rgba(120,230,255,${0.12 + 0.10 * pulse})`;
      c.beginPath(); c.ellipse(sx, sy - 4, 26 + grow * 14, 17 + grow * 8, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = `rgba(150,238,255,${0.7 + 0.3 * pulse})`;
      c.lineWidth = 3 + pulse * 2;
      c.beginPath(); c.ellipse(sx, sy - 4, 26 + grow * 14, 17 + grow * 8, 0, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${0.5 * t})`; c.lineWidth = 2;   // 起手白核闪
      c.beginPath(); c.ellipse(sx, sy - 4, 16, 10, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
    // I-frame highlight ring during the dodge (clear "I'm invincible right now")
    const body = p.iframeT > 0 ? '#cfe8ff' : (p.flashT > 0 ? '#ffffff' : theme.playerBody);
    drawVoxelMan(c, sx, sy, body, theme.playerHead, p.facing, p.iframeT > 0 ? '#cfe8ff' : theme.playerHelmet);
    if (p.frozenT > 0) drawPhone(c, sx, sy);

    // Weapon overlay (gun barrel or knife blade) toward aim direction
    const wcol = p.airdropAmmo > 0 ? ((AIRDROP_MODES[p.airdropMode] || AIRDROP_MODES.strong).color) : (p.usingKnife ? theme.knifeBlade : p.gun.color);
    const len  = p.usingKnife ? 8 : 12;
    const ang  = p.aimAng;
    const gx = sx + Math.cos(ang) * len;
    const gy = sy - 8 + Math.sin(ang) * len * 0.5;
    c.fillStyle = wcol;
    c.fillRect(Math.round(gx) - 3, Math.round(gy) - 2, 6, 4);

    // Aim line (subtle directional hint — helps passive viewer read intent)
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(sx, sy - 8);
    c.lineTo(sx + Math.cos(ang) * 38, sy - 8 + Math.sin(ang) * 38 * 0.5);
    c.stroke();
  }

  // R13: lean bot version of the gloo wall (cover toward its target; no player-side
  // shake/SFX so 9 bots walling doesn't turn into chaos). hp 90 = player can shoot it down.
  function botDeployWall(s, b, ang) {
    const Iso = $Iso(), ws = Iso.WS;
    const cx = b.wx + Math.cos(ang) * ws * 1.4, cy = b.wy + Math.sin(ang) * ws * 1.4;
    const vertAim = Math.abs(Math.sin(ang)) >= Math.abs(Math.cos(ang));
    const long = ws * 1.8, thick = ws * 0.5;
    const w = vertAim ? long : thick, h = vertAim ? thick : long;
    const wall = { x: cx - w / 2, y: cy - h / 2, w, h, wy: cy + h / 2, kind: 'gloowall', type: 'brick',
      destructible: true, destroyed: false, hp: 90, maxHp: 90, life: 5.5 };
    s.covers.push(wall); if (s.walls) s.walls.push(wall);
    if ($particles()) $particles()(s.particles, cx, cy, '#3fe0ff', 8);
  }

  // R3 FF 速建墙: 身前(瞄准方向)部署亮蓝掩体墙, 挡子弹/LOS, ~6s 或被打掉(FF 招牌 Gloo Wall)
  function deployWall(s, p) {
    const Iso = $Iso(), ws = Iso.WS;
    const ang = (p.aimAng != null) ? p.aimAng : (p.facing > 0 ? 0 : Math.PI);
    const cx = p.wx + Math.cos(ang) * ws * 1.45, cy = p.wy + Math.sin(ang) * ws * 1.45;   // 身前(不盖玩家=不卡)
    // R8: orient the wall PERPENDICULAR to aim so it blocks the lane you're facing
    // (real FF cover). Vertical aim → wide horizontal wall; horizontal aim → tall vertical wall.
    const vertAim = Math.abs(Math.sin(ang)) >= Math.abs(Math.cos(ang));
    const long = ws * 2.0, thick = ws * 0.5;
    const w = vertAim ? long : thick, h = vertAim ? thick : long;
    const wall = { x: cx - w / 2, y: cy - h / 2, w, h, wy: cy + h / 2, kind: 'gloowall', type: 'brick',
      destructible: true, destroyed: false, hp: 120, maxHp: 120, life: 6.5 };
    s.covers.push(wall); if (s.walls) s.walls.push(wall);
    pushShake(s, 6);
    if ($particles()) { $particles()(s.particles, cx, cy, '#3fe0ff', 18); $particles()(s.particles, cx, cy, '#bff5ff', 10); }
    if ($flashFCT()) $flashFCT()(cx, cy, '🧱速建墙!', '#3fe0ff');
    const SFX = $SFX(); if (SFX.qDash) SFX.qDash();
  }
  // R8: a single SOLID standing translucent-blue panel (FF gloo barrier) along the
  // wall's long axis — not 3 staggered cubes (that read as a staircase).
  function drawGlooWall(c, w, theme) {
    const Iso = $Iso();
    const horiz = w.w >= w.h;
    let ax, ay, bx, by;
    if (horiz) { ax = w.x;           ay = w.y + w.h / 2; bx = w.x + w.w;     by = w.y + w.h / 2; }
    else       { ax = w.x + w.w / 2; ay = w.y;           bx = w.x + w.w / 2; by = w.y + w.h; }
    const A = Iso.w2s(ax, ay), B = Iso.w2s(bx, by);
    const dmg = w.maxHp ? (1 - Math.max(0, w.hp) / w.maxHp) : 0;
    const H = 38 * (1 - dmg * 0.32);   // panel height (px); shrinks a bit as it's shot down
    c.save();
    if (w.life < 1.2 && Math.floor(performance.now() / 140) % 2 === 0) c.globalAlpha = 0.5;   // blink before it expires
    // main translucent panel
    c.fillStyle = 'rgba(60,200,250,0.40)';
    c.beginPath(); c.moveTo(A.sx, A.sy); c.lineTo(B.sx, B.sy); c.lineTo(B.sx, B.sy - H); c.lineTo(A.sx, A.sy - H); c.closePath(); c.fill();
    // brighter band near the base
    c.fillStyle = 'rgba(125,228,255,0.22)';
    c.beginPath(); c.moveTo(A.sx, A.sy); c.lineTo(B.sx, B.sy); c.lineTo(B.sx, B.sy - H * 0.42); c.lineTo(A.sx, A.sy - H * 0.42); c.closePath(); c.fill();
    // vertical energy ribs
    c.strokeStyle = 'rgba(165,240,255,0.42)'; c.lineWidth = 1;
    for (let t = 0.16; t < 1; t += 0.16) { const ex = A.sx + (B.sx - A.sx) * t, ey = A.sy + (B.sy - A.sy) * t; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex, ey - H); c.stroke(); }
    // bright top rim + base glow + end caps → reads as a solid barrier
    c.strokeStyle = 'rgba(212,248,255,0.95)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(A.sx, A.sy - H); c.lineTo(B.sx, B.sy - H); c.stroke();
    c.strokeStyle = 'rgba(70,210,255,0.85)'; c.lineWidth = 2;   c.beginPath(); c.moveTo(A.sx, A.sy); c.lineTo(B.sx, B.sy); c.stroke();
    c.fillStyle = 'rgba(205,246,255,0.85)';
    c.fillRect(Math.round(A.sx) - 1.5, Math.round(A.sy - H), 3, H); c.fillRect(Math.round(B.sx) - 1.5, Math.round(B.sy - H), 3, H);
    c.restore();
  }
  // R3 喜剧枪渲染: 摇摆小鸭 / 冰块(让"变成X"名副其实、看得见)
  function drawDuck(c, sx, sy) {
    const wob = Math.sin(performance.now() / 110) * 2;   // 摇摇摆摆
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(sx, sy + 4, 11, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe14a'; c.beginPath(); c.ellipse(sx + wob, sy - 4, 10, 8, 0, 0, Math.PI * 2); c.fill();   // 身体
    c.beginPath(); c.ellipse(sx + wob - 1, sy - 14, 6, 6, 0, 0, Math.PI * 2); c.fill();                         // 头
    c.fillStyle = '#ff8a2a'; c.beginPath(); c.moveTo(sx + wob + 4, sy - 14); c.lineTo(sx + wob + 11, sy - 12); c.lineTo(sx + wob + 4, sy - 11); c.closePath(); c.fill();   // 嘴
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(sx + wob + 1, sy - 15, 1.3, 0, Math.PI * 2); c.fill();        // 眼
    c.restore();
  }
  function drawIce(c, sx, sy) {
    c.save();
    c.fillStyle = 'rgba(150,225,255,0.42)'; c.fillRect(Math.round(sx - 12), Math.round(sy - 30), 24, 34);
    c.strokeStyle = 'rgba(220,245,255,0.85)'; c.lineWidth = 1.5; c.strokeRect(Math.round(sx - 12), Math.round(sy - 30), 24, 34);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx - 6, sy - 27); c.lineTo(sx - 1, sy + 1); c.stroke();   // 冰裂高光
    c.restore();
  }
  function drawBot(c, b, theme) {
    const Iso = $Iso();
    const { sx, sy } = Iso.w2s(b.wx, b.wy);
    // R13: dodge-roll i-frame tell — cyan after-glow + ring so you read "it juked".
    if (b.iframeT > 0) {
      const k = Math.max(0, Math.min(1, b.iframeT / 0.2));
      c.save();
      c.globalAlpha = 0.35 * k; c.fillStyle = '#9fefff';
      c.beginPath(); c.ellipse(sx, sy, 15, 9, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.6 * k; c.strokeStyle = '#bff5ff'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(sx, sy - 6, 13, 8, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
    if (b.elite) {                                            // 高手 tell — gold pulsing ring + a small crown
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200 + b.id);
      c.save();
      c.globalAlpha = 0.4 + 0.35 * pulse; c.strokeStyle = '#ffd24a'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(sx, sy + 2, 14 + 2 * pulse, 8, 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1; c.fillStyle = '#ffd24a';
      const hy = sy - 31;
      c.beginPath(); c.moveTo(sx - 6, hy); c.lineTo(sx - 6, hy - 5); c.lineTo(sx - 2, hy - 2);
      c.lineTo(sx, hy - 6); c.lineTo(sx + 2, hy - 2); c.lineTo(sx + 6, hy - 5); c.lineTo(sx + 6, hy); c.closePath(); c.fill();
      c.restore();
    }
    const hpBar = () => {
      const barW = 22;
      c.fillStyle = '#222'; c.fillRect(Math.round(sx - barW / 2), Math.round(sy - 34), barW, 3);
      c.fillStyle = '#ff4655'; c.fillRect(Math.round(sx - barW / 2), Math.round(sy - 34), barW * Math.max(0, b.hp / b.maxHp), 3);
    };
    if (b.treeT > 0) { drawTree(c, sx, sy + 2, theme); hpBar(); return; }   // 整个人变成一棵大树(名副其实)
    if (b.duckT > 0) { drawDuck(c, sx, sy); hpBar(); return; }              // 变成摇摆小鸭
    const bodyCol = b.hitFlash > 0 ? '#ffffff' : b.color;
    const lift = b.floatT > 0 ? (16 + Math.sin(performance.now() / 300 + b.id) * 4) : 0;   // 🎈 气球飘浮抬升
    if (lift) { c.save(); c.translate(0, -lift); }
    const shrunk = b.shrinkT > 0;
    if (shrunk) { c.save(); c.translate(sx, sy); c.scale(0.32, 0.32); c.translate(-sx, -sy); }   // 缩成小不点(0.32 更夸张)
    drawVoxelMan(c, sx, sy, bodyCol, '#ffa080', 0, (theme.botHelmet && theme.botHelmet[b.id % 3]) || '#7a2a1a');
    if (shrunk) c.restore();
    if (b.iceT > 0) drawIce(c, sx, sy);          // 冻成冰块
    if (b.frozenT > 0) drawPhone(c, sx, sy);
    c.fillStyle = b.bandColor; c.fillRect(Math.round(sx - 4), Math.round(sy - 28), 8, 2);   // squad band
    hpBar();
    const stateCol = b.state === 'DODGE' ? '#ffd84a' : b.state === 'FLEE' ? '#ff4655' : b.state === 'ENGAGE' ? '#5af5e0' : '#888';
    c.fillStyle = stateCol; c.fillRect(Math.round(sx - 1), Math.round(sy - 38), 2, 2);
    if (lift) {   // 🎈 pink balloon + string above the lifted body
      c.fillStyle = '#ff8ad0'; c.beginPath(); c.ellipse(sx, sy - 36, 8, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(sx - 2.5, sy - 39, 2.4, 3, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ff8ad0'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx, sy - 26); c.lineTo(sx, sy - 12); c.stroke();
      c.restore();
    }
  }

  function drawBullet(c, bl, theme) {
    const Iso = $Iso();
    const { sx, sy } = Iso.w2s(bl.wx, bl.wy, 8);
    const big = bl.big || 1;                              // GIFT shells render oversized
    // Bullet trail tail
    const tailAng = Math.atan2(bl.vy, bl.vx);
    const tailLen = (bl.mode === 'normal' ? 8 : 12) * big;
    c.strokeStyle = bl.color;
    c.lineWidth = 2 * big;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx - Math.cos(tailAng) * tailLen, sy - Math.sin(tailAng) * tailLen * 0.5);
    c.stroke();
    // Bullet core (big shells get a glow halo so they read as a tank round)
    if (big > 1.6) { c.globalAlpha = 0.4; c.fillStyle = bl.color; c.beginPath(); c.arc(sx, sy, 5 * big, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    c.fillStyle = big > 1 ? '#fff' : bl.color;
    const r = 2 * big; c.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  // ─── Per-biome ambient atmosphere (R4) ─────────────────────
  // Screen-space cosmetic layer: ember rise + ash / falling snow + cold vignette
  // / rising bubbles + caustics / warm dust. Pure draw (no game state) and fully
  // time-driven (performance.now), so the no-input invariant + gate are unaffected.
  function drawAmbient(c, theme) {
    const key = theme.key;
    const W = $W(), H = $H();
    const t = performance.now() / 1000;
    if (key === 'volcano') {
      const pulse = 0.10 + 0.05 * Math.sin(t * 1.5);                 // pulsing lava glow (bottom)
      const g = c.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, 'rgba(255,80,20,0)'); g.addColorStop(1, `rgba(255,70,20,${pulse})`);
      c.fillStyle = g; c.fillRect(0, H * 0.55, W, H * 0.45);
      for (let k = 0; k < 24; k++) {                                 // rising embers
        const sd = k * 53.7;
        const x = (Math.sin(sd) * 0.5 + 0.5) * W + Math.sin(t * 0.6 + sd) * 14;
        const y = H - ((t * 42 + sd * 30) % (H + 40));
        const a = 0.4 + 0.4 * Math.sin(t * 3 + sd);
        c.fillStyle = `rgba(255,${(150 + (sd * 7) % 80) | 0},50,${a})`;
        c.fillRect(x | 0, y | 0, 2, 2);
      }
      for (let k = 0; k < 14; k++) {                                 // drifting ash
        const sd = k * 91.3;
        const x = (Math.sin(sd * 1.3) * 0.5 + 0.5) * W + Math.sin(t * 0.4 + sd) * 22;
        const y = (t * 26 + sd * 40) % (H + 30);
        c.fillStyle = 'rgba(180,162,150,0.32)'; c.fillRect(x | 0, y | 0, 2, 2);
      }
    } else if (key === 'arctic') {
      const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.82);
      g.addColorStop(0, 'rgba(140,200,240,0)'); g.addColorStop(1, 'rgba(110,170,220,0.20)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);                       // cold vignette
      for (let k = 0; k < 56; k++) {                                 // falling snow (2 sizes)
        const sd = k * 37.1, big = k % 5 === 0;
        const x = (Math.sin(sd) * 0.5 + 0.5) * W + Math.sin(t * 0.8 + sd) * 16;
        const y = (t * (big ? 60 : 38) + sd * 50) % (H + 20);
        c.fillStyle = big ? 'rgba(255,255,255,0.92)' : 'rgba(236,246,252,0.72)';
        c.beginPath(); c.arc(x, y, big ? 2.4 : 1.4, 0, Math.PI * 2); c.fill();
      }
    } else if (key === 'seabed') {
      const g = c.createLinearGradient(0, 0, 0, H);                  // depth vignette
      g.addColorStop(0, 'rgba(10,60,90,0.30)'); g.addColorStop(0.5, 'rgba(10,40,70,0.04)'); g.addColorStop(1, 'rgba(5,25,45,0.32)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.save(); c.globalCompositeOperation = 'lighter';              // caustic light bands
      for (let k = 0; k < 5; k++) {
        const sd = k * 61.7;
        const x = ((t * 18 + sd * 90) % (W + 180)) - 90;
        c.fillStyle = `rgba(120,220,235,${0.05 + 0.03 * Math.sin(t * 1.2 + sd)})`;
        c.beginPath(); c.ellipse(x, H * 0.3 + Math.sin(t * 0.5 + sd) * 40, 70 + (k % 3) * 30, 18, -0.4, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      for (let k = 0; k < 26; k++) {                                 // rising bubbles
        const sd = k * 47.9;
        const x = (Math.sin(sd) * 0.5 + 0.5) * W + Math.sin(t * 1.1 + sd) * 10;
        const y = H - ((t * 44 + sd * 40) % (H + 30));
        c.strokeStyle = 'rgba(200,245,255,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.arc(x, y, 1.2 + (sd % 3), 0, Math.PI * 2); c.stroke();
      }
    } else if (key === 'village') {
      const g = c.createLinearGradient(0, 0, 0, H * 0.5);            // warm sun haze (top)
      g.addColorStop(0, 'rgba(255,235,180,0.16)'); g.addColorStop(1, 'rgba(255,235,180,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H * 0.5);
      for (let k = 0; k < 22; k++) {                                 // drifting dust motes
        const sd = k * 43.3;
        const x = (Math.sin(sd) * 0.5 + 0.5) * W + Math.sin(t * 0.3 + sd) * 30;
        const y = (Math.sin(sd * 2.1) * 0.5 + 0.5) * H + Math.sin(t * 0.5 + sd) * 16;
        c.fillStyle = `rgba(255,240,200,${0.16 + 0.12 * Math.sin(t + sd)})`; c.fillRect(x | 0, y | 0, 2, 2);
      }
    } else {                                                          // forest — sparse sun pollen
      for (let k = 0; k < 16; k++) {
        const sd = k * 57.2;
        const x = (Math.sin(sd) * 0.5 + 0.5) * W + Math.sin(t * 0.3 + sd) * 26;
        const y = (Math.sin(sd * 1.7) * 0.5 + 0.5) * H + Math.sin(t * 0.4 + sd) * 14;
        c.fillStyle = `rgba(255,250,200,${0.10 + 0.10 * Math.sin(t * 0.8 + sd)})`; c.fillRect(x | 0, y | 0, 2, 2);
      }
    }
  }

  function drawZone(c, s, theme) {
    const Iso = $Iso();
    const z = s.zone;
    const ctr = Iso.w2s(z.cx, z.cy);
    const rx = z.r * (Iso.TW / Iso.WS);
    const ry = z.r * (Iso.TH / Iso.WS);
    c.save();
    c.fillStyle = theme.zoneFill;
    c.fillRect(0, 0, $W(), $H());
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.ellipse(ctr.sx, ctr.sy, rx, ry, 0, 0, Math.PI*2);
    c.fill();
    c.restore();
    c.strokeStyle = theme.zoneRing;
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(ctr.sx, ctr.sy, rx, ry, 0, 0, Math.PI*2);
    c.stroke();
    // Target shrink ring (preview)
    c.strokeStyle = theme.zoneTarget;
    c.lineWidth = 1;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.ellipse(ctr.sx, ctr.sy, z.targetR * (Iso.TW/Iso.WS), z.targetR * (Iso.TH/Iso.WS), 0, 0, Math.PI*2);
    c.stroke();
    c.setLineDash([]);
  }

  function drawHazard(c, h, theme) {
    const Iso = $Iso();
    const ctr = Iso.w2s(h.wx, h.wy);
    if (!h.landed) {
      const t = h.tele;
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 90);
      const rx = 30 * (Iso.TW/Iso.WS), ry = 30 * (Iso.TH/Iso.WS);
      // Filled red danger zone
      c.fillStyle = 'rgba(255,50,50,0.30)';
      c.beginPath(); c.ellipse(ctr.sx, ctr.sy, rx, ry, 0, 0, Math.PI*2); c.fill();
      // Pulsing red ring outline (clear "move out of here")
      c.strokeStyle = `rgba(255,40,40,${0.6+pulse*0.4})`; c.lineWidth = 3;
      c.beginPath(); c.ellipse(ctr.sx, ctr.sy, rx, ry, 0, 0, Math.PI*2); c.stroke();
      // Shrinking inner ring shows impact countdown
      const k = Math.max(0, t / 2.0);
      c.strokeStyle = 'rgba(255,220,80,0.9)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(ctr.sx, ctr.sy, rx*k, ry*k, 0, 0, Math.PI*2); c.stroke();
      // Warning label + a clearly-falling crate above
      c.fillStyle = '#ff5555'; c.font = 'bold 11px monospace'; c.textAlign = 'center';
      c.fillText('⚠ 轰炸', ctr.sx, ctr.sy - ry - 6);
      const fall = ctr.sy - 70 * Math.max(0, t / 2.0);
      c.fillStyle = '#b8945a'; c.fillRect(ctr.sx - 7, fall - 7, 14, 14);
      c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(ctr.sx - 7, fall - 7, 14, 14);
      c.textAlign = 'left';
    } else if (h.flashT > 0) {
      c.fillStyle = '#ffd84a';
      c.globalAlpha = Math.max(0, h.flashT * 2);
      c.beginPath();
      c.ellipse(ctr.sx, ctr.sy, 30 * (Iso.TW/Iso.WS), 30 * (Iso.TH/Iso.WS), 0, 0, Math.PI*2);
      c.fill();
      c.globalAlpha = 1;
      // Crate ruin
      drawBlock(c, ctr.sx, ctr.sy - 6, 6, theme.crateBase);
    }
  }

  // ─── Themed scenery sprites (jungle battlefield) ────────────────
  function groundShadow(c, sx, sy, rx, ry) {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath(); c.ellipse(sx, sy + 4, rx, ry, 0, 0, Math.PI*2); c.fill();
  }
  function drawTree(c, sx, sy, theme) {
    groundShadow(c, sx, sy, 15, 7);
    c.fillStyle = theme.trunk; c.fillRect(Math.round(sx-3), Math.round(sy-16), 6, 20);
    const blobs = [[0,-44,14],[-11,-34,11],[11,-34,11],[-5,-28,10],[7,-26,10]];
    for (const [dx,dy,r] of blobs) { c.fillStyle = theme.canopyLo; c.beginPath(); c.ellipse(sx+dx, sy+dy+4, r, r*0.9, 0, 0, Math.PI*2); c.fill(); }
    for (const [dx,dy,r] of blobs) { c.fillStyle = theme.canopy;   c.beginPath(); c.ellipse(sx+dx, sy+dy,   r, r*0.9, 0, 0, Math.PI*2); c.fill(); }
    c.fillStyle = theme.canopyHi; c.beginPath(); c.ellipse(sx-6, sy-44, 8, 6, 0, 0, Math.PI*2); c.fill();
  }
  function drawHut(c, sx, sy, theme) {
    const Iso = $Iso(), TW = Iso.TW, TH = Iso.TH;
    groundShadow(c, sx, sy, TW*0.95, TH*0.85);
    drawBlock(c, sx, sy, 16, theme.hutWall);             // walls
    // pitched roof sitting on top of the 16-tall walls
    const ry = sy - 16;
    c.fillStyle = theme.hutRoof;
    c.beginPath(); c.moveTo(sx - TW - 2, ry + TH); c.lineTo(sx, ry - 9); c.lineTo(sx + TW + 2, ry + TH); c.lineTo(sx, ry + 2*TH); c.closePath(); c.fill();
    c.fillStyle = shade(theme.hutRoof, 0.18);
    c.beginPath(); c.moveTo(sx + TW + 2, ry + TH); c.lineTo(sx, ry - 9); c.lineTo(sx, ry + 2*TH); c.closePath(); c.fill();
    c.fillStyle = '#2a1c10'; c.fillRect(Math.round(sx-3), Math.round(sy-2), 6, 8);   // doorway
  }
  function drawRock(c, sx, sy, theme) {
    groundShadow(c, sx, sy, 14, 7);
    c.fillStyle = theme.rockLo; c.beginPath(); c.ellipse(sx, sy-4, 14, 11, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = theme.rock;   c.beginPath(); c.ellipse(sx-2, sy-7, 11, 8, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = shade(theme.rock, -0.0) === theme.rock ? '#b6b6ac' : '#b6b6ac'; c.beginPath(); c.ellipse(sx-4, sy-9, 4, 3, 0, 0, Math.PI*2); c.fill();
  }
  function drawCrate(c, sx, sy, theme, dmg) {
    const Iso = $Iso(), TW = Iso.TW, TH = Iso.TH;
    groundShadow(c, sx, sy, TW * 0.9, TH * 0.8);
    const h = Math.max(6, 16 * (1 - dmg * 0.45));
    const col = dmg > 0.4 ? mix(theme.crateWood, theme.crateLine, (dmg - 0.4) / 0.6) : theme.crateWood;
    drawBlock(c, sx, sy, h, col);
    const line = theme.crateLine || shade(col, 0.42);
    c.strokeStyle = line; c.lineWidth = 1.1;
    // inset LID rim on the top face (a recessed border = a crate lid, NOT a cross/X)
    const ix = TW * 0.42, iy = TH * 0.42;
    c.beginPath(); c.moveTo(sx, sy + iy); c.lineTo(sx + ix, sy + TH); c.lineTo(sx, sy + 2 * TH - iy); c.lineTo(sx - ix, sy + TH); c.closePath(); c.stroke();
    // horizontal wood slats on both visible faces (reads as a real wooden crate)
    for (let f = 0.34; f < 0.95; f += 0.33) { const yy = h * f; c.beginPath(); c.moveTo(sx, sy + 2 * TH + yy); c.lineTo(sx + TW, sy + TH + yy); c.stroke(); c.beginPath(); c.moveTo(sx - TW, sy + TH + yy); c.lineTo(sx, sy + 2 * TH + yy); c.stroke(); }
    // iron corner brackets (top + two front-bottom corners)
    c.fillStyle = 'rgba(58,40,24,0.8)';
    c.fillRect(Math.round(sx - 1.5), Math.round(sy - 1), 3, 3);
    c.fillRect(Math.round(sx + TW - 3), Math.round(sy + TH + h - 4), 3, 4);
    c.fillRect(Math.round(sx - TW), Math.round(sy + TH + h - 4), 3, 4);
    if (dmg > 0.35) { c.strokeStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.moveTo(sx - 4, sy + TH + 3); c.lineTo(sx + 3, sy + h * 0.7); c.stroke(); }
  }
  function drawSandbag(c, sx, sy, theme, dmg) {
    const Iso = $Iso(), TW = Iso.TW;
    groundShadow(c, sx, sy, TW*0.9, 7);
    const col = dmg > 0.4 ? mix(theme.sandbag, theme.sandbagLo, (dmg-0.4)/0.6) : theme.sandbag;
    const bag = (bx, by, w) => { c.fillStyle = theme.sandbagLo; c.beginPath(); c.ellipse(bx, by+1, w, w*0.62, 0, 0, Math.PI*2); c.fill(); c.fillStyle = col; c.beginPath(); c.ellipse(bx, by, w, w*0.6, 0, 0, Math.PI*2); c.fill(); };
    const k = 1 - dmg * 0.5;
    bag(sx-7, sy-2, 8*k); bag(sx+7, sy-2, 8*k); bag(sx, sy+1, 8*k);    // bottom row
    if (dmg < 0.6) { bag(sx-4, sy-11, 8*k); bag(sx+4, sy-11, 8*k); }   // top row (gone when badly hit)
  }
  // ③ 经典吃鸡地标 drawers ─────────────────────────────────────
  function drawContainer(c, sx, sy, theme, tintIdx) {
    const Iso = $Iso(), TW = Iso.TW, TH = Iso.TH;
    groundShadow(c, sx, sy, TW * 1.15, TH * 1.0);
    // vibrant shipping-container liveries per biome (no drab grey)
    const sets = {
      forest:  ['#3a7ca5', '#c4543a', '#d9a441'],
      volcano: ['#b5482e', '#7a3a22', '#c8702a'],
      arctic:  ['#3e9ec4', '#cf6a4a', '#d6c24a'],
      seabed:  ['#2e9a86', '#3a7ca5', '#caa44a'],
      village: ['#a06a38', '#7a8a44', '#b07a3a'],
    };
    const base = (sets[theme.key] || sets.forest)[(tintIdx || 0) % 3];
    const h = 22;
    drawBlock(c, sx, sy, h, base);
    // corrugated ribs running down the right (lit) face
    c.strokeStyle = shade(base, 0.32); c.lineWidth = 1;
    for (let u = 0.16; u < 1; u += 0.16) { const rx = sx + TW * u, ry = sy + 2 * TH - TH * u; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx, ry + h); c.stroke(); }
    // cargo doors split + handle bars on the left (shadow) face
    c.strokeStyle = shade(base, 0.5); c.lineWidth = 1.3;
    const mx = sx - TW * 0.5, my = sy + 2 * TH - TH * 0.5;
    c.beginPath(); c.moveTo(mx, my); c.lineTo(mx, my + h); c.stroke();
    // corner castings (dark blocks)
    c.fillStyle = 'rgba(18,18,20,0.5)';
    c.fillRect(Math.round(sx + TW - 4), Math.round(sy + TH), 4, 4);
    c.fillRect(Math.round(sx - TW), Math.round(sy + TH), 4, 4);
    c.fillRect(Math.round(sx - 2), Math.round(sy - 1), 4, 3);
    // painted ID stencil on the top face
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = 'bold 6px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('CN ' + (((tintIdx || 0) * 37 + 14) % 90 + 10), sx, sy + TH); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }
  function drawTower(c, sx, sy, theme) {
    groundShadow(c, sx, sy, 13, 7);
    // four legs + cross-braces (a real timber watchtower, not 2 sticks)
    c.strokeStyle = '#6b5a3a'; c.lineWidth = 2.5;
    for (const dx of [-7, 7]) { c.beginPath(); c.moveTo(sx + dx, sy + 4); c.lineTo(sx + dx * 0.45, sy - 30); c.stroke(); }
    c.strokeStyle = '#5a4a2e'; c.lineWidth = 1.4;   // X cross-brace between the legs
    c.beginPath(); c.moveTo(sx - 7, sy + 2); c.lineTo(sx + 3, sy - 16); c.moveTo(sx + 7, sy + 2); c.lineTo(sx - 3, sy - 16); c.stroke();
    c.fillStyle = '#7a6540'; c.fillRect(Math.round(sx - 12), Math.round(sy - 42), 24, 7);   // platform
    c.fillStyle = '#8a7550'; c.fillRect(Math.round(sx - 12), Math.round(sy - 43), 24, 1.5); // platform lit edge
    c.strokeStyle = '#8a7550'; c.lineWidth = 1.5; c.strokeRect(Math.round(sx - 12), Math.round(sy - 49), 24, 7);   // railing
    c.fillStyle = '#c2a878'; c.beginPath(); c.ellipse(sx + 6, sy - 49, 4, 2.4, 0, 0, Math.PI * 2); c.fill();        // a sandbag on the deck
    c.fillStyle = '#5a4628'; c.beginPath(); c.moveTo(sx - 13, sy - 49); c.lineTo(sx, sy - 61); c.lineTo(sx + 13, sy - 49); c.closePath(); c.fill();   // roof
    c.fillStyle = '#6e5836'; c.beginPath(); c.moveTo(sx, sy - 61); c.lineTo(sx + 13, sy - 49); c.lineTo(sx + 4, sy - 49); c.closePath(); c.fill();    // roof shaded slope
  }
  function drawBuilding(c, sx, sy, theme) {
    const Iso = $Iso(), TW = Iso.TW, TH = Iso.TH;
    groundShadow(c, sx, sy, TW * 1.2, TH * 1.05);
    // village 的 building 槽走 drawBarn(dispatch 里), 这里服务 forest/volcano/arctic/seabed。
    const wall = { volcano: '#6a4a3e', arctic: '#aebfcc', seabed: '#5a8a82' }[theme.key] || '#b0a890';
    const h = 34;
    drawBlock(c, sx, sy, h, wall);
    // window grid on the right (lit) face — a few windows glow warm = "occupied building"
    for (let row = 0; row < 3; row++) for (let u = 0.26; u < 1; u += 0.26) {
      const rx = sx + TW * u, ry = sy + 2 * TH - TH * u + 5 + row * 9;
      const lit = ((row * 3 + (u * 10 | 0)) % 4) === 0;
      c.fillStyle = lit ? 'rgba(255,214,130,0.9)' : 'rgba(28,34,42,0.85)';
      c.fillRect(Math.round(rx - 2), Math.round(ry), 4, 6);
    }
    // parapet roof rim + rooftop AC unit + antenna
    c.strokeStyle = tint(wall, 0.28); c.lineWidth = 2;
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + TW, sy + TH); c.lineTo(sx, sy + 2 * TH); c.lineTo(sx - TW, sy + TH); c.closePath(); c.stroke();
    c.fillStyle = shade(wall, 0.32); c.fillRect(Math.round(sx - 6), Math.round(sy - 1), 12, 5);
    c.fillStyle = 'rgba(120,120,128,0.9)'; c.fillRect(Math.round(sx + 6), Math.round(sy - 9), 1.5, 8);
    c.beginPath(); c.arc(sx + 6.7, sy - 9, 1.6, 0, Math.PI * 2); c.fill();
  }
  function drawWreck(c, sx, sy, theme) {
    groundShadow(c, sx, sy, 17, 8);
    c.fillStyle = '#4a4640'; c.beginPath(); c.ellipse(sx, sy - 3, 15, 8, 0, 0, Math.PI * 2); c.fill();   // 底盘
    c.fillStyle = '#5d5852'; c.fillRect(Math.round(sx - 9), Math.round(sy - 13), 18, 9);                  // 驾驶舱
    c.fillStyle = '#23201c'; c.beginPath(); c.ellipse(sx - 9, sy + 4, 4, 4, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(sx + 9, sy + 4, 4, 4, 0, 0, Math.PI * 2); c.fill();   // 轮子
    c.fillStyle = '#8a3a2a'; c.fillRect(Math.round(sx - 3), Math.round(sy - 17), 6, 4);                   // 锈
  }
  function drawBarrel(c, sx, sy, theme, dmg) {
    groundShadow(c, sx, sy, 8, 5);
    const col = dmg > 0.5 ? '#7a241a' : '#c23a2a';
    c.fillStyle = col; c.fillRect(Math.round(sx - 6), Math.round(sy - 16), 12, 18);
    c.fillStyle = shade(col, 0.26); c.fillRect(Math.round(sx + 2), Math.round(sy - 16), 4, 18);   // shadow side
    c.fillStyle = tint(col, 0.20);  c.fillRect(Math.round(sx - 6), Math.round(sy - 16), 2.5, 18); // lit edge
    c.fillStyle = '#e8a83a'; c.fillRect(Math.round(sx - 6), Math.round(sy - 12), 12, 2); c.fillRect(Math.round(sx - 6), Math.round(sy - 3), 12, 2);   // hazard rings
    c.fillStyle = '#1a1410'; for (const dx of [-3, 1]) c.fillRect(Math.round(sx + dx), Math.round(sy - 9), 2, 4);   // hazard mark
    c.fillStyle = tint(col, 0.32); c.beginPath(); c.ellipse(sx, sy - 16, 6, 2.4, 0, 0, Math.PI * 2); c.fill();      // lid
    c.fillStyle = '#2a1a14'; c.beginPath(); c.arc(sx - 2.5, sy - 16, 0.9, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(sx + 2.5, sy - 16, 0.9, 0, Math.PI * 2); c.fill();   // lid bolts
  }
  function drawPhone(c, sx, sy) {
    const yy = sy - 33 + Math.sin(performance.now() / 140) * 2;
    c.save();
    c.fillStyle = 'rgba(10,13,20,0.78)';
    c.beginPath(); c.ellipse(sx, yy, 11, 9, 0, 0, Math.PI*2); c.fill();
    c.font = '13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('📱', sx, yy);
    c.restore();
  }
  function drawBush(c, sx, sy, theme) {
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(sx, sy+3, 11, 5, 0, 0, Math.PI*2); c.fill();
    for (const [dx,dy,r] of [[-5,-2,7],[5,-2,7],[0,-6,8]]) { c.fillStyle = theme.bush; c.beginPath(); c.ellipse(sx+dx, sy+dy, r, r*0.8, 0, 0, Math.PI*2); c.fill(); }
    c.fillStyle = theme.bushHi; c.beginPath(); c.ellipse(sx-2, sy-7, 4, 3, 0, 0, Math.PI*2); c.fill();
  }
  function drawGrassTuft(c, sx, sy, theme) {
    c.strokeStyle = theme.canopyHi; c.lineWidth = 1.4;
    for (const dx of [-4,-1,2,5]) { c.beginPath(); c.moveTo(sx+dx, sy+3); c.lineTo(sx+dx + (dx>0?2:-2), sy-6); c.stroke(); }
  }
  function drawPebble(c, sx, sy, theme) {
    c.fillStyle = theme.rockLo; c.beginPath(); c.ellipse(sx-2, sy, 4, 3, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = theme.rock;   c.beginPath(); c.ellipse(sx+3, sy+1, 3, 2.4, 0, 0, Math.PI*2); c.fill();
  }

  // ─── Biome-signature landmark sprites (R4) ──────────────────
  // Same map slot / collision rect as forest's tree/rock/container/etc — only
  // the drawing differs per biome (dispatched in drawCoverObj by theme.key), so
  // forest (the gate) is untouched while each map reads unmistakably as its
  // FF-meme biome: 火焰山 枯树+熔岩石 · 冰川 雪松+冰柱 · 海底 珊瑚+海带 · 村庄 草垛+风车+谷仓。
  function drawDeadTree(c, sx, sy, theme) {                 // 火焰山: 焦黑枯树 + 余烬
    groundShadow(c, sx, sy, 12, 6);
    c.fillStyle = 'rgba(255,110,30,0.26)';
    c.beginPath(); c.ellipse(sx, sy + 2, 13, 6, 0, 0, Math.PI * 2); c.fill();   // ember glow at base
    c.strokeStyle = theme.trunk || '#241712'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - 2, sy - 34); c.stroke();
    c.lineWidth = 3;
    const br = [[-2,-22,-13,-32],[-1,-28,9,-36],[-2,-18,8,-24],[-3,-30,-10,-40]];
    for (const [x1,y1,x2,y2] of br) { c.beginPath(); c.moveTo(sx+x1, sy+y1); c.lineTo(sx+x2, sy+y2); c.stroke(); }
    c.fillStyle = theme.lavaHot || '#ffd23a';
    for (const [, , x2, y2] of br) { c.beginPath(); c.arc(sx+x2, sy+y2, 1.6, 0, Math.PI*2); c.fill(); }   // glowing tips
    c.lineCap = 'butt';
  }
  function drawLavaRock(c, sx, sy, theme) {                 // 火焰山: 发光熔岩裂石
    groundShadow(c, sx, sy, 15, 7);
    c.fillStyle = 'rgba(255,90,20,0.30)'; c.beginPath(); c.ellipse(sx, sy, 16, 8, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = theme.rockLo || '#332824'; c.beginPath(); c.ellipse(sx, sy-4, 14, 11, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = theme.rock || '#4a3e38';   c.beginPath(); c.ellipse(sx-2, sy-7, 11, 8, 0, 0, Math.PI*2); c.fill();
    c.strokeStyle = theme.lava || '#ff6a1f'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(sx-8, sy-2); c.lineTo(sx-2, sy-7); c.lineTo(sx+5, sy-3); c.stroke();
    c.beginPath(); c.moveTo(sx-3, sy-10); c.lineTo(sx+1, sy-5); c.stroke();
    c.fillStyle = theme.lavaHot || '#ffd23a'; c.beginPath(); c.arc(sx-2, sy-7, 1.7, 0, Math.PI*2); c.fill();
  }
  function drawSnowPine(c, sx, sy, theme) {                 // 冰川: 雪顶松
    groundShadow(c, sx, sy, 12, 6);
    c.fillStyle = theme.trunk || '#5a4a3c'; c.fillRect(Math.round(sx-2), Math.round(sy-8), 4, 10);
    const tiers = [[-16, 15, 18], [-28, 12, 14], [-40, 9, 11]];   // [baseY, halfW, h]
    for (const [by, hw, h] of tiers) {
      c.fillStyle = theme.canopyLo || '#274e38';
      c.beginPath(); c.moveTo(sx, sy+by-h); c.lineTo(sx+hw, sy+by); c.lineTo(sx-hw, sy+by); c.closePath(); c.fill();
      c.fillStyle = theme.canopy || '#356a4a';
      c.beginPath(); c.moveTo(sx-1, sy+by-h); c.lineTo(sx+hw-3, sy+by); c.lineTo(sx-hw, sy+by); c.closePath(); c.fill();
      c.fillStyle = theme.canopyHi || '#eaf5f9';
      c.beginPath(); c.moveTo(sx, sy+by-h); c.lineTo(sx+4, sy+by-h+5); c.lineTo(sx-4, sy+by-h+5); c.closePath(); c.fill();   // snow cap
    }
  }
  function drawIcePillar(c, sx, sy, theme) {                // 冰川: 冰晶柱
    groundShadow(c, sx, sy, 11, 6);
    const main = theme.icePillar || '#cdeeff', hi = theme.icePillarHi || '#ffffff';
    c.fillStyle = main;
    c.beginPath(); c.moveTo(sx, sy-34); c.lineTo(sx+9, sy-6); c.lineTo(sx, sy+2); c.lineTo(sx-9, sy-6); c.closePath(); c.fill();
    c.fillStyle = 'rgba(110,170,205,0.55)';   // shaded right facet
    c.beginPath(); c.moveTo(sx, sy-34); c.lineTo(sx+9, sy-6); c.lineTo(sx, sy+2); c.closePath(); c.fill();
    c.fillStyle = hi; c.fillRect(Math.round(sx-1), Math.round(sy-32), 2, 26);   // highlight edge
    c.fillStyle = main;
    c.beginPath(); c.moveTo(sx-9, sy-16); c.lineTo(sx-4, sy-2); c.lineTo(sx-13, sy-2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(sx+10, sy-12); c.lineTo(sx+14, sy-2); c.lineTo(sx+6, sy-2); c.closePath(); c.fill();
  }
  function drawCoral(c, sx, sy, theme) {                    // 海底: 珊瑚扇
    groundShadow(c, sx, sy, 13, 6);
    const cols = [theme.coral1 || '#ff8a6a', theme.coral2 || '#ffb24a', theme.coral3 || '#c87ad0'];
    const prongs = [[-9,-14],[-4,-22],[2,-25],[8,-18],[12,-9]];
    let k = 0;
    for (const [tx,ty] of prongs) {
      c.strokeStyle = cols[k % 3]; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx+tx*0.4, sy+ty*0.5, sx+tx, sy+ty); c.stroke();
      c.fillStyle = cols[k % 3]; c.beginPath(); c.arc(sx+tx, sy+ty, 2.4, 0, Math.PI*2); c.fill();
      k++;
    }
    c.lineCap = 'butt';
  }
  function drawKelp(c, sx, sy, theme) {                     // 海底: 摇摆海带
    const sway = Math.sin(performance.now()/700 + sx*0.05) * 4;
    groundShadow(c, sx, sy, 8, 4);
    c.strokeStyle = theme.canopyLo || '#147064'; c.lineWidth = 3.5; c.lineCap = 'round';
    for (const off of [-4, 2, 6]) {
      c.beginPath(); c.moveTo(sx+off, sy); c.quadraticCurveTo(sx+off+sway*0.5, sy-16, sx+off+sway, sy-34); c.stroke();
    }
    c.strokeStyle = theme.canopyHi || '#3ed0b0'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(sx+2, sy); c.quadraticCurveTo(sx+2+sway*0.5, sy-16, sx+2+sway, sy-32); c.stroke();
    c.lineCap = 'butt';
  }
  function drawHaystack(c, sx, sy, theme) {                 // 村庄: 金色草垛
    groundShadow(c, sx, sy, 14, 7);
    const hay = theme.hay || '#e8c44a', lo = theme.hayLo || '#c49c32';
    c.fillStyle = lo; c.beginPath(); c.ellipse(sx, sy-2, 14, 9, 0, 0, Math.PI*2); c.fill();
    c.fillStyle = hay; c.beginPath(); c.moveTo(sx-13, sy-1); c.quadraticCurveTo(sx, sy-30, sx+13, sy-1); c.closePath(); c.fill();
    c.strokeStyle = lo; c.lineWidth = 1.5;
    for (const yy of [-4, -11, -18]) { const w = 12*(1+yy/30); c.beginPath(); c.moveTo(sx-w, sy+yy); c.quadraticCurveTo(sx, sy+yy-3, sx+w, sy+yy); c.stroke(); }
    c.fillStyle = lo; c.fillRect(Math.round(sx-1), Math.round(sy-30), 2, 5);   // top tuft
  }
  function drawWindmill(c, sx, sy, theme) {                 // 村庄: 旋转风车(tower 槽)
    groundShadow(c, sx, sy, 11, 6);
    const wall = theme.hutWall || '#cab084';
    c.fillStyle = wall;
    c.beginPath(); c.moveTo(sx-9, sy+2); c.lineTo(sx-6, sy-38); c.lineTo(sx+6, sy-38); c.lineTo(sx+9, sy+2); c.closePath(); c.fill();
    c.fillStyle = shade(wall, 0.18);
    c.beginPath(); c.moveTo(sx+2, sy+2); c.lineTo(sx+4, sy-38); c.lineTo(sx+6, sy-38); c.lineTo(sx+9, sy+2); c.closePath(); c.fill();
    c.fillStyle = theme.hutRoof || '#a8442c';
    c.beginPath(); c.moveTo(sx-8, sy-37); c.lineTo(sx, sy-48); c.lineTo(sx+8, sy-37); c.closePath(); c.fill();   // conical cap
    const a = performance.now()/1100;
    c.save(); c.translate(sx, sy-34); c.rotate(a);
    c.strokeStyle = '#6a4a2a'; c.lineWidth = 2; c.fillStyle = 'rgba(245,238,210,0.92)';
    for (let k=0;k<4;k++){ c.rotate(Math.PI/2); c.fillRect(2, -2, 16, 5); c.strokeRect(2, -2, 16, 5); }   // sails
    c.restore();
  }
  function drawBarn(c, sx, sy, theme) {                     // 村庄: 红顶谷仓(building 槽)
    const Iso = $Iso(), TW = Iso.TW, TH = Iso.TH;
    groundShadow(c, sx, sy, TW*1.15, TH*1.0);
    const red = theme.hutRoof || '#a8442c';
    drawBlock(c, sx, sy, 26, red);
    const ry = sy - 26;
    c.fillStyle = shade(red, 0.3);
    c.beginPath(); c.moveTo(sx-TW-2, ry+TH); c.lineTo(sx, ry-10); c.lineTo(sx+TW+2, ry+TH); c.lineTo(sx, ry+2*TH); c.closePath(); c.fill();   // gambrel roof
    c.fillStyle = '#ece6d8'; c.fillRect(Math.round(sx-5), Math.round(sy-4), 10, 12);   // white door
    c.strokeStyle = red; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(sx-5, sy-4); c.lineTo(sx+5, sy+8); c.moveTo(sx+5, sy-4); c.lineTo(sx-5, sy+8); c.stroke();   // X trim
  }
  // Dispatcher for cover objects (landmarks + destructible crates/sandbags).
  // R10: real-object landmark sprites (replace placeholder boxes). An organic
  // BOULDER (rounded lobes, never a cube) + a pitched-roof HOUSE — silhouettes a
  // player reads instantly as "rock" / "house" in FF's world, per biome.
  function drawBoulder(c, sx, sy, theme) {
    groundShadow(c, sx, sy, 21, 9);
    const key = theme.key;
    const base = theme.rock || '#8a8a80', lo = theme.rockLo || '#6b6b62';
    c.fillStyle = lo; c.beginPath(); c.ellipse(sx - 9, sy - 5, 12, 10, 0, 0, Math.PI * 2); c.fill();   // back-left lobe
    c.beginPath(); c.ellipse(sx + 11, sy - 3, 11, 9, 0, 0, Math.PI * 2); c.fill();                       // back-right lobe
    c.fillStyle = base; c.beginPath(); c.ellipse(sx, sy - 15, 16, 14, 0, 0, Math.PI * 2); c.fill();       // main mass
    c.fillStyle = tint(base, 0.22); c.beginPath(); c.ellipse(sx - 4, sy - 21, 9, 6, -0.3, 0, Math.PI * 2); c.fill();   // lit top facet
    c.strokeStyle = shade(base, 0.36); c.lineWidth = 1.2;   // cracks
    c.beginPath(); c.moveTo(sx - 6, sy - 23); c.lineTo(sx - 2, sy - 13); c.lineTo(sx + 4, sy - 15); c.stroke();
    c.beginPath(); c.moveTo(sx + 6, sy - 21); c.lineTo(sx + 3, sy - 11); c.stroke();
    if (key === 'arctic') { c.fillStyle = 'rgba(245,250,255,0.9)'; c.beginPath(); c.ellipse(sx - 3, sy - 22, 11, 6, -0.2, 0, Math.PI); c.fill(); }   // snow cap
    else if (key === 'volcano') { c.strokeStyle = '#ff7a2a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(sx - 5, sy - 18); c.lineTo(sx + 2, sy - 12); c.stroke(); }   // lava vein
    else if (key === 'seabed') { c.fillStyle = '#ffb24a'; c.beginPath(); c.arc(sx + 5, sy - 18, 2, 0, Math.PI * 2); c.fill(); c.fillStyle = '#c87ad0'; c.beginPath(); c.arc(sx - 7, sy - 10, 1.6, 0, Math.PI * 2); c.fill(); }   // barnacles/coral
    c.strokeStyle = 'rgba(0,0,0,0.20)'; c.lineWidth = 1; c.beginPath(); c.ellipse(sx, sy - 15, 16, 14, 0, 0, Math.PI * 2); c.stroke();
  }
  function drawHouse(c, sx, sy, theme) {
    const Iso = $Iso(), TW = Iso.TW, TH = Iso.TH;
    groundShadow(c, sx, sy, TW * 1.15, TH * 1.0);
    const P = ({
      forest:  { wall: '#bca884', roof: '#7a4a2c', door: '#583718' },
      village: { wall: '#e6d3aa', roof: '#b24632', door: '#7a4a28' },
      arctic:  { wall: '#c2cdd8', roof: '#eef4f8', door: '#5f6e7a' },
      volcano: { wall: '#5a4a42', roof: '#34261e', door: '#211610' },
      seabed:  { wall: '#6f8f86', roof: '#46645d', door: '#2c4640' },
    })[theme.key] || { wall: '#bca884', roof: '#7a4a2c', door: '#583718' };
    const wallH = 19;
    drawBlock(c, sx, sy, wallH, P.wall);
    const ry = sy - wallH;
    // big overhanging gable roof — the silhouette that instantly reads "house"
    c.fillStyle = P.roof;
    c.beginPath(); c.moveTo(sx - TW - 3, ry + TH); c.lineTo(sx, ry - 14); c.lineTo(sx + TW + 3, ry + TH); c.lineTo(sx, ry + 2 * TH); c.closePath(); c.fill();
    c.fillStyle = shade(P.roof, 0.20);   // right slope (shadow)
    c.beginPath(); c.moveTo(sx + TW + 3, ry + TH); c.lineTo(sx, ry - 14); c.lineTo(sx, ry + 2 * TH); c.closePath(); c.fill();
    c.strokeStyle = tint(P.roof, 0.28); c.lineWidth = 1.5;   // ridge + eave highlight
    c.beginPath(); c.moveTo(sx - TW - 3, ry + TH); c.lineTo(sx, ry - 14); c.stroke();
    // door + warm window + chimney
    c.fillStyle = P.door; c.fillRect(Math.round(sx - 3), Math.round(sy - 1), 6, 9);
    c.fillStyle = theme.key === 'seabed' || theme.key === 'volcano' ? 'rgba(20,20,24,0.6)' : 'rgba(255,214,130,0.9)';
    c.fillRect(Math.round(sx + TW * 0.4), Math.round(sy + TH * 0.45), 4, 5);
    c.fillStyle = shade(P.wall, 0.34); c.fillRect(Math.round(sx + 7), Math.round(ry - 9), 4, 9);   // chimney
  }

  // R12: biome-NATIVE destructible cover. A wooden crate/barrel is a placeholder
  // trope — a real snowfield has ice blocks & snow banks, a lava field obsidian,
  // a jungle fallen logs, a reef coral-rock. These read as "what's actually here".
  function drawLog(c, sx, sy, theme, dmg) {           // forest: fallen mossy log
    const Iso = $Iso(), TW = Iso.TW;
    groundShadow(c, sx, sy, TW * 0.95, 6);
    const k = 1 - dmg * 0.32, len = 19 * k, rad = 7 * k;
    c.fillStyle = '#4a3218'; c.beginPath(); c.ellipse(sx, sy - rad + 2, len, rad, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6a4a2c'; c.beginPath(); c.ellipse(sx, sy - rad, len, rad, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7d5a36'; c.beginPath(); c.ellipse(sx - 2, sy - rad - 2, len * 0.84, rad * 0.5, 0, 0, Math.PI * 2); c.fill();   // top light
    c.fillStyle = '#c49a5e'; c.beginPath(); c.ellipse(sx + len, sy - rad, rad * 0.55, rad, 0, 0, Math.PI * 2); c.fill();          // cut end
    c.strokeStyle = '#8a6a40'; c.lineWidth = 1; for (let r = 0.4; r < 1; r += 0.32) { c.beginPath(); c.ellipse(sx + len, sy - rad, rad * 0.55 * r, rad * r, 0, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = '#4a3218'; for (let dx = -len * 0.6; dx < len * 0.6; dx += 6) { c.beginPath(); c.moveTo(sx + dx, sy - rad * 1.6); c.lineTo(sx + dx, sy - rad * 0.4); c.stroke(); }   // bark
    c.fillStyle = 'rgba(92,150,60,0.65)'; c.beginPath(); c.ellipse(sx - 5, sy - rad - 3, 5, 2.4, 0, 0, Math.PI * 2); c.fill();    // moss
  }
  function drawIceBlock(c, sx, sy, theme, dmg) {      // arctic: translucent ice block
    const Iso = $Iso(), TW = Iso.TW, TH = Iso.TH;
    groundShadow(c, sx, sy, TW * 0.78, TH * 0.7);
    const h = Math.max(8, 18 * (1 - dmg * 0.4));
    drawBlock(c, sx, sy, h, '#bfe6f5');
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.moveTo(sx, sy + 2); c.lineTo(sx + TW * 0.5, sy + TH); c.lineTo(sx, sy + 2 * TH - 2); c.lineTo(sx - TW * 0.5, sy + TH); c.closePath(); c.fill();   // top sheen
    c.strokeStyle = 'rgba(120,180,210,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx - 4, sy + TH + 2); c.lineTo(sx + 2, sy + 2 * TH + h * 0.5); c.stroke();   // inner crack
    c.strokeStyle = 'rgba(236,250,255,0.85)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(sx - TW, sy + TH); c.lineTo(sx, sy); c.lineTo(sx + TW, sy + TH); c.stroke();   // frosty top rim
  }
  function drawSnowMound(c, sx, sy, theme, dmg) {     // arctic: packed snow bank
    groundShadow(c, sx, sy, 16, 7);
    const k = 1 - dmg * 0.4;
    c.fillStyle = '#d6e4ee'; c.beginPath(); c.ellipse(sx, sy - 2, 16 * k, 9 * k, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f2f8fc'; c.beginPath(); c.ellipse(sx - 2, sy - 6 * k, 12 * k, 7 * k, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(sx - 4, sy - 9 * k, 6 * k, 3 * k, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.fillRect(Math.round(sx + 3), Math.round(sy - 7), 1, 1); c.fillRect(Math.round(sx - 6), Math.round(sy - 3), 1, 1);
  }
  function drawObsidian(c, sx, sy, theme, dmg) {      // volcano: black glassy volcanic rock
    groundShadow(c, sx, sy, 15, 7);
    const k = 1 - dmg * 0.32;
    c.fillStyle = '#1a1118'; c.beginPath(); c.moveTo(sx, sy - 18 * k); c.lineTo(sx + 13 * k, sy - 6); c.lineTo(sx + 7 * k, sy + 4); c.lineTo(sx - 9 * k, sy + 3); c.lineTo(sx - 13 * k, sy - 7); c.closePath(); c.fill();
    c.fillStyle = '#3a2438'; c.beginPath(); c.moveTo(sx, sy - 18 * k); c.lineTo(sx + 13 * k, sy - 6); c.lineTo(sx + 2, sy - 4); c.closePath(); c.fill();   // facet
    c.fillStyle = 'rgba(160,128,170,0.5)'; c.beginPath(); c.moveTo(sx, sy - 18 * k); c.lineTo(sx + 4, sy - 9); c.lineTo(sx - 3, sy - 8); c.closePath(); c.fill();   // sheen
    c.strokeStyle = '#ff6a1f'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(sx - 5, sy - 2); c.lineTo(sx + 1, sy - 8); c.stroke();   // ember crack
    c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(sx + 1, sy - 8, 1.2, 0, Math.PI * 2); c.fill();
  }
  function drawRockChunk(c, sx, sy, theme, dmg) {     // generic low rock, biome-coloured (forest/volcano/seabed)
    groundShadow(c, sx, sy, 14, 6);
    const k = 1 - dmg * 0.32;
    const base = theme.rock || '#8a8a80', lo = theme.rockLo || '#6b6b62';
    c.fillStyle = lo; c.beginPath(); c.ellipse(sx, sy - 3, 13 * k, 9 * k, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = base; c.beginPath(); c.ellipse(sx - 2, sy - 6 * k, 10 * k, 7 * k, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = tint(base, 0.2); c.beginPath(); c.ellipse(sx - 4, sy - 8 * k, 5 * k, 3 * k, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = shade(base, 0.3); c.lineWidth = 1; c.beginPath(); c.moveTo(sx - 5, sy - 6); c.lineTo(sx, sy - 2); c.lineTo(sx + 5, sy - 5); c.stroke();
  }

  function drawCoverObj(c, o, theme) {
    const Iso = $Iso();
    const { sx, sy } = Iso.w2s(o.i * Iso.WS, o.j * Iso.WS);
    const dmg = o.maxHp ? (1 - Math.max(0, o.hp) / o.maxHp) : 0;
    const kind = o.kind || o.type || 'crate';
    // R4 biome remap (visual only — same map slot + collision rect as forest).
    const key = theme.key;
    // R12: destructible cover (crate/sandbag) → biome-NATIVE objects, not wooden crates.
    if (key === 'forest') { if (kind === 'crate') return drawLog(c, sx, sy, theme, dmg); if (kind === 'sandbag') return drawRockChunk(c, sx, sy, theme, dmg); }
    else if (key === 'volcano') { if (kind === 'tree') return drawDeadTree(c, sx, sy, theme); if (kind === 'rock') return drawLavaRock(c, sx, sy, theme); if (kind === 'crate') return drawObsidian(c, sx, sy, theme, dmg); if (kind === 'sandbag') return drawRockChunk(c, sx, sy, theme, dmg); }
    else if (key === 'arctic') { if (kind === 'tree') return drawSnowPine(c, sx, sy, theme); if (kind === 'rock') return drawIcePillar(c, sx, sy, theme); if (kind === 'crate') return drawIceBlock(c, sx, sy, theme, dmg); if (kind === 'sandbag') return drawSnowMound(c, sx, sy, theme, dmg); }
    else if (key === 'seabed') { if (kind === 'tree') return drawKelp(c, sx, sy, theme); if (kind === 'rock') return drawCoral(c, sx, sy, theme); if (kind === 'crate' || kind === 'sandbag') return drawRockChunk(c, sx, sy, theme, dmg); }
    else if (key === 'village') { if (kind === 'rock') return drawHaystack(c, sx, sy, theme); if (kind === 'tower') return drawWindmill(c, sx, sy, theme); if (kind === 'building') return drawBarn(c, sx, sy, theme); }
    if (kind === 'tree') drawTree(c, sx, sy, theme);
    else if (kind === 'hut') drawHut(c, sx, sy, theme);
    else if (kind === 'rock') drawRock(c, sx, sy, theme);
    else if (kind === 'container') { if ((o.tint || 0) % 2 === 1) drawHouse(c, sx, sy, theme); else drawBoulder(c, sx, sy, theme); }   // R10: real objects, not boxes
    else if (kind === 'tower') drawTower(c, sx, sy, theme);
    else if (kind === 'building') drawHouse(c, sx, sy, theme);   // R10: building slot = a real house (village→barn handled above)
    else if (kind === 'wreck') drawWreck(c, sx, sy, theme);
    else if (kind === 'barrel') drawBarrel(c, sx, sy, theme, dmg);
    else if (kind === 'sandbag') drawSandbag(c, sx, sy, theme, dmg);
    else drawCrate(c, sx, sy, theme, dmg);   // 'crate' / 'brick'
  }
  // ─── Biome-signature decor (R5) — small scatter with 心意 per map ──
  function drawCharRock(c, sx, sy) {        // 火焰山: 焦石 + 余光
    c.fillStyle = 'rgba(255,90,20,0.18)'; c.beginPath(); c.ellipse(sx, sy + 1, 8, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a1d18'; c.beginPath(); c.ellipse(sx, sy - 2, 6, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff6a1f'; c.fillRect(Math.round(sx - 3), Math.round(sy - 2), 2, 1); c.fillRect(Math.round(sx + 1), Math.round(sy - 3), 1, 2);
  }
  function drawEmberTuft(c, sx, sy) {       // 火焰山: 余烬丛(闪)
    const t = performance.now() / 300;
    for (const dx of [-3, 2, 0]) { const dy = dx === 0 ? -3 : (dx > 0 ? -1 : 0); c.fillStyle = `rgba(255,${140 + (dx + 5) * 12},40,${0.5 + 0.4 * Math.sin(t + dx)})`; c.fillRect(sx + dx, sy + dy, 2, 2); }
  }
  function drawSnowDrift(c, sx, sy) {       // 冰川: 雪堆
    c.fillStyle = 'rgba(180,205,225,0.5)'; c.beginPath(); c.ellipse(sx, sy + 2, 9, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f4fbff'; c.beginPath(); c.ellipse(sx - 1, sy - 1, 7, 4, 0, 0, Math.PI * 2); c.fill();
  }
  function drawIceShard(c, sx, sy) {        // 冰川: 小冰碴
    c.fillStyle = '#cdeeff'; c.beginPath(); c.moveTo(sx, sy - 9); c.lineTo(sx + 3, sy + 1); c.lineTo(sx - 3, sy + 1); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(Math.round(sx) - 0, sy - 8, 1, 7);
  }
  function drawShell(c, sx, sy) {           // 海底: 贝壳
    c.fillStyle = '#ffd9c2'; c.beginPath(); c.ellipse(sx, sy - 1, 6, 5, 0, Math.PI, 0); c.fill();
    c.strokeStyle = '#e0a890'; c.lineWidth = 1; for (const dx of [-3, 0, 3]) { c.beginPath(); c.moveTo(sx, sy - 1); c.lineTo(sx + dx, sy - 6); c.stroke(); }
  }
  function drawStarfish(c, sx, sy) {        // 海底: 海星
    c.save(); c.translate(sx, sy - 2); c.fillStyle = '#ff8a4a'; c.beginPath();
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 5; c.lineTo(Math.cos(a) * 6, Math.sin(a) * 4); const a2 = a + Math.PI / 5; c.lineTo(Math.cos(a2) * 2.4, Math.sin(a2) * 1.6); }
    c.closePath(); c.fill(); c.restore();
  }
  function drawSeaweedTuft(c, sx, sy, theme) {  // 海底: 小海草(摇)
    const sway = Math.sin(performance.now() / 500 + sx * 0.1) * 2;
    c.strokeStyle = theme.canopy || '#1f9a8a'; c.lineWidth = 1.6; c.lineCap = 'round';
    for (const dx of [-3, 0, 3]) { c.beginPath(); c.moveTo(sx + dx, sy + 2); c.quadraticCurveTo(sx + dx + sway, sy - 4, sx + dx + sway, sy - 9); c.stroke(); }
    c.lineCap = 'butt';
  }
  function drawFlowers(c, sx, sy) {         // 村庄: 花丛
    c.strokeStyle = '#4f9a3a'; c.lineWidth = 1; for (const dx of [-3, 3]) { c.beginPath(); c.moveTo(sx + dx, sy + 2); c.lineTo(sx + dx, sy - 4); c.stroke(); }
    const cols = ['#ff5a7a', '#ffd23a', '#ffffff']; let i = 0;
    for (const [dx, dy] of [[-3, -5], [3, -5], [0, -2]]) { c.fillStyle = cols[i++ % 3]; c.beginPath(); c.arc(sx + dx, sy + dy, 2.2, 0, Math.PI * 2); c.fill(); }
  }
  function drawPumpkin(c, sx, sy) {         // 村庄: 南瓜
    c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(sx, sy + 2, 6, 3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8852a'; c.beginPath(); c.ellipse(sx, sy - 2, 6, 5, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#c46a1a'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx - 3, sy - 5); c.lineTo(sx - 3, sy + 1); c.moveTo(sx + 3, sy - 5); c.lineTo(sx + 3, sy + 1); c.stroke();
    c.fillStyle = '#4f7a2a'; c.fillRect(Math.round(sx - 1), sy - 9, 2, 3);   // stem
  }
  function drawDecor(c, d, theme) {
    const Iso = $Iso();
    const { sx, sy } = Iso.w2s(d.i * Iso.WS, d.j * Iso.WS);
    const key = theme.key;
    if (key === 'volcano') { if (d.kind === 'bush') return drawCharRock(c, sx, sy); if (d.kind === 'grass') return drawEmberTuft(c, sx, sy); return drawPebble(c, sx, sy, theme); }
    if (key === 'arctic')  { if (d.kind === 'bush') return drawSnowDrift(c, sx, sy); if (d.kind === 'grass') return drawIceShard(c, sx, sy); return drawPebble(c, sx, sy, theme); }
    if (key === 'seabed')  { if (d.kind === 'bush') return drawShell(c, sx, sy); if (d.kind === 'grass') return drawSeaweedTuft(c, sx, sy, theme); return drawStarfish(c, sx, sy); }
    if (key === 'village') { if (d.kind === 'bush') return drawFlowers(c, sx, sy); if (d.kind === 'grass') return drawGrassTuft(c, sx, sy, theme); return drawPumpkin(c, sx, sy); }
    // forest (base) — original dispatch, byte-identical
    if (d.kind === 'bush') drawBush(c, sx, sy, theme);
    else if (d.kind === 'grass') drawGrassTuft(c, sx, sy, theme);
    else drawPebble(c, sx, sy, theme);
  }
  // Back-comat: anything still calling drawBrick routes to the crate sprite.
  function drawBrick(c, b, theme) { drawCoverObj(c, b, theme); }

  function drawAirdrop(c, wp, theme) {
    const Iso = $Iso();
    const bob = Math.sin(wp.bobT * 4) * 4;
    const ctr = Iso.w2s(wp.wx, wp.wy);
    const pulse = 0.6 + 0.4 * Math.sin(wp.bobT * 6);
    const dropOff = wp.dropT > 0 ? wp.dropT * 200 : 0;   // crate height above its resting spot
    const mode = AIRDROP_MODES[wp.mode] || AIRDROP_MODES.strong;
    const loot = mode.color;                              // crate top hints the loot inside (surprise)
    const lrgb = hexToRgb(loot);
    const cy = ctr.sy - 12 + bob - dropOff;              // crate centre Y
    const t = performance.now() / 1000;

    // Landing target ring (FF red signal) while inbound
    if (wp.dropT > 0) {
      const rk = 0.5 + 0.5 * Math.sin(wp.bobT * 10);
      c.strokeStyle = `rgba(255,90,70,${0.55 + rk * 0.35})`; c.lineWidth = 2;
      c.beginPath(); c.ellipse(ctr.sx, ctr.sy + 4, 26, 12, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(ctr.sx, ctr.sy + 4, 26 * (1 - wp.dropT), 12 * (1 - wp.dropT), 0, 0, Math.PI * 2); c.stroke();
    }

    // Red signal-smoke plume (FF's iconic drop marker) — rising fading puffs, spottable from afar
    for (let k = 0; k < 7; k++) {
      const ph = (t * 0.55 + k * 0.32) % 1;
      const sy2 = ctr.sy - 4 - ph * 72;
      const sx2 = ctr.sx + 16 + Math.sin(t * 1.3 + k) * (6 + ph * 14);
      c.fillStyle = `rgba(255,${80 + k * 6},66,${0.34 * (1 - ph)})`;
      c.beginPath(); c.arc(sx2, sy2, 4 + ph * 12, 0, Math.PI * 2); c.fill();
    }

    // Beacon beam in the loot colour — "supply here, and here's a hint what's inside"
    c.save();
    const grad = c.createLinearGradient(ctr.sx, ctr.sy - 130, ctr.sx, ctr.sy);
    grad.addColorStop(0, `rgba(${lrgb},0)`);
    grad.addColorStop(1, `rgba(${lrgb},${0.14 + pulse * 0.14})`);
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(ctr.sx - 5, ctr.sy - 130); c.lineTo(ctr.sx + 5, ctr.sy - 130);
    c.lineTo(ctr.sx + 20, ctr.sy); c.lineTo(ctr.sx - 20, ctr.sy);
    c.closePath(); c.fill();
    c.restore();

    // Parachute while descending — FF-style coloured-gore canopy + suspension lines
    if (wp.dropT > 0.04) {
      const py = cy - 30;
      const gores = ['#ff5a4a', '#f4f4f4', '#ffd23a', '#f4f4f4', '#ff5a4a'];
      for (let g = 0; g < 5; g++) {
        const x0 = ctr.sx - 22 + g * 8.8, x1 = x0 + 8.8;
        c.fillStyle = gores[g];
        c.beginPath(); c.moveTo(x0, py + 4); c.quadraticCurveTo((x0 + x1) / 2, py - 18, x1, py + 4); c.lineTo((x0 + x1) / 2, py + 9); c.closePath(); c.fill();
      }
      c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(ctr.sx - 22, py + 4); c.quadraticCurveTo(ctr.sx, py + 11, ctr.sx + 22, py + 4); c.stroke();
      c.strokeStyle = 'rgba(40,40,40,0.55)';
      c.beginPath();
      c.moveTo(ctr.sx - 22, py + 5); c.lineTo(ctr.sx - 9, cy - 7);
      c.moveTo(ctr.sx + 22, py + 5); c.lineTo(ctr.sx + 9, cy - 7);
      c.moveTo(ctr.sx, py + 9); c.lineTo(ctr.sx, cy - 9); c.stroke();
    }

    // Landed glow halo (loot colour) + orbiting sparkles → "come grab the surprise"
    if (wp.dropT <= 0) {
      c.fillStyle = loot; c.globalAlpha = 0.22 + pulse * 0.26;
      c.beginPath(); c.ellipse(ctr.sx, ctr.sy + 4, 24, 11, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      for (let k = 0; k < 4; k++) {
        const a = t * 2 + k * Math.PI / 2;
        const tw = 0.5 + 0.5 * Math.sin(t * 6 + k);
        c.fillStyle = `rgba(255,255,255,${tw})`;
        c.fillRect((ctr.sx + Math.cos(a) * 18) | 0, (cy - 2 + Math.sin(a) * 8) | 0, 2, 2);
      }
    }

    drawSupplyCrate(c, ctr.sx, cy, loot, pulse);
  }

  // FF-style military supply crate: olive-metal voxel + loot-colour top panel +
  // black/yellow hazard stripes + corner ribs + pulsing red beacon + SUPPLY mark.
  function drawSupplyCrate(c, sx, cy, loot, pulse) {
    const Iso = $Iso(), TW = Iso.TW, TH = Iso.TH;
    drawBlock(c, sx, cy, 16, '#5b6650');                                 // olive metal body
    c.fillStyle = loot;                                                  // top panel = loot hint
    c.beginPath(); c.moveTo(sx, cy); c.lineTo(sx + TW - 3, cy + TH - 2); c.lineTo(sx, cy + 2 * TH - 4); c.lineTo(sx - TW + 3, cy + TH - 2); c.closePath(); c.fill();
    c.save();                                                            // hazard stripes (front-right face)
    c.beginPath(); c.moveTo(sx, cy + 2 * TH); c.lineTo(sx + TW, cy + TH); c.lineTo(sx + TW, cy + TH + 16); c.lineTo(sx, cy + 2 * TH + 16); c.closePath(); c.clip();
    for (let k = -2; k <= 6; k++) { c.fillStyle = (k % 2 === 0) ? '#15171f' : '#ffd23a'; c.beginPath(); c.moveTo(sx + k * 5, cy + TH + 16); c.lineTo(sx + k * 5 + 5, cy + TH + 16); c.lineTo(sx + k * 5 + 13, cy + TH); c.lineTo(sx + k * 5 + 8, cy + TH); c.closePath(); c.fill(); }
    c.restore();
    c.strokeStyle = '#394133'; c.lineWidth = 1.5;                        // centre rib
    c.beginPath(); c.moveTo(sx, cy); c.lineTo(sx, cy + 2 * TH); c.stroke();
    c.fillStyle = `rgba(255,80,66,${0.5 + pulse * 0.5})`;                // pulsing beacon
    c.beginPath(); c.arc(sx, cy - 2, 2.6 + pulse * 1.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(sx, cy - 2, 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0d1018'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('SUPPLY', sx, cy + TH + 7);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }

  function drawAdsReticle(c, s, theme) {
    const Iso = $Iso();
    const p = s.player;
    const ctr = Iso.w2s(p.wx, p.wy);
    const dist = 150;
    const rx = ctr.sx + Math.cos(p.aimAng) * dist;
    const ry = ctr.sy + Math.sin(p.aimAng) * dist * 0.5;
    c.save();
    c.globalAlpha = p.adsT;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath();
    c.rect(0, 0, $W(), $H());
    c.arc(rx, ry, 90, 0, Math.PI*2, true);
    c.fill('evenodd');
    c.strokeStyle = theme.playerBody;
    c.lineWidth = 2;
    c.beginPath(); c.arc(rx, ry, 4, 0, Math.PI*2); c.stroke();
    c.beginPath(); c.moveTo(rx-28, ry); c.lineTo(rx-8, ry); c.stroke();
    c.beginPath(); c.moveTo(rx+8, ry);  c.lineTo(rx+28, ry); c.stroke();
    c.beginPath(); c.moveTo(rx, ry-28); c.lineTo(rx, ry-8);  c.stroke();
    c.beginPath(); c.moveTo(rx, ry+8);  c.lineTo(rx, ry+28); c.stroke();
    c.restore();
  }

  function drawEventStrikes(c, s, theme) {
    const Iso = $Iso();
    const e = s.evt;
    if (!e || (e.type !== 'airstrike' && e.type !== 'lightning')) return;
    const warnK = Math.max(0, 1 - e.t / e.warn);          // 1 → 0 over the warn window
    const rx = TUNING.strikeRadius * (Iso.TW / Iso.WS), ry = TUNING.strikeRadius * (Iso.TH / Iso.WS);
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 70);
    for (const st of e.strikes) {
      const ctr = Iso.w2s(st.wx, st.wy);
      if (!st.boomed) {
        c.fillStyle = `rgba(255,60,40,${0.16 + (1 - warnK) * 0.22})`;
        c.beginPath(); c.ellipse(ctr.sx, ctr.sy, rx, ry, 0, 0, Math.PI*2); c.fill();
        c.strokeStyle = `rgba(255,50,40,${0.7 + pulse * 0.3})`; c.lineWidth = 2.5;
        c.beginPath(); c.ellipse(ctr.sx, ctr.sy, rx, ry, 0, 0, Math.PI*2); c.stroke();
        c.strokeStyle = 'rgba(255,210,80,0.95)'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(ctr.sx, ctr.sy, rx * warnK, ry * warnK, 0, 0, Math.PI*2); c.stroke();
        if (e.type === 'airstrike') {
          const fall = ctr.sy - 95 * warnK;
          c.fillStyle = '#3a3a3a'; c.fillRect(Math.round(ctr.sx-3), Math.round(fall-7), 6, 12);
          c.fillStyle = '#ffae3a'; c.fillRect(Math.round(ctr.sx-2), Math.round(fall+5), 4, 4);
        } else {
          c.strokeStyle = `rgba(190,225,255,${0.4 + pulse * 0.5})`; c.lineWidth = 2;
          c.beginPath(); c.moveTo(ctr.sx, ctr.sy-120); c.lineTo(ctr.sx-4, ctr.sy-70); c.lineTo(ctr.sx+3, ctr.sy-40); c.lineTo(ctr.sx, ctr.sy); c.stroke();
        }
      } else if (e.flashT > 0) {
        c.globalAlpha = Math.max(0, e.flashT * 4);
        c.fillStyle = e.type === 'lightning' ? '#dff0ff' : '#ffcf6a';
        c.beginPath(); c.ellipse(ctr.sx, ctr.sy, rx*1.1, ry*1.1, 0, 0, Math.PI*2); c.fill();
        c.globalAlpha = 1;
        if (e.type === 'lightning') { c.strokeStyle = '#eaf6ff'; c.lineWidth = 3; c.beginPath(); c.moveTo(ctr.sx, ctr.sy-150); c.lineTo(ctr.sx-6, ctr.sy-80); c.lineTo(ctr.sx+5, ctr.sy-40); c.lineTo(ctr.sx, ctr.sy); c.stroke(); }
      }
    }
  }

  // Edge arrows pointing at OFF-screen enemies (clean threat indicator instead
  // of a corner radar — reads instantly, never overlaps the HP bar / pills).
  function drawOffscreenArrows(c, s, theme, W, H) {
    const Iso = $Iso();
    const cx = W / 2, cy = H * 0.5, m = 30;
    for (const b of s.bots) {
      const pr = Iso.w2s(b.wx, b.wy);
      if (pr.sx > 6 && pr.sx < W - 6 && pr.sy > 62 && pr.sy < H - 118) continue;   // on-screen
      const ang = Math.atan2(pr.sy - cy, pr.sx - cx);
      let ax = Math.max(m, Math.min(W - m, cx + Math.cos(ang) * 2000));
      let ay = Math.max(74, Math.min(H - 132, cy + Math.sin(ang) * 2000));
      c.save();
      c.translate(ax, ay); c.rotate(ang);
      c.globalAlpha = 0.92; c.fillStyle = b.bandColor;
      c.beginPath(); c.moveTo(11, 0); c.lineTo(-6, -7); c.lineTo(-2, 0); c.lineTo(-6, 7); c.closePath(); c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // R2 FF 辨识度: 小地图(毒圈 + 存活点) — 左上角, 半透明, 像 FF/PUBGM 的 minimap
  function drawMinimap(c, s, theme, W, H) {
    const Iso = $Iso();
    const sz = 74, mx = 12, my = 64;
    const mapWpx = s.mapW * Iso.WS, mapHpx = s.mapH * Iso.WS;
    const px = (wx) => mx + Math.max(0, Math.min(1, wx / mapWpx)) * sz;
    const py = (wy) => my + Math.max(0, Math.min(1, wy / mapHpx)) * sz;
    c.save();
    c.fillStyle = 'rgba(12,22,16,0.66)';
    c.fillRect(mx - 3, my - 3, sz + 6, sz + 6);
    c.strokeStyle = 'rgba(120,200,140,0.5)'; c.lineWidth = 1; c.strokeRect(mx - 3, my - 3, sz + 6, sz + 6);
    if (s.zone) { c.strokeStyle = '#4ad0ff'; c.lineWidth = 1.5; c.beginPath(); c.arc(px(s.zone.cx), py(s.zone.cy), Math.max(2, (s.zone.r / mapWpx) * sz), 0, Math.PI * 2); c.stroke(); }
    if (s.airdrop && s.airdrop.spawned && !s.airdrop.collected) { c.fillStyle = theme.weirdGold; c.fillRect(px(s.airdrop.wx) - 2, py(s.airdrop.wy) - 2, 4, 4); }
    c.fillStyle = '#ff5a4a'; for (const b of s.bots) { c.beginPath(); c.arc(px(b.wx), py(b.wy), 1.8, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#5ad0ff'; c.beginPath(); c.arc(px(s.player.wx), py(s.player.wy), 3, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // R2 FF 辨识度: 击杀 feed — 右上角滚动 "谁淘汰谁"
  function drawKillFeed(c, s, theme, W, H) {
    if (!s.killFeed || !s.killFeed.length) return;
    c.save();
    c.textAlign = 'right'; c.textBaseline = 'middle'; c.font = 'bold 12px sans-serif';
    let y = 134;   // R11: was 86 — sat on top of the AR/KIT pills (top:72). Drop below them.
    for (let i = 0; i < Math.min(3, s.killFeed.length); i++) {
      const k = s.killFeed[i];
      const txt = '☠ ' + k.txt;
      const w = c.measureText(txt).width;
      c.globalAlpha = Math.min(1, k.t / 0.6);
      c.fillStyle = 'rgba(10,13,20,0.6)'; c.fillRect(W - 12 - w - 12, y - 9, w + 14, 18);
      c.fillStyle = k.col || '#fff'; c.fillText(txt, W - 16, y);
      y += 21;
    }
    c.globalAlpha = 1; c.restore();
  }
  function drawHUD(c, s, theme, W, H) {
    const p = s.player;
    const pad = 10;
    // R11: removed the persistent center "power-gun" banner — it duplicated the
    // top-right weapon pill (same "穿甲强枪·N发") and crowded it. The pickup flash
    // (Juice.popup on grab) is the moment-of-pickup cue; the pill is the standing one.

    // (Removed the top-right circular radar — in this single-screen arena the
    // in-world zone ring + visible enemies make it redundant, and it overlapped
    // the HP bar + pills. Off-screen foes are flagged by edge arrows below.)
    drawOffscreenArrows(c, s, theme, W, H);
    drawMinimap(c, s, theme, W, H);    // R2 FF: 小地图(毒圈+存活点)
    drawKillFeed(c, s, theme, W, H);   // R2 FF: 击杀 feed

    // Knife mode HUD (left side small chip)
    if (p.usingKnife) {
      c.save();
      c.fillStyle = 'rgba(232,234,242,0.92)';
      c.fillRect(pad, H - 80, 64, 22);
      c.fillStyle = '#1a1d28';
      c.font = 'bold 11px monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('KNIFE', pad + 32, H - 80 + 11);
      c.restore();
    }

    // R6 FF 开火键: 大红开火键。直播 sheet 里用 compact HUD 缩小并贴边,
    // 避免压住中心战斗区; standalone 保留更强的手游按钮感。
    {
      const compact = compactHud(W, H);
      const fx = compact ? W - 58 : W - 84;
      const fy = compact ? H - 98 : H - 188;
      const fr = compact ? 38 : 52;
      const held = !!p.aiming;
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 130);
      c.save();
      // outer ring glow when held
      if (held) { c.fillStyle = 'rgba(255,70,85,0.18)'; c.beginPath(); c.arc(fx, fy, fr + 9, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = held ? 'rgba(255,70,85,0.95)' : 'rgba(196,48,60,0.62)';
      c.beginPath(); c.arc(fx, fy, fr, 0, Math.PI * 2); c.fill();
      c.strokeStyle = `rgba(255,150,160,${0.55 + 0.45 * pulse})`; c.lineWidth = 3.5;
      c.beginPath(); c.arc(fx, fy, fr, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = (compact ? 22 : 30) + 'px sans-serif'; c.fillText('🔫', fx, fy - (compact ? 7 : 9));
      c.font = 'bold ' + (compact ? 12 : 15) + 'px sans-serif'; c.fillText('开火', fx, fy + (compact ? 14 : 17));
      c.restore();
    }

    // R7 onboarding coach marks (first ~5s) — drawn last = on top.
    if (s.coachT > 0) drawCoachMarks(c, s, W, H);
  }

  // First-round coaching so a brand-new player gets the core loop in 2-3s:
  // a top core-goal one-liner (fades ~3s) + a pulsing joystick hint (until first
  // move) + a pulsing ring on the FIRE button (until first shot).
  function drawCoachMarks(c, s, W, H) {
    const ct = s.coachT;
    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // (1) core-goal banner — the instant "what is this game" (full ~2.4s, then fades)
    if (ct > 1.8) {
      c.globalAlpha = Math.min(1, (ct - 1.8) / 0.8);
      const compact = compactHud(W, H);
      const bw = compact ? Math.min(260, W - 48) : 318;
      const bh = compact ? 40 : 46;
      const bx = W / 2, by = compact ? H * 0.24 : H * 0.28;
      c.fillStyle = 'rgba(10,13,20,0.78)'; c.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
      c.strokeStyle = 'rgba(255,216,74,0.7)'; c.lineWidth = 1.5; c.strokeRect(bx - bw / 2, by - bh / 2, bw, bh);
      c.fillStyle = '#ffd84a'; c.font = 'bold ' + (compact ? 14 : 16) + 'px sans-serif'; c.fillText('活到最后 = BOOYAH!', bx, by - (compact ? 7 : 9));
      c.fillStyle = '#eaf2ff'; c.font = (compact ? 11 : 12) + 'px sans-serif'; c.fillText('左侧跑位 · 右下开火', bx, by + (compact ? 11 : 12));
      c.globalAlpha = 1;
    }
    // (2) joystick hint (until first move)
    if (!s.coachMoved) {
      const jx = W * 0.22, jy = H * 0.70;
      c.globalAlpha = 0.45 + pulse * 0.45;
      c.strokeStyle = '#5af5e0'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(jx, jy, 30 + pulse * 6, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(10,13,20,0.74)'; c.fillRect(jx - 46, jy - 64, 92, 22);
      c.fillStyle = '#5af5e0'; c.font = 'bold 13px sans-serif'; c.fillText('🕹 拖着走', jx, jy - 53);
    }
    // (3) fire-button hint (until first shot)
    if (!s.coachFired) {
      const compact = compactHud(W, H);
      const fx = compact ? W - 58 : W - 84;
      const fy = compact ? H - 98 : H - 188;
      c.globalAlpha = 0.45 + pulse * 0.45;
      c.strokeStyle = '#ff6a78'; c.lineWidth = 3;
      c.beginPath(); c.arc(fx, fy, (compact ? 45 : 60) + pulse * 7, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
      const labelW = compact ? 126 : 160;
      c.fillStyle = 'rgba(10,13,20,0.76)'; c.fillRect(fx - labelW / 2, fy - (compact ? 74 : 94), labelW, 24);
      c.fillStyle = '#ff8a96'; c.font = 'bold ' + (compact ? 12 : 13) + 'px sans-serif'; c.fillText('右下开火', fx, fy - (compact ? 62 : 82));
    }
    c.restore();
  }

})();

// ============================================================
//  QA self-test mode — triggered by ?qa=1 in URL
//  Verifies the full game pipeline end-to-end by driving inputs
//  through the engine's __qaSetJoy/__qaSetAim/__qaPressSkill
//  hooks (same path real touch events take) and asserting that
//  state transitions occur. Logs PASS/FAIL to console + shows
//  a banner on screen so anyone opening the URL can confirm.
// ============================================================
(function bootBrQa() {
  if (typeof window === 'undefined' || typeof location === 'undefined') return;
  const params = new URLSearchParams(location.search);
  if (params.get('qa') !== '1') return;

  const log = (...a) => console.log('[BR-QA]', ...a);
  const setResult = (pass, msg) => {
    window.__BR_QA_RESULT = { pass, msg, ts: Date.now() };
    log(pass ? 'PASS' : 'FAIL', msg);
    if (window.showBanner) window.showBanner((pass ? '✓ QA PASS · ' : '✗ QA FAIL · ') + msg, pass ? '#5af5e0' : '#ff4655', 3.5);
  };

  async function waitFor(predicate, timeoutMs = 8000, label = 'condition') {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      if (predicate()) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    log('TIMEOUT waiting for ' + label);
    return false;
  }

  // Drive Games.br.update(dt) manually rather than depending on requestAnimationFrame.
  // Background tabs throttle rAF to ~1/sec which makes natural-time waits unreliable;
  // calling update directly is the SAME code path real users hit (engine tick →
  // current.update(dt)) and is deterministic for QA verification.
  function tick(dtSeconds) {
    if (window.Games && window.Games.br && window.Games.br.update) {
      window.Games.br.update(dtSeconds);
    }
  }
  function tickMany(seconds, dt = 0.05) {
    const n = Math.ceil(seconds / dt);
    for (let i = 0; i < n; i++) tick(dt);
  }

  async function run() {
    log('starting QA self-test in 1.5s…');
    await new Promise(r => setTimeout(r, 1500));

    // Ensure tutorial is dismissed (engine ?qa=1 hook does this at 1.1s,
    // but call directly as belt-and-suspenders for QA determinism)
    if (window.dismissTutorial) window.dismissTutorial();

    // Wait briefly for game state to populate
    const gameActive = await waitFor(
      () => window.state && window.state.brActive && window.state.player,
      8000, 'state.brActive'
    );
    if (!gameActive) return setResult(false, '游戏未启动');

    const s = window.state;
    // QA setup — clear covers + teleport player to a known clear spot at zone
    // center, so movement and LOS tests aren't gated on random cover placement.
    const coversBackup = s.covers;
    s.covers = [];
    s.player.wx = s.zone.cx;
    s.player.wy = s.zone.cy;
    const p0wx = s.player.wx, p0wy = s.player.wy, kills0 = s.kills;
    log('baseline (teleported to zone center)', { wx: p0wx, wy: p0wy, kills: kills0, botCount: s.bots.length });

    // Phase 1 — joystick → player movement via direct update() ticks
    log('Phase 1 · joystick movement');
    if (window.__qaSetJoy) window.__qaSetJoy(-0.8, -0.8);  // up-left drag
    tickMany(1.0);  // 1 second of game ticks at dt=0.05
    const moveDist = Math.hypot(s.player.wx - p0wx, s.player.wy - p0wy);
    if (moveDist < 15) {
      if (window.__qaSetJoy) window.__qaSetJoy(0, 0);
      const mv = window.getMoveVec ? window.getMoveVec() : null;
      return setResult(false, `joystick → player 没动 (delta=${moveDist.toFixed(1)}, getMoveVec=${mv ? JSON.stringify({x:mv.x.toFixed(2),y:mv.y.toFixed(2)}) : 'null'})`);
    }
    log('phase1 ok — moved by', moveDist.toFixed(1));

    // Phase 2 — auto-fire reaches bot (covers already cleared above)
    log('Phase 2 · auto-fire reach');
    if (window.__qaSetJoy) window.__qaSetJoy(0, 0);
    const nb = s.bots[0];
    if (!nb) return setResult(false, '初始 bot 不存在');
    s.player.wx = nb.wx - 100;
    s.player.wy = nb.wy;
    const botHp0 = nb.hp;
    tickMany(3.0);  // 3 seconds of ticks — auto-aim lerps + multiple shots
    const botDamaged = (nb.hp < botHp0) || !s.bots.includes(nb);
    if (!botDamaged) {
      s.covers = coversBackup;
      return setResult(false, `自动开火没打到 bot (bot hp ${nb.hp.toFixed(0)}/${botHp0})`);
    }
    log(`phase2 ok — bot hp ${nb.hp.toFixed(0)}/${botHp0}`);

    // Phase 3 — win condition via direct damage injection
    log('Phase 3 · win condition');
    for (const b of s.bots.slice()) {
      s.bullets.push({ wx: b.wx, wy: b.wy, vx: 0, vy: 0, life: 0.3, owner: 'p', dmg: 999, color: '#fff', mode: 'normal' });
    }
    tickMany(1.0);
    if (s.bots.length !== 0) {
      s.covers = coversBackup;
      return setResult(false, `胜利条件(last-man-standing): bots=${s.bots.length} 未清空, kills=${s.kills}`);
    }
    log('phase3 ok — 全场清空 #1, kills', s.kills);

    s.covers = coversBackup;  // restore for any post-test inspection
    setResult(true, `joystick + autofire + 全场清空 #1 全过 (HP ${Math.round(s.player.hp)})`);
  }

  // Engine ?qa=1 dismisses tutorial at 1.1s; we wait 1.5s before running
  run().catch(e => setResult(false, 'exception: ' + (e && e.message)));
})();
