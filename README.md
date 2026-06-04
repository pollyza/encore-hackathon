# Encore (安可) — TikTok LIVE V2G Engine

> AI 把游戏主播的高光时刻自动重构成 30 秒像素 mini-game,推送给当时在场的观众玩,再剪成上下分屏短视频回流到 TikTok。
>
> **看 → 玩 → 播 三元闭环** · LIVE-native · 不打扰主播打游戏

TikTok Gaming Hackathon 参赛项目。完整 client-side demo,无后端依赖。

---

## 🎯 在线 demo (扫码就能玩)

| | URL |
|---|---|
| **3 直播间 feed** (主入口) | <https://encore-deploy.vercel.app/prototype/live/feed.html> |
| Landing + QR | <https://encore-deploy.vercel.app/> |
| Pitch slides (11 张) | <https://encore-deploy.vercel.app/docs/encore_slides.html> |
| 单房间 streamer (直连) | <https://encore-deploy.vercel.app/prototype/live/streamer.html?mode=fps> |
| 单机 mini-game | <https://encore-deploy.vercel.app/prototype/encore_prototype.html> |

手机扫 slide 7 的 QR → 落地到 feed.html → 上下滑动切换 TK Sói (FPS) / ROADKING88 (GTA) / PIXELMAX (OBBY) 3 个直播间 → 任一房间触发高光 → 玩 30s mini-game → 进前 3 自动剪上下分屏短视频。

---

## 🧱 怎么跑 (本地)

```bash
git clone https://github.com/pollyza/encore-hackathon.git
cd encore-hackathon

# 启动静态预览 — 必须从项目根目录起服务 (不要从 prototype/ 起)
python3 -m http.server 8080

# 浏览器:
#   → 3 直播间 feed:    http://localhost:8080/prototype/live/feed.html
#   → 单房间 streamer:  http://localhost:8080/prototype/live/streamer.html?mode=fps
#   → 单机游戏:         http://localhost:8080/prototype/encore_prototype.html
#   → Slides:           http://localhost:8080/docs/encore_slides.html

# 同步镜像 + 部署到 Vercel prod
bash scripts/deploy.sh
bash scripts/deploy.sh --skip-vercel   # 只同步镜像
```

---

## 🏗️ 架构 (一张图)

```
                    ┌─────────────────────────────────────────┐
                    │  prototype/live/feed.html               │
                    │  (3 iframe 上下滑动 · TikTok-style feed) │
                    └─────────────┬───────────────────────────┘
                                  │ ?mode=fps|gta|roblox
                                  ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  prototype/live/streamer.html                                     │
   │  ──────────────────────────────                                  │
   │  · TikTok-fidelity chrome (host pill / viewer stack / chat / 底部) │
   │  · Figma 真 icon (rose / gift / share)                           │
   │  · 主播 canvas 场景 (FPS / GTA / OBBY 三套 mock)                  │
   │                                                                   │
   │  ┌─ Encore sheet (bottom slide-up, 4 phase) ────────────────────┐ │
   │  │ loading → game → result → ranking                            │ │
   │  │           │                                                   │ │
   │  │           ▼  iframe embedded=1                                │ │
   │  │  prototype/encore_prototype.html                              │ │
   │  │  (3 模板 FPS / MOBA / BR · Mario)                              │ │
   │  └───────────────────────────────────────────────────────────────┘ │
   │                                                                    │
   │  ┌─ Player recorder + clip composer ───────────────────────────┐  │
   │  │  Canvas → MediaRecorder → .webm/.mp4 → 上下分屏 540×960     │  │
   │  └──────────────────────────────────────────────────────────────┘  │
   └────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ postMessage schema v1.1
                                  │
                    ┌─────────────┴─────────────┐
                    │  prototype/v2g/observer.py │
                    │  (Claude Vision · Zihui)   │
                    └────────────────────────────┘
```

详细模块导航见 [`docs/README.md`](docs/README.md)。

---

## 👥 4 人分工

| 模块 | Owner | 负责 |
|---|---|---|
| **A** Engine + Games | Mario | `prototype/engine/` + `prototype/games/` — 渲染器、输入、3 模板核心 |
| **B** V2G + AI | Zihui | `prototype/v2g/` — Vision 代理、JSON schema、prompt |
| **C** 美术 + 内容 | Lingyi | `prototype/assets/` — 主题、sprite atlas、管道 |
| **D** LIVE + UX | Polly | `prototype/live/` + `prototype/ui/` + `docs/` — streamer shell、sheet、HUD、tutorial、文档 |

