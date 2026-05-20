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

## 仓库布局

```
encore-hackathon/
├── prototype/                     # 单文件可玩 demo (H5)
│   └── encore_prototype.html
├── reference/                     # 测试素材
│   ├── videos/                    # 真实 TikTok LIVE 切片
│   └── frames/                    # ffmpeg 抽出来的关键帧, AI Vision 输入
├── docs/                          # 设计笔记 + 项目导航
│   ├── README.md                  # 项目状态总览 + 飞书链接索引
│   └── CLAUDE_PROJECT_SETUP.md    # 多项目管理 cheatsheet
└── .claude/                       # Claude Code 项目配置
    ├── settings.local.json        # 项目独有权限白名单
    └── launch.json                # 静态服务配置
```

## Dev workflow

```bash
# 进入项目
cd ~/Documents/encore-hackathon

# 启动静态预览 (Launch preview 面板或浏览器都能看)
python3 -m http.server 8080 -d prototype/
# → http://localhost:8080/encore_prototype.html

# 从新视频抽帧, 喂给 Claude Vision 做 V2G 提取
ffmpeg -ss <sec> -i reference/videos/<file> -frames:v 1 -q:v 2 reference/frames/<name>.jpg
```

## 不在范围内 (Out of scope)

- LIVE 平台真集成 (demo 用 OBS 模拟)
- 真 AI 高光检测 (demo 用主播侧按钮写死触发)
- 真礼物 / 支付 (只做 UI 摆拍)
- FPS / MOBA / BR 之外的模板 (M9+ 长尾再扩)
- 任何后端服务 (demo 完全 client-side, 局域网部署)

## 当前进度快照

详见 `docs/README.md` 的进度清单。
