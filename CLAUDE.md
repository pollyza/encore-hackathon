<!-- This file is also exposed as AGENTS.md (symlink) so non-Claude-Code AI tools
     (Codex, Cursor, Aider, etc.) read the same project rules at session start. -->

# Encore — AI Hackathon Project

## 我是谁

我是 TikTok Gaming PM, 这个目录是我个人为部门 AI 产品 hackathon 准备的参赛项目。

## 项目是什么

**Encore (安可)** 是一个 LIVE-native 的 Video-to-Game (V2G) 玩法引擎。当游戏主播在 LIVE 中打出高光时刻, AI 自动把这一时刻**结构化重构**成一个 30 秒像素风 mini game, 通过底部 sheet overlay 推送给当时在场的所有观众。观众玩完后, AI 自动剪成 15 秒短视频回流到直播间, 主播实时锐评 Top 3 录像——形成"看 → 玩 → 播"三元闭环。

## 核心已定决策 (不要在对话中再来回讨论)

- **第一阶段技术路径**: 模板参数化 (Phase 1 / Path B), 不是真生成式。AI 从视频抽 JSON config → 路由到 3 个预制模板之一: FPS / MOBA / Battle Royale
- **美术**: 抽象像素风 (Roblox / MC 系), 规避所有游戏 IP 风险, 千元机兼容
- **入口位置**: LIVE-first。M12 之前不做短视频流入口 (转化率塌方)
- **UX 形态**: TikTok 原生 bottom sheet 上滑, **永不挤压 LIVE 主画面**, 8 状态有限状态机
- **变现**: 4 层礼物经济 (Enhance / Spotlight / Sponsor / Loot), **禁止"送礼换试玩"** gating
- **模板覆盖**: 必须做 3 套 (FPS + MOBA + BR), 覆盖 TikTok 游戏 LIVE 约 60-70% 内容供给
- **主播分成铁律**: Encore 礼物中主播分成 ≥ 普通 LIVE 礼物分成

## 飞书文档 (canonical, 设计真理在这里)

| 文档 | URL |
|---|---|
| Product Brief v0.1 (含 §11 用户体验旅程 + §11.7 状态机画板) | https://bytedance.larkoffice.com/docx/Gu2ed1ZOqobDF9xqY7VmjLYMyQe |
| Demo Dev Plan v0.2 (双形态编排, 7 天 sprint) | https://bytedance.larkoffice.com/docx/LfbydvhwCopawvx6UthmmOcoyNf |

**本地代码是设计的"试探与原型", 飞书文档是设计的"主线真理"。** 修改设计时优先改飞书, 不是改本地。

## 仓库布局 (v0.6.1 拆分后, 为 4 人协作准备)

```
encore-hackathon/
├── prototype/                     # 可玩 demo (H5)
│   ├── encore_prototype.html      # 入口 HTML + (暂时) IIFE 主循环
│   ├── styles.css                 # 全局 CSS (已抽离, 所有人共享)
│   ├── README.md                  # 模块导航, 4 人各自看哪里
│   ├── engine/                    # 渲染器 / 输入 / 音效 (owner: A)
│   ├── games/                     # 3 个模板 + _interface.md 接口契约 (owner: A)
│   ├── ui/                        # HUD / HOW_TO_PLAY / splash / end (owner: D)
│   ├── v2g/                       # Vision 代理 + JSON schema (owner: B)
│   │   ├── observer.py
│   │   ├── schema.md
│   │   └── README.md
│   ├── live/                      # streamer.html (LIVE 仿真主页, owner: D)
│   │   ├── streamer.html
│   │   └── README.md
│   └── assets/                    # 精灵 atlas + 主题 + 管道 (owner: C)
├── godot/                         # M12 spike · Godot 4.x MOBA standalone (R&D)
│   ├── project.godot
│   ├── README.md                  # 跑法 + Kenney 包指引 + 3 天 build path
│   ├── AGENTS.md / CLAUDE.md      # GDScript 模式 (4 工具同源)
│   ├── scenes/                    # main / hero / projectile / aoe_telegraph
│   ├── scripts/                   # hero / ability / game / hud + abilities/*
│   └── assets/                    # tiles / sprites / sfx (Kenney + MJ)
├── reference/                     # 测试素材
│   ├── videos/                    # 真实 TikTok LIVE 切片
│   └── frames/                    # ffmpeg 抽出来的关键帧
├── docs/                          # 设计笔记 + 项目导航
│   ├── README.md
│   ├── encore_product_plan.md     # 产品规划 + hackathon 分工 (v0.7)
│   └── v2g_demo.md
├── scripts/
│   └── deploy.sh                  # 同步镜像 + Vercel 部署
├── .github/
│   └── CODEOWNERS                 # 模块归属, GitHub PR 自动 @owner
└── .claude/
    ├── settings.local.json        # 项目权限白名单
    └── launch.json                # 静态服务配置
```

