// ─────────────────────────────────────────────────────────────────────────
// clip-composer.js — real client-side winner-clip composition
//
// Job: produce a real, downloadable / shareable video Blob of the winner's
// split-screen clip (host highlight + viewer Encore replay) — not just an
// on-screen mock. Pipeline:
//
//   ┌─────────────────────┐   ┌─────────────────────┐
//   │ host canvas (live)  │   │ viewer canvas (live)│   ← already drawn by
//   │  fps/gta/roblox     │   │  drawMockEncoreScene│     encore-sheet.js
//   └──────────┬──────────┘   └──────────┬──────────┘     for on-screen
//              │ drawImage()             │ drawImage()    preview
//              ▼                         ▼
//   ┌────────────────────────────────────────────────┐
//   │ composite canvas (offscreen, 540×960 9:16)     │
//   │  • top half  = host canvas                     │
//   │  • bottom    = viewer canvas                   │
//   │  • overlays  = divider, brand, name tags,      │
//   │                progress bar, countdown text    │
//   └──────────┬─────────────────────────────────────┘
//              │ .captureStream(30)
//              ▼
//        MediaRecorder ──► Blob (.webm or .mp4) ──► URL.createObjectURL
//                                                    │
//                                                    ▼
//                                            <video id="result-clip-output">
//                                            + download / share buttons
//
// Why three canvases instead of one: the on-screen split-screen is sized
// by the result sheet's layout (responsive), but TikTok needs a fixed
// 9:16 video (540×960). Drawing into a separate offscreen canvas lets us
// produce a clip at the right aspect ratio independent of UI layout.
//
// Player-half source: currently the drawMockEncoreScene canvas (mock).
// Future: real player gameplay capture — wrap the Mario game-canvas in
// its own MediaRecorder during play, save the blob, play it back here
// instead of the mock. That's tracked as Step 2 of the winner-clip plan.
// ─────────────────────────────────────────────────────────────────────────

window.ClipComposer = (() => {
  const COMPOSITE_W = 540;
  const COMPOSITE_H = 960;
  const RECORD_DURATION_MS = 12000;

  // Active session state. One winner-clip recording at a time. start()
  // tears down any previous session before kicking off a new one.
  let active = null;

  function start({ hostCanvas, viewerCanvas, compositeCanvas, mode, hostLabel, viewerLabel, onReady, onError }) {
    stop(); // tear down any prior session

    if (!hostCanvas || !viewerCanvas || !compositeCanvas) {
      onError && onError(new Error('ClipComposer.start: missing canvas refs'));
      return;
    }
    compositeCanvas.width  = COMPOSITE_W;
    compositeCanvas.height = COMPOSITE_H;
    const cctx = compositeCanvas.getContext('2d');

    const startedAt = performance.now();
    // setInterval (not rAF) for the offscreen composite — rAF gets
    // throttled to ~1fps when the tab is backgrounded, which would stall
    // the recorder mid-stream. The offscreen composite doesn't need to
    // sync to display refresh anyway.
    let timerId = null;

    // Pick best supported recorder mime. Order matters: VP9 = best quality
    // on Chrome; vp8 falls back; mp4 catches Safari. If none supported,
    // we still draw on-screen but skip recording (graceful degrade).
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    const mime = candidates.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    let recorder = null;
    const chunks = [];
    if (mime) {
      try {
        const stream = compositeCanvas.captureStream(30);
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
        recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mime });
          const url  = URL.createObjectURL(blob);
          onReady && onReady({ blob, url, mime, durationMs: performance.now() - startedAt });
        };
        recorder.start();
      } catch (e) {
        recorder = null;
        onError && onError(e);
      }
    } else {
      onError && onError(new Error('MediaRecorder unsupported in this browser'));
    }

    // Composite draw loop — runs until stop() OR until RECORD_DURATION_MS
    // elapses (whichever first). Recorder finalizes onstop → onReady fires
    // with the blob URL.
    const draw = () => {
      const t = performance.now() - startedAt;
      drawComposite(cctx, hostCanvas, viewerCanvas, t, { hostLabel, viewerLabel, mode });
      if (recorder && t >= RECORD_DURATION_MS) {
        clearInterval(timerId);
        timerId = null;
        try { recorder.state === 'recording' && recorder.stop(); } catch (_) {}
      }
    };
    // 30 fps ≈ 33ms. setInterval (not requestAnimationFrame) so the loop
    // keeps running even if the tab is backgrounded mid-record.
    timerId = setInterval(draw, 1000 / 30);

    active = {
      stop() {
        if (timerId) { clearInterval(timerId); timerId = null; }
        if (recorder && recorder.state === 'recording') {
          try { recorder.stop(); } catch (_) {}
        }
      },
    };
  }

  function stop() {
    if (active) { active.stop(); active = null; }
  }

  // ── Composite drawing ──────────────────────────────────────────────────
  function drawComposite(ctx, hostCv, viewerCv, t, opts) {
    const W = COMPOSITE_W, H = COMPOSITE_H;
    const halfH = H / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Top half: host (cover-fit)
    if (hostCv && hostCv.width > 0) {
      drawCover(ctx, hostCv, 0, 0, W, halfH);
    }
    // Bottom half: viewer (cover-fit)
    if (viewerCv && viewerCv.width > 0) {
      drawCover(ctx, viewerCv, 0, halfH, W, halfH);
    }

    // Divider bar with ⚡ ENCORE label
    const divH = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, halfH - divH / 2, W, divH);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '700 16px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡ ENCORE', W / 2, halfH);

    // Name tags
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    drawTag(ctx, '⏵ LIVE  @TK_Soi', 14, 18);
    drawTag(ctx, '@you · 🥈',         14, halfH + divH / 2 + 18);

    // Brand corner
    ctx.font = '700 13px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'right';
    drawTag(ctx, '⚡ Encore', W - 14, H - 28, { padRight: 0 });

    // Recording progress bar bottom
    const p = Math.min(1, t / RECORD_DURATION_MS);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, H - 4, W, 4);
    ctx.fillStyle = '#FE2C55';
    ctx.fillRect(0, H - 4, W * p, 4);
  }

  // Cover-fit drawImage (like CSS object-fit: cover)
  function drawCover(ctx, src, dx, dy, dw, dh) {
    const sw = src.width, sh = src.height;
    if (!sw || !sh) return;
    const dr = dw / dh, sr = sw / sh;
    let sx = 0, sy = 0, sCropW = sw, sCropH = sh;
    if (sr > dr) {
      // source wider → crop sides
      sCropW = sh * dr;
      sx = (sw - sCropW) / 2;
    } else {
      sCropH = sw / dr;
      sy = (sh - sCropH) / 2;
    }
    ctx.drawImage(src, sx, sy, sCropW, sCropH, dx, dy, dw, dh);
  }

  function drawTag(ctx, text, x, y, { padRight = 10 } = {}) {
    const padding = 6;
    const m = ctx.measureText(text);
    const w = m.width + padding * 2;
    const h = 22;
    const bx = ctx.textAlign === 'right' ? x - w + padRight : x;
    const by = y - h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, bx, by, w, h, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    const tx = ctx.textAlign === 'right' ? bx + w - padding : bx + padding;
    ctx.fillText(text, tx, y);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  return { start, stop, RECORD_DURATION_MS };
})();
