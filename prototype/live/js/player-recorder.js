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
  const MAX_DURATION_MS = 30000;     // cap a runaway recording at 30s
  let activeCanvas = null;            // canvas currently being recorded
  let recorder = null;
  let chunks = [];
  let mimeType = '';
  let startedAt = 0;
  let timeoutId = null;
  let lastBlobUrl = null;             // most recent finalized clip
  let lastBlob = null;
  // Tracks the in-flight "stop → onstop → blob ready" handoff. encore_done
  // arrives synchronously and we want to show the winner sheet IMMEDIATELY,
  // but MediaRecorder.onstop fires later (event-queue). Callers can await
  // this promise (or use the global pendingStopPromise via waitForReady())
  // to know when the URL is actually ready.
  let pendingStopPromise = null;

  function pickMime() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    if (!window.MediaRecorder) return '';
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  // Start recording a specific canvas. Tears down any prior session +
  // revokes any prior blob URL.
  function start(canvas) {
    stop();
    revokeLastUrl();
    if (!canvas) return false;
    mimeType = pickMime();
    if (!mimeType) return false;

    try {
      const stream = canvas.captureStream(30);
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_000_000,
      });
      chunks = [];
      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      // onstop handler is set in stop() so we can hand the resolver
      // back to whoever called stop().
      activeCanvas = canvas;
      startedAt = performance.now();
      recorder.start();
      // Hard cap so a stuck game doesn't run forever
      timeoutId = setTimeout(() => stop(), MAX_DURATION_MS);
      return true;
    } catch (e) {
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
        pendingStopPromise = null;
        resolve(out);
      };
      try { recorder.stop(); } catch (_) {
        // If stop throws, resolve null so callers don't hang forever
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
  function findCanvasInIframe(iframe, { timeoutMs = 3000, onFound, onTimeout } = {}) {
    const t0 = performance.now();
    // setInterval, not rAF: rAF gets throttled to ~1fps when the tab is
    // backgrounded, which would silently miss the canvas.
    const iv = setInterval(() => {
      const doc = iframe && iframe.contentDocument;
      if (doc) {
        // Prefer the largest canvas on the page (the game's main one), in
        // case there are HUD canvases too.
        const canvases = Array.from(doc.querySelectorAll('canvas'));
        let best = null, bestArea = 0;
        for (const c of canvases) {
          const a = (c.width || 0) * (c.height || 0);
          if (a > bestArea) { best = c; bestArea = a; }
        }
        if (best && bestArea > 0) { clearInterval(iv); onFound && onFound(best); return; }
      }
      if (performance.now() - t0 > timeoutMs) { clearInterval(iv); onTimeout && onTimeout(); }
    }, 80);
  }

  return { start, stop, waitForReady, getLastUrl, getLastBlob, findCanvasInIframe };
})();
