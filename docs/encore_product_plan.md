# Encore — 产品规划 v0.7

> 基于 hackathon prototype (v0.7 · LIVE 模块高保真重建后) 的总结、对外讲清楚、对内对齐的单页产品文档。
> 配套资源:[Product Brief v0.1 (飞书)](https://bytedance.larkoffice.com/docx/Gu2ed1ZOqobDF9xqY7VmjLYMyQe) · [Demo Dev Plan v0.2 (飞书)](https://bytedance.larkoffice.com/docx/LfbydvhwCopawvx6UthmmOcoyNf) · [LIVE 交互模块 sub-doc (飞书 wiki)](https://www.feishu.cn/wiki/DqOXwN2hzig5cUkX6zxcCFmGnXd) · [GitHub](https://github.com/pollyza/encore-hackathon) · [Live demo](https://encore-deploy.vercel.app) · [D-module 状态卡](./polly_d_module_status.md)
> 维护者:Encore PM。本文档与代码进度同步,不是另一份"主线真理"——主线真理仍在飞书。

---

## 1. 背景

### 1.1 痛点

游戏 LIVE 是 TikTok 增速最快的内容形态之一,但观众端的互动密度远低于内容密度:

- **5 秒高光黑洞**:主播打出 ace / clutch / 抢龙 → 观众注意力是峰值的,但能做的只有刷 1 句文字弹幕(平均提交延迟 ~3.5s)、点 1 个礼物。**情绪没被接住,瞬间就过去了。**
- **互动单向且贫乏**:礼物 = 单向打赏;弹幕 = 文字流;评论 = 异步;关注 = 全或无。观众没有任何"做点什么"的中间档位。
- **主播变现单一**:游戏主播只能靠礼物 + 抽成,缺少把"刚才那一把"再卖一次的中间产品(replay、二创、衍生玩法都没有平台级承接)。
- **平台 dwell time 瓶颈**:游戏 LIVE 用户进得快出得快,因为"看完了高光就没事干"。

### 1.2 价值主张

> **把"看的人"变成"玩的人"——在高光那 30 秒里。**

| 角色 | 价值 |
|---|---|
| **观众** | 高光时刻情绪有出口(直接玩一局)→ 产生社交资本("这把我也玩过")→ 留更久、回访更高、更愿付费 |
| **主播** | 高光被算法识别 + 复用 + 反哺(观众玩出的 Top 3 录像回流到 LIVE)→ 内容深度 ↑ 礼物 SKU ↑ 分成 ↑ |
| **平台** | 游戏直播新增"mini-game" 内容形态 → dwell time + ARPU 双升,新一类礼物 SKU,可对外讲的差异化叙事 |

### 1.3 面向人群

**核心用户(MVP)**:

- **TikTok 游戏 LIVE 头部主播**(FPS / MOBA / 吃鸡品类,粉丝 50w+):愿意为新形态破局,有量也有内容承载。MVP 灰度首选 5–10 个。
- **TikTok 游戏 LIVE 重度观众**(每日 LIVE 时长 > 30 分钟):有付费习惯、有社交分享冲动,是付费转化主力。

**Phase 2 扩展人群**:

- 中长尾游戏主播(粉丝 5w+)、短视频用户(看完游戏短视频"再玩一下")、跨品类 LIVE(派对、卡牌、IRL 等需要观众互动的赛道)。

---

## 2. 一句话需求

> **AI 实时观察游戏 LIVE 的高光时刻,30 秒内把它重构成一个观众能玩的像素 mini-game,通过 bottom sheet 推给当时在场的观众,玩完后再剪成 15 秒短视频回流给主播。**

---

## 3. 预期实现场景与用户路径

### 3.1 MVP 形态 · LIVE 主导

**触发**:玩家在 TikTok 游戏 LIVE 间观看 → AI(Claude Vision)每 4s 抽样视频帧 → 检测到高光事件(kill 三杀 / clutch 残局 / 抢龙等)→ 返回 V2G JSON config。

**用户路径**:

```
进入 LIVE 间
   ↓
  [看主播打 ~ 任意时长]
   ↓
  AI 检测到高光 (例: FPS 1v3 残局)
   ↓
  bottom sheet 上滑覆盖, 占屏 80%
  ⚡ ENCORE · FPS · DESERT · "1v3 retake"
   ↓
  HOW TO PLAY 卡片 (3-5s 自动 / 任意键继续)
   ↓
  玩 30 秒 (与刚才高光同款 template + theme + scenario)
   ↓
  Game Over → 弹"录像 / 战绩"
   ↓
  (可选) 送礼放大下一局 / 给录像加曝光
   ↓
  bottom sheet 自动滑下 → 8s 冷却 → 继续看 LIVE
   ↓
  (异步) 15 秒高分录像剪进主播 Top 3 池
   ↓
  主播实时锐评 → 观众再次进入循环
```

**关键 UX 铁律(不可妥协)**:

- 永不 pause LIVE / 永不静音 / 永不挤压主画面
- 任意时刻下滑回 LIVE,游戏自动结束
- 千元机也跑得动(Canvas 2D + 体素方块,无 WebGL)
- 状态机 8 状态: `SAMPLING / DETECTED / WARMUP / PLAY / END / REPLAY_PEEK / GIFT / RESET`

### 3.2 Phase 2 形态 · 短视频扩展(M12+)

短视频 feed 中遇到游戏类视频 → AI 离线分析视频 → 视频底部出现 "▲ Encore 这一段" → 上滑解锁 mini-game(同 LIVE 流程)。

**为什么 MVP 不先做短视频**:LIVE 是"同时在场"的天然社交场景,玩完后录像回流给主播能形成 看 → 玩 → 播 三元闭环;短视频是异步的,缺少"播"这一环,会塌方到"只是个小游戏"。M12 之前不做。

---

## 4. Prototype 功能范围与未来方向

### 4.1 当前 v0.6 已交付

| 类别 | 内容 |
|---|---|
| **3 个游戏模板** | FPS Cover Strike (Valorant feel) / MOBA Dragon Pit (LoL feel) / BR Final Circle (PUBG feel) |
| **12 套主题** | 每模板 4 套调色板 + tile set,开局随机滚 |
| **22 个精灵 atlas** | 程序化像素美术,AI 真精灵管道(`PROMPTS.md` + `process.py` + `pack.py`)就绪待跑批 |
| **Iso 体素渲染器** | Canvas 2D,自适应画布,移动竖屏 + 桌面横屏都 fit |
| **完整 V2G 闭环** | `live/streamer.html` → 抽帧 → `v2g/observer.py` 代理 → Claude Vision → JSON config → iframe 启动游戏 |
| **Ambient FX** | 每模板独立粒子 + 色调 grading + 地面贴花 |
| **新手引导** | 5-tier HOW TO PLAY 卡片,触屏 / 桌面双适配,可关 |
| **公开 demo** | Vercel + GitHub v1 tag + 13 页演讲 deck |

### 4.2 v0.6.1 多人协作准备

为 4 人 hackathon 协作做的基础设施 (已就绪):

- ✅ `prototype/` 目录拆分为 `engine/` `games/` `ui/` `v2g/` `live/` `assets/` 子模块
- ✅ CSS 抽离到 `prototype/styles.css`
- ✅ `prototype/games/_interface.md` 接口契约
- ✅ `prototype/v2g/schema.md` JSON 协议文档 (v1.1 — 加 `td` enum + `encore_done.template` + `encore_progress`)
- ✅ `.github/CODEOWNERS` 模块归属
- ✅ `CLAUDE.md` 多人协作铁律
- ✅ `scripts/deploy.sh` 同步新路径
- ⏳ JS 拆分 (Day 0 morning) — 每个 game 独立成 `games/{fps,moba,br}.js`,引擎拆到 `engine/`

### 4.3 v0.7 LIVE 交互模块高保真重建 (本次更新)

Polly 拿到 Claude Design 输出的 React 高保真 handoff (`design_handoff_encore/`) 后,完整移植到 vanilla JS 真实代码库,并把 Mario 的 3 个真模板通过 V2G postMessage 接进 LIVE sheet。

**核心交付**:

- ✅ 完整重写 `prototype/live/` (7 个模块化文件,2900+ 行新代码)
  - Native TikTok tone (#FE2C55 + #25F4EE) + Inter / Space Grotesk 字体
  - 4-phase 状态机 (loading → game → result → ranking) + ack overlay
  - 4-entry mode (highlight popup → bar 渐进 + top chip + chat card feature-flagged)
  - 高光弹窗入口卡 (gradient ⚡ + ringPing 动效)
  - Loading state (高光缩略图 + scan line + 24 个粒子 + 状态文案循环 + 进度条 + monospace 脚注)
  - Result page (gradient score chip + Encore Rank pill + Share clip + Gift Remix dashed card + Fun/Hard/Remix 反馈 + Play again)
  - Ranking sub-page (segmented tabs + 8 行 leaderboard + medals/VIP/Host tags + You 行高亮 + 自动滚到 You)
  - Feedback ack overlay (radial glow + 3 同心环 + emoji + thanks 标题 + 950ms 自动关 + 飘字 ack pill)
  - iPhone 14 phone frame + JS-based fit-scale (桌面/手机/平板自适应)
- ✅ Mario 真模板集成 (`encore_prototype.html?embedded=1` via iframe + V2G postMessage v1.1)
  - 每次开 sheet 随机抽 fps / moba / br + 主题 + scenario
  - `pickConfig` hook 预留给 Zihui 的 observer 接入 (替换随机为真实 Vision 检测)
- ✅ Landing page (`/`) + 扫码 QR (`/qr-encore.svg`) — 评委现场扫码体验
- ✅ Vercel production 部署 + domain aliased

**公开 URL**:
- 🏠 Landing: https://encore-deploy.vercel.app/
- ⚡ LIVE demo (D-module): https://encore-deploy.vercel.app/prototype/live/streamer.html
- 🎮 标准游戏 (A-module): https://encore-deploy.vercel.app/prototype/encore_prototype.html
- 🎤 Pitch deck: https://encore-deploy.vercel.app/docs/encore_slides.html

详见 [`docs/polly_d_module_status.md`](./polly_d_module_status.md) (D-module 当前状态简明卡片,给 Mario/Zihui/Lingyi 跟进用)。

### 4.4 未来扩展(优先级排序)

| 里程碑 | 内容 | 价值 |
|---|---|---|
| **M9 (NOW)** | 真 AI 美术批量切入(MJ / SD / DALL-E)| 视觉接近 Astrocade 级,可上 PRD |
| **M10** | TikTok feed shell + 真 SDK 接入 | 完整看→玩→播闭环, 录像回流 |
| **M11** | 4 层礼物经济实装(Enhance / Spotlight / Sponsor / Loot)| 商业化验证 |
| **M12** | 第 4 个模板家族(塔防 / 自走棋 / Survivors 三选一)| 模板覆盖率 60% → 75% |
| **M12 spike** | **试做 1 个新模板用 Godot Engine 替代 hand-written Canvas**(2-3 天小成本验证,只跑这一个模板,与 HTML5 三模板并存) | 评估 Godot 在"非 LIVE 嵌入"形态下的 dev velocity / 美术 polish 是否真的更顺。结果决定 Phase 2 是否大改 |
| **M13** | **多人 PK / 实时对战**(同一直播间观众 1v1 / 3v3)| 社交杠杆撬动留存 |
| **M14** | 排行榜 + 主播 Encore 专属任务 | 主播 - 观众生态绑定 |
| **M14+** | 生成式行为 DSL(LLM 直接输出波次 / 单位 / 技能 DSL)| 每条 Encore 不一样, Astrocade-tier 竞争位 — Godot 的 scene 组合天然契合 |
| **M16+** | 真实平台 + 高并发后端 | 百万级并发,模型缓存与降级 |

> **关于 Godot Engine 的判断(2026-05-22 评估)**:
> 短期(Phase 1, 千元机 + LIVE 嵌入硬约束)**不迁** — Godot Web 1-2MB 起步 + 不确定 cold-start 不适合 30 秒一局的 bottom-sheet 体验。
> 长期(Phase 2, 独立小程序 / 站立 H5 / native 形态,bundle 大小不再硬限)**值得做 1 个模板试水**(见 M12 spike 行),hybrid 栈可接受。
> V2G JSON schema (`prototype/v2g/schema.md`) 是工具无关的稳定接口 — 它隔离了 streamer / observer 与 game 引擎,所以将来要切 Godot 时不破坏上游。
> 完整评估见 [/Users/bytedance/.claude/plans/rosy-honking-river.md](file:///Users/bytedance/.claude/plans/rosy-honking-river.md)(本地 plan 文件, 决策依据 + 3 条 verification 步骤)。

### 4.5 礼物变现(M11 设计)

- **Enhance**(改造你的下一局): 火焰子弹 / 双倍 HP / 额外一条命 — 个人增益
- **Spotlight**(为录像加曝光): 让你的录像更可能进 Top 3 锐评池 — 社交向
- **Sponsor**(给主播下一局加 buff): 礼物流向主播 — 主播侧深度变现
- **Loot**(概率宝箱皮肤): 持续收益,常驻 SKU

**铁律**:禁止"送礼换试玩"。送礼是放大体验,不是入场券。主播分成 ≥ 普通 LIVE 礼物分成。

---

## 5. 4 人开发分工

### 5.1 当前实际目录(v0.6.1,可立即上手)

```
encore-hackathon/
├── prototype/
│   ├── encore_prototype.html     全员入口 (HTML + IIFE)  ← 暂时大家都改, 提交前同步
│   ├── styles.css                所有 CSS                ← D 拥有
│   ├── README.md                 模块导航
│   ├── engine/                   ─────────────────────────  A · 玩法引擎
│   │   └── README.md             Iso / 输入 / 音效 / 粒子 (Day 0 拆出)
│   ├── games/                    ─────────────────────────  A · 玩法引擎
│   │   ├── _interface.md         Games[key] 契约 (改它需要全员同意)
│   │   ├── fps.js  (Day 0 拆)
│   │   ├── moba.js (Day 0 拆)
│   │   └── br.js   (Day 0 拆)
│   ├── ui/                       ─────────────────────────  D · LIVE/UX
│   │   └── README.md             HUD / HOW_TO_PLAY / splash / end
│   ├── v2g/                      ─────────────────────────  B · V2G/AI
│   │   ├── observer.py           ✓ Vision HTTP 代理
│   │   ├── schema.md             ✓ JSON config 契约
│   │   └── README.md
│   ├── live/                     ─────────────────────────  D · LIVE/UX (v0.7 重建)
│   │   ├── streamer.html         ✓ 集成 shell + iPhone frame + fit-scale
│   │   ├── css/
│   │   │   ├── live-shell.css    ✓ TikTok chrome + tokens + 11 keyframes
│   │   │   ├── ai-panel.css      ✓ Sheet shell + 4 phases + ack overlay
│   │   │   └── mini-games.css    ✓ Aim/Rhythm/Dodge (备用,不加载)
│   │   ├── js/
│   │   │   ├── live-room.js      ✓ chrome 编排 + entry-mode 渐进 + chat + ack
│   │   │   ├── encore-sheet.js   ✓ 4-phase 状态机 + iframe protocol
│   │   │   ├── mini-games.js     ✓ 3 demo 游戏 (备用,不加载)
│   │   │   └── observer-client.js  ✓ V2G 客户端 (dormant,等 B 接入)
│   │   └── README.md
│   └── assets/                   ─────────────────────────  C · 美术
│       ├── atlas.png / .json     ✓ 精灵图集 (程序化, 待 AI 替换)
│       ├── pack.py / process.py  ✓ 精灵流水线
│       └── PROMPTS.md            ✓ AI prompt playbook
├── docs/
│   ├── encore_product_plan.md    本文档
│   ├── v2g_demo.md               V2G 跑通指南
│   └── encore_slides.html        13 页演讲 deck
├── scripts/
│   └── deploy.sh                 同步镜像 + Vercel 部署
└── .github/
    └── CODEOWNERS                4 人模块归属
```

### 5.2 4 个角色 + 关键产出

| 角色 | 模块 | 主要产出 | 谁就近评审 |
|---|---|---|---|
| **A · 玩法引擎** | `engine/` + `games/` | 3 模板 Games 对象、Iso 渲染、aim/fire/collision、UX 状态机 | D(因为 D 改的是引擎暴露的接口) |
| **B · V2G / AI** | `v2g/` | observer.py 提示词调优、cost 监控、schema 演进 | D(streamer.html 是 schema 的消费方) |
| **C · 美术内容** | `assets/` + `themes.js` | 12 主题调色板、22 sprites、粒子调色 | A(美术接到引擎的 hook) |
| **D · LIVE 集成 / UX** | `live/` + `ui/` + `styles.css` + `docs/` | streamer.html、postMessage、bottom sheet、礼物 UI 摆拍、deck 演示 | A(LIVE 通过 postMessage 调引擎) |

### 5.3 依赖关系与并行度

```
DAY 1 ─────────────────────────────────────────────────────────────
  全员对齐 1h (确认接口 + 切分支)
       ↓
  A · 玩法引擎 ─────┐                       (critical path)
                    ├─→ 第一次集成(晚)
  B · V2G/AI ──────┤
       (mock JSON config 给 A 用, A 不阻塞)
                    │
  C · 美术 ────────┤
       (基于 A 的占位先做主题色, A 接口稳定后跑批 sprites)
                    │
  D · LIVE 集成 ───┘
       (先做 shell, 等 A/B 产物对接)

DAY 2 ─────────────────────────────────────────────────────────────
  并行修 bug + 集成第二轮
       ↓
  全员 playtest-check (中午)
       ↓
  录 demo + 终极部署 + 评委演示 (下午)
```

**关键并行点**:
- B 先产出 mock JSON config,A / D 立刻可用,B 后端开发不阻塞前端。
- C 先做主题色 + 调色板(纯 CSS / themes.js),与 A 完全解耦,后期跑 sprites 时也只是替换 atlas。
- D 的 streamer / sheet shell 用 mock 数据可以独立开发,集成只是接接口。

**关键串行点**:
- A 必须先定义清楚 `Games.x.init / update / draw / refit` 接口(已写死在 `games/_interface.md`)。Day 1 第一个小时 review + 锁版本。
- 第一次集成必须在 Day 1 晚 6 点前完成,否则 Day 2 没时间修。

---

## 6. Hackathon 前准备 + 2 天交付计划

### 6.1 多人协作工具链(已就绪)

| 工具 | 状态 | 用途 |
|---|---|---|
| `scripts/deploy.sh` | ✅ 已建 | 镜像同步 + Vercel 部署。`--skip-vercel` 只同步 |
| `playtest-check` skill | ✅ 已建 (`~/.claude/skills/`) | 改完 game 后 5 步检查,提交前必跑 |
| `.github/CODEOWNERS` | ✅ 已建 | PR 自动 @ 模块负责人 |
| `prototype/games/_interface.md` | ✅ 已建 | Games 接口契约 |
| `prototype/v2g/schema.md` | ✅ 已建 | V2G JSON 协议 |
| `CLAUDE.md` 多人铁律 | ✅ 已建 | 每个 Claude session 启动时自动读到 |
| Vercel per-branch preview | ⚠️ 部署自动跑, 但 SSO 拦截 | Vercel 默认给每个 PR 生成预览 URL (本仓库实测 PR #3 自动出了 [preview](https://encore-deploy-git-feat-tutorial-overla-52616e-pollyzas-projects.vercel.app)), 但 401 SSO gate 只允许 Vercel team 成员访问。**4 人协作需要其中之一**:(a) 把 dev B/C/D 加进 Vercel team (Settings → Members);(b) Vercel dashboard → Settings → Deployment Protection → 把 "Vercel Authentication" 对 Preview Deployments 关掉 (推荐, hackathon 用);(c) 用现有的 access-code gate 替代,继续走 prod URL。建议 hackathon 期间走 (b) |
| GitHub Actions prettier check | ⏳ 待开 | 杜绝格式冲突,2 小时配置(可选) |

### 6.2 Hackathon 前一周准备(零代码,纯准备)

| 类别 | 内容 |
|---|---|
| **设计真理** | 飞书 Brief v0.1 锁定;3 铁律确认(UX 不压缩 LIVE / 礼物不 gate / 主播分成 ≥)|
| **内容素材** | 5 段真实 TikTok 游戏 LIVE 录屏;3 套参考游戏调色板;5 个参考精灵风格图 |
| **技术准备** | Claude API key + 预算(估算 $2.25 / 30 分钟 demo);Vercel 项目预创;`scripts/deploy.sh` 部署链路打通(✅ 已打通)|
| **环境 self-check** | 每人本地能跑 `python3 -m http.server 8080` + 看到 prototype;`vercel --prod` 能跑通;Lark CLI 能用 |
| **CODEOWNERS 真名** | 把 `placeholder-dev-a/b/c/d` 替换成 4 人真实 GitHub handle |
| **Vercel preview 配置** | git integration 默认已开 (实测 PR #3 自动出预览). **必须额外做一步**: dashboard → Settings → Deployment Protection → 把 "Vercel Authentication" 在 Preview Deployments 下关掉, 否则 4 人除 owner 外其他人会撞 401。或者把 B/C/D 加进 Vercel team |
| **分工对齐** | 4 人每人提前 1 周阅读 `prototype/README.md` + `_interface.md` + 本文档;各写 200 字"我准备做什么、我会卡在哪"|
| **演示物料** | 评委 demo 流程脚本(2 分钟讲完看→玩→播);访问码定好 |

### 6.3 Day 1 时间表(48h 倒计时 T-48 ~ T-24)

| 时段 | 内容 | 负责人 |
|---|---|---|
| **09:00 – 10:00** | 全员对齐:Review `_interface.md` + `schema.md` + 切个人 feature 分支 | 全员 |
| **10:00 – 10:30** | **JS 拆分** — A 主导, 把 encore_prototype.html 的 IIFE 拆成 `engine/*.js` + `games/*.js` + `ui/*.js`, 用 `<script src=...>` 串起来。**这是最关键的 30 分钟**, 不做后面 4 人会撞车 | A + 全员旁观 |
| **10:30 – 12:30** | 并行 sprint #1 | A:FPS 模板核心机制 / B:observer 代理 + 假 Vision response / C:3 主题调色板 + 占位 sprite / D:streamer shell + bottom sheet 动画 |
| **12:30 – 13:30** | 午饭 + Brief 重读 | — |
| **13:30 – 17:00** | 并行 sprint #2 | A:MOBA + BR 模板 + 输入处理 / B:真 Vision 接入 + JSON 协议落地 / C:12 主题完整切换 + ambient FX / D:postMessage 双向通信 + 状态机 |
| **17:00 – 19:00** | **第一次集成**:streamer → Vision → iframe → 完整看→玩跑通 | 全员 |
| **19:00 – 20:00** | 晚饭 + 每人列 Day 2 必做清单 | 全员 |
| **20:00 – 22:00** | **playtest-check #1**:互相演示对方模块,记下 3 个最 ugly 的问题 | 全员 |
| **22:00 –** | 关机睡觉(避免 hackathon 通宵反向降产出) | — |

**Day 1 结束物**:看 → 玩 链路跑通(可能丑),3 个模板都能进入,主题随机滚。**这是不能往后挪的硬截止**。

### 6.4 Day 2 时间表(T-24 ~ T-0)

| 时段 | 内容 | 负责人 |
|---|---|---|
| **09:00 – 09:30** | 全员快速同步:昨晚发现的 3 个 ugly 问题 → 分配责任人 | 全员 |
| **09:30 – 12:00** | **并行修 bug + 添亮点** | A:跑 `/playtest-check`,补 auto-aim/auto-fire 等友好默认值 / B:Vision prompt 调优,降误触发率 / C:跑 AI sprite 批次(如果时间够)/ D:HOW TO PLAY 引导卡 + 礼物 UI 摆拍 |
| **12:00 – 13:00** | 午饭 + **集成 #2**:所有人产出合到一起 | — |
| **13:00 – 14:30** | **playtest-check #2**:每人请 1 个非组员盲玩 30 秒,记反馈 | 全员 |
| **14:30 – 16:00** | 修盲玩反馈中的硬伤(命中、目标感、引导不清)| ABCD 按模块 |
| **16:00 – 17:30** | **录 demo 视频 + 终极部署 + Slide deck 定稿** | D 主导,全员协助 |
| **17:30 – 18:30** | 现场演示彩排 ≥ 3 次(2 分钟版本)| 全员 |
| **18:30 – 19:30** | 晚饭 / 休息 | — |
| **19:30 – 21:00** | **评委演示** | 主讲 1 人 + 旁边 1 人控场 |

### 6.5 合并节奏(参考)

```
Day 1 上午 10:00  全员对齐, 建分支
Day 1 中午 12:30  第一次主线合并 #1 (每人都把当前进展并入 main)
Day 1 傍晚 17:00  第一次集成合并 #2 (4 个模块第一次跑通)
Day 1 睡前 22:00  Day 1 收盘合并 #3

Day 2 早上 09:30  Day 2 起步合并 #4
Day 2 中午 12:00  集成合并 #5
Day 2 下午 16:00  Demo-freeze 合并 #6 (锁版本, 后续只修 critical)
```

每次合并由 **当天的 "merge captain"**(轮值)主持,职责是 git pull + 合 4 个分支 + 跑 `playtest-check` + 部署预览。

### 6.6 交付物

Demo 之前必须有的:
1. ✅ **Live demo URL**(同 v0.6 已交付:`https://encore-deploy.vercel.app`)
2. ✅ **2 分钟现场演示**:进 LIVE 间 → Vision 检测 → bottom sheet 玩一局 → 录像回流的完整路径
3. ✅ **13 页 deck / pitch 页**:讲清楚问题、形态、商业模型、roadmap
4. ✅ **30 秒 demo 视频**(防演示翻车备份)
5. ✅ **GitHub 仓库 + README**(评委自己也能跑)

### 6.7 风险与降级方案

| 风险 | 降级方案 |
|---|---|
| Vision 检测不稳定 | 演示时用预录视频 + 假 JSON(已实装 `FORCE` 按钮)|
| AI 美术跑不出 | 用程序化 atlas(已实装,千元机能跑)|
| 集成卡壳 | 4 模块分别可独立演示,降级到 "看 3 个模板都能玩"|
| 评委不懂游戏 | 演示选 FPS(认知门槛最低)+ 主播侧讲叙事 |
| 网络/部署翻车 | 本地 `localhost:8080` 备份,30 秒 demo 视频备份 |
| Day 1 上午 JS 拆分失败 | 退回单文件 + 严格的 git 锁(每人锁一段 commit 范围)|

---

## 附录 A:已锁定的产品决策(不在 hackathon 期间反复讨论)

| 决策 | 内容 |
|---|---|
| **技术路径** | Phase 1 = 模板参数化(Path B),不是真生成式;AI 出 JSON,引擎接 |
| **美术风格** | 抽象像素风(Roblox / MC 系),规避 IP 风险,千元机兼容 |
| **入口位置** | LIVE-first;M12 前不做短视频流入口(转化率塌方)|
| **UX 形态** | TikTok 原生 bottom sheet 上滑,永不挤压 LIVE,8 状态 FSM |
| **变现** | 4 层礼物经济(Enhance / Spotlight / Sponsor / Loot),禁止"送礼换试玩"|
| **模板覆盖** | 必须做 3 套(FPS + MOBA + BR),覆盖 60-70% 游戏 LIVE 内容供给 |
| **主播分成** | Encore 礼物中主播分成 ≥ 普通 LIVE 礼物分成 |

## 附录 B:Claude Code 多人协作的特有陷阱与对策

| 陷阱 | 对策 |
|---|---|
| Claude 把别人写的 200 行函数重写成 250 行风格不同 | `CLAUDE.md` 加铁律:"不要重构未在本 task 范围内的代码,用 Edit 不用 Write" |
| Claude 引入新依赖(npm / pip) | 新依赖必须 PR 单独提,锁版本 |
| Claude 改文件后忘记同步镜像 | 让每个人的 Claude 在 PR 前跑 `bash scripts/deploy.sh --skip-vercel` |
| 两个 Claude 各自写了一个同名 helper 函数 | 拆模块 + CODEOWNERS 解决 99%;剩下 1% 在 code review 拍掉 |
| 一个人的 Claude 改了 `Games.x.update` 签名 | 接口契约写在 `prototype/games/_interface.md`,Claude 启动时读到 |
| 别人改的 CSS class 名冲突 | 用 `.fps-` `.moba-` `.sheet-` `.howto-` 模块前缀 |

---

**文档维护**:本文档为 Encore PM 单方面起草的产品规划,与 hackathon 实际开发产出对齐。设计真理在飞书,本地文档/代码是设计的实现与试探,不是来源。
