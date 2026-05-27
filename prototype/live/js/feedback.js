/**
 * feedback.js · Stage 4
 *
 * The Fun / Too hard / Remix card that overlays the bottom sheet after
 * a game ends. Each button shows a confirmation toast then asks the
 * AiPanel FSM to close.
 *
 * Public API:
 *   Feedback.init({ card, toast, buttons (NodeList), statsEl, onChosen(kind, stats) })
 *   Feedback.show(stats)   // called by streamer.js when AiPanel.onEnd fires
 */
(function (root) {
  'use strict';

  const TOAST_TEXTS = {
    fun:   '✓ Glad you liked it!',
    hard:  "✓ We'll tune it down",
    remix: '✓ Generating remix… (M11+)',
  };
  const TOAST_MS = 900;

  let cfg = null;

  function setStats(stats) {
    if (!cfg.statsEl || !stats) return;
    const won = stats.won ? 'VICTORY' : 'DEFEAT';
    const parts = [won];
    if (typeof stats.kills === 'number') parts.push(`${stats.kills} KILLS`);
    if (typeof stats.duration === 'number') parts.push(`${stats.duration.toFixed(1)}s`);
    else if (typeof stats.time === 'number') parts.push(`${stats.time.toFixed(1)}s`);
    cfg.statsEl.textContent = parts.join(' · ');
  }

  function showToast(kind) {
    if (!cfg.toast) return;
    cfg.toast.textContent = TOAST_TEXTS[kind] || '✓ Thanks!';
    cfg.toast.classList.add('show');
    setTimeout(() => { cfg.toast.classList.remove('show'); }, TOAST_MS);
  }

  function bindButtons() {
    cfg.buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.fb;
        showToast(kind);
        if (cfg.onChosen) cfg.onChosen(kind, root.AiPanel ? root.AiPanel.getLastStats() : null);
      });
    });
  }

  root.Feedback = {
    init(config) {
      cfg = config;
      bindButtons();
    },
    show(stats) {
      setStats(stats);
    },
  };
})(window);
