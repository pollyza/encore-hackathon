// ============================================================
//  juice.js — shared "game feel" layer for all Encore games.
//  window.Juice. Pure, self-contained, pooled. Loaded BEFORE the
//  game modules. The engine main loop drives it:
//    Juice.tick(realDt)                  // advance timers
//    if (!Juice.frozen()) game.update()  // hit-stop gate
//    game.draw()
//    Juice.draw(ctx, W, H)               // popups + particles + post-FX
//
//  Games just call the spawners at impact moments:
//    Juice.hitstop(0.09)        // freeze-frame
//    Juice.addTrauma(0.4, nx, ny)
//    Juice.flash('#fff', 90)    // white-flash
//    Juice.chroma(80)           // chromatic aberration
//    Juice.vignettePulse(0.5)
//    Juice.popup('KILL ×3', sx, sy, {color, size})
//    Juice.burst(sx, sy, 'spark', '#ffd24a')
//  Techniques copied from Vlambeer (Art of Screenshake), Juice It Or
//  Lose It, GMTK, Celeste, Vampire Survivors — see plan.
// ============================================================
(function () {
  if (typeof window === 'undefined') return;

  const R = (a, b) => a + Math.random() * (b - a);

  const J = {
    _hitstop: 0,
    _trauma: 0, _tdirx: 0, _tdiry: 0,
    _flash: { t: 0, dur: 0, color: '#fff' },
    _chroma: 0, _chromaDur: 0,
    _vig: 0, _vigDur: 0,
    _popups: [],
    _parts: [],
    _confetti: [],

    // ---- easing ----
    easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
    easeOutElastic(t) { if (t === 0 || t === 1) return t; const c4 = (2 * Math.PI) / 3; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },

    reset() {
      this._hitstop = 0; this._trauma = 0; this._tdirx = this._tdiry = 0;
      this._flash = { t: 0, dur: 0, color: '#fff' };
      this._chroma = 0; this._chromaDur = 0; this._vig = 0; this._vigDur = 0;
      this._popups.length = 0; this._parts.length = 0; this._confetti.length = 0;
    },

    // ---- hit-stop (freeze frame) ----
    hitstop(s) { this._hitstop = Math.min(0.2, Math.max(this._hitstop, s)); },  // capped so it ALWAYS recovers
    frozen() { return this._hitstop > 0; },

    // ---- trauma screenshake (trauma², linear decay) ----
    addTrauma(a, dirx, diry) {
      this._trauma = Math.min(1, this._trauma + a);
      if (dirx !== undefined) { this._tdirx = dirx; this._tdiry = diry || 0; }
    },
    shake() {
      const s = this._trauma * this._trauma;       // squared falloff
      const MAX_OFF = 16, MAX_ANG = 0.09;            // px / rad
      const dirBias = (Math.abs(this._tdirx) + Math.abs(this._tdiry)) > 0.01;
      const ox = MAX_OFF * s * (dirBias ? this._tdirx + R(-0.4, 0.4) : R(-1, 1));
      const oy = MAX_OFF * s * (dirBias ? this._tdiry + R(-0.4, 0.4) : R(-1, 1));
      return { ox, oy, rot: MAX_ANG * s * R(-1, 1) };
    },

    // ---- post-FX pulses ----
    flash(color, ms) { this._flash = { t: (ms || 80) / 1000, dur: (ms || 80) / 1000, color: color || '#fff' }; },
    chroma(ms) { this._chromaDur = (ms || 80) / 1000; this._chroma = this._chromaDur; },
    vignettePulse(amt) { this._vigDur = 0.4; this._vig = Math.max(this._vig, amt || 0.5); },

    // ---- floating popups (screen-space; scale-up then settle, rise+fade) ----
    popup(text, x, y, opts) {
      opts = opts || {};
      this._popups.push({ text, x, y, color: opts.color || '#fff', size: opts.size || 18, t: 0, dur: opts.dur || 0.75, vy: opts.vy != null ? opts.vy : -34 });
      if (this._popups.length > 40) this._popups.shift();
    },

    // ---- particle burst (screen-space, pooled) ----
    burst(x, y, kind, color) {
      let n, life, spd, grav, sz, add;
      if (kind === 'dust')      { n = 6;  life = 0.32; spd = 60;  grav = 60;  sz = 3; add = false; }
      else if (kind === 'debris'){ n = 16; life = 0.8;  spd = 220; grav = 900; sz = 3; add = false; }
      else if (kind === 'cash')  { n = 14; life = 0.7;  spd = 200; grav = 500; sz = 4; add = false; }
      else                      { n = 12; life = 0.35; spd = 260; grav = 600; sz = 3; add = true; } // 'spark'
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = spd * R(0.4, 1);
        this._parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'cash' ? 120 : 0), life, max: life, grav, sz, color, add });
      }
      if (this._parts.length > 400) this._parts.splice(0, this._parts.length - 400);
    },
    confetti(W) {
      for (let i = 0; i < 110; i++) {
        const hue = (Math.random() * 360) | 0;
        this._confetti.push({ x: R(0, W), y: R(-40, -4), vx: R(-40, 40), vy: R(60, 200), rot: Math.random() * 6, vr: R(-6, 6), life: 2.6, max: 2.6, color: `hsl(${hue},90%,60%)`, w: R(4, 8), h: R(6, 12) });
      }
    },

    // ---- per-frame advance (realDt — runs even while frozen) ----
    tick(dt) {
      if (this._hitstop > 0) this._hitstop = Math.max(0, this._hitstop - dt);
      this._trauma = Math.max(0, this._trauma - 1.4 * dt);
      if (this._flash.t > 0) this._flash.t = Math.max(0, this._flash.t - dt);
      if (this._chroma > 0) this._chroma = Math.max(0, this._chroma - dt);
      if (this._vig > 0) this._vig = Math.max(0, this._vig - dt / Math.max(0.001, this._vigDur) * this._vig);
      const adv = (arr) => { for (const p of arr) { p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; if (p.grav) p.vy += p.grav * dt; if (p.vr) p.rot += p.vr * dt; p.life -= dt; } };
      adv(this._parts);
      adv(this._confetti);
      for (const pu of this._popups) { pu.t += dt; }
      this._parts = this._parts.filter(p => p.life > 0);
      this._popups = this._popups.filter(p => p.t < p.dur);
      this._confetti = this._confetti.filter(p => p.life > 0);
    },

    // ---- draw overlay (screen-space; called after game.draw) ----
    draw(ctx, W, H) {
      // particles
      for (const p of this._parts) {
        const a = Math.max(0, Math.min(1, p.life / p.max));
        ctx.globalAlpha = a;
        if (p.add) ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      // confetti
      for (const c of this._confetti) {
        ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, c.life / c.max));
        ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
      }
      ctx.globalAlpha = 1;
      // popups (scale 0.5→1.3→1.0 via easeOutBack, rise, fade)
      for (const pu of this._popups) {
        const k = pu.t / pu.dur;
        const sc = k < 0.4 ? 0.5 + this.easeOutBack(k / 0.4) * 0.8 : 1.3 - 0.3 * ((k - 0.4) / 0.6);
        const yy = pu.y + pu.vy * k;
        ctx.save(); ctx.globalAlpha = k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.3) : 1;
        ctx.translate(pu.x, yy); ctx.scale(sc, sc);
        ctx.font = `bold ${pu.size}px monospace`; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(pu.text, 0, 0);
        ctx.fillStyle = pu.color; ctx.fillText(pu.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
      // vignette pulse (cached gradient)
      if (this._vig > 0.01) {
        if (!this._vigGrad || this._vigW !== W || this._vigH !== H) {
          const g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.62);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(180,20,20,1)');
          this._vigGrad = g; this._vigW = W; this._vigH = H;
        }
        ctx.globalAlpha = Math.min(0.6, this._vig); ctx.fillStyle = this._vigGrad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      }
      // full-screen flash
      if (this._flash.t > 0) {
        ctx.globalAlpha = Math.min(0.8, this._flash.t / this._flash.dur * 0.8);
        ctx.fillStyle = this._flash.color; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      }
    },

    // chromatic-aberration amount [0..1] for the engine to offset RGB (optional)
    chromaAmt() { return this._chromaDur > 0 ? this._chroma / this._chromaDur : 0; },
  };

  window.Juice = J;
})();
