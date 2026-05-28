# Encore Hackathon — Project Navigation

## Canonical 文档 (Lark)

| 文档 | URL |
|---|---|
| **Product Brief v0.1** (含 §11 UX 旅程 + §11.7 状态机画板) | https://bytedance.larkoffice.com/docx/Gu2ed1ZOqobDF9xqY7VmjLYMyQe |
| **Demo Dev Plan v0.2** (双形态编排, 7 天 sprint) | https://bytedance.larkoffice.com/docx/LfbydvhwCopawvx6UthmmOcoyNf |

> 设计真理在飞书。本地代码是原型试探。改设计先改飞书。

## 本地素材

| 路径 | 内容 |
|---|---|
| `prototype/encore_prototype.html` | 当前可玩 demo (单文件 H5, 当前 MOBA 模板 v0.4) |
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

# 启动静态预览
python3 -m http.server 8080 -d prototype/
# 浏览器打开: http://localhost:8080/encore_prototype.html
# 手机扫码: 同一 WiFi 下访问 http://<本机 LAN IP>:8080/encore_prototype.html
```

## 当前进度 (last updated 2026-05-28)

### 🌐 公开 URL

| 入口 | URL |
|---|---|
| Landing (含扫码体验 QR) | https://encore-deploy.vercel.app/ |
| **LIVE 主 demo** (Polly D-module) | https://encore-deploy.vercel.app/prototype/live/streamer.html |
| 独立游戏 (Mario A-module) | https://encore-deploy.vercel.app/prototype/encore_prototype.html |
| Pitch deck | https://encore-deploy.vercel.app/docs/encore_slides.html |

### ✅ 已完成

**产品 / 设计**
- 产品定义 (Brief v0.1, 11 章 + 附录)
- 双形态架构: LIVE Encore + Video Encore (Encore Replay)
- 5 阶段技术路线 + 4 层礼物经济 + 主播分成铁律
- 8 状态 UX 旅程 + Sheet 状态机画板
- Demo Dev Plan v0.2 (双形态编排, 7 天逐日)
- LIVE 交互模块 sub-doc v0.1 (Polly D-module 规格, 已落 Lark wiki)

**A-module (Mario · 玩法引擎)**
- Prototype v0.4 → v0.6 — 3 个游戏模板 (FPS Cover Strike / MOBA Dragon Pit / BR Final Circle)
- 12 套主题 (4 themes × 3 templates) + 22 sprite atlas + iso 体素渲染器
- `?embedded=1` + V2G postMessage 协议 (schema v1.1 — encore_ready / launch / encore_done)
- `encore_done` payload 含 `template` + `duration` 字段 (动态从 Games 找)

**B-module (Zihui · V2G / AI)**
- V2G AI Vision 可行性验证 (2 个真实 TikTok LIVE 视频跑通)
- `observer.py` 抽帧 + Claude Vision 提示词 + cost 监控
- Schema v1.1 锁定 (`prototype/v2g/schema.md`)

**D-module (Polly · LIVE 交互 / UX) — v0.7 高保真重建** (← **本轮 hackathon 主要产出**)
- Claude Design handoff (`design_handoff_encore/`) → 完整移植到 vanilla JS 真实代码库
- `prototype/live/` 重写为 7 个模块化文件:
  - `streamer.html` — 集成 shell + iPhone 14 phone frame + JS-based fit-scale
  - `css/live-shell.css` — TikTok chrome (host pill / 活动 rail / highlight popup / chat / bottom bar) + 11 个共享 keyframes
  - `css/ai-panel.css` — Sheet shell + 4 phases + feedback ack overlay
  - `css/mini-games.css` — Aim/Rhythm/Dodge 样式 (保留备用)
  - `js/live-room.js` — chrome 编排 + entry-mode 渐进 (highlight popup → bar) + chat 滚 + ack pills
  - `js/encore-sheet.js` — 4-phase 状态机 (loading → game → result → ranking) + ack
  - `js/mini-games.js` — 3 个完整可玩 demo (备用,当前不加载)
- **集成 Mario 真模板** — game phase 通过 iframe 加载 `encore_prototype.html?embedded=1`,每次随机抽 fps/moba/br + 主题/scenario (`pickConfig` hook 预留给 V2G observer 接入)
- Result / Ranking 子页 + Feedback ack 全部实现 (score chip 渐变 / Encore Rank pill / Gift Remix dashed card / 排行榜 You 行高亮 + 自动滚)
- Landing page (`/`) + 扫码 QR (`/qr-encore.svg`)
- Vercel production 部署 + 域名 aliased

**协作工具链 (已就绪)**
- `.github/CODEOWNERS` 4 人模块归属
- `prototype/games/_interface.md` 接口契约
- `prototype/v2g/schema.md` JSON 协议
- `CLAUDE.md` 多人协作铁律
- `scripts/deploy.sh` 镜像同步 + Vercel 部署
- `scripts/playtest-check.sh` 5 步游戏 sanity check

### 🔄 进行中

无 — Polly D-module 本轮收工。后续等 Mario / Zihui 同步。

### 📋 P1 — Demo 之前要做

- [ ] **真机/真浏览器测试** — 手机 Safari + 桌面 Chrome 各跑一遍 9-step E2E (preview 中 9 步全部 ✓)
- [ ] **V2G observer 接入 D-module** — Zihui 把 cachedDetection 写到 streamer.html 的 `pickConfig` hook, 让随机模板变成真实 Vision 检测
- [ ] **Sub-doc 同步当前实现** — Lark wiki 子页 (PsFTd9fQDooQCkxVZMkmSZMyyhf) 写的还是旧的 4-state FSM, 要更到 4-phase + 4-entry mode + highlight popup
- [ ] **Mario `Games.td`** (第 4 模板, td 占位已就绪,`TEMPLATES` 数组里加 `'td'` 一行即可启用)
- [ ] **演示 storyboard** — 1 分钟脚本 (打开 LIVE → highlight → play → MOBA → result → ranking → fun → ack → bar → 第二轮 FPS)

### 📋 P2 — 锦上添花

- [ ] Lingyi 美术素材路径统一 (`prototype/assets/` 还是 `prototype/live/assets/`)
- [ ] 增加测试视频多样性 (MOBA 直播片段 + BR 直播片段)
- [ ] Pitch deck (10 张, 90 秒 demo 段) — 已有 13 页 v0.6 版,可能要补 D-module rebuild 的内容
- [ ] 评委 Q&A 应答表
- [ ] Plan B / Plan C 兜底视频录制
- [ ] 内测 (找 8 个同事真扫码玩)

详见 [`polly_d_module_status.md`](polly_d_module_status.md) (D-module 当前状态简明卡片,给 Mario/Zihui/Lingyi 跟进用)。

## 给后续 Claude Code session 的提示

每次开新 session 前: **`cd ~/Documents/encore-hackathon`** 再启 Claude Code, 不要在其他目录里干 hackathon 的活。

`CLAUDE.md` 已经写好项目背景, 会自动注入。
