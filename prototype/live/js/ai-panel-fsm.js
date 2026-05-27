/**
 * ai-panel-fsm.js · Stage 3
 *
 * Bottom-sheet 4-state state machine:
 *
 *   CLOSED ──user-click──> LOADING ──iframe-ready──> PLAYING
 *      ▲                                                │
 *      │                                                │ encore_done
 *      │                                                ▼
 *      │  ◄─────── close / button click ──── FEEDBACK <── 300ms ──── ENDED
 *      │
 *      └── user clicks close X in sheet header (any state)
 *
 * The iframe (game) is RELOADED on every launch (panel reopen always
 * gives a fresh game, no pause/resume protocol). On close mid-game,
 * iframe.src is set to 'about:blank' to destroy game state.
 *
 * Public API:
 *   AiPanel.init({ sheet, frame, pill, header, closeBtn, loadingEl, timerEl,
 *                  onActive, onIdle, onEnd: (stats) => {} })
 *   AiPanel.launch(config)
 *   AiPanel.close()
 *   AiPanel.state()         // returns 'closed' | 'loading' | 'playing' | 'ended' | 'feedback'
 *   AiPanel.isActive()      // true when state != 'closed'
 */
(function (root) {
  'use strict';

  // Round duration per template (mirror encore_prototype.html Games.x.duration).
  // Used for the parent-side countdown shown in sheet header.
  const ROUND_DURATION = { fps: 30, moba: 45, br: 30, td: 30 };

  const ENDED_TO_FEEDBACK_MS = 300;
  const FEEDBACK_AUTO_CLOSE_MS = 4000;
  const LOADING_FALLBACK_MS = 2500;   // if encore_ready never arrives, force launch
  const IFRAME_URL = '../encore_prototype.html?embedded=1';

  let cfg = null;
  let state = 'closed';
  let pendingConfig = null;
  let countdownTimer = null;
  let endedTimer = null;
  let feedbackAutoTimer = null;
  let loadingFallbackTimer = null;
  let lastStats = null;

  function setState(next) {
    if (state === next) return;
    state = next;
    cfg.sheet.dataset.state = next;
  }

  function showLoading(config) {
    cfg.loadingEl.classList.remove('hidden');
    cfg.loadingEl.classList.add('show');
    const sc = config.scenario || {};
    const desc = sc.description || `${config.template} · ${config.theme}`;
    cfg.loadingEl.querySelector('.subline').textContent = desc;
  }

  function hideLoading() {
    cfg.loadingEl.classList.remove('show');
    cfg.loadingEl.classList.add('hidden');
  }

  function startCountdown(template) {
    let secs = ROUND_DURATION[template] || 30;
    cfg.timerEl.textContent = '0:' + String(secs).padStart(2, '0');
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      secs = Math.max(0, secs - 1);
      cfg.timerEl.textContent = '0:' + String(secs).padStart(2, '0');
      if (secs <= 0) clearInterval(countdownTimer);
    }, 1000);
  }

  function stopCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    cfg.timerEl.textContent = '';
  }

  function sendLaunch(config) {
    try {
      cfg.frame.contentWindow.postMessage({ type: 'launch', config }, '*');
    } catch (e) { console.warn('postMessage failed:', e); }
  }

  // ── PUBLIC: launch ─────────────────────────────────────────────────
  function launch(config) {
    if (state !== 'closed') return; // ignore duplicate clicks
    pendingConfig = config;
    setState('loading');

    cfg.sheet.classList.add('open');
    cfg.pill.textContent = `${(config.template || '').toUpperCase()} · ${(config.theme || '').toUpperCase()}`;
    cfg.timerEl.textContent = '';
    showLoading(config);

    if (cfg.onActive) cfg.onActive();

    // Force-reload the iframe so each open is a fresh game (no stale state).
    cfg.frame.src = IFRAME_URL;

    // If encore_ready doesn't arrive within fallback window, fire anyway.
    if (loadingFallbackTimer) clearTimeout(loadingFallbackTimer);
    loadingFallbackTimer = setTimeout(() => {
      if (state === 'loading' && pendingConfig) {
        console.warn('[AiPanel] encore_ready timeout, firing launch anyway');
        promoteToPlaying();
      }
    }, LOADING_FALLBACK_MS);
  }

  function promoteToPlaying() {
    if (state !== 'loading' || !pendingConfig) return;
    if (loadingFallbackTimer) { clearTimeout(loadingFallbackTimer); loadingFallbackTimer = null; }
    const config = pendingConfig;
    pendingConfig = null;
    sendLaunch(config);
    hideLoading();
    setState('playing');
    startCountdown(config.template);
  }

  // ── PUBLIC: close (also bound to sheet header X button) ────────────
  function close() {
    if (state === 'closed') return;
    setState('closed');
    cfg.sheet.classList.remove('open');
    // Destroy game state so reopen always starts fresh.
    cfg.frame.src = 'about:blank';
    hideLoading();
    stopCountdown();
    if (endedTimer) { clearTimeout(endedTimer); endedTimer = null; }
    if (feedbackAutoTimer) { clearTimeout(feedbackAutoTimer); feedbackAutoTimer = null; }
    if (loadingFallbackTimer) { clearTimeout(loadingFallbackTimer); loadingFallbackTimer = null; }
    pendingConfig = null;
    if (cfg.onIdle) cfg.onIdle();
  }

  // ── PostMessage handler from iframe ────────────────────────────────
  function onMessage(e) {
    const d = e.data;
    if (!d || typeof d !== 'object') return;

    if (d.type === 'encore_ready') {
      // The iframe just finished loading and is awaiting launch.
      promoteToPlaying();
    } else if (d.type === 'encore_progress') {
      // Optional, Mario can opt-in to override our local countdown
      if (state === 'playing' && typeof d.timeLeft === 'number') {
        const secs = Math.max(0, Math.ceil(d.timeLeft));
        cfg.timerEl.textContent = '0:' + String(secs).padStart(2, '0');
      }
    } else if (d.type === 'encore_done') {
      if (state !== 'playing') return;
      lastStats = d.stats || {};
      stopCountdown();
      setState('ended');
      // Brief pause so user can read the in-iframe end card before
      // we slap the Fun/Hard/Remix feedback on top of it.
      endedTimer = setTimeout(() => {
        endedTimer = null;
        if (state !== 'ended') return;
        setState('feedback');
        if (cfg.onEnd) cfg.onEnd(lastStats);
        feedbackAutoTimer = setTimeout(() => {
          feedbackAutoTimer = null;
          if (state === 'feedback') close();
        }, FEEDBACK_AUTO_CLOSE_MS);
      }, ENDED_TO_FEEDBACK_MS);
    }
  }

  // ── PUBLIC: feedback chose a reaction → close immediately ───────────
  function feedbackChosen() {
    if (feedbackAutoTimer) { clearTimeout(feedbackAutoTimer); feedbackAutoTimer = null; }
    setTimeout(close, 900); // let the toast animation finish
  }

  root.AiPanel = {
    init(config) {
      cfg = config;
      cfg.sheet.dataset.state = 'closed';
      window.addEventListener('message', onMessage);
      if (cfg.closeBtn) cfg.closeBtn.addEventListener('click', close);
      // Iframe blank on first load — only fetched on first launch
      cfg.frame.src = 'about:blank';
    },
    launch,
    close,
    feedbackChosen,
    state: () => state,
    isActive: () => state !== 'closed',
    getLastStats: () => lastStats,
  };
})(window);
