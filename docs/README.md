# Encore Hackathon — Project Navigation

## Canonical 文档 (Lark)

| 文档 | URL | 当前版本 |
|---|---|---|
| **Product Brief** (产品定义 + UX 旅程 + 状态机) | https://bytedance.my.larkoffice.com/docx/VdRFd5MkBopEjyxAJ70mqmvJyfc | v0.9 (本地 `docs/encore_product_brief_v0.8.md` 已含 Phase 2 cost 重算) |
| **Demo Dev Plan** (双形态编排, 7 天 sprint) | https://bytedance.larkoffice.com/docx/LfbydvhwCopawvx6UthmmOcoyNf | v0.2 |
| **Onepager** (给评委 + 跨部门) | (见 `docs/encore_judge_onepager.md`) | v0.4 (Phase 2 cost 3 档已更新) |
| **Slides** (Pitch deck) | https://encore-deploy.vercel.app/docs/encore_slides.html | 11 张 · slide 7 已跟 feed.html demo 对齐 |

> 设计真理在飞书。本地代码是原型试探。改设计先改飞书。

## 本地素材

| 路径 | 内容 |
|---|---|
| `prototype/encore_prototype.html` | Mario A-module 可玩 demo (单文件 H5, 3 模板 FPS/MOBA/BR) |
| `prototype/live/streamer.html` | Polly D-module LIVE 集成 shell (TikTok 高保真,1 个房间) |
| `prototype/live/feed.html` | Polly **3 直播间 feed shell** (上下滑动切换 3 个 streamer iframe) |
| `prototype/live/assets/icons/` | **Figma 原始图标** (rose.png / gift.png / share.svg, PR #40 加入) |
| `reference/videos/` | 真实 TikTok LIVE 切片 (gitignored, 按需重下) |
| `reference/frames/` | ffmpeg 抽出来的关键帧 (gitignored, 可从 videos 重抽) |

### 视频下载链接 (重下用)

```bash
# 测试视频 1: Kamen Rider arcade (IP 重 + 格斗格式, 不作为主模板源)
curl -L -o reference/videos/encore_test.mp4 \
  "https://tosv-sg.tiktok-row.org/obj/tikcast-game-alertbox-sg/kairo/videos/7622684681188363029_1774795604_1774795904.mp4"

# 测试视频 2: Valorant 越南服 1v3 (canonical FPS 模板源)
curl -L -o reference/videos/encore_test2.mp4 \
  "https://tosv-sg.tiktok-row.org/obj/tikcast-game-alertbox-sg/kairo/videos/7621899032668211985_1774616052_1774616352.mp4"
```

## Quick start

```bash
cd ~/Documents/encore-hackathon

# 启动静态预览 — 必须从项目根目录起服务
python3 -m http.server 8080
# 浏览器打开:
#   → 3 直播间 feed:   http://localhost:8080/prototype/live/feed.html
#   → 单房间 streamer: http://localhost:8080/prototype/live/streamer.html?mode=fps
#   → 单机游戏 demo:    http://localhost:8080/prototype/encore_prototype.html
#   → Pitch slides:    http://localhost:8080/docs/encore_slides.html

# 编辑完 prototype 后, 同步 + 部署
bash scripts/deploy.sh                # 镜像 + Vercel prod
bash scripts/deploy.sh --skip-vercel  # 只同步镜像 (本地 preview)
```

## 当前进度 (last updated 2026-06-04)

### 🌐 公开 URL

| 入口 | URL | 备注 |
|---|---|---|
| **主入口 Landing** | https://encore-deploy.vercel.app/ | rewrite → `/docs/landing.html` |
| **3 直播间 feed** (扫码体验主路径) | https://encore-deploy.vercel.app/prototype/live/feed.html | QR 现指向这里 |
| 单房间 streamer | https://encore-deploy.vercel.app/prototype/live/streamer.html?mode=fps | 直连测试用 |
| 单机游戏 (Mario A) | https://encore-deploy.vercel.app/prototype/encore_prototype.html | embedded 进 sheet 时也用这套 |
| Pitch deck | https://encore-deploy.vercel.app/docs/encore_slides.html | 11 张 |

### ✅ 已完成

**产品 / 设计**
- 产品定义 (Brief v0.9, 11 章 + 附录)
- 双形态架构: LIVE Encore + Video Encore (Encore Replay)
- 5 阶段技术路线 + 4 层礼物经济 + 主播分成铁律
- 8 状态 UX 旅程 + Sheet 状态机画板
- Demo Dev Plan v0.2 (双形态编排, 7 天逐日)
- LIVE 交互模块 sub-doc v0.1 (Polly D-module 规格, 已落 Lark wiki)
- **Phase 2 cost 3 档重算** (PR #30/#31, 2026-06-04 earlier) — 900K 日活主播 → ~4B 高光/月,A/B/C 三档全部 ≤ $100K/月

**A-module (Mario · 玩法引擎)**
- Prototype v0.4 → v0.6 — 3 个游戏模板 (FPS Cover Strike / MOBA Dragon Pit / BR Final Circle)
- 12 套主题 (4 themes × 3 templates) + 22 sprite atlas + iso 体素渲染器
- `?embedded=1` + V2G postMessage 协议 (schema v1.1 — encore_ready / launch / encore_done)
- `encore_done` payload 含 `template` + `duration` 字段 (动态从 Games 找)

**B-module (Zihui · V2G / AI)**
- V2G AI Vision 可行性验证 (2 个真实 TikTok LIVE 视频跑通)
- `observer.py` 抽帧 + Claude Vision 提示词 + cost 监控
- Schema v1.1 锁定 (`prototype/v2g/schema.md`)
- Observer offline retry + legacy schema fallback (PR #32, demo day 防 API timeout)

**D-module (Polly · LIVE 交互 / UX)** ← **本轮 hackathon 主要产出 + 2026-06-04 大更新**

v0.7 高保真重建 (已完成):
- Claude Design handoff → 完整移植到 vanilla JS 真实代码库
- `prototype/live/` 7 个模块化文件 (streamer.html / live-shell.css / ai-panel.css / mini-games.css / live-room.js / encore-sheet.js / mini-games.js)
- 集成 Mario 真模板 (iframe 加载 `encore_prototype.html?embedded=1`, 随机 fps/moba/br)
- 4 phase 状态机 (loading → game → result → ranking) + ack pills
- Landing page + 扫码 QR + Vercel prod 部署

**2026-06-04 当天追加** (5 个 PR):
- **PR #34 玩家录屏 race fix** — `PlayerRecorder.stop()` 返回 Promise, 加 `waitForReady()`,解决 winner clip 下半截显示 mock 不是玩家真实录像的问题
- **PR #35 移动端 MediaRecorder 兼容** — iOS Safari only-mp4 codec + `start(timeslice=1000)` 分块, debug chip via `?debug=1`
- **PR #38/39 Slide 7 重做** — 老 slide 7 (iframe + CONTROLS + FYI 三堵墙) 砍掉,变成: 大 QR + 3 直播间 tile + 2 outcome chip (📹 短视频 / 🎁 Enhance);随 Polly feed.html 改动二次更新 tile 内容为 3 个房主 (TK Sói / ROADKING88 / PIXELMAX)
- **Polly 7595de1 3 直播间 feed shell** — 新 `feed.html` 3 iframe 上下滑动, landing + QR 改指向 feed.html, lazy-load 邻居房间, dot indicator + swipe hint
- **PR #40 TikTok-fidelity UI pass (5 个 commit)** — 把 streamer.html 跟 Figma 真 TikTok 设计稿对齐:
  - **底部操作栏**: 老 ☺ 🤝 🎁 ↗ emoji 圆圈 → 真 Figma 资产 `rose.png` (3D 玫瑰) + `gift.png` (粉礼盒) + `share.svg` (白箭头) + 10px 文字标签
  - **聊天**: 黑色模糊气泡 → 无气泡 text-shadow + 32px 头像 + 内联 LV.NN 等级徽章 (deterministic hash, 8..72)
  - **顶部观看者**: 2 个 dot → 3 个堆叠头像 + "±" 前缀
  - **主播头像**: 空黑圆 → 首字母 + 渐变 + 红 live-dot + 按 mode 配色 (FPS 粉橙 / GTA 紫 / OBBY 蓝)
  - **顶部安全区**: 隐藏 FPS 罗盘 (撞状态栏), 下移雷达/武器/摇杆/火力 (避让 LIVE chrome)
  - Hearts "♥ 118.1K" → "118.1K likes" (无 icon, 跟 Figma 一致)
- **`7447294` deploy.sh fix** — `vercel.json` 漏同步导致 prod `/` 路径 404, 修 deploy.sh sync 逻辑

**协作工具链 (已就绪)**
- `.github/CODEOWNERS` 4 人模块归属
- `prototype/games/_interface.md` 接口契约
- `prototype/v2g/schema.md` JSON 协议
- `CLAUDE.md` / `AGENTS.md` (symlink) 多人协作铁律 + 大白话表
- `scripts/deploy.sh` 镜像同步 + Vercel 部署 (现已含 vercel.json + assets/icons 同步)
- `scripts/playtest-check.sh` 5 步游戏 sanity check
- `.claude/skills/playtest-check` Claude Code skill

### 🔄 进行中

无 — D-module 本轮收工。Mario 提交了 zihui-video / zihui-live.video.Mp4 分支 (素材 + 真视频),还在 review。

### 📋 P1 — Demo 之前要做

- [ ] **真机/真浏览器测试** — 手机 Safari + Chrome 各跑一遍 3-room feed 滑动 + Encore 触发 + 玩 + 发视频 + 送礼
- [ ] **V2G observer 接入 D-module** — Zihui 把 cachedDetection 写到 streamer.html 的 `pickConfig` hook, 让随机模板变成真实 Vision 检测
- [ ] **Sub-doc 同步当前实现** — Lark wiki 子页 (PsFTd9fQDooQCkxVZMkmSZMyyhf) 写的还是旧的 4-state FSM, 要更到 4-phase + 4-entry mode + highlight popup + 3-room feed
- [ ] **演示 storyboard** — 1 分钟脚本 (开 feed → 滑到 TK Sói 房 → highlight → play → MOBA → result → ranking → ack → 再滑到 ROADKING88 房演示第二轮)
- [ ] **评委 Q&A 应答表** — 重点准备: 跟「萌宠快跑」互动游戏的差别 (有现成对比, 见 `.claude/plans/prancy-cuddling-duckling.md`)

### 📋 P2 — 锦上添花

- [ ] 美术素材路径统一 (`prototype/assets/` vs `prototype/live/assets/`)
- [ ] 增加测试视频多样性 (MOBA 直播片段 + BR 直播片段)
- [ ] Plan B / Plan C 兜底视频录制
- [ ] 内测 (找 8 个同事真扫码玩)
- [ ] feed.html 滑动时 unload 远离的 iframe (现在 3 个常驻 RAF, 移动端电量负担可能大)

### 📋 隐藏的 / 等同步的

- Mario `zihui-video` / `zihui-live.video.Mp4` 分支 — 真高光视频已上 (e4cc5cb + 0a388ae),`encore_test2.mp4` 切片做了上下分屏样片。等他 PR 上来 review。

详见 [`polly_d_module_status.md`](polly_d_module_status.md) (D-module 当前状态简明卡片,给 Mario/Zihui/Lingyi 跟进用)。

## 给后续 Claude Code session 的提示

每次开新 session 前: **`cd ~/Documents/encore-hackathon`** 再启 Claude Code, 不要在其他目录里干 hackathon 的活。

`CLAUDE.md` 已经写好项目背景, 会自动注入。`AGENTS.md` 是 symlink 指过去 — 非 Claude Code 的 AI 工具 (Codex / Cursor / Aider) 看的也是同一份。
