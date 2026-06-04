// ─────────────────────────────────────────────────────────────────────────
// player-recorder.js — capture the actual Encore gameplay
//
// Job: while the player is playing the Encore mini-game inside the iframe,
// record the game's <canvas> via MediaRecorder so the winner clip can
// stitch in REAL gameplay (not a mock) as the bottom half.
//
//   encore-sheet.js                     player-recorder.js
//   ─────────────────                   ──────────────────
//   game iframe loads                     ──►  attach(canvas)
//   "encore_ready"  message               ──►  start()
//   user plays the 30s game               ─── recording... ───
//   "encore_done"   message               ──►  stop() → onReady(blob, url)
//   winner state opens                    ──►  getLastUrl()
//                                              + clip-composer reads from
//                                                <video src=blob url> instead
//                                                of the mock scene
//
// Cross-origin notes: the game iframe is served from the same origin as
// the host page (both on localhost or both on Vercel), so we can reach
// in via iframe.contentDocument.querySelector('canvas'). If the canvas
// is "tainted" (loaded a cross-origin image without CORS), captureStream
// still works but the recording may end up blank — we degrade gracefully
// and the viewer-half mock scene takes over.
// ─────────────────────────────────────────────────────────────────────────

window.PlayerRecorder = (() => {
  const MAX_DURATION_MS = 60000;     // cap a runaway recording at 60s (was 30s)
  let activeCanvas = null;            // canvas currently being recorded
  let recorder = null;
  let chunks = [];
  let mimeType = '';
  let startedAt = 0;
  let timeoutId = null;
  let lastBlobUrl = null;             // most recent finalized clip
  let lastBlob = null;
  let pendingStopPromise = null;
  // Mobile debug — surfaced via a floating chip when ?debug=1 in URL
  // (see ensureDebugChip below). Each step writes here so we can SEE
  // what failed on a phone without console access.
  let debugState = 'idle';
  function setDebug(s) {
    debugState = s;
    const chip = document.getElementById('encore-rec-debug');
    if (chip) chip.textContent = '🎬 ' + s;
  }
  function ensureDebugChip() {
    if (!/[?&]debug=1\b/.test(location.search)) return;
    if (document.getElementById('encore-rec-debug')) return;
    const c = document.createElement('div');
    c.id = 'encore-rec-debug';
    c.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;padding:4px 8px;background:rgba(0,0,0,.7);color:#fff;border:1px solid #FE2C55;border-radius:4px;font:11px/1.4 monospace;pointer-events:none;max-width:80vw;';
    c.textContent = '🎬 ' + debugState;
    document.body.appendChild(c);
  }

  // Mime order matters: iOS Safari 14.3+ only supports mp4/H264. Android
  // Chrome supports webm. Safari often returns false for `video/mp4`
  // alone but true for the codec-qualified variant — list both.
  function pickMime() {
    if (!window.MediaRecorder) return '';
    const candidates = [
      'video/mp4;codecs=h264',         // iOS Safari primary
      'video/mp4',                      // iOS Safari fallback
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm;codecs=h264',
      'video/webm',
    ];
    for (const t of candidates) {
      try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (_) {}
    }
    return '';
  }

  // Start recording a specific canvas. Tears down any prior session +
  // revokes any prior blob URL.
  function start(canvas) {
    ensureDebugChip();
    stop();
    revokeLastUrl();
    if (!canvas) { setDebug('no canvas'); return false; }
    if (!canvas.width || !canvas.height) {
      // Canvas exists but isn't sized yet — retry in a beat
      setDebug('canvas 0x0, retrying');
      setTimeout(() => start(canvas), 200);
      return false;
    }
    mimeType = pickMime();
    if (!mimeType) { setDebug('no mime supported'); return false; }
    setDebug('mime: ' + mimeType.replace('video/', ''));

    try {
      if (typeof canvas.captureStream !== 'function') {
        setDebug('no captureStream');
        return false;
      }
      const stream = canvas.captureStream(30);
      const tracks = stream.getVideoTracks();
      if (!tracks.length) { setDebug('no video track'); return false; }
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_000_000,
      });
      chunks = [];
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
          setDebug('rec ● ' + chunks.length + ' chunks · ' + canvas.width + 'x' + canvas.height);
        }
      };
      recorder.onerror = (e) => {
        setDebug('rec err: ' + (e.error && e.error.name || 'unknown'));
        console.warn('[PlayerRecorder] recorder error:', e);
      };
      activeCanvas = canvas;
      startedAt = performance.now();
      // timeslice 1000ms — flushes chunks every 1s. CRITICAL on mobile
      // Safari which otherwise may not emit ondataavailable until stop().
      // Also makes the recording survive mid-game crashes.
      recorder.start(1000);
      setDebug('started ' + canvas.width + 'x' + canvas.height);
      timeoutId = setTimeout(() => stop(), MAX_DURATION_MS);
      return true;
    } catch (e) {
      setDebug('start err: ' + (e && e.message || e));
      console.warn('[PlayerRecorder] start failed:', e && e.message);
      recorder = null;
      activeCanvas = null;
      return false;
    }
  }

  // Returns a Promise that resolves to { blob, url } once MediaRecorder
  // finishes flushing chunks (its onstop event fires). If there's no
  // active recording, resolves to null immediately.
  function stop() {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    if (!recorder || recorder.state !== 'recording') {
      // Nothing in flight — return any pending stop promise OR null
      const p = pendingStopPromise || Promise.resolve(null);
      recorder = null;
      activeCanvas = null;
      return p;
    }
    pendingStopPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        lastBlob = new Blob(chunks, { type: mimeType });
        lastBlobUrl = URL.createObjectURL(lastBlob);
        const out = { blob: lastBlob, url: lastBlobUrl };
        setDebug('done: ' + Math.round(lastBlob.size/1024) + 'KB · ' + chunks.length + ' chunks');
        pendingStopPromise = null;
        resolve(out);
      };
      try { recorder.stop(); } catch (_) {
        setDebug('stop threw');
        pendingStopPromise = null;
        resolve(null);
      }
    });
    recorder = null;
    activeCanvas = null;
    return pendingStopPromise;
  }

  // For callers that didn't keep the stop() promise — returns the current
  // in-flight promise (if recording is finalizing) or null if there's no
  // pending finalization.
  function waitForReady() { return pendingStopPromise; }

  function revokeLastUrl() {
    if (lastBlobUrl) {
      try { URL.revokeObjectURL(lastBlobUrl); } catch (_) {}
      lastBlobUrl = null;
      lastBlob = null;
    }
  }

  function getLastUrl() { return lastBlobUrl; }
  function getLastBlob() { return lastBlob; }

  // Probe for the game canvas inside an iframe. Mario's templates render
  // via a single <canvas> at the top level of the prototype's DOM. We
  // poll for it because the canvas is created after the iframe finishes
  // loading + after the "launch" postMessage is processed.
  function findCanvasInIframe(iframe, { timeoutMs = 10000, onFound, onTimeout } = {}) {
    ensureDebugChip();
    setDebug('looking for canvas in iframe');
    const t0 = performance.now();
    // setInterval, not rAF: rAF gets throttled to ~1fps when the tab is
    // backgrounded, which would silently miss the canvas. 10s timeout
    // (was 3s) — mobile + slow networks need longer to load game assets
    // before Mario's prototype creates and sizes the <canvas id="game">.
    const iv = setInterval(() => {
      const doc = iframe && iframe.contentDocument;
      if (doc) {
        const canvases = Array.from(doc.querySelectorAll('canvas'));
        let best = null, bestArea = 0;
        for (const c of canvases) {
          const a = (c.width || 0) * (c.height || 0);
          if (a > bestArea) { best = c; bestArea = a; }
        }
        if (best && bestArea > 0) {
          clearInterval(iv);
          setDebug('canvas found ' + best.width + 'x' + best.height);
          onFound && onFound(best);
          return;
        }
      }
      if (performance.now() - t0 > timeoutMs) {
        clearInterval(iv);
        setDebug('canvas not found in ' + timeoutMs + 'ms');
        onTimeout && onTimeout();
      }
    }, 80);
  }

  return { start, stop, waitForReady, getLastUrl, getLastBlob, findCanvasInIframe };
})();
