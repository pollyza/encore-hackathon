/**
 * mini-games.js — Aim / Rhythm / Dodge
 *
 * Each game is rendered into the supplied container; on completion it calls
 * onComplete({ score, max, won }).
 *
 * Public API: MiniGames.start({ kind, container, tone, onComplete })
 */
(() => {
  'use strict';

  // ── Shared HUD + countdown ─────────────────────────────────────────────
  function buildHUD({ label, scoreObj, timeObj }) {
    // scoreObj/timeObj are objects we can mutate to update text without rebuilding
    const hud = document.createElement('div');
    hud.className = 'game-hud';

    const left = document.createElement('div');
    left.className = 'label-chip';
    left.innerHTML = `<span class="dot">●</span> ${label}`;
    hud.appendChild(left);

    const right = document.createElement('div');
    right.className = 'score-chip';
    if (scoreObj) {
      const s = document.createElement('span');
      const of = document.createElement('span');
      of.className = 'of';
      s.textContent = scoreObj.score;
      of.textContent = '/' + scoreObj.max;
      right.appendChild(s); right.appendChild(of);
      scoreObj.el = s;
    } else if (timeObj) {
      const t = document.createElement('span');
      t.textContent = timeObj.time.toFixed(1) + 's';
      right.appendChild(t);
      timeObj.el = t;
    }
    hud.appendChild(right);
    return hud;
  }

  function runCountdown(container, onDone) {
    const wrap = document.createElement('div');
    wrap.className = 'countdown';
    container.appendChild(wrap);

    let n = 3;
    const step = () => {
      wrap.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'digit';
      d.textContent = n === 0 ? 'GO!' : String(n);
      wrap.appendChild(d);
      if (n === 0) {
        setTimeout(() => { wrap.remove(); onDone(); }, 500);
      } else {
        n--;
        setTimeout(step, 700);
      }
    };
    step();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AIM — 8 targets, win ≥ 5, ringPing target with shrinking TTL
  // ═══════════════════════════════════════════════════════════════════════
  function startAim(container, tone, onComplete) {
    const TOTAL = 8;
    const WIN = 5;
    const arena = document.createElement('div');
    arena.id = 'game-aim';
    container.appendChild(arena);

    // Grid lines (SVG)
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    grid.setAttribute('class', 'grid');
    grid.setAttribute('viewBox', '0 0 100 100');
    grid.setAttribute('preserveAspectRatio', 'none');
    [20, 40, 60, 80].forEach(p => {
      ['v', 'h'].forEach(dir => {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        if (dir === 'v') { l.setAttribute('x1', p); l.setAttribute('y1', 0); l.setAttribute('x2', p); l.setAttribute('y2', 100); }
        else             { l.setAttribute('x1', 0); l.setAttribute('y1', p); l.setAttribute('x2', 100); l.setAttribute('y2', p); }
        l.setAttribute('stroke', tone.accent2);
        l.setAttribute('stroke-width', '.15');
        grid.appendChild(l);
      });
    });
    arena.appendChild(grid);

    const scoreObj = { score: 0, max: TOTAL };
    const hud = buildHUD({ label: 'AIM', scoreObj });
    arena.appendChild(hud);

    // Crosshair
    const cross = document.createElement('div');
    cross.className = 'crosshair';
    cross.innerHTML = '<div class="ring"></div><div class="ch"></div><div class="cv"></div>';
    cross.style.left = '50%'; cross.style.top = '55%';
    arena.appendChild(cross);

    // Hint
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = `Tap the targets · ${WIN} to win`;
    arena.appendChild(hint);

    let shots = 0;
    let target = null;
    let targetEl = null;
    let targetTimeout = null;
    let stopped = false;

    function spawn() {
      if (stopped) return;
      if (shots >= TOTAL) {
        setTimeout(() => onComplete({ score: scoreObj.score, max: TOTAL, won: scoreObj.score >= WIN }), 400);
        return;
      }
      const ttl = 1300 - Math.min(shots * 60, 400);
      target = {
        x: 0.15 + Math.random() * 0.7,
        y: 0.20 + Math.random() * 0.55,
        ttl,
        born: Date.now(),
      };
      // Render target
      const el = document.createElement('div');
      el.className = 'target';
      el.innerHTML = `
        <div class="ring"></div>
        <div class="core"></div>
        <div class="cross-h"></div>
        <div class="cross-v"></div>
      `;
      el.style.left = (target.x * 100) + '%';
      el.style.top  = (target.y * 100) + '%';
      arena.appendChild(el);
      targetEl = el;

      // Auto-miss
      targetTimeout = setTimeout(() => {
        if (targetEl) targetEl.remove();
        targetEl = null; target = null;
        shots++;
        setTimeout(spawn, 350);
      }, ttl);
    }

    function spawnHitMarker(x, y) {
      const m = document.createElement('div');
      m.className = 'hit-marker';
      m.textContent = '+1';
      m.style.left = (x * 100) + '%';
      m.style.top  = (y * 100) + '%';
      arena.appendChild(m);
      setTimeout(() => m.remove(), 800);
    }

    arena.addEventListener('click', (e) => {
      hint.style.display = 'none';
      const rect = arena.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top)  / rect.height;
      cross.style.left = (x * 100) + '%';
      cross.style.top  = (y * 100) + '%';

      if (!target) return;
      const dx = (x - target.x) * rect.width;
      const dy = (y - target.y) * rect.height;
      const dist = Math.hypot(dx, dy);
      if (dist < 30) {
        scoreObj.score++;
        scoreObj.el.textContent = scoreObj.score;
        spawnHitMarker(target.x, target.y);
      }
      clearTimeout(targetTimeout);
      if (targetEl) targetEl.remove();
      targetEl = null; target = null;
      shots++;
      setTimeout(spawn, 350);
    });

    runCountdown(arena, () => { setTimeout(spawn, 200); });

    return () => { stopped = true; clearTimeout(targetTimeout); };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RHYTHM — 4 lanes, 10 notes, win ≥ 7
  // ═══════════════════════════════════════════════════════════════════════
  function startRhythm(container, tone, onComplete) {
    const TOTAL = 10;
    const WIN = 7;
    const LANES = 4;
    const FALL_MS = 1800;

    const arena = document.createElement('div');
    arena.id = 'game-rhythm';
    container.appendChild(arena);

    const scoreObj = { score: 0, max: TOTAL };
    arena.appendChild(buildHUD({ label: 'RHYTHM', scoreObj }));

    // Lanes
    const lanesWrap = document.createElement('div');
    lanesWrap.className = 'lanes';
    const laneEls = [];
    for (let i = 0; i < LANES; i++) {
      const lane = document.createElement('div');
      lane.className = 'lane';
      lanesWrap.appendChild(lane);
      laneEls.push(lane);
    }
    arena.appendChild(lanesWrap);

    // Hit line + pads
    const hitLine = document.createElement('div');
    hitLine.className = 'hit-line';
    arena.appendChild(hitLine);

    const pads = document.createElement('div');
    pads.className = 'pads';
    for (let i = 0; i < LANES; i++) {
      const p = document.createElement('button');
      p.className = 'pad ' + (i % 2 === 0 ? 'alt-a' : 'alt-b');
      p.textContent = '●';
      p.addEventListener('pointerdown', () => tapLane(i));
      pads.appendChild(p);
    }
    arena.appendChild(pads);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Tap the pad when the note hits the line';
    arena.appendChild(hint);

    let stopped = false;
    let started = false;
    let startTime = 0;
    let spawnIdx = 0;
    const notes = []; // { id, lane, born, hit, missed, el }

    function spawnNote() {
      if (stopped) return;
      if (spawnIdx >= TOTAL) return;
      const lane = Math.floor(Math.random() * LANES);
      const el = document.createElement('div');
      el.className = 'note ' + (lane % 2 === 0 ? 'alt-a' : 'alt-b');
      laneEls[lane].appendChild(el);
      notes.push({ id: spawnIdx, lane, born: performance.now() - startTime, hit: false, missed: false, el });
      spawnIdx++;
    }

    function tapLane(lane) {
      if (!started || stopped) return;
      const now = performance.now() - startTime;
      let best = -1, bestDelta = Infinity;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.lane !== lane || n.hit || n.missed) continue;
        const progress = (now - n.born) / FALL_MS;
        const delta = Math.abs(progress - 1);
        if (delta < bestDelta) { bestDelta = delta; best = i; }
      }
      if (best === -1) return;
      const n = notes[best];
      if (bestDelta < 0.18) {
        n.hit = true;
        scoreObj.score++;
        if (scoreObj.el) scoreObj.el.textContent = scoreObj.score;
        const text = bestDelta < 0.07 ? 'PERFECT' : 'GOOD';
        showJudge(laneEls[lane], text, bestDelta < 0.07 ? 'perfect' : 'good');
        if (n.el) n.el.remove();
      } else {
        n.missed = true;
        showJudge(laneEls[lane], 'MISS', 'miss');
        n.el.classList.add('missed');
      }
    }

    function showJudge(parent, text, cls) {
      hint.style.display = 'none';
      const j = document.createElement('div');
      j.className = 'judge ' + cls;
      j.textContent = text;
      parent.appendChild(j);
      setTimeout(() => j.remove(), 700);
    }

    function tick() {
      if (stopped) return;
      const now = performance.now() - startTime;

      // Update note positions
      notes.forEach(n => {
        if (n.hit) return;
        const progress = Math.min(1.05, (now - n.born) / FALL_MS);
        if (n.el && n.el.isConnected) {
          n.el.style.top = (progress * 100) + '%';
        }
        if (!n.missed && progress > 1.08) {
          n.missed = true;
          if (n.el) n.el.classList.add('missed');
        }
      });

      // End condition: all spawned + all resolved
      const resolved = notes.filter(n => n.hit || n.missed).length;
      if (spawnIdx >= TOTAL && notes.length > 0 && resolved === notes.length) {
        stopped = true;
        setTimeout(() => onComplete({
          score: scoreObj.score,
          max: TOTAL,
          won: scoreObj.score >= WIN,
        }), 500);
        return;
      }
      requestAnimationFrame(tick);
    }

    runCountdown(arena, () => {
      started = true;
      startTime = performance.now();
      const spawnIv = setInterval(() => {
        if (spawnIdx >= TOTAL || stopped) { clearInterval(spawnIv); return; }
        spawnNote();
      }, 600);
      requestAnimationFrame(tick);
    });

    return () => { stopped = true; };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DODGE — 3 lanes, 3 HP, 12s, obstacles (red ✕) + pickups (cyan ★)
  // ═══════════════════════════════════════════════════════════════════════
  function startDodge(container, tone, onComplete) {
    const LANES = 3;
    const DURATION = 12;

    const arena = document.createElement('div');
    arena.id = 'game-dodge';
    container.appendChild(arena);

    const timeObj = { time: DURATION };
    arena.appendChild(buildHUD({ label: 'DODGE', timeObj }));

    // HP dots
    const hpWrap = document.createElement('div');
    hpWrap.className = 'hp';
    const hpEls = [];
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'heart on';
      hpWrap.appendChild(d); hpEls.push(d);
    }
    arena.appendChild(hpWrap);

    // Lanes
    const lanesWrap = document.createElement('div');
    lanesWrap.className = 'lanes';
    for (let i = 0; i < LANES; i++) {
      const l = document.createElement('div');
      l.className = 'lane';
      lanesWrap.appendChild(l);
    }
    arena.appendChild(lanesWrap);

    // Player
    const player = document.createElement('div');
    player.className = 'player';
    player.innerHTML = `
      <svg viewBox="0 0 44 60" width="44" height="60" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="22" cy="56" rx="16" ry="3" fill="${tone.accent}" opacity=".5"/>
        <path d="M16 10 Q22 4 28 10 L30 28 L34 50 L28 56 L16 56 L10 50 L14 28 Z" fill="#e8e3d6"/>
        <circle cx="22" cy="8" r="6" fill="#f1ddb6"/>
      </svg>
    `;
    lanesWrap.appendChild(player);

    // L/R buttons
    const lr = document.createElement('div');
    lr.className = 'lr';
    const lbtn = document.createElement('button'); lbtn.textContent = '←';
    const rbtn = document.createElement('button'); rbtn.textContent = '→';
    lr.appendChild(lbtn); lr.appendChild(rbtn);
    arena.appendChild(lr);

    let lane = 1, hp = 3, stopped = false, started = false;
    let lastT = 0, elapsed = 0, spawnTimer = 0;
    let pickups = 0;
    const obstacles = []; // {id, lane, y, pickup, el, hit}

    function placePlayer() {
      player.style.left = ((lane + 0.5) * (100 / LANES)) + '%';
    }
    placePlayer();

    function move(dir) {
      if (!started || stopped) return;
      lane = Math.max(0, Math.min(LANES - 1, lane + dir));
      placePlayer();
    }
    lbtn.addEventListener('pointerdown', () => move(-1));
    rbtn.addEventListener('pointerdown', () => move(1));

    const onKey = (e) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);

    // Swipe
    let touchStart = null;
    arena.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; touchStart = { x: t.clientX, y: t.clientY };
    });
    arena.addEventListener('touchend', (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      if (Math.abs(dx) > 24) move(dx > 0 ? 1 : -1);
      touchStart = null;
    });

    function spawn() {
      const isPickup = Math.random() < 0.18;
      const l = Math.floor(Math.random() * LANES);
      const el = document.createElement('div');
      el.className = isPickup ? 'pickup' : 'obstacle';
      el.textContent = isPickup ? '★' : '✕';
      el.style.left = ((l + 0.5) * (100 / LANES)) + '%';
      el.style.top  = '-10%';
      lanesWrap.appendChild(el);
      obstacles.push({ id: Math.random(), lane: l, y: -0.1, pickup: isPickup, el, hit: false });
    }

    function setHP(v) {
      hp = v;
      for (let i = 0; i < 3; i++) hpEls[i].classList.toggle('on', i < hp);
    }

    function loop(now) {
      if (stopped) return;
      if (!lastT) lastT = now;
      const dt = (now - lastT) / 1000;
      lastT = now;
      elapsed += dt;
      spawnTimer += dt;
      timeObj.time = Math.max(0, DURATION - elapsed);
      if (timeObj.el) timeObj.el.textContent = timeObj.time.toFixed(1) + 's';

      const rate = Math.max(0.55, 0.95 - elapsed * 0.03);
      if (spawnTimer > rate) { spawnTimer = 0; spawn(); }

      // move + collision
      const speed = 0.45 + elapsed * 0.012;
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i];
        ob.y += speed * dt;
        if (ob.el && ob.el.isConnected) ob.el.style.top = (ob.y * 100) + '%';
        if (!ob.hit && ob.y > 0.85 && ob.y < 0.95 && ob.lane === lane) {
          ob.hit = true;
          if (ob.pickup) pickups++;
          else setHP(hp - 1);
        }
        if (ob.y > 1.1) {
          if (ob.el) ob.el.remove();
          obstacles.splice(i, 1);
        }
      }

      if (elapsed >= DURATION || hp <= 0) {
        stopped = true;
        const won = hp > 0;
        const score = Math.round(Math.max(0, (won ? DURATION : elapsed)) + pickups);
        setTimeout(() => onComplete({ score, max: DURATION, won }), 400);
        return;
      }
      requestAnimationFrame(loop);
    }

    runCountdown(arena, () => {
      started = true;
      lastT = 0;
      requestAnimationFrame(loop);
    });

    return () => {
      stopped = true;
      window.removeEventListener('keydown', onKey);
    };
  }

  // ── Dispatcher ────────────────────────────────────────────────────────
  function start({ kind, container, tone, onComplete }) {
    const t = tone || { accent: '#FE2C55', accent2: '#25F4EE' };
    if (kind === 'rhythm') return startRhythm(container, t, onComplete);
    if (kind === 'dodge')  return startDodge(container, t, onComplete);
    return startAim(container, t, onComplete);
  }

  window.MiniGames = { start };
})();
