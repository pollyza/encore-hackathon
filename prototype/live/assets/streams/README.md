# LIVE background footage (`streamer.html` Task 1)

The phone LIVE view plays a real game-stream clip behind the TikTok chrome so it
looks like an actual livestream. Drop three short, muted, looping MP4s here:

```
fps.mp4      ← Free Fire stream   (mode=fps  → Free Fire BR template)
gta.mp4      ← GTA V stream       (mode=gta)
roblox.mp4   ← Roblox obby stream (mode=roblox)
```

`streamer.html` loads `assets/streams/<mode>.mp4`, plays it muted+looped over the
procedural canvas, and hides the synthetic HUD. **If a file is missing or autoplay
is blocked, the canvas fallback shows instead — the screen is never blank.** So the
demo works with zero, one, or all three clips present.

## How to make the clips

Automated download from YouTube is currently blocked by YouTube's bot-check, which
needs *your* logged-in cookies (this machine's IP can't fetch anonymously). Two ways:

**A — you run yt-dlp with your browser cookies** (replace `chrome` with safari/firefox):

```bash
cd prototype/live/assets/streams
yt-dlp --cookies-from-browser chrome -f 'bv*[height<=720]' \
  --download-sections "*00:30-00:45" -o src-fps.%(ext)s   https://youtu.be/LlDa1EAemhg
yt-dlp --cookies-from-browser chrome -f 'bv*[height<=720]' \
  --download-sections "*01:00-01:15" -o src-gta.%(ext)s   https://youtu.be/5TAB4i9P1eI
yt-dlp --cookies-from-browser chrome -f 'bv*[height<=720]' \
  --download-sections "*00:30-00:45" -o src-roblox.%(ext)s https://youtu.be/QvWer1xEmOE
```

**B — just drop any gameplay MP4** you already have as `fps.mp4` / `gta.mp4` / `roblox.mp4`.

## Transcode (keeps them small + loopable, < ~2 MB each)

```bash
for m in fps gta roblox; do
  ffmpeg -y -i src-$m.* -an -vf "scale=540:-2:flags=lanczos,fps=24" \
    -c:v libx264 -profile:v baseline -pix_fmt yuv420p -crf 30 -t 8 \
    -movflags +faststart $m.mp4
done
rm -f src-*
```

540px wide, 24fps, no audio, ~8s. Then `bash scripts/deploy.sh` mirrors this dir to
the preview + Vercel (the mirror step is already wired). Commit the MP4s (the repo
size budget easily fits ~5 MB total).
