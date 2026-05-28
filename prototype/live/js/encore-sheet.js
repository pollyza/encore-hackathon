/**
 * encore-sheet.js — Encore bottom sheet + 4-phase machine
 *
 * Phases:
 *   loading  → 2.7s AI-generation feel (thumbnail + scan + status cycle + progress)
 *   game     → loads Mario's template (FPS / MOBA / BR) in an iframe via the
 *              V2G postMessage protocol (schema v1.1):
 *                parent → iframe: { type: 'launch', config: V2GResponse }
 *                iframe → parent: { type: 'encore_ready' }  (after load)
 *                iframe → parent: { type: 'encore_done', stats: {...} }
 *   result   → score chip + extension pills + gift remix + feedback + play again
 *   ranking  → leaderboard sub-view (back returns to result)
 *
 * Feedback ack: tap Fun/Hard/Remix → 950ms radial-ring overlay + ack pill → close.
 */
(() => {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────
  const LOADING_MS = 2700;
  const STAGE_INTERVAL = 650;
  const STAGES = [
    'Capturing highlight…',
    'Analyzing this moment…',
    'Generating mini-game…',
    'Calibrating difficulty…',
  ];
  const ACK_HOLD_MS = 950;

  const TONE = {
    accent:   '#FE2C55',
    accent2:  '#25F4EE',
  };

  const FB_COPY = {
    fun:   { tag: 'love',     sub: 'Tuning your next Encore' },
    hard:  { tag: 'too hard', sub: 'Tuning your next Encore' },
    remix: { tag: 'remix',    sub: 'Generating a remix…'      },
  };

  // ── Mario template catalogue (matches encore_prototype.html `Games.x`) ─
  // Loaded into the iframe via { type: 'launch', config } on encore_ready.
  // schema.md v1.1 documents the V2GResponse shape.
  const TEMPLATES = ['fps', 'moba', 'br'];  // td WIP — add when Mario ships
  const THEMES = {
    fps:  ['desert', 'snow', 'cyber', 'jungle'],
    moba: ['grass',  'lava', 'ice',   'twilight'],
    br:   ['forest', 'desert', 'island', 'wasteland'],
  };
  const TEMPLATE_LABEL = {
    fps:  'Cover Strike',
    moba: 'Dragon Pit',
    br:   'Final Circle',
    td:   'Wave Defense',
  };
  const TEMPLATE_DESC = {
    fps:  '1vN clutch',
    moba: 'dragon pit fight',
    br:   'final circle',
    td:   'tower defense wave',
  };
  const WEAPONS = ['pistol', 'smg', 'rifle', 'sniper'];

  // IFRAME URL — relative to /live/streamer.html, hits /prototype/encore_prototype.html
  // (which the deploy mirror flattens to /encore_prototype.html). Both work.
  const IFRAME_URL = '../encore_prototype.html?embedded=1';

  // Random V2GResponse — used when no real Vision detection is available.
  // Each open() pulls a fresh config so demo rounds feel varied.
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function makeRandomConfig() {
    const template = pickRandom(TEMPLATES);
    const theme    = pickRandom(THEMES[template]);
    const scenario = {
      enemy_count: 2 + Math.floor(Math.random() * 3),     // 2..4
      hp_start:    pickRandom([60, 80, 100]),
      description: TEMPLATE_DESC[template],
    };
    if (template === 'fps' || template === 'br') {
      scenario.weapon = pickRandom(WEAPONS);
    }
    return {
      highlight:  true,
      confidence: 1.0,
      template,
      theme,
      scenario,
      _meta: { tokens_in: 0, tokens_out: 0, model: 'demo-random' },
    };
  }

  // ── State ─────────────────────────────────────────────────────────────
  let cfg = null;
  let phase = 'closed';           // closed | loading | game | result | ranking
  let lastResult = null;
  let currentConfig = null;       // last V2GResponse we launched the iframe with
  let loadingRAF = null;
  let loadingStageIv = null;
  let ackTimer = null;
  let mounted = false;
  let iframe = null;              // active game iframe
  let pendingLaunch = null;       // config waiting for encore_ready
  let messageHandler = null;

  // ── DOM refs (resolved in init) ───────────────────────────────────────
  let dom = {};

  // ── Phase switching ───────────────────────────────────────────────────
  function setPhase(p) {
    phase = p;
    cfg.sheet.dataset.phase = p;
    ['loading', 'game', 'result', 'ranking'].forEach(name => {
      const el = document.getElementById('phase-' + name);
      el.classList.toggle('active', name === p);
    });
  }

  // ── Open / close ──────────────────────────────────────────────────────
  function open() {
    if (mounted && phase !== 'closed') return;
    mounted = true;
    cfg.sheet.classList.remove('hidden', 'closing');
    cfg.backdrop.classList.remove('hidden', 'closing');
    // Reset header subtitle to the generic AI tag until startGame names
    // a concrete template
    const subEl = document.querySelector('#sheet-header .brand .text .sub');
    if (subEl) subEl.textContent = 'AI · forked from TK Sói';
    // Re-mount with fresh slide-up animation
    cfg.sheet.style.animation = 'none';
    // Force reflow then re-enable
    void cfg.sheet.offsetWidth;
    cfg.sheet.style.animation = '';
    startLoading();
  }

  function close() {
    if (!mounted) return;
    clearLoading();
    clearAck();
    destroyIframe();
    cfg.sheet.classList.add('closing');
    cfg.backdrop.classList.add('closing');
    setTimeout(() => {
      cfg.sheet.classList.add('hidden');
      cfg.backdrop.classList.add('hidden');
      cfg.sheet.classList.remove('closing');
      cfg.backdrop.classList.remove('closing');
      setPhase('closed');
      mounted = false;
      // Reset game container
      document.getElementById('phase-game').innerHTML = '';
    }, 320);
  }

  // ── LOADING phase ─────────────────────────────────────────────────────
  function startLoading() {
    setPhase('loading');

    // Reset visuals
    let stageIdx = 0;
    dom.loadingStatus.textContent = STAGES[0];
    dom.loadingPct.textContent = '0%';

    // CSS transition animates the bar on the compositor thread, which keeps
    // working even when JS timers are throttled (background tabs, headless).
    dom.loadingBar.style.transition = 'none';
    dom.loadingBar.style.width = '0%';
    // Force reflow so the transition picks up the from→to delta cleanly
    void dom.loadingBar.offsetWidth;
    dom.loadingBar.style.transition = `width ${LOADING_MS}ms linear`;
    dom.loadingBar.style.width = '100%';

    // Inject particles
    renderParticles();

    // Cycle status text (650ms intervals over 4 stages = ~2.6s)
    loadingStageIv = setInterval(() => {
      stageIdx = Math.min(STAGES.length - 1, stageIdx + 1);
      dom.loadingStatus.textContent = STAGES[stageIdx];
      // Reset animation
      dom.loadingStatus.style.animation = 'none';
      void dom.loadingStatus.offsetWidth;
      dom.loadingStatus.style.animation = '';
      // Also bump the % text so users see progress even if rAF/timer is throttled
      const p = Math.min(100, Math.round((stageIdx + 1) / STAGES.length * 100));
      dom.loadingPct.textContent = p + '%';
    }, STAGE_INTERVAL);

    // Advance on the CSS bar's transitionend event — fires on the next
    // compositor frame and is robust to setTimeout/setInterval throttling
    // (e.g. backgrounded tabs, headless preview). setTimeout fallback in
    // case the transition is interrupted before it ends.
    const onDone = (e) => {
      if (e && e.propertyName && e.propertyName !== 'width') return;
      dom.loadingBar.removeEventListener('transitionend', onDone);
      dom.loadingPct.textContent = '100%';
      clearLoading();
      setTimeout(startGame, 200);
    };
    dom.loadingBar.addEventListener('transitionend', onDone);
    loadingRAF = setTimeout(onDone, LOADING_MS + 600);
  }

  function clearLoading() {
    if (loadingRAF) { clearTimeout(loadingRAF); loadingRAF = null; }
    if (loadingStageIv) { clearInterval(loadingStageIv); loadingStageIv = null; }
  }

  function renderParticles() {
    const wrap = dom.loadingParticles;
    wrap.innerHTML = '';
    for (let i = 0; i < 24; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const s = 0.5 + Math.random() * 1.5;
      p.style.left = (Math.random() * 100) + '%';
      p.style.top  = (Math.random() * 100) + '%';
      p.style.width = p.style.height = (3 * s) + 'px';
      p.style.animation = `encoreFloat ${(1.5 + Math.random() * 2).toFixed(2)}s ease-in-out infinite`;
      p.style.animationDelay = (Math.random() * 1.5).toFixed(2) + 's';
      wrap.appendChild(p);
    }
  }

  // ── GAME phase ────────────────────────────────────────────────────────
  //
  // Loads Mario's encore_prototype.html in an iframe and drives it via the
  // V2G postMessage protocol. The iframe is recreated on every launch so
  // game state is always fresh (matches the design "discard + regenerate"
  // decision; no pause/resume).
  //
  // Random template pick happens here unless cfg.pickConfig was supplied
  // (e.g. observer-client passing a real Vision detection).
  function startGame() {
    setPhase('game');
    currentConfig = cfg.pickConfig
      ? (cfg.pickConfig() || makeRandomConfig())
      : makeRandomConfig();

    // Update sheet header subtitle to show the picked template + theme
    const subEl = document.querySelector('#sheet-header .brand .text .sub');
    if (subEl) {
      const label = TEMPLATE_LABEL[currentConfig.template] || currentConfig.template;
      subEl.textContent = `${label} · ${currentConfig.theme}`;
    }

    const container = document.getElementById('phase-game');
    container.innerHTML = '';

    // Build the iframe
    iframe = document.createElement('iframe');
    iframe.src = IFRAME_URL;
    iframe.allow = 'autoplay';
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;';
    container.appendChild(iframe);

    // Queue the launch — will fire when iframe sends encore_ready
    pendingLaunch = currentConfig;

    // Defensive fallback: if encore_ready never arrives within 2.5s,
    // try to send launch anyway (iframe may have loaded but missed
    // the postMessage path — happens in some Safari builds).
    setTimeout(() => {
      if (pendingLaunch && iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'launch', config: pendingLaunch }, '*');
          pendingLaunch = null;
        } catch (_) {}
      }
    }, 2500);
  }

  function handleIframeMessage(e) {
    const data = e && e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'encore_ready') {
      // Iframe is up — fire the launch config we cached
      if (pendingLaunch && iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'launch', config: pendingLaunch }, '*');
        } catch (_) {}
        pendingLaunch = null;
      }
    } else if (data.type === 'encore_done') {
      // Map the iframe's stats payload onto our internal {score, max, won}.
      // Mario's payload: { won, kills, time, duration, template }
      const s = data.stats || {};
      const max = s.duration ? Math.max(1, Math.round(s.duration)) : 30;
      const score = (s.kills != null ? s.kills : 0);
      onGameDone({ score, max, won: !!s.won, raw: s });
    }
  }

  function destroyIframe() {
    if (iframe) {
      // Setting src to about:blank releases any audio/timers running inside
      try { iframe.src = 'about:blank'; } catch (_) {}
      iframe.remove();
      iframe = null;
    }
    pendingLaunch = null;
  }

  // ── RESULT phase ──────────────────────────────────────────────────────
  function onGameDone(result) {
    lastResult = result;
    showResult(result);
  }

  function showResult({ won, score, max }) {
    setPhase('result');
    const wrap = document.getElementById('phase-result');
    wrap.classList.toggle('lost', !won);

    document.getElementById('result-label').textContent    = won ? 'Encore complete' : 'Run ended';
    document.getElementById('result-headline').textContent = won ? 'Nice run!'        : 'So close.';
    document.getElementById('result-score').textContent    = score;
    document.getElementById('result-max').textContent      = max;
    document.getElementById('host-score').textContent      = Math.max(1, max - 2);
    document.getElementById('host-max').textContent        = max;
    document.getElementById('rank-num').textContent        = won ? 234 : 1872;
  }

  function playAgain() {
    destroyIframe();
    document.getElementById('phase-game').innerHTML = '';
    startLoading();
  }

  // ── RANKING phase ─────────────────────────────────────────────────────
  function showRanking() {
    setPhase('ranking');
    const t = currentConfig && currentConfig.template;
    const label = TEMPLATE_LABEL[t] || 'Encore';
    document.getElementById('ranking-sub').textContent =
      label + " · from TK Sói's highlight";
    renderRankingList();
  }

  function renderRankingList() {
    const list = document.getElementById('ranking-list');
    list.innerHTML = '';
    const r = lastResult || { score: 0, max: 8, won: true };
    const youRank  = r.won ? 234 : 1872;
    const youScore = r.score;
    const youMax   = r.max;

    const top = [
      { rank: 1, name: 'PixelHawk',   score: youMax,                medal: '🥇', tag: 'VIP'  },
      { rank: 2, name: 'LunaWolf_92', score: youMax,                medal: '🥈' },
      { rank: 3, name: 'TK Sói',      score: Math.max(1, youMax-1), medal: '🥉', tag: 'Host' },
      { rank: 4, name: 'Khoa.real',   score: Math.max(1, youMax-1) },
      { rank: 5, name: 'minhquan',    score: Math.max(1, youMax-1) },
      { rank: 6, name: 'echo.cat',    score: Math.max(1, youMax-2) },
    ];
    top.forEach(row => list.appendChild(makeRow(row, false, youMax)));

    const gap = document.createElement('div');
    gap.className = 'lb-gap';
    gap.textContent = '···';
    list.appendChild(gap);

    const youRow = makeRow({ rank: youRank, name: 'You', score: youScore }, true, youMax);
    list.appendChild(youRow);
    list.appendChild(makeRow({ rank: youRank + 1, name: 'duy.le',   score: Math.max(0, youScore - 1) }, false, youMax));
    list.appendChild(makeRow({ rank: youRank + 2, name: 'soimoon',  score: Math.max(0, youScore - 1) }, false, youMax));

    // Auto-scroll so the "You" row is visible — most important row in
    // the leaderboard for the audience. Without this it's below the
    // fold behind the sticky Play-again CTA.
    requestAnimationFrame(() => {
      const listRect = list.getBoundingClientRect();
      const rowRect = youRow.getBoundingClientRect();
      // Place the You row about 1/3 from the top of the visible list
      const target = (rowRect.top + list.scrollTop) - (listRect.top + listRect.height * 0.33);
      list.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    });
  }

  function makeRow(r, you, youMax) {
    const row = document.createElement('div');
    row.className = 'lb-row' + (you ? ' you' : '') + (r.rank <= 3 ? ' top3' : '');

    const rank = document.createElement('div');
    rank.className = 'rank';
    rank.textContent = r.medal || ('#' + r.rank);
    row.appendChild(rank);

    const ava = document.createElement('div');
    ava.className = 'avatar';
    const hue = (r.rank * 53) % 360;
    ava.style.background = `linear-gradient(135deg, hsl(${hue} 50% 50%), hsl(${(hue + 60) % 360} 50% 35%))`;
    ava.textContent = r.name[0] || '?';
    row.appendChild(ava);

    const who = document.createElement('div');
    who.className = 'who';
    const nameRow = document.createElement('div');
    nameRow.className = 'name-row';
    nameRow.appendChild(document.createTextNode(you ? 'You' : r.name));
    if (r.tag) {
      const tag = document.createElement('span');
      tag.className = 'tag' + (r.tag === 'VIP' ? ' vip' : '');
      tag.textContent = '+' + r.tag;
      nameRow.appendChild(tag);
    }
    if (you) {
      const tag = document.createElement('span');
      tag.className = 'tag you-tag';
      tag.textContent = 'You';
      nameRow.appendChild(tag);
    }
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `${r.score}/${youMax} · 0:${15 + (r.rank % 5)}s`;
    who.appendChild(nameRow);
    who.appendChild(sub);
    row.appendChild(who);

    const score = document.createElement('div');
    score.className = 'score';
    score.textContent = r.score;
    row.appendChild(score);

    return row;
  }

  // ── FEEDBACK ack overlay ──────────────────────────────────────────────
  function handleFeedback(kind) {
    const meta = FB_COPY[kind];
    if (!meta) return;
    const emojiMap = { fun: '🔥', hard: '😵', remix: '🎲' };
    document.getElementById('fb-ack-emoji').textContent = emojiMap[kind];
    document.getElementById('fb-ack-sub').textContent   = meta.sub;
    dom.fbAck.classList.remove('hidden');
    cfg.onAck && cfg.onAck(`Got it — ${meta.tag}`);
    ackTimer = setTimeout(() => {
      close();
    }, ACK_HOLD_MS);
  }

  function clearAck() {
    if (ackTimer) { clearTimeout(ackTimer); ackTimer = null; }
    dom.fbAck.classList.add('hidden');
  }

  // ── Init / wiring ─────────────────────────────────────────────────────
  function init(c) {
    cfg = c;
    dom.loadingStatus    = document.getElementById('loading-status');
    dom.loadingBar       = document.getElementById('loading-bar');
    dom.loadingPct       = document.getElementById('loading-pct');
    dom.loadingParticles = document.getElementById('loading-particles');
    dom.fbAck            = document.getElementById('fb-ack');

    cfg.backdrop.addEventListener('click', close);
    cfg.closeBtn.addEventListener('click', close);

    // Listen for iframe messages (encore_ready / encore_done / etc.)
    messageHandler = handleIframeMessage;
    window.addEventListener('message', messageHandler);

    // Feedback row
    document.querySelectorAll('#phase-result .fb-btn').forEach(btn => {
      btn.addEventListener('click', () => handleFeedback(btn.dataset.fb));
    });

    // Play again
    document.getElementById('play-again').addEventListener('click', playAgain);
    document.getElementById('ranking-play-again').addEventListener('click', () => {
      setPhase('result');
      // small visual reset for next loop
      setTimeout(playAgain, 100);
    });

    // Extension pills
    document.getElementById('rank-pill').addEventListener('click', showRanking);
    document.getElementById('share-pill').addEventListener('click', () => {
      cfg.onAck && cfg.onAck('Share — coming soon');
    });
    document.querySelector('#phase-result .gift-remix .send').addEventListener('click', () => {
      cfg.onAck && cfg.onAck('Gift Remix · M11+');
    });

    // Ranking back + tabs
    document.getElementById('ranking-back').addEventListener('click', () => setPhase('result'));
    document.querySelectorAll('#phase-ranking .tabs .seg button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#phase-ranking .tabs .seg button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
  }

  window.EncoreSheet = { init, open, close };
})();