CODEOWNERS 在 `.github/CODEOWNERS`,改别人的代码先 @。

---

## 📅 最新进展 (2026-06-04 收工)

**今天 (2026-06-04) 主要产出**
- **PR #40 TikTok-fidelity UI pass** — 用 Figma MCP 把真 TikTok LIVE 设计稿对齐到 streamer.html: 底部 Rose/Gift/Share 换成 Figma 原资产 (3D 玫瑰 + 粉礼盒 + 白箭头)、聊天去气泡 + LV.NN 等级徽章、顶部 3 头像堆 + ± 前缀、主播头像首字母 + 按 mode 配色 + 红 live-dot、隐藏 FPS 罗盘避让状态栏。
- **PR #39 Slide 7 跟 feed.html 对齐** — slide 7 改成展示 3 个 LIVE 直播间 tile (TK Sói / ROADKING88 / PIXELMAX) 而不是 3 套游戏模板。
- **`7447294` deploy.sh fix** — vercel.json 漏同步导致 prod `/` 路径 404,补 sync 逻辑。
- **PR #34/35 玩家录屏 fix** — MediaRecorder race condition + iOS Safari mp4 codec/timeslice 兼容。
- **PR #38 Slide 7 初代重做** — 老 slide 7 (iframe + CONTROLS + FYI 三堵墙) 砍掉换成 QR + 3 tile + 2 outcome chip。
- **Polly `7595de1`** — 新 `feed.html` 3 iframe 上下滑动 shell + landing/QR 改指向 feed.html。

**整体进度**
- ✅ A/B/D 三模块全部跑通,prod 已部署可扫码
- ✅ 3 直播间 feed 上线 (Polly 7595de1)
- ✅ TikTok-fidelity UI 收尾 (PR #40)
- ✅ 11 张 pitch slides 上线
- ✅ Phase 2 cost 3 档全部 ≤ $100K/月 (PR #30/31)
- 🔄 等 Mario 的 zihui-video 分支 (真高光视频上下分屏样片)
- 📋 P1 剩: 真机 E2E 测试 / V2G observer 接入 streamer.html 的 pickConfig hook / 演示 storyboard / 评委 Q&A 应答表

完整进度清单见 [`docs/README.md`](docs/README.md)。

---

## 📚 文档

| 文档 | 路径 |
|---|---|
| **AI agent 使用规则** (Claude Code / Codex / Cursor 都看这个) | [`CLAUDE.md`](CLAUDE.md) (`AGENTS.md` 是 symlink) |
| **项目导航 + 进度清单** | [`docs/README.md`](docs/README.md) |
| **产品 brief v0.9** | [`docs/encore_product_brief_v0.8.md`](docs/encore_product_brief_v0.8.md) |
| **评委 onepager** | [`docs/encore_judge_onepager.md`](docs/encore_judge_onepager.md) |
| **D-module 状态卡** (给 A/B/C 同步) | [`docs/polly_d_module_status.md`](docs/polly_d_module_status.md) |
| **V2G 真实测试** | [`docs/v2g_demo.md`](docs/v2g_demo.md) |
| **协作工作流** | [`docs/encore_team_workflow.md`](docs/encore_team_workflow.md) |

**Lark canonical 文档** (设计真理): [Product Brief](https://bytedance.larkoffice.com/docx/Gu2ed1ZOqobDF9xqY7VmjLYMyQe) · [Demo Dev Plan](https://bytedance.larkoffice.com/docx/LfbydvhwCopawvx6UthmmOcoyNf)

---

## ⚠️ 不在范围内 (Out of scope)

- LIVE 平台真集成 (demo 用主播侧按钮 + iframe 模拟)
- 真 AI 高光检测 (现在用 V2G observer 跑 cached detection,真实接入留作 P1)
- 真礼物 / 支付 (只做 UI 摆拍)
- FPS / MOBA / BR / OBBY 之外的模板 (Phase 2+ 长尾再扩)
- 任何后端服务 (demo 完全 client-side)
