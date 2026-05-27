/**
 * observer-client.js
 *
 * Polls the local observer.py proxy (which fronts Claude Vision) with one
 * downsampled JPEG frame every SAMPLE_INTERVAL_MS. Tracks running cost
 * across calls and exposes:
 *
 *   ObserverClient.start({ video, onHighlight, onStatus, onCost })
 *     starts the sample loop
 *   ObserverClient.pause()  / .resume()
 *     pause sampling (used while a game is active)
 *
 * Stage 1: behaviour identical to the old streamer.html. Future Stages may
 * stop auto-pop on highlight (Stage 3 makes the panel manual-open).
 */
(function (root) {
  'use strict';

  const OBSERVER_URL = 'http://127.0.0.1:8081/analyze';
  const SAMPLE_INTERVAL_MS    = 4000;
  const CONFIDENCE_THRESHOLD  = 0.6;
  const JPEG_QUALITY          = 0.6;
  const FRAME_MAX_WIDTH       = 480;

  let timer = null;
  let inflight = false;
  let totalCost = 0;
  let sampleCount = 0;
  let detectCount = 0;
  let paused = false;
  let cfg = null;

  function grabFrame(video) {
    if (!video.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = FRAME_MAX_WIDTH;
    c.height = Math.round(FRAME_MAX_WIDTH * video.videoHeight / video.videoWidth);
    try {
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    } catch (e) {
      console.warn('frame grab failed (CORS?):', e);
      return null;
    }
    return c.toDataURL('image/jpeg', JPEG_QUALITY);
  }

  async function sample() {
    if (paused || inflight) return;
    const dataUrl = grabFrame(cfg.video);
    if (!dataUrl) {
      cfg.onStatus('idle', 'no video frame available yet…');
      return;
    }
    sampleCount++;
    inflight = true;
    const t = cfg.video.currentTime;
    cfg.onStatus('analyzing', `🤖 Claude analyzing frame @ ${t.toFixed(1)}s (#${sampleCount})…`);
    try {
      const resp = await fetch(OBSERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, t }),
      });
      const data = await resp.json();
      if (data.busy) {
        cfg.onStatus('sampling', `observer busy, will retry next tick`);
        return;
      }
      if (data._meta) {
        const m = data._meta;
        const cost = (m.tokens_in * 3 + m.tokens_out * 15) / 1_000_000;
        totalCost += cost;
        cfg.onCost('$' + totalCost.toFixed(4));
      }
      if (data.error) {
        cfg.onStatus('idle', 'analyze error: ' + data.error);
        return;
      }
      if (data.highlight && (data.confidence || 0) >= CONFIDENCE_THRESHOLD) {
        detectCount++;
        const sc = data.scenario || {};
        cfg.onStatus('detected', `🎯 HIGHLIGHT #${detectCount} (${Math.round(data.confidence*100)}%): ${sc.description || data.template}`);
        cfg.onHighlight(data);
      } else {
        const sc = data.scenario || {};
        const note = sc.description ? ` — ${sc.description}` : '';
        cfg.onStatus('sampling', `· no highlight @ ${t.toFixed(1)}s (conf ${Math.round((data.confidence||0)*100)}%)${note}`);
      }
    } catch (e) {
      cfg.onStatus('idle', 'observer offline: ' + e.message + ' (start observer.py?)');
    } finally {
      inflight = false;
    }
  }

  root.ObserverClient = {
    start(config) {
      cfg = config;
      paused = false;
      cfg.onStatus('sampling', `👁 sampling every ${SAMPLE_INTERVAL_MS/1000}s`);
      if (timer) clearInterval(timer);
      timer = setInterval(sample, SAMPLE_INTERVAL_MS);
      setTimeout(sample, 2000);
    },
    pause() { paused = true; },
    resume() {
      paused = false;
      cfg && cfg.onStatus('sampling', `👁 resumed sampling`);
    },
    forceSample() { sample(); },
    getCost() { return totalCost; },
  };
})(window);
