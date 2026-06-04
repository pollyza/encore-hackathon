/**
 * encore-sheet.js — Encore bottom sheet + 4-phase machine
 *
 * Phases:
 *   loading  → 2.7s AI-generation feel (thumbnail + scan + status cycle + progress)
 *   game     → loads Mario's template (GTA / Roblox / Free Fire BR) in an iframe via the
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
  const TEMPLATES = ['gta', 'roblox', 'br'];  // Mario final set: GTA + Roblox + Free Fire BR
  const THEMES = {
    fps:    ['desert', 'snow', 'cyber',  'jungle'],
    moba:   ['grass',  'lava', 'ice',    'twilight'],
    br:     ['forest', 'desert', 'island','wasteland'],
    roblox: ['grass',  'snow', 'lava',   'space'],         // Mario v2 5/28
    gta:    ['night',  'rain', 'sunset', 'snownight'],     // Mario v2 5/28
  };
  const TEMPLATE_LABEL = {
    fps:    'Cover Strike',
    moba:   'Dragon Pit',
    br:     'Free Fire BR',
    td:     'Wave Defense',
    roblox: 'Obby Parkour',   // Mario v2 5/28
    gta:    'GTA Heist',      // Mario v2 5/28
  };
  const TEMPLATE_DESC = {
    fps:    '1vN clutch',
    moba:   'dragon pit fight',
    br:     'free fire final circle',
    td:     'tower defense wave',
    roblox: 'platform parkour',   // Mario v2 5/28
    gta:    'shop heist run',     // Mario v2 5/28
  };
  const WEAPONS = ['pistol', 'smg', 'rifle', 'sniper'];
  // GIFT "Enhance" layer — per-game pools of community-meme boosts. The result
  // screen rotates through each pool so every round offers a DIFFERENT gift
  // (variety = repeat-purchase pull). Each is big & funny & on-brand; strong but
  // timed, never gates play. Keys match the game modules' applyGiftBoost pools.
  const GIFT_POOLS = {
    br: [
      { key: 'tank',    ico: '🚁', head: 'BOOYAH Airdrop',  sub: 'Air-drops a tank cannon — huge AOE shells', button: '🌹 5' },
      { key: 'eagle',   ico: '🦅', head: 'Falco Airstrike', sub: 'Pet eagle carpet-bombs the lobby',          button: '🌹 5' },
      { key: 'shotgun', ico: '🔫', head: 'Golden M1887',    sub: 'Iconic gold shotgun — point-blank melt',    button: '🌹 5' },
    ],
    gta: [
      { key: 'cartel', ico: '🚁', head: 'Cartel Airstrike', sub: 'A chopper rides shotgun & bombs your path',     button: '🌹 5' },
      { key: 'fbi',    ico: '🚔', head: 'FBI Escort',       sub: 'Armored SUVs flank you — bulletproof run',     button: '🌹 5' },
      { key: 'tank',   ico: '🛡', head: 'Rhino Tank',       sub: 'Become a tank — plow through everything',       button: '🌹 5' },
    ],
    roblox: [
      { key: 'wings', ico: '🪽', head: 'Dominus Wings', sub: 'Giant glowing wings — take off & glide', button: '🌹 5' },
      { key: 'coil',  ico: '🌀', head: 'Gravity Coil',  sub: 'The classic gear — moon-jump sky-high',  button: '🌹 5' },
      { key: 'oof',   ico: '🚀', head: 'OOF Rocket',    sub: 'Mega-bounce spring — to the moon, OOF!', button: '🌹 5' },
    ],
  };
  const giftRotation = {};   // template -> next index, so consecutive rounds offer different gifts
  let pickedGift = null;     // the gift currently shown on the result screen (copy + send agree)

  // IFRAME URL — relative to /live/streamer.html, hits /prototype/encore_prototype.html
  // (which the deploy mirror flattens to /encore_prototype.html). Both work.
  const IFRAME_URL = '../encore_prototype.html?embedded=1&v=v2g-ready-r4';

  // Random V2GResponse — used when no real Vision detection is available.
  // Each open() pulls a fresh config so demo rounds feel varied.
  const URL_PARAMS = new URLSearchParams(window.location.search);
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function makeRandomConfig() {
    const forcedTemplate = URL_PARAMS.get('force_template');
    const template = TEMPLATES.includes(forcedTemplate) ? forcedTemplate : pickRandom(TEMPLATES);
    const forcedTheme = URL_PARAMS.get('force_theme');
    const theme = (THEMES[template] || []).includes(forcedTheme) ? forcedTheme : pickRandom(THEMES[template]);
    let scenario;
    // Per-template scenario fields (Mario v2 5/28)
    if (template === 'roblox') {
      scenario = {
        platform_count: 18,
        gap_range_min:  80,
        gap_range_max:  220,
        seed:           Math.floor(Math.random() * 100000),
        description:    TEMPLATE_DESC[template],
      };
    } else if (template === 'gta') {
      scenario = {
        shop_count:     4,
        cop_spawn_rate: 0.2,
        map_size:       1500,
        description:    TEMPLATE_DESC[template],
      };
    } else if (template === 'br') {
      scenario = {
        enemy_count: 9,
        hp_start:    100,
        description: TEMPLATE_DESC[template],
        weapon:      pickRandom(WEAPONS),
      };
    } else {
      // fps / moba / br / td legacy fields
      scenario = {
        enemy_count: 2 + Math.floor(Math.random() * 3),     // 2..4
        hp_start:    pickRandom([60, 80, 100]),
        description: TEMPLATE_DESC[template],
      };
      if (template === 'fps' || template === 'br') {
        scenario.weapon = pickRandom(WEAPONS);
      }
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
  let nextConfigOverride = null;   // one-shot config used by Gift Boost replay
  let loadingRAF = null;
  let loadingStageIv = null;
  let ackTimer = null;
  let mounted = false;
  let iframe = null;              // active game iframe
  let pendingLaunch = null;       // config waiting for encore_ready
  let messageHandler = null;
  let blindLaunchTimer = null;    // 2.5s defensive launch timer (cancelled on teardown)
  let recorderStarted = false;    // gameplay recorder starts once per iframe (on encore_started)

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
    stopAllClipAnimations();
    cancelPublishCountdown();
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
  function startLoading(forcedConfig) {
    if (forcedConfig) nextConfigOverride = forcedConfig;
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
    currentConfig = nextConfigOverride || (cfg.pickConfig
      ? (cfg.pickConfig() || makeRandomConfig())
      : makeRandomConfig());
    nextConfigOverride = null;

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
    recorderStarted = false;

    // Defensive fallback: if encore_ready never arrives within 2.5s, send launch
    // anyway. Tracked so destroyIframe() can cancel it — a stale fire must not
    // hit the NEXT iframe on the gift re-launch path.
    if (blindLaunchTimer) clearTimeout(blindLaunchTimer);
    blindLaunchTimer = setTimeout(() => {
      blindLaunchTimer = null;
      if (pendingLaunch && iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'launch', config: pendingLaunch }, '*');
          pendingLaunch = null;
        } catch (_) {}
      }
    }, 2500);
  }

  // Start the gameplay recorder exactly once per iframe. Gated on encore_started
  // (the iframe's first real game frame) so the recording is real gameplay, never
  // the loading frame → no more black bottom-half clips.
  function startRecorderOnce() {
    if (recorderStarted || !window.PlayerRecorder || !iframe) return;
    recorderStarted = true;
    window.PlayerRecorder.findCanvasInIframe(iframe, {
      onFound: (canvas) => { window.PlayerRecorder.start(canvas); },
      onTimeout: () => {
        console.warn('[encore-sheet] game canvas not found within timeout — winner clip will use viewer-half mock');
      },
    });
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
      if (blindLaunchTimer) { clearTimeout(blindLaunchTimer); blindLaunchTimer = null; }
      // Defensive: if the iframe is an old build that never posts encore_started,
      // still start the recorder ~1.6s later (the game has launched by then).
      setTimeout(startRecorderOnce, 1600);
    } else if (data.type === 'encore_started') {
      // First real game frame painted — record now (not while it was still the
      // loading frame). Primary, immediate path.
      startRecorderOnce();
    } else if (data.type === 'encore_done') {
      // Stop the gameplay recording — the finalized blob URL becomes
      // available via PlayerRecorder.getLastUrl() shortly after.
      if (window.PlayerRecorder) window.PlayerRecorder.stop();
      // Map the iframe's stats payload onto our internal {score, max, won}.
      // Mario's payload: { won, kills, time, duration, template }
      const s = data.stats || {};
      const max = s.duration ? Math.max(1, Math.round(s.duration)) : 30;
      const score = (s.kills != null ? s.kills : 0);
      onGameDone({ score, max, won: !!s.won, raw: s });
    }
  }

  function destroyIframe() {
    if (blindLaunchTimer) { clearTimeout(blindLaunchTimer); blindLaunchTimer = null; }
    if (iframe) {
      // Setting src to about:blank releases any audio/timers running inside
      try { iframe.src = 'about:blank'; } catch (_) {}
      iframe.remove();
      iframe = null;
    }
    pendingLaunch = null;
    recorderStarted = false;
  }

  // ── RESULT phase ──────────────────────────────────────────────────────
  function onGameDone(result) {
    lastResult = result;
    showResult(result);
  }

  // v0.8 split-screen second-distribution mock: derive UI state from rank.
  // Top-3 winner → clip preview + caption + auto-publish countdown
  // Non-winner   → Spotlight "Make my clip" pay card
  //
  // For demo determinism: rank is computed from won + score (top-3 if won and
  // score is high). In real impl, rank comes from server after leaderboard
  // settles. The mock just needs to convincingly demo both states.
  function rankFromResult({ won, score, max }) {
    if (!won) return { rank: 18, medal: '😅', isWinner: false };
    // Demo heuristic: if score is at least 75% of max → #2; full → #1; else #3
    const ratio = max > 0 ? score / max : 0;
    if (ratio >= 1)    return { rank: 1, medal: '🥇', isWinner: true };
    if (ratio >= 0.75) return { rank: 2, medal: '🥈', isWinner: true };
    return { rank: 3, medal: '🥉', isWinner: true };
  }

  let publishCountdownTimer = null;
  function startPublishCountdown() {
    cancelPublishCountdown();
    const elNum  = document.getElementById('result-publish-countdown');
    const elMsg  = elNum && elNum.parentElement;
    const elBtnC = document.getElementById('result-publish-cancel');
    const elBtnN = document.getElementById('result-publish-now');
    if (!elNum || !elMsg) return;
    elMsg.classList.remove('cancelled', 'published');
    elNum.textContent = '3';
    let n = 3;
    publishCountdownTimer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(publishCountdownTimer);
        publishCountdownTimer = null;
        markPublished();
        return;
      }
      elNum.textContent = String(n);
    }, 1000);
  }
  function cancelPublishCountdown() {
    if (publishCountdownTimer) {
      clearInterval(publishCountdownTimer);
      publishCountdownTimer = null;
    }
  }
  function markPublished() {
    const elMsg = document.querySelector('#result-publish-wrap .sheet-result-publish-msg');
    if (elMsg) {
      elMsg.classList.add('published');
      elMsg.innerHTML = '✓ Published to TikTok · view in your profile';
    }
  }
  function markCancelled() {
    cancelPublishCountdown();
    const elMsg = document.querySelector('#result-publish-wrap .sheet-result-publish-msg');
    if (elMsg) {
      elMsg.classList.add('cancelled');
      elMsg.innerHTML = 'Saved as draft · you can publish anytime';
    }
  }

  // ── Canvas 2D simulated pixel encore for the clip preview viewer half ──
  // Pure visual mock — NOT the real game. Auto-bot character + crosshair
  // tracking + enemies popping + score floats. Future: swap to a playback
  // of the actual player's gameplay (MediaRecorder on the game canvas
  // during play → blob → <video> source here).
  let clipCanvasRAF = null;
  let clipCanvasStart = 0;
  let clipHostCanvasRAF = null;       // host (top half) drawing loop
  let clipHostCanvasStart = 0;
  let clipOutputBlobUrl = null;        // last finished ClipComposer URL

  // Fits a canvas's backing store to its CSS box. Returns true on success;
  // false when the container hasn't laid out yet (0×0).
  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    if (r.width === 0) return false;
    cv.width  = Math.round(r.width);
    cv.height = Math.round(r.height);
    return true;
  }

  // Hidden <video> element backed by the most recent gameplay recording.
  // When present + playing, the viewer-half canvas drawImages from it
  // instead of running drawMockEncoreScene. Reused across rounds; lazily
  // built the first time a real recording is available.
  let playbackVideoEl = null;
  let fallbackViewerVideoEl = null;
  const MODE_VIDEO = {
    fps:    '../../reference/videos/FF.mp4',
    gta:    '../../reference/videos/GTA.mp4',
    roblox: '../../reference/videos/roblox.mp4',
  };
  function ensurePlaybackVideo() {
    if (playbackVideoEl) return playbackVideoEl;
    const v = document.createElement('video');
    v.muted = true;
    v.loop  = true;
    v.playsInline = true;
    v.autoplay    = true;
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;';
    v.setAttribute('aria-hidden', 'true');
    document.body.appendChild(v);
    playbackVideoEl = v;
    return v;
  }
  function ensureFallbackViewerVideo() {
    if (fallbackViewerVideoEl) return fallbackViewerVideoEl;
    const v = document.createElement('video');
    v.muted = true;
    v.loop  = true;
    v.playsInline = true;
    v.autoplay = true;
    v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;';
    v.setAttribute('aria-hidden', 'true');
    document.body.appendChild(v);
    fallbackViewerVideoEl = v;
    return v;
  }
  function getViewerVideoEl() {
    if (playbackVideoEl && playbackVideoEl.readyState >= 2) return playbackVideoEl;
    const liveVideo = document.getElementById('live-video');
    if (liveVideo && liveVideo.readyState >= 2) return liveVideo;
    const mode = window.LiveMode || 'fps';
    const url = MODE_VIDEO[mode] || MODE_VIDEO.fps;
    const v = ensureFallbackViewerVideo();
    if (v.src !== url) {
      v.src = url;
      v.load();
      v.play().catch(() => {});
    }
    return v.readyState >= 2 ? v : null;
  }

  function startClipCanvasAnimation() {
    stopClipCanvasAnimation();
    const cv = document.getElementById('result-clip-canvas');
    if (!cv) return;
    if (!fitCanvas(cv)) {
      // setTimeout (not rAF) for retry — rAF gets throttled to ~1Hz on
      // backgrounded tabs, which delays fit by seconds and would let the
      // winner-clip recorder capture an empty canvas.
      setTimeout(startClipCanvasAnimation, 33);
      return;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) { setTimeout(startClipCanvasAnimation, 33); return; }   // ctx loss — retry, don't throw

    // If we recorded real player gameplay, prefer that as the viewer-half
    // source. Otherwise fall back to the mock scene.
    //
    // NOTE the race: encore_done arrives → PlayerRecorder.stop() called →
    // recorder.onstop fires LATER (event-queue). Meanwhile showResult is
    // synchronous and lands us here before the blob URL exists. Solution:
    //   1) check getLastUrl() — usually null on first call
    //   2) if PlayerRecorder is mid-finalize (waitForReady() returns a
    //      Promise), await it and swap mock → playback when ready
    //   3) if no recording in flight, stick with mock for the whole clip
    let usingPlayback = false;
    function switchToPlayback(url) {
      if (!url) return;
      const v = ensurePlaybackVideo();
      if (v.src !== url) {
        v.src = url;
        v.load();
      }
      v.play().catch(() => { /* user gesture needed — drawImage still works */ });
      usingPlayback = true;
    }
    const initialUrl = window.PlayerRecorder && window.PlayerRecorder.getLastUrl();
    if (initialUrl) {
      switchToPlayback(initialUrl);
    } else if (window.PlayerRecorder && window.PlayerRecorder.waitForReady) {
      const pending = window.PlayerRecorder.waitForReady();
      if (pending && typeof pending.then === 'function') {
        pending.then(out => {
          if (out && out.url) switchToPlayback(out.url);
        }).catch(() => { /* recording errored — keep mock */ });
      }
    }

    clipCanvasStart = performance.now();
    const draw = () => {
      const t = performance.now() - clipCanvasStart;
      const viewerVideo = getViewerVideoEl();
      if (usingPlayback && playbackVideoEl && playbackVideoEl.readyState >= 2) {
        const v = playbackVideoEl;
        const dw = cv.width, dh = cv.height;
        const sw = v.videoWidth || 1, sh = v.videoHeight || 1;
        const dr = dw / dh, sr = sw / sh;
        let sx = 0, sy = 0, cropW = sw, cropH = sh;
        if (sr > dr) { cropW = sh * dr; sx = (sw - cropW) / 2; }
        else         { cropH = sw / dr; sy = (sh - cropH) / 2; }
        ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, dw, dh);
      } else if (viewerVideo && viewerVideo.readyState >= 2) {
        const v = viewerVideo;
        const dw = cv.width, dh = cv.height;
        const sw = v.videoWidth || 1, sh = v.videoHeight || 1;
        const dr = dw / dh, sr = sw / sh;
        let sx = 0, sy = 0, cropW = sw, cropH = sh;
        if (sr > dr) { cropW = sh * dr; sx = (sw - cropW) / 2; }
        else         { cropH = sw / dr; sy = (sh - cropH) / 2; }
        ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, dw, dh);
      } else {
        drawMockEncoreScene(ctx, cv.width, cv.height, t);
      }
    };
    // setInterval (not rAF) — see comment above. We want this loop to keep
    // running during the 12s recording window even if the tab is idle.
    clipCanvasRAF = setInterval(draw, 1000 / 30);
  }
  function stopClipCanvasAnimation() {
    if (clipCanvasRAF) { clearInterval(clipCanvasRAF); clipCanvasRAF = null; }
    if (playbackVideoEl) {
      try { playbackVideoEl.pause(); } catch (_) {}
    }
  }

  // Host (top) half: paints the matching LIVE scene (fps/gta/roblox) from
  // window.LiveScenes (exported by streamer.html). Genre-consistent with
  // whatever the streamer was playing when the highlight triggered.
  function startClipHostCanvasAnimation() {
    stopClipHostCanvasAnimation();
    const cv = document.getElementById('result-clip-host-canvas');
    if (!cv) return;
    if (!fitCanvas(cv)) {
      setTimeout(startClipHostCanvasAnimation, 33);
      return;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) { setTimeout(startClipHostCanvasAnimation, 33); return; }   // ctx loss — retry, don't throw
    const mode = (window.LiveMode || 'fps');
    const sceneFn = (window.LiveScenes && window.LiveScenes[mode]) || null;
    const liveVideo = document.getElementById('live-video');
    clipHostCanvasStart = performance.now();
    const draw = () => {
      const t = performance.now() - clipHostCanvasStart;
      if (liveVideo && liveVideo.readyState >= 2) {
        const v = liveVideo;
        const dw = cv.width, dh = cv.height;
        const sw = v.videoWidth || 1, sh = v.videoHeight || 1;
        const dr = dw / dh, sr = sw / sh;
        let sx = 0, sy = 0, cropW = sw, cropH = sh;
        if (sr > dr) { cropW = sh * dr; sx = (sw - cropW) / 2; }
        else         { cropH = sw / dr; sy = (sh - cropH) / 2; }
        ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, dw, dh);
      } else if (sceneFn) {
        sceneFn(ctx, cv.width, cv.height, t);
      }
    };
    // setInterval — keep drawing through backgrounded tabs so the recorder
    // doesn't see an empty canvas. See same comment on viewer-half above.
    clipHostCanvasRAF = setInterval(draw, 1000 / 30);
  }
  function stopClipHostCanvasAnimation() {
    if (clipHostCanvasRAF) { clearInterval(clipHostCanvasRAF); clipHostCanvasRAF = null; }
  }

  // Tear down everything related to the winner clip preview (used when
  // switching to non-winner state or closing the sheet).
  function stopAllClipAnimations() {
    stopClipCanvasAnimation();
    stopClipHostCanvasAnimation();
    if (window.ClipComposer) window.ClipComposer.stop();
    // Reset action buttons + revoke stale blob URL
    if (clipOutputBlobUrl) { URL.revokeObjectURL(clipOutputBlobUrl); clipOutputBlobUrl = null; }
    const out = document.getElementById('result-clip-output');
    if (out) { out.hidden = true; out.removeAttribute('src'); }
    const dl = document.getElementById('result-clip-download');
    const sh = document.getElementById('result-clip-share');
    if (dl) { dl.disabled = true; dl.textContent = '⬇ recording…'; }
    if (sh) { sh.disabled = true; sh.textContent = '↗ share'; }
  }

  // Kicks the on-screen split-screen draw + the offscreen composite
  // recorder. When ClipComposer fires onReady, swap the preview canvases
  // for a real <video> playback of the recorded blob and enable
  // Download / Share buttons.
  function startWinnerClipComposition() {
    startClipHostCanvasAnimation();
    startClipCanvasAnimation();
    if (!window.ClipComposer) return;   // graceful degrade if script missing

    const hostCv   = document.getElementById('result-clip-host-canvas');
    const viewerCv = document.getElementById('result-clip-canvas');
    const compCv   = document.getElementById('result-clip-composite');
    if (!hostCv || !viewerCv || !compCv) return;

    window.ClipComposer.start({
      hostCanvas:      hostCv,
      viewerCanvas:    viewerCv,
      compositeCanvas: compCv,
      mode:            (window.LiveMode || 'fps'),
      onReady: ({ url, mime }) => {
        clipOutputBlobUrl = url;
        const out  = document.getElementById('result-clip-output');
        const prev = document.getElementById('result-clip-preview');
        if (out) {
          out.src = url;
          out.hidden = false;
          out.play().catch(() => { /* user gesture required — controls handle it */ });
        }
        if (prev) prev.style.display = 'none';     // hide the live split-screen
        const dl = document.getElementById('result-clip-download');
        const sh = document.getElementById('result-clip-share');
        if (dl) {
          dl.disabled = false;
          dl.textContent = '⬇ Download';
          dl.onclick = () => downloadBlobUrl(url, suggestedFileName(mime));
        }
        if (sh) {
          sh.disabled = false;
          sh.textContent = '↗ Share';
          sh.onclick = () => shareBlobUrl(url, mime);
        }
      },
      onError: (err) => {
        console.warn('[ClipComposer] recording failed:', err && err.message);
        // Disable share, keep download as "preview only" fallback
        const dl = document.getElementById('result-clip-download');
        const sh = document.getElementById('result-clip-share');
        if (dl) { dl.disabled = true; dl.textContent = '⚠ rec unsupported'; }
        if (sh) { sh.disabled = true; }
      },
    });
  }

  function suggestedFileName(mime) {
    const ext = mime && mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    return `encore-clip.${ext}`;
  }
  function downloadBlobUrl(url, filename) {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function shareBlobUrl(url, mime) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], suggestedFileName(mime), { type: mime || 'video/webm' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Encore clip',
          text:  "Played @TK_Soi's highlight — ranked top-3 on Encore ⚡",
        });
      } else {
        // No Web Share — fall back to download
        downloadBlobUrl(url, suggestedFileName(mime));
      }
    } catch (e) {
      console.warn('[ClipComposer] share failed:', e && e.message);
    }
  }

  function drawMockEncoreScene(ctx, w, h, t) {
    // Background — twilight desert gradient like FPS template
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0,    '#241b2f');
    sky.addColorStop(0.55, '#3a2540');
    sky.addColorStop(1,    '#1f1828');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Distant horizon line + mountain silhouette (parallax slow)
    const horizonY = h * 0.55;
    const px = (t * 0.012) % w;
    ctx.fillStyle = '#0e0a14';
    for (let i = -1; i < 3; i++) {
      ctx.beginPath();
      const baseX = i * w - px;
      ctx.moveTo(baseX,           horizonY);
      ctx.lineTo(baseX + w * 0.2, horizonY - 18);
      ctx.lineTo(baseX + w * 0.35,horizonY - 6);
      ctx.lineTo(baseX + w * 0.55,horizonY - 22);
      ctx.lineTo(baseX + w * 0.8, horizonY - 10);
      ctx.lineTo(baseX + w,       horizonY);
      ctx.closePath();
      ctx.fill();
    }

    // Ground (below horizon) — checker tiles parallax fast
    ctx.fillStyle = '#19121f';
    ctx.fillRect(0, horizonY, w, h - horizonY);
    const tile = 14;
    const px2 = (t * 0.06) % tile;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = horizonY; y < h; y += tile) {
      const rowOffset = ((Math.floor((y - horizonY) / tile)) % 2) * tile;
      for (let x = -tile + rowOffset - px2; x < w; x += tile * 2) {
        ctx.fillRect(x, y, tile, 2);
      }
    }

    // Scanline shimmer (subtle CRT)
    const scanY = (t * 0.18) % h;
    const grd = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
    grd.addColorStop(0,   'rgba(37,244,238,0)');
    grd.addColorStop(0.5, 'rgba(37,244,238,0.08)');
    grd.addColorStop(1,   'rgba(37,244,238,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, scanY - 30, w, 60);

    // Pixel character — moves left/right, idle bob
    const charBaseX = w * 0.5 + Math.sin(t * 0.0008) * (w * 0.18);
    const charBaseY = h * 0.78 + Math.sin(t * 0.005) * 1.5;
    const stepFrame = Math.floor(t / 200) % 2;
    drawPixelChar(ctx, charBaseX, charBaseY, stepFrame);

    // Crosshair tracks toward the active enemy
    const enemyT = ((t * 0.0006) % 1);
    const enemyX = w * (0.15 + enemyT * 0.7);
    const enemyY = horizonY + 26 + Math.sin(t * 0.006) * 3;
    const crossX = charBaseX + (enemyX - charBaseX) * 0.9;
    const crossY = charBaseY - 18 + (enemyY - (charBaseY - 18)) * 0.9;
    drawCrosshair(ctx, crossX, crossY, t);

    // Muzzle flash + tracer on fire beats
    const fireBeat = (t % 700) < 90;
    if (fireBeat) {
      ctx.strokeStyle = 'rgba(255,210,0,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(charBaseX + 4, charBaseY - 10);
      ctx.lineTo(crossX, crossY);
      ctx.stroke();
      // Muzzle
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(charBaseX + 3, charBaseY - 11, 3, 2);
    }

    // Enemy — pixel block
    ctx.fillStyle = '#FE2C55';
    ctx.fillRect(enemyX - 4, enemyY - 6, 8, 10);
    ctx.fillStyle = '#7a1029';
    ctx.fillRect(enemyX - 4, enemyY + 4, 8, 2);
    // Enemy "hit flash" when crosshair is near
    const dist = Math.hypot(crossX - enemyX, crossY - enemyY);
    if (dist < 12 && fireBeat) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(enemyX - 5, enemyY - 7, 10, 12);
    }

    // Score float — "+150" rising near char
    const floatPhase = (t % 2400) / 2400;
    if (floatPhase < 0.7) {
      const fy = charBaseY - 30 - floatPhase * 30;
      ctx.fillStyle = `rgba(37,244,238,${(1 - floatPhase / 0.7) * 0.9})`;
      ctx.font = 'bold 10px "Space Grotesk", monospace';
      ctx.fillText('+150', charBaseX + 8, fy);
    }

    // HUD score corner top-right
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '8px "Space Grotesk", monospace';
    ctx.fillText('HP', 6, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(20, 6, 28, 6);
    const hpFrac = 0.7 + Math.sin(t * 0.002) * 0.15;
    ctx.fillStyle = '#25F4EE';
    ctx.fillRect(20, 6, 28 * hpFrac, 6);
  }

  function drawPixelChar(ctx, x, y, stepFrame) {
    // 8x14 px character
    ctx.fillStyle = '#f1ddb6'; // skin tone
    ctx.fillRect(x - 2, y - 16, 4, 4);     // head
    ctx.fillStyle = '#e8e3d6'; // torso
    ctx.fillRect(x - 3, y - 12, 6, 7);     // body
    ctx.fillStyle = '#3a3026'; // weapon
    ctx.fillRect(x + 2, y - 11, 6, 1);
    ctx.fillStyle = '#1f1a14'; // legs
    if (stepFrame === 0) {
      ctx.fillRect(x - 3, y - 5, 2, 5);
      ctx.fillRect(x + 1, y - 5, 2, 5);
    } else {
      ctx.fillRect(x - 4, y - 5, 2, 5);
      ctx.fillRect(x + 2, y - 5, 2, 5);
    }
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCrosshair(ctx, x, y, t) {
    ctx.strokeStyle = '#25F4EE';
    ctx.lineWidth = 1;
    const r = 7 + Math.sin(t * 0.008) * 1;
    ctx.beginPath();
    ctx.moveTo(x - r - 2, y); ctx.lineTo(x - 2, y);
    ctx.moveTo(x + 2, y);     ctx.lineTo(x + r + 2, y);
    ctx.moveTo(x, y - r - 2); ctx.lineTo(x, y - 2);
    ctx.moveTo(x, y + 2);     ctx.lineTo(x, y + r + 2);
    ctx.stroke();
  }

  function wireResultPageOnce() {
    if (wireResultPageOnce.done) return;
    wireResultPageOnce.done = true;

    // Caption inline edit
    const captionEl = document.getElementById('result-caption-text');
    const editBtn   = document.getElementById('result-caption-edit');
    if (editBtn && captionEl) {
      editBtn.addEventListener('click', () => {
        const editing = captionEl.getAttribute('contenteditable') === 'true';
        captionEl.setAttribute('contenteditable', editing ? 'false' : 'true');
        editBtn.textContent = editing ? 'edit' : 'done';
        if (!editing) {
          captionEl.focus();
          // Place cursor at end
          const range = document.createRange();
          range.selectNodeContents(captionEl);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    }

    // Publish controls
    const cancelBtn = document.getElementById('result-publish-cancel');
    const nowBtn    = document.getElementById('result-publish-now');
    if (cancelBtn) cancelBtn.addEventListener('click', markCancelled);
    if (nowBtn)    nowBtn.addEventListener('click', () => { cancelPublishCountdown(); markPublished(); });

    // Enhance CTA → REAL per-game gift: send the rolled gift + start a boosted
    // replay (sendGiftBoost). Replaces the v0.8.1 text-swap mock + its gift-gate
    // (Enhance only enhances — no "送礼换试玩" gating).
    const enhCta = document.getElementById('result-enhance-cta');
    if (enhCta) enhCta.addEventListener('click', sendGiftBoost);

    // Clip play / sound / regenerate — UI-only mocks for demo
    const playOverlay = document.getElementById('result-clip-play');
    if (playOverlay) {
      playOverlay.addEventListener('click', () => {
        playOverlay.style.opacity = '0';
        // In real impl: trigger <video>.play()
      });
    }
    const soundBtn = document.getElementById('result-clip-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const muted = soundBtn.textContent.startsWith('🔇');
        soundBtn.textContent = muted ? '🔊 sound on' : '🔇 muted';
      });
    }
    const regenBtn = document.getElementById('result-clip-regen');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => {
        regenBtn.textContent = '↻ regenerated';
        regenBtn.disabled = true;
        setTimeout(() => { regenBtn.textContent = '↻ regenerate'; regenBtn.disabled = false; }, 1500);
      });
    }
  }

  function showResult({ won, score, max }) {
    setPhase('result');
    const wrap = document.getElementById('phase-result');

    const rinfo = rankFromResult({ won, score, max });
    wrap.classList.toggle('lost', !rinfo.isWinner);

    // v0.8 big RANK chip
    const medalEl = document.getElementById('result-rank-medal');
    const numEl   = document.getElementById('result-rank-num-big');
    if (medalEl) medalEl.textContent = rinfo.medal;
    if (numEl)   numEl.textContent   = rinfo.rank;

    // Score / host columns (kept from v0.7 for compact summary)
    document.getElementById('result-score').textContent = score;
    document.getElementById('result-max').textContent   = max;
    document.getElementById('host-score').textContent   = Math.max(1, max - 2);
    document.getElementById('host-max').textContent     = max;

    // Legacy secondary rank pill (still opens ranking sub-phase);
    // v0.8.1 uses the same rank as the big chip so numbers are consistent
    document.getElementById('rank-num').textContent = rinfo.rank;

    // Update viewer score on bottom-half of clip preview
    const vscore = document.getElementById('result-clip-vscore');
    if (vscore) vscore.textContent = score.toLocaleString();

    wireResultPageOnce();

    // Reset publish state (winner only) — user-initiated, no auto-countdown.
    // viewer taps "Publish ⚡" or "Maybe later"; "✓ Published" only shows
    // after explicit click.
    cancelPublishCountdown();
    const publishMsg = document.querySelector('#result-publish-wrap .sheet-result-publish-msg');
    if (publishMsg) {
      publishMsg.classList.remove('cancelled', 'published');
      publishMsg.innerHTML = 'Ready to publish to TikTok?';
    }
    if (rinfo.isWinner) {
      // Reset clip state from any prior round (output blob / buttons /
      // hidden preview), then start a fresh recording.
      stopAllClipAnimations();
      const prev = document.getElementById('result-clip-preview');
      if (prev) prev.style.display = '';
      // Genre-match viewer tag emoji to current LIVE mode.
      const viewerTag = document.getElementById('result-clip-viewer-tag');
      if (viewerTag) {
        const mode = (window.LiveMode || 'fps');
        viewerTag.textContent =
          mode === 'gta'    ? '⊕ GTA'
        : mode === 'roblox' ? '⊕ OBBY'
        : '⊕ FPS';
      }
      // Kick the offscreen composite + MediaRecorder. After ~12s a real
      // .webm/.mp4 Blob is ready and Download / Share buttons enable.
      startWinnerClipComposition();
    } else {
      // Non-winner shows Retry card instead of clip → tear down everything
      stopAllClipAnimations();
      // Compute spots-from-#3 gap for the Retry card stats
      const gapEl = document.getElementById('result-retry-gap');
      if (gapEl) {
        const youRank = rinfo.rank; // already a faux rank like 15 / 1872
        gapEl.textContent = Math.max(1, youRank - 3);
      }
    }

    // Enhance CTA → our per-game gift pool (rotates each round; won=Flex / lost=Comeback)
    updateEnhanceCta(won);
  }

  function playAgain() {
    destroyIframe();
    document.getElementById('phase-game').innerHTML = '';
    startLoading();
  }

  function giftPoolFor(t) { return GIFT_POOLS[t] || GIFT_POOLS.br; }

  // Pick the NEXT gift in this template's pool (rotates each result screen → variety).
  function rollGift(t) {
    const pool = giftPoolFor(t);
    const i = (giftRotation[t] || 0) % pool.length;
    giftRotation[t] = i + 1;
    return pool[i];
  }

  function currentGiftBoost() {
    if (pickedGift) return pickedGift;
    const t = (currentConfig && currentConfig.template) || 'br';
    return (pickedGift = rollGift(t));
  }

  // Drives PR#19's v0.8 Enhance CTA (#result-enhance-cta) with our per-game gift
  // pool — rotates each round so every offer differs.
  function updateEnhanceCta(won) {
    const t = (currentConfig && currentConfig.template) || 'br';
    pickedGift = rollGift(t);                       // fresh, different gift each round (variety)
    const g = pickedGift;
    const cta = document.getElementById('result-enhance-cta');
    if (!cta) return;
    cta.style.pointerEvents = '';
    const ico = cta.querySelector('.ico'), head = cta.querySelector('.head'), sub = cta.querySelector('.sub'), price = cta.querySelector('.price');
    if (ico)  ico.textContent  = g.ico;
    // won → flex/show-off framing; lost → comeback framing (the empathetic second wind)
    if (head) head.textContent = (won ? 'Flex it · ' : 'Comeback · ') + g.head;
    if (sub)  sub.textContent  = won ? (g.sub + ' — go viral') : (g.sub + ' — bounce back');
    if (price) price.textContent = g.button;        // 🌹 5
    // Enhance only ENHANCES — never gate play behind a gift (no 送礼换试玩)
    const gate = document.getElementById('result-enhance-gate'); if (gate) gate.hidden = true;
  }

  function makeGiftBoostConfig() {
    const base = currentConfig || makeRandomConfig();
    const boost = currentGiftBoost();
    const scenario = Object.assign({}, base.scenario || {}, {
      gift_boost: boost.key,
      gift_label: boost.head,
      description: (base.scenario && base.scenario.description) || TEMPLATE_DESC[base.template] || 'gift boosted run',
    });
    return Object.assign({}, base, {
      scenario,
      _meta: Object.assign({}, base._meta || {}, {
        gift: boost.key,
        coins: 5,
        model: 'demo-gift-boost',
      }),
    });
  }

  function sendGiftBoost() {
    const boost = currentGiftBoost();
    const boosted = makeGiftBoostConfig();
    cfg.onAck && cfg.onAck(boost.ico + ' ' + boost.head + ' sent · enjoy the boost!');
    pickedGift = null;                              // next round rolls a fresh gift
    destroyIframe();
    document.getElementById('phase-game').innerHTML = '';
    startLoading(boosted);
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
    // Note: v0.8 removed share-pill and gift-remix from HTML (replaced by
    // split-screen clip flow); guard for null in case they come back.
    document.getElementById('rank-pill')?.addEventListener('click', showRanking);
    document.getElementById('share-pill')?.addEventListener('click', () => {
      cfg.onAck && cfg.onAck('Share — coming soon');
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

  // Expose showResult + a "force-open into a specific phase" helper for
  // URL-hash demo driver (e.g. ?#result-winner) and integration tests.
  function forceResult({ won, score, max }) {
    if (!cfg) return; // not initialised yet
    cfg.sheet.classList.remove('hidden');
    cfg.backdrop && cfg.backdrop.classList.remove('hidden');
    setPhase('result');
    showResult({ won, score, max });
  }

  window.EncoreSheet = { init, open, close, forceResult, showResult };
})();