## Dev workflow

```bash
# 进入项目
cd ~/Documents/encore-hackathon

# 启动静态预览 — 必须从项目根目录起服务, 不要从 prototype/ 起
python3 -m http.server 8080
# → 游戏:    http://localhost:8080/prototype/encore_prototype.html
# → V2G 演示: http://localhost:8080/prototype/live/streamer.html

# 从新视频抽帧, 喂给 Claude Vision
ffmpeg -ss <sec> -i reference/videos/<file> -frames:v 1 -q:v 2 reference/frames/<name>.jpg

# 编辑完 prototype 后, 同步两个镜像 + 部署到 Vercel
# (--skip-vercel 只同步镜像, 不部署)
bash scripts/deploy.sh
```

每次改完游戏逻辑、输入处理、胜利条件、或教程文案后, 在声明 done / redeploy 之前先跑 5 步 checklist 算出"陌生人能不能在 round 内赢" — 这是这版项目反复踩过的坑:

- **Claude Code**: 调用 `playtest-check` skill (输入 `/playtest-check`)
- **Codex / Cursor / 其他 AI**: 跑 `bash scripts/playtest-check.sh`, 把输出贴给 AI 出判断

## 多人协作铁律 (Hackathon 4 人分工时强制)

每个 Claude Code session 启动时都会读到本节, 请严格遵守:

1. **只改自己 CODEOWNERS 的文件**。要改别人的 → 先在群里 @, 等同意。
2. **不要重构未在本 task 范围内的代码**。用 Edit 不用 Write — Write 会触发 Claude 大段重写, 几乎必产生 merge conflict。
3. **`prototype/games/_interface.md` 是契约**, 改动需要全员同意。同理 `prototype/v2g/schema.md`。
4. **提交前必跑**: `bash scripts/deploy.sh --skip-vercel` (镜像同步) + 浏览器手玩一局 + 如果改了游戏逻辑就跑 `/playtest-check`。
5. **CSS 用模块前缀**: `.fps-*`, `.moba-*`, `.br-*`, `.sheet-*`, `.howto-*`, `.hud-*`, `.splash-*`, `.end-*`。不要用裸 class。
6. **PR 标题格式**: `[A/B/C/D] <一句话>`, 前缀 = 模块负责人。
7. **单个 commit diff > 200 行**就拆开。Claude 自然倾向于一次性大改, 提交前 `git diff --stat` 自检。
8. **不要 6 小时不 push**。短命分支, 每 4 小时合一次 main, 避免分支腐烂。

## 不在范围内 (Out of scope)

- LIVE 平台真集成 (demo 用 OBS 模拟)
- 真 AI 高光检测 (demo 用主播侧按钮写死触发)
- 真礼物 / 支付 (只做 UI 摆拍)
- FPS / MOBA / BR 之外的模板 (M9+ 长尾再扩)
- 任何后端服务 (demo 完全 client-side, 局域网部署)

## 当前进度快照

详见 `docs/README.md` 的进度清单。
