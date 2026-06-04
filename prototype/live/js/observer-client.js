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

  const OBSERVER_URL = 'http://127.0.0.1:3000/vision-detect';
  const SAMPLE_INTERVAL_MS    = 4000;
  const CONFIDENCE_THRESHOLD  = 0.6;
  const JPEG_QUALITY          = 0.6;
  const FRAME_MAX_WIDTH       = 480;

  let timer = null;
  let retryTimer = null;
  let inflight = false;
  let totalCost = 0;
  let sampleCount = 0;
  let detectCount = 0;
  let paused = false;
  let cfg = null;
  let observerAvailable = true;
  const OFFLINE_RETRY_MS      = 15000;

  function scheduleSample(delay) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    timer = setTimeout(sample, delay);
  }

  function clearScheduledSample() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

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
    if (paused || inflight || !observerAvailable) return;
    const dataUrl = grabFrame(cfg.video);
    if (!dataUrl) {
      cfg.onStatus('idle', 'no video frame available yet…');
      scheduleSample(SAMPLE_INTERVAL_MS);
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
        body: JSON.stringify({ image_base64: dataUrl, timestamp: t, frame_index: Math.floor(t * 30) }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        cfg.onStatus('idle', 'vision error: ' + (data.detail || resp.status));
        scheduleSample(SAMPLE_INTERVAL_MS);
        return;
      }
      observerAvailable = true;
      if (data._meta) {
        const m = data._meta;
        const cost = (m.tokens_in * 3 + m.tokens_out * 15) / 1_000_000;
        totalCost += cost;
        cfg.onCost('$' + totalCost.toFixed(4));
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
      scheduleSample(SAMPLE_INTERVAL_MS);
    } catch (e) {
      observerAvailable = false;
      cfg.onStatus('idle', 'observer offline: ' + e.message + ' (start observer.py?)');
      clearScheduledSample();
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      retryTimer = setTimeout(() => {
        observerAvailable = true;
        retryTimer = null;
        sample();
      }, OFFLINE_RETRY_MS);
    } finally {
      inflight = false;
    }
  }

  root.ObserverClient = {
    start(config) {
      cfg = config;
      paused = false;
      observerAvailable = true;
      cfg.onStatus('sampling', `👁 sampling every ${SAMPLE_INTERVAL_MS/1000}s`);
      clearScheduledSample();
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      scheduleSample(2000);
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
