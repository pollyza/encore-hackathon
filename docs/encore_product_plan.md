# Encore — 产品规划 v0.8

> 本地 staging 文档,与飞书 [Product Brief v0.8](https://bytedance.larkoffice.com/docx/PzXnd27k8oWMRYxJIx4mgw4uy8c) 同步。**设计真理在飞书**,本地是实现试探。
> 配套资源:[Demo Dev Plan v0.2 (飞书)](https://bytedance.larkoffice.com/docx/LfbydvhwCopawvx6UthmmOcoyNf) · [LIVE 交互模块 sub-doc (飞书 wiki)](https://www.feishu.cn/wiki/DqOXwN2hzig5cUkX6zxcCFmGnXd) · [GitHub](https://github.com/pollyza/encore-hackathon) · [Live demo](https://encore-deploy.vercel.app) · [D-module 状态卡](./polly_d_module_status.md)
> 维护者:Encore PM。
> **v0.8 vs v0.7 主要变化**:删除未验证数据(`5 秒高光黑洞` / `3.5s 弹幕延迟` / 各种百分比预测) · 新增 non-interference 第一原则 · 礼物经济从 4 层(Enhance/Spotlight/Sponsor/Loot)砍到 2 层 + Phase 2 一层(Enhance/Spotlight + Remix) · 新增 §4 机制设计 / §5 商业价值 / §6 创新性 / §7 可落地性 / §8 MVP 局限 / §9 护城河 / §10 风险共 7 章诚实评估。

---

## 1. 背景与定位

### 1.1 真问题

TikTok LIVE 现有的**观众侧互动 SKU 栈**:

| SKU | 观众侧动作 | 上限/痛点 |
|---|---|---|
| 礼物打赏 | 单向 | 无操作感、心智门槛高 |
| 弹幕评论 | 文字 | 单向、信息低密度 |
| 关注 / 加群 | 长期决策 | 0/1 切换,无中间档位 |
| 礼物互动 mini-game(PUBGM / 蛋仔联动) | 送礼驱动主播游戏 | **干预主播游戏进程**,把 gaming LIVE 退化成派对游戏 MC 直播 |
| Polls / 投票 | 选择 | 互动频率低、ARPU 弱 |
| 游戏竞猜 / Predictions | 押注 | 完全二手体验,无操作感 |

**观察**:整个栈里**没有一个 SKU 给观众"自己做点什么"的并行 agency**。送礼是单向、弹幕是文字、关注是 0/1、互动 mini-game 是借主播的手玩。观众的"我也想动手"被堵在这里。

> **注**:旧版 v0.7 中"5 秒高光黑洞"和"弹幕平均提交延迟 ~3.5s"两句话都没有可查的数据来源,已删除。这一节的论述基于**功能栈缺位的逻辑判断**,不依赖具体延迟数字。

### 1.2 Encore 在 SKU 矩阵中的位置

| SKU | 主播角色 | 观众角色 | 是否干预主播 |
|---|---|---|---|
| 礼物互动 mini-game | 游戏被动承受者 | 礼物驱动主播游戏 | **高** |
| Polls / 投票 | 提问者 | 投票者 | 无 |
| 游戏竞猜 | 被预测对象 | 押注者 | 无 |
| 弹幕 / 礼物 | 反应者 | 表达者 | 无 |
| **Encore** | **打 ranked 不变**(保持 player 身份)| **平行玩家**(自己玩 30s mini-game)| **零** |

Encore 不是替换上述任何一格,而是**新增一个维度**——"观众的并行 agency 层"。它跟现有 SKU 共存而非竞争。

### 1.3 第一原则:Non-interference

> **主播玩什么、怎么玩、什么时候玩,Encore 永远不动。Encore 是观众侧并行栈,不是主播侧工具栈。**

可执行含义:

- ❌ 任何"送礼物让主播下一把开 buff" → 不做
- ❌ "Sponsor 主播下一局" → 不做
- ✅ Enhance(改观众自己的下一局)→ 做
- ✅ 主播侧只做选择题(一键 promote/skip),永远不做操作题

这条原则是 Encore 跟现有礼物互动 mini-game 的根本架构差异,**已锁定在附录 A**。

### 1.4 价值主张(不带数据,仅定性)

| 角色 | 收益 |
|---|---|
| **观众** | 高光时刻情绪有出口(玩一局),产生"我也参与过"的社交资本;进入 Top 3 winner 时自动产出短视频,扩展个人 TikTok 内容产出 |
| **主播** | 内容杠杆免操作:Encore winner clip 自动 @tag、可选 Duet 接受 → 主播被动产出二次分发内容;付费功能可设 gift-gate 直接增量变现 |
| **平台** | 填补现有观众互动 SKU 栈"并行 agency"空格;增加新的礼物 SKU 触发场景;游戏 LIVE 内容形态多样化 |

> **注**:具体业务价值数据(dwell time、ARPU 提升、付费率)必须由灰度 A/B 数据回答,**MVP 不预设结论**。

### 1.5 面向人群

**MVP 灰度(核心用户)**:

- **TikTok 游戏 LIVE 头部主播**(FPS / MOBA / 吃鸡品类,粉丝 ≥ 50w):5–10 人启动灰度
- **TikTok 游戏 LIVE 重度观众**(每日 LIVE 观看时长 ≥ 30min):付费意愿和分享意愿双高

**Phase 2 扩展**:

- 中长尾游戏主播(粉丝 ≥ 5w)
- 跨品类 LIVE(派对、卡牌、IRL 等需要观众互动的赛道)
- 短视频 feed 流入口(M12+,验证 LIVE 形态成立后再扩)

---

## 2. 一句话需求

> **TikTok LIVE 的观众互动栈缺少"不干预主播"的并行 agency 层。Encore 用游戏 LIVE 切入这个空位:每次高光时刻,AI 把它结构化重构成观众侧 30s mini-game,并在事后自动产出"主播版 vs 玩家版"split-screen 短视频回流到 TikTok feed。**

**和 v0.7 的对比**:

- 旧:「AI 实时检测高光,重构成 mini-game 推给观众」(把 AI 当核心卖点)
- 新:「填补观众互动 SKU 缺位的并行 agency 层」(把 AI 降级为 enabler,不是 hero feature)

AI 仍然在产品里、是必需基建,但**它不是定位句**。定位句是产品在 SKU 矩阵中的位置。

---

## 3. 用户交互路径

### 3.1 主播侧

**开播前 dashboard 配置(一次性)**:

```
[Encore 开关]
  · 灰度阶段:默认 ON(BD 一对一沟通,已知情)
  · 全量阶段:默认 OFF,主播主动 opt-in

[Duet 自动接受](仅当 Encore 开关 ON 时显示)
  · 默认 ON,可关
  · ON = winner clip 自动以 Collab Post 形式发布(主播侧无操作)
  · OFF = winner clip 仅以 @tag 形式发布,主播可后续手动决定每条是否 Duet

[付费功能 gift-gate]
  · Enhance / Spotlight / Remix 三档分别配置
  · 候选:OFF(推荐)/ 50 / 200 / 500 金币
  · 超过 500 金币 dashboard 出软警告"该 gate 转化率比同档主播低 X%"(数据出来后才显示)
```

**直播中**:

```
AI 检测到高光事件
  ↓
推送通知到主播端 (5s 倒计时)
  · 默认 promote
  · 主播可一键 skip (Vision 成本不浪费 = 已花, 但 bottom sheet 不弹给观众)
  ↓
promote → bottom sheet 弹给所有在场观众
skip → 该高光不进入 Encore 流程
  ↓
主播继续打 ranked, 不再被 Encore 流程打扰
```

**直播后(异步)**:

- 30 min 内主播可逐条 review winner clip 决定是否 veto
- 不 veto → 自动发布到 viewer profile + @tag 主播 + 可选 Collab
- 全局可一键关闭 Encore 后续直播默认配置

### 3.2 观众侧

**首次玩 Encore(一次性 legal consent)**:

```
弹窗:
  「玩 Encore 即同意:
   · 你的玩法记录可能被生成为 split-screen 短视频
   · 进入 Top 3 winner 时自动 publish 到你的 TikTok profile, @tag 主播
   · 失败或非 winner 局不自动 publish, 你可付费选择发布
   · 同意条款可随时在设置中撤回」
  [同意才能继续玩]
```

**每次高光场(重复流程)**:

```
进入 LIVE 间
   ↓
[观看主播 ~ 任意时长]
   ↓
AI 检测高光 → 主播 promote → bottom sheet 上滑
  · 受 fatigue cap 限制: 每场每 viewer ≤ 3-5 次
  · 永不挤压 LIVE 主画面, 永不静音
   ↓
HOW TO PLAY 3-5s (可一键继续)
   ↓
玩 30s Encore (与刚才高光同 template + theme + scenario)
   ↓
Result Page:
  · 个人分数 + Encore Rank pill
  · 实时排名 "目前 #N / 共 X 人完成 (还有 Y 人进行中)"
  · 付费功能入口:
    · 主播 gate OFF → 直接付费购买 Enhance / Spotlight
    · 主播 gate ON → 先送 N 金币给主播 → 解锁购买入口
   ↓
高光场结束 (~3-5 min 后异步):
  · 进入 Top 3 → push 通知 "恭喜进入 winner #N, 短视频已生成"
  · 未进 Top 3 → push 通知 "未进 winner, 是否 $0.5 付费生成你的 clip"
  · 失败局 → 不主动 push, 仅在 result page 显示选项
   ↓
bottom sheet 自动滑下 → fatigue cooldown → 继续看 LIVE
```

### 3.3 Clip 生成与二次分发

| 维度 | 规则 |
|---|---|
| **资格** | Top 3 winner 免费自动生成 + 其他 viewer $0.5 付费 Spotlight 生成 |
| **排名** | 分数降序 → 完成时间升序 → 进入 Encore 时间升序 |
| **post owner** | viewer 自己(profile + 双方粉丝 feed) |
| **主播绑定** | 自动 @tag;主播 30 min 内决定是否升级为 Duet/Collab Post |
| **视觉格式** | 默认上下 split:主播 15s 上 + viewer 15s 下,总长 15s 同步播放<br>backup A/B:mirror 前后接续(主播 → viewer 重放) |
| **viewer 视频长度** | 服务端自动剪 30s 玩法的 score 峰值 ±7.5s = 15s 高光段 |
| **失败 clip** | 不自动生成;viewer 可付费手动生成 |
| **质量门槛** | 完成 + 最低分数(具体阈值待 MVP 后调)→ 否则 winner 资格作废 + 不弹付费选项 |
| **分发链路** | 等同 TikTok 普通 UGC,进 profile + 双方粉丝 feed;自动加 `#Encore` hashtag |
| **算法保护** | server-side quality gate(防 spam);后续阶段跟算法团队对齐"stitched native content"标识 |
| **CTA** | clip 描述自动嵌入 `Play [Game Name] →`,走 TikTok game center 入口,**不依赖游戏厂商 BD** |

### 3.4 礼物经济

**铁律**:Encore 玩本身 / 看 winner clip / 被动 collab,任何时候都不能 gate。Gift-gate 只能加在**付费功能入口**前。

**免费层**(绝对不可 gate):

- 玩 Encore 30s
- 看 winner clip / 自己出 winner clip
- 被动 Collab(主播 Duet)
- Result Page 实时排名显示
- 失败局手动选择是否付费生成 clip

**付费层**(可主播 gift-gate):

| SKU | 价位(待定,需 A/B) | 阶段 | 说明 |
|---|---|---|---|
| **Enhance** | $0.5-1 | MVP | 改自己下一局(火焰子弹 / 双倍 HP / 额外一条命);唯一接近"功能性付费"心智 |
| **Spotlight** | $0.5 | MVP | 非 winner 但想发自己 clip;**和 v0.7 不同的是不再卖"加曝光"**,改卖"生成自己的 clip",心智更具体 |
| **Remix** | $2-5 | Phase 2(M11+) | LLM 生成自定义参数("slower, shotgun, pink enemies");**这是 AI 真正不可替代的地方** |

**主播分成**:

- gift-gate 触发的礼物 → 走 TikTok LIVE 正常礼物分成(主播主要收益)
- 付费功能本身的收入 → 平台 / Encore 标准分成(主播不分)
- **这是关键边界**:主播不分付费功能直接收入,防止"主播为催付费降低 gate"产生反激励

> **从 v0.7 删除的 SKU**:
> - **Sponsor**(送主播下一局加 buff):违反 non-interference 第一原则
> - **Loot**(概率宝箱):赌博机制,监管风险

### 3.5 8 状态有限状态机(保留 v0.7 设计)

`SAMPLING / DETECTED / WARMUP / PLAY / END / REPLAY_PEEK / GIFT / RESET`

详见 [Brief 飞书文档 §11.7 状态机画板](https://bytedance.larkoffice.com/docx/PzXnd27k8oWMRYxJIx4mgw4uy8c)。

---

## 4. 机制设计(技术 + 业务联合)

### 4.1 Top 3 Winner Clip 机制

**为什么是 3 而不是 1**:

- Top 1 = 单点稀缺,viewer 没希望就不玩
- Top 3 = 3 个槽位,玩的动机 + 上榜可能性平衡
- 数学上 50 高光 × 3 = 150 winner clip/场,加付费 Spotlight 200-500 条,总量级可管理

**winner 资格 + 防作弊**:

- 完成度门槛 + 最低分数 + 完整 input log 校验
- 防 bot 农场:device fingerprint + viewer-in-LIVE 时长 ≥ 5min + Encore 历史 hash check
- 平局规则:三级排序(分数 → 完成时间 → 进 Encore 时间)

### 4.2 Server-side Render 架构

**核心 insight**:Encore 是**确定性的**(同 seed + 同 input log = 同结果),所以 viewer 客户端只需上传几 KB 的 input log,服务端可重渲。

```
viewer 客户端
  · 录入完整 input log (按键 + 时间戳, 几 KB)
  · 上传到 Encore 服务端
  · 不录视频, 不传视频流(移动端流量 / 电量友好)

Encore 服务端 (asynchronous worker)
  · 接收 input log + session metadata (seed, template, theme)
  · headless Canvas 重渲 30s 游戏 → 取分数峰值 ±7.5s = 15s
  · 拉取主播侧 15s 高光 (从 TikTok LIVE clip pipeline 既有能力)
  · ffmpeg 上下拼 → 输出 9:16 短视频
  · 发布到 viewer TikTok account, @tag 主播, #Encore tag

可观察延迟: 高光结束后 3-5 min 内 clip 出来
```

**成本数量级**(估算,需 B 实测验证):

- 单 clip 渲染 ≈ 0.5-1 CPU·s
- 50K 直播间 × 50 高光 × 3 winner = 7.5M clip/日
- 7.5M × 1s = ~2000 CPU·h/日 ≈ **$50-200/日 全量级别**(云上 spot 实例)
- 相比 Vision 检测成本(见 §7.2)可忽略

### 4.3 Vision 检测 + 主播 promote/skip 流程

主播侧的 5s 倒计时 promote/skip 是**整个机制的关键设计**:

- 让主播作为高光质量过滤器,减少误触发对观众体验的伤害
- 给主播 control 感("我是 Encore 的 director,不是被动接受者")
- 砍掉 ~30-50% 的低质 Encore 触发,降低观众 fatigue
- 但不能砍太多 → 默认 promote、5s 倒计时、一键操作降低主播认知负担

### 4.4 法律 / 隐私 consent

| 角色 | 何时 consent | 形式 |
|---|---|---|
| 主播 | 首次 dashboard 开 Encore 开关 | 一次性弹窗 + 长 ToS 链接 |
| viewer | 首次玩 Encore | 一次性弹窗(友好措辞,参考 TikTok Duet 首次开通范式) |

撤回路径:双方任何时候可在设置撤回,撤回后**不影响已发布 clip**(已发布走 TikTok 普通 UGC 删除流程)。

---

## 5. 商业价值

### 5.1 收入模型(MVP)

**单一收入流:观众侧付费功能 + 礼物 gift-gate**

| 收入项 | 来源 | 主播分成 | 平台分成 |
|---|---|---|---|
| Enhance / Spotlight 购买 | viewer 直接付费 | 0%(除非走 gift-gate) | 100% 走平台 / Encore 标准比例 |
| Gift-gate 礼物 | viewer 送礼解锁付费功能入口 | 走 TikTok LIVE 礼物正常分成 | 同上 |

**Phase 2 可选扩展**:

- Remix 高客单功能($2-5)
- 游戏发行 CPI 漏斗(需达到 100K clip/日 + 游戏厂商主动洽谈触发)

### 5.2 不预设数据结论

v0.7 中"5-10% ARPU lift"、"$87/直播"等数字**全部撤回**,原因:

- 没有 TikTok LIVE gaming 品类的真实 ARPPU 内部数据
- 类比 Twitch Bits 的外部数字($5-12/年)无法直接换算到 TikTok
- 灰度前任何具体收入预测都是 marketing 不是 business analysis

**MVP 阶段要做的是**:

1. 灰度 5-10 主播,每场跑 1 周
2. 记录:Encore 触发率 / 完成率 / 付费率 / clip 发布率 / clip 平均观看 / viewer 次日回访
3. 跟同主播开播前 1 月做 baseline 对比
4. **数据出来后再写收入模型**

### 5.3 业务价值的非直接收入部分

不是所有价值都进 P&L,但这些是平台层面必须算账的:

- **观众 dwell time**:viewer 进 LIVE 不再"看完高光就走",因为还要等下一次 Encore + 看 winner clip
- **平台 UGC 新内容形态**:#Encore tag 下的 split-screen 短视频是 TikTok 算法可吸收的新内容池
- **游戏发行漏斗潜力**:clip 内嵌 `Play [Game Name]` CTA → 走 game center,不需要 publisher BD,**organic install referral 是免费红利**
- **主播粘性**:接入 Encore 的主播多一条被动内容产出线,迁移到竞品时这部分内容直接归零

这些是**叙事价值**不是数字承诺,但是给平台高层讲 Encore 时必须讲清楚的。

---

## 6. 创新性与竞争差异

### 6.1 vs 现有竞品(直接同类)

| 维度 | Twitch Extensions | tikfinity | Rezone / Loopit | **Encore** |
|---|---|---|---|---|
| 触发方 | viewer 主动开 panel | streamer 配置 alerts | viewer 主动点 | **AI 上下文触发** |
| 内容来源 | 通用预制 mini-game | streamer 自配 | 通用预制 | **video → game 参数化重构** |
| 形态 | 侧边栏(desktop-first) | 屏幕 overlay | 独立 webapp | **bottom sheet(mobile-first)** |
| 分发 | viewer 主动找 | streamer 整 | viewer 整 | **主流 feed + 自动 collab 回流** |
| 主播干预 | 无 | 主播自配 | 无 | **零(non-interference)** |

**真差异化只有两条**:

1. **AI 上下文触发**(context-aware vs. menu-driven)
2. **mobile-first bottom sheet** 形态

> **诚实声明**:Twitch Extensions 这个品类**8 年了没爆**,最成功的是 Predictions(不是 mini-game)。这说明 mini-game-as-extension 这个范式本身可能天花板就低。Encore 必须靠 §9 的护城河叠加来跳出这个范式天花板,而不是认为"做得更好就能赢"。

### 6.2 vs TikTok LIVE 现有礼物互动 mini-game

这是 Encore 的**最直接竞品**,差异写清:

| 维度 | 礼物互动 mini-game | **Encore** |
|---|---|---|
| 主播角色 | 游戏被动承受者(被 buff/障碍打扰) | 不变(继续打 ranked) |
| 观众玩 | 借主播的手玩 | **自己玩** |
| 内容形态 | 礼物驱动单一交互 | **完整 30s 玩法** |
| 二次分发 | 无 | **自动 split-screen 短视频** |
| 蚕食 gaming LIVE | **是**(主播变 MC) | **否**(主播保持 player) |

**关键论点**:TikTok 现有礼物互动 mini-game 的最大问题是**让 gaming LIVE 退化成派对游戏直播**——主播不再是 player,gaming 品类的核心吸引力被稀释。Encore 是反向设计:**保留主播 player 身份的同时新增观众 agency**。

这一条是 BD 沟通的核心叙事——**Encore 是对游戏 LIVE 品类的保护,不是消费**。

### 6.3 AI 的真实位置

| 阶段 | AI 是必需还是可替代 |
|---|---|
| Phase 1 高光检测 | **可被规则系统替代**(kill feed OCR + HP bar tracking + minimap state)。Vision LLM 是**便利**不是**必需**。 |
| Phase 1 模板路由 | **可被规则替代**(基于游戏 + scenario tag 直接 hash) |
| Phase 1 V2G JSON 参数 | **可被规则替代**(templates 是预制的) |
| Phase 2 新游戏零样本扩展 | **AI 必需**(不写新 OCR 就能支持新游戏) |
| Phase 2 Remix 功能 | **AI 必需**(生成式 DSL 才能动态出新参数) |

**结论**:Encore 在 Phase 1 是**模板化交互范式 + UX + 平台礼物中台**的组合,AI 是 enabler 不是 hero。把 AI 当核心卖点会让评委一眼看穿"现在不需要 LLM"。

**正确叙事**:Encore 是一个**今天就能跑通的产品**,AI 是它**Phase 2 的扩展性保险**。

### 6.4 为什么是 LIVE + Gaming,不是短视频或其他场景

**LIVE 的唯一不可替代性:co-presence(同时在场)**:

- 5000 人在同一秒看到 1v3 翻盘,bottom sheet 同时弹给 5000 人
- 共享情绪 anchor 是短视频做不到的(异步)
- LIVE 用户钱包已开(既有礼物习惯),短视频用户没开

**Gaming 的唯一不可替代性:高光事件是离散、可识别、可参数化的**:

- 聊天 LIVE / IRL LIVE / 唱歌 LIVE 的"高光"是连续主观无法参数化的
- 只有 Gaming(FPS kill / MOBA 团战 / BR 残局)的高光是结构化事件

**所以 LIVE + Gaming 不是营销选择,是唯一可行解的边界**。

---

## 7. 可落地性

### 7.1 技术路径(已锁定,不再讨论)

- **Phase 1 = 模板参数化**(Path B),不是真生成式
- AI 从视频抽 JSON config → 路由到 3 个预制模板:FPS / MOBA / BR
- **抽象像素风**(Roblox / MC 系),规避游戏 IP 风险,千元机兼容
- Canvas 2D + 体素方块,无 WebGL

详见 [Demo Dev Plan v0.2](https://bytedance.larkoffice.com/docx/LfbydvhwCopawvx6UthmmOcoyNf)。

### 7.2 成本模型(按 Claude 3.5 Sonnet 公开价测算)

**Vision 检测成本**(最重的一笔):

| 参数 | 取值 | 来源 |
|---|---|---|
| 单帧 input tokens | ~1500 | 含 prompt 估算 |
| 单帧 output tokens | ~200 | JSON 输出 |
| Claude Sonnet input | $3/M | Anthropic 官方 |
| Claude Sonnet output | $15/M | 同上 |
| 单帧成本 | **~$0.0075** | 计算 |
| 4s 采样频率 | 900 帧/h | 设计选择 |
| **单直播间小时成本** | **~$6.75/h** | |

**全量阶段成本曲线**:

| 阶段 | 同时在播直播间数 | 日成本(5h/直播) | 月成本 |
|---|---|---|---|
| 内测 5 主播 | ~5 | ~$170 | ~$5K |
| Phase 1 灰度 100 主播 | ~100 | ~$3.4K | ~$100K |
| Phase 2 灰度 1,000 主播 | ~1,000 | ~$34K | ~$1M |
| 全量(保守 50K 同时在播) | ~50,000 | ~$1.7M | **~$50M** |

**这是不能上 production 的成本曲线**。MVP 之后必须立刻做 cost engineering:

1. **关键帧 diff + 事件触发**:kill feed 出现才送 Vision → 砍 5-10×
2. **小模型分流**:Haiku 做初筛、Sonnet 做确认 → 再砍 2-3×
3. **prompt cache + 全直播间共享 system prompt** → 砍 30-50%
4. **Vision-only 模式 in 灰度,规则系统 fallback in 全量** → 砍 80%+

**乐观叠加优化 = ~50× 总优化,全量成本 ~$1M/月**,这才是可上线数量级。

**Render 成本**(次要):

- 全量 50K 直播间 × 50 高光 × 3 winner = 7.5M clip/日
- 单 clip 渲染 ~0.5-1 CPU·s = ~$50-200/日
- 相比 Vision 可忽略

### 7.3 运营 / 灰度路径

| 阶段 | 范围 | 验证目标 |
|---|---|---|
| **M9 内测** | 5-10 主播 × 1 周 | 触发率 / 完成率 / 主播体验是否被打扰 |
| **M10 Phase 1 灰度** | 100 主播 × 4 周 | clip 生成质量 / 算法分发表现 / 付费转化 |
| **M11 礼物经济实装** | 同上灰度池 | gift-gate 设置合理性 / ARPU 变化 |
| **M12 模板扩展 + 短视频 entry** | 灰度扩到 1000 | template 覆盖率 / 短视频流入口可行性 |
| **M13+** | 全量 | 真实成本曲线 / Phase 2 收入流 |

每阶段必须先把上阶段验证数据出来再扩。**不预设跳级**。

---

## 8. MVP 局限性(诚实承认)

Hackathon 阶段和 Phase 1 上线**不解决**的三件事:

### 8.1 单局游戏品质

30s mini-game 好玩门槛极高。Helix Jump / Stack 这种"30 秒爽快感"是几十人团队几个月调出来的。Hackathon 4 人 2 天产出的 mini-game 大概率**技术正确但不好玩**。

**应对**:

- 演示阶段不让评委亲手玩 30s 检验"是否好玩"——演示重点是范式 + 闭环 + 平台叙事,游戏一带而过
- MVP 上线后**专项投入 6-12 个月**做单局品质优化
- 这一节必须在飞书 review 时跟设计 / 美术对齐预期

### 8.2 全量成本曲线未解

§7.2 算出全量 $50M/月,乐观优化后 $1M/月,**优化路径都需要 Phase 1 之后专项 cost engineering**。MVP 跑不出商业可行性结论,只能验证产品形态。

### 8.3 单一品类、单一形态

- 只做 FPS / MOBA / BR 三模板,覆盖 60-70% gaming LIVE 内容(来源:基于 TikTok gaming 内部分布的粗估,待验证)
- 只做 LIVE 形态,**不做短视频流入口直到 M12+**(短视频缺少 co-presence,转化率会塌方)

这三件事不是 Phase 1 失败,是 Phase 1 范围。提前划清楚预期。

---

## 9. 竞争护城河(诚实评估)

### 9.1 不是护城河的东西

- V2G JSON schema:开源 / 可被反编译
- Vision 模型:Anthropic / OpenAI / Google 谁都能用
- 4 模板设计:Twitch 4 人团队 1 个月能 clone
- AI Remix DSL:Phase 2 才用,clone 难度等同 Phase 1

### 9.2 真护城河(按强度排)

1. **TikTok 平台分发本身**(最强)—— Twitch clone 出不来 TikTok 的 feed-LIVE 混合分发结构。这是 TikTok 的护城河,Encore 蹭。
2. **观众侧 skill graph + matchmaking data**(中强)—— 每个观众玩 Encore 的历史数据。3 个月后是 first-mover only 数据。
3. **头部主播绑定 + 定制化 Encore variant**(中弱)—— 跟头部主播签独家"我的 Encore",类似 Twitch emote 锁定效应。3 个月内能签 50-100 个 top streamer 是 defensible。
4. **TikTok wallet / 礼物中台原生集成**(看公司意愿)—— Encore SKU 直接走 TikTok wallet,Twitch clone 得自建支付通路。这是**组织能力护城河**,不是技术。

### 9.3 6 个月领先策略

技术 clone 大概 4 个月内做完。**Encore 必须用 1 + 4 赢,不能用技术赢**:

- (1) 不是 PM 能争取的,靠平台 leverage
- (4) **必须 PM 在 Hackathon 之后立刻去对齐**:TikTok 钱包侧 + 礼物中台 + game center 入口的合作。这件事在 v0.7 完全没写,是最大空白。

---

## 10. 风险与缓解

| 风险 | mitigation |
|---|---|
| **观众 fatigue**:5h × 50 高光 = 50 次弹窗 | (a) 主播 promote/skip 砍 30-50%;(b) viewer fatigue cap 每场 ≤ 3-5 次;(c) opt-in 默认在新用户首次进 LIVE 后弹一次"是否启用 Encore"。三层叠加预期 frequency ≤ 4 次/场 |
| **#Encore 标签被算法判 spam** | server-side quality gate + 完成度门槛 + 阶段对齐 TikTok 算法团队加 "stitched native content" 标识 |
| **Bot 农场刷 winner** | device fingerprint + LIVE 时长门槛 + Encore 历史 hash check |
| **主播 gift-gate 设过高劝退 viewer** | dashboard 软警告 + 转化率 dashboard 反馈 |
| **viewer 法律弹窗 deter 转化** | 友好措辞(参考 TikTok Duet 首次开通范式) + 撤回路径清晰 |
| **MVP 游戏不好玩拖垮叙事** | 演示不让评委亲手玩;MVP 之后 6-12 个月专项 |
| **3-6 个月内 Twitch clone** | 靠护城河 (1)+(4),技术不防 clone |
| **Vision 全量成本不可控** | Phase 1 之后 cost engineering 路线图(4 步骤、~50× 优化目标) |

---

## 11. Out of Scope(明确不做)

- LIVE 平台真集成(demo 用 OBS 模拟)
- 真 AI 高光检测(demo 用主播侧按钮写死触发)
- 真礼物 / 支付(只做 UI 摆拍)
- FPS / MOBA / BR 之外的模板(M12+ 长尾再扩)
- 任何后端服务(Hackathon demo 完全 client-side)
- 主播侧操作型功能(违反 non-interference 第一原则)
- Sponsor 礼物 SKU(违反第一原则)
- Loot 概率宝箱(监管风险)
- 短视频 feed 流入口(M12+ 验证 LIVE 后再扩)

---

## 12. Prototype 进度快照

### 12.1 当前 v0.7 已交付

| 类别 | 内容 |
|---|---|
| **3 个游戏模板** | FPS Cover Strike(Valorant feel)/ MOBA Dragon Pit(LoL feel)/ BR Final Circle(PUBG feel) |
| **12 套主题** | 每模板 4 套调色板 + tile set,开局随机滚 |
| **22 个精灵 atlas** | 程序化像素美术,AI 真精灵管道(`PROMPTS.md` + `process.py` + `pack.py`)就绪待跑批 |
| **Iso 体素渲染器** | Canvas 2D,自适应画布,移动竖屏 + 桌面横屏都 fit |
| **完整 V2G 闭环** | `live/streamer.html` → 抽帧 → `v2g/observer.py` 代理 → Claude Vision → JSON config → iframe 启动游戏 |
| **Ambient FX** | 每模板独立粒子 + 色调 grading + 地面贴花 |
| **新手引导** | 5-tier HOW TO PLAY 卡片,触屏 / 桌面双适配,可关 |
| **LIVE 高保真模块** | streamer.html 7 个模块化文件、4-phase 状态机、4-entry mode、Loading/Result/Ranking 三页、iPhone frame + fit-scale |
| **Mario 真模板集成** | `encore_prototype.html?embedded=1` via iframe + V2G postMessage v1.1 |
| **Landing 页 + QR** | 评委现场扫码体验 |
| **公开 demo** | Vercel + GitHub v1 tag + 13 页演讲 deck |

### 12.2 v0.6.1 多人协作准备(已就绪)

- ✅ `prototype/` 目录拆分为 `engine/` `games/` `ui/` `v2g/` `live/` `assets/` 子模块
- ✅ CSS 抽离到 `prototype/styles.css`
- ✅ `prototype/games/_interface.md` 接口契约
- ✅ `prototype/v2g/schema.md` JSON 协议文档(v1.1)
- ✅ `.github/CODEOWNERS` 模块归属
- ✅ `CLAUDE.md` 多人协作铁律
- ✅ `scripts/deploy.sh` 同步新路径
- ⏳ JS 拆分(Day 0 morning)— 每个 game 独立成 `games/{fps,moba,br}.js`,引擎拆到 `engine/`

**公开 URL**:
- 🏠 Landing:https://encore-deploy.vercel.app/
- ⚡ LIVE demo(D-module):https://encore-deploy.vercel.app/prototype/live/streamer.html
- 🎮 标准游戏(A-module):https://encore-deploy.vercel.app/prototype/encore_prototype.html
- 🎤 Pitch deck:https://encore-deploy.vercel.app/docs/encore_slides.html

详见 [`docs/polly_d_module_status.md`](./polly_d_module_status.md)。

### 12.3 未来扩展(优先级排序)— 已按 v0.8 礼物经济更新

| 里程碑 | 内容 | 价值 |
|---|---|---|
| **M9(NOW)** | 真 AI 美术批量切入(MJ / SD / DALL-E)| 视觉接近 Astrocade 级,可上 PRD |
| **M10** | TikTok feed shell + 真 SDK 接入 | 完整看→玩→播闭环, clip 自动回流 |
| **M11** | 礼物经济实装(**Enhance + Spotlight,gift-gate 机制**)| 商业化验证,**已删 Sponsor / Loot** |
| **M11+ (Phase 2)** | **AI Remix 付费功能**($2-5/次,LLM 生成式 DSL) | 唯一真生成式 AI 用例,差异化护城河 |
| **M12** | 第 4 个模板家族(塔防 / 自走棋 / Survivors 三选一)| 模板覆盖率 60% → 75% |
| **M12 spike** | 试做 1 个新模板用 Godot Engine 替代 hand-written Canvas(2-3 天小成本验证)| 评估 Godot 在非 LIVE 嵌入形态下的 dev velocity / 美术 polish |
| **M12+** | 短视频 feed 流入口 | 异步形态扩展,需先验证 LIVE 闭环成立 |
| **M13** | 多人 PK / 实时对战(同一直播间观众 1v1 / 3v3)| 社交杠杆撬动留存 |
| **M14** | 排行榜 + 主播 Encore 专属任务 | 主播 - 观众生态绑定 |
| **M14+** | 生成式行为 DSL(LLM 直接输出波次 / 单位 / 技能 DSL)| 每条 Encore 不一样, Astrocade-tier 竞争位 |
| **M16+** | 真实平台 + 高并发后端 + cost engineering | 百万级并发,模型缓存与降级 |

> **关于 Godot Engine 的判断(2026-05-22 评估)**:
> 短期(Phase 1, 千元机 + LIVE 嵌入硬约束)**不迁** — Godot Web 1-2MB 起步 + 不确定 cold-start 不适合 30 秒一局的 bottom-sheet 体验。
> 长期(Phase 2, 独立小程序 / 站立 H5 / native 形态,bundle 大小不再硬限)**值得做 1 个模板试水**(见 M12 spike 行)。
> V2G JSON schema(`prototype/v2g/schema.md`)是工具无关的稳定接口 — 它隔离了 streamer / observer 与 game 引擎,所以将来要切 Godot 时不破坏上游。

---

## 13. 4 人开发分工

### 13.1 当前实际目录(v0.6.1,可立即上手)

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
│   ├── encore_product_brief_v0.8.md  飞书 v0.8 的本地 staging
│   ├── v2g_demo.md               V2G 跑通指南
│   └── encore_slides.html        13 页演讲 deck
├── scripts/
│   └── deploy.sh                 同步镜像 + Vercel 部署
└── .github/
    └── CODEOWNERS                4 人模块归属
```

### 13.2 4 个角色 + 关键产出

| 角色 | 模块 | 主要产出 | 谁就近评审 |
|---|---|---|---|
| **A · 玩法引擎** | `engine/` + `games/` | 3 模板 Games 对象、Iso 渲染、aim/fire/collision、UX 状态机 | D(因为 D 改的是引擎暴露的接口) |
| **B · V2G / AI** | `v2g/` | observer.py 提示词调优、cost 监控、schema 演进 | D(streamer.html 是 schema 的消费方) |
| **C · 美术内容** | `assets/` + `themes.js` | 12 主题调色板、22 sprites、粒子调色 | A(美术接到引擎的 hook) |
| **D · LIVE 集成 / UX** | `live/` + `ui/` + `styles.css` + `docs/` | streamer.html、postMessage、bottom sheet、礼物 UI 摆拍、deck 演示 | A(LIVE 通过 postMessage 调引擎) |

### 13.3 依赖关系与并行度

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

## 14. Hackathon 前准备 + 2 天交付计划

### 14.1 多人协作工具链(已就绪)

| 工具 | 状态 | 用途 |
|---|---|---|
| `scripts/deploy.sh` | ✅ 已建 | 镜像同步 + Vercel 部署。`--skip-vercel` 只同步 |
| `playtest-check` skill | ✅ 已建(`~/.claude/skills/`)| 改完 game 后 5 步检查,提交前必跑 |
| `.github/CODEOWNERS` | ✅ 已建 | PR 自动 @ 模块负责人 |
| `prototype/games/_interface.md` | ✅ 已建 | Games 接口契约 |
| `prototype/v2g/schema.md` | ✅ 已建 | V2G JSON 协议 |
| `CLAUDE.md` 多人铁律 | ✅ 已建 | 每个 Claude session 启动时自动读到 |
| Vercel per-branch preview | ⚠️ 部署自动跑, 但 SSO 拦截 | Vercel 默认给每个 PR 生成预览 URL, 但 401 SSO gate 只允许 Vercel team 成员访问。**4 人协作需要其中之一**:(a) 把 dev B/C/D 加进 Vercel team;(b) Vercel dashboard → Settings → Deployment Protection → 关 Preview Deployments 的 "Vercel Authentication";(c) 用 access-code gate 替代,继续走 prod URL。建议 hackathon 期间走 (b) |
| GitHub Actions prettier check | ⏳ 待开 | 杜绝格式冲突,2 小时配置(可选) |

### 14.2 Hackathon 前一周准备(零代码,纯准备)

| 类别 | 内容 |
|---|---|
| **设计真理** | 飞书 [Brief v0.8](https://bytedance.larkoffice.com/docx/PzXnd27k8oWMRYxJIx4mgw4uy8c) 锁定;3 铁律确认(non-interference / UX 不压缩 LIVE / 主播分成 ≥) |
| **内容素材** | 5 段真实 TikTok 游戏 LIVE 录屏;3 套参考游戏调色板;5 个参考精灵风格图 |
| **技术准备** | Claude API key + 预算(估算 $2.25 / 30 分钟 demo);Vercel 项目预创;`scripts/deploy.sh` 部署链路打通(✅ 已打通)|
| **环境 self-check** | 每人本地能跑 `python3 -m http.server 8080` + 看到 prototype;`vercel --prod` 能跑通;Lark CLI 能用 |
| **CODEOWNERS 真名** | 把 `placeholder-dev-a/b/c/d` 替换成 4 人真实 GitHub handle |
| **Vercel preview 配置** | dashboard → Settings → Deployment Protection → 关 Preview Deployments 的 "Vercel Authentication" |
| **分工对齐** | 4 人每人提前 1 周阅读 `prototype/README.md` + `_interface.md` + 本文档;各写 200 字"我准备做什么、我会卡在哪" |
| **演示物料** | 评委 demo 流程脚本(2 分钟讲完看→玩→播);访问码定好 |

### 14.3 Day 1 时间表(48h 倒计时 T-48 ~ T-24)

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

### 14.4 Day 2 时间表(T-24 ~ T-0)

| 时段 | 内容 | 负责人 |
|---|---|---|
| **09:00 – 09:30** | 全员快速同步:昨晚发现的 3 个 ugly 问题 → 分配责任人 | 全员 |
| **09:30 – 12:00** | **并行修 bug + 添亮点** | A:跑 `/playtest-check`,补 auto-aim/auto-fire 等友好默认值 / B:Vision prompt 调优,降误触发率 / C:跑 AI sprite 批次(如果时间够)/ D:HOW TO PLAY 引导卡 + 礼物 UI 摆拍 |
| **12:00 – 13:00** | 午饭 + **集成 #2**:所有人产出合到一起 | — |
| **13:00 – 14:30** | **playtest-check #2**:每人请 1 个非组员盲玩 30 秒,记反馈 | 全员 |
| **14:30 – 16:00** | 修盲玩反馈中的硬伤(命中、目标感、引导不清) | ABCD 按模块 |
| **16:00 – 17:30** | **录 demo 视频 + 终极部署 + Slide deck 定稿** | D 主导,全员协助 |
| **17:30 – 18:30** | 现场演示彩排 ≥ 3 次(2 分钟版本) | 全员 |
| **18:30 – 19:30** | 晚饭 / 休息 | — |
| **19:30 – 21:00** | **评委演示** | 主讲 1 人 + 旁边 1 人控场 |

### 14.5 合并节奏(参考)

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

### 14.6 交付物

Demo 之前必须有的:
1. ✅ **Live demo URL**(同 v0.6 已交付:`https://encore-deploy.vercel.app`)
2. ✅ **2 分钟现场演示**:进 LIVE 间 → Vision 检测 → bottom sheet 玩一局 → clip 自动生成 split-screen 的完整路径
3. ✅ **13 页 deck / pitch 页**:讲清楚问题、形态、商业模型、roadmap
4. ✅ **30 秒 demo 视频**(防演示翻车备份)
5. ✅ **GitHub 仓库 + README**(评委自己也能跑)

### 14.7 风险与降级方案

| 风险 | 降级方案 |
|---|---|
| Vision 检测不稳定 | 演示时用预录视频 + 假 JSON(已实装 `FORCE` 按钮)|
| AI 美术跑不出 | 用程序化 atlas(已实装,千元机能跑)|
| 集成卡壳 | 4 模块分别可独立演示,降级到 "看 3 个模板都能玩"|
| 评委不懂游戏 | 演示选 FPS(认知门槛最低)+ 主播侧讲叙事 |
| 网络/部署翻车 | 本地 `localhost:8080` 备份,30 秒 demo 视频备份 |
| Day 1 上午 JS 拆分失败 | 退回单文件 + 严格的 git 锁(每人锁一段 commit 范围)|

---

## 附录 A:已锁定决策(不在 Hackathon 期间反复讨论)

| 决策 | 内容 |
|---|---|
| **第一原则** | Non-interference:主播侧只做选择题,不做操作题 |
| **技术路径** | Phase 1 = 模板参数化(Path B),不是真生成式;AI 出 JSON,引擎接 |
| **美术风格** | 抽象像素风(Roblox / MC 系),规避 IP,千元机兼容 |
| **入口位置** | LIVE-first;M12 前不做短视频流入口 |
| **UX 形态** | TikTok 原生 bottom sheet 上滑,永不挤压 LIVE,8 状态 FSM |
| **模板覆盖** | 必须做 3 套(FPS + MOBA + BR),覆盖 60-70% gaming LIVE 内容 |
| **AI 定位** | AI 是 enabler 不是 hero;Phase 1 模板路由可被规则替代;Phase 2 Remix 是 AI 真不可替代用例 |
| **二次分发** | Top 3 winner 自动 clip 免费 + 其他 viewer 付费 Spotlight 生成;post 主体永远是 viewer,主播 @tag + 可选 Duet |
| **视觉格式** | 默认上下 split,前后 mirror 为 backup |
| **付费 SKU** | MVP 仅 Enhance + Spotlight;Phase 2 加 Remix;**Sponsor / Loot 不做** |
| **gift-gate** | 主播可设付费功能 gift-gate(OFF / 50 / 200 / 500 金币);免费 Encore 玩 / 看 clip / 被动 collab 永远不能 gate |
| **主播分成** | 礼物收入走 TikTok LIVE 正常分成;付费功能直接收入主播不分(防反激励) |
| **主播开关默认** | 灰度 ON / 全量 OFF;Duet 默认 ON(已开 Encore 主播) |
| **失败 clip** | 不自动生成,viewer 可付费手动 |
| **法律 consent** | viewer 首次玩弹窗;主播首次开 Encore 弹窗;撤回路径清晰 |

---

## 附录 B:飞书 review 待对齐的开放问题

| # | 问题 | 推荐方向 |
|---|---|---|
| 1 | 主播 gift-gate 是否设硬上限 | 不设,仅软警告 |
| 2 | viewer 首次 consent 弹窗措辞 | 走 TikTok 法务,参考 Duet 首次开通 |
| 3 | clip 算法分发是否标 "stitched native content" | 跟 TikTok 算法团队 M10-M11 对齐 |
| 4 | game center 入口 CTA 文案 | 跟 TikTok game ads 中台对齐 |
| 5 | TikTok wallet / 礼物中台对接时间表 | PM Hackathon 后立刻推动 BD |
| 6 | 灰度首批 5-10 主播选择标准 | 粉丝量 + 品类 + 配合意愿三维筛选 |
| 7 | Phase 1 数据指标 baseline 怎么对齐 | 跟数据团队定义"Encore lift" 测量方法 |
| 8 | 法务对 "main account = viewer, streamer @tag" 模式的看法 | 类比 TikTok Stitch / Duet 法务结论 |

---

## 附录 C:Claude Code 多人协作的特有陷阱与对策

| 陷阱 | 对策 |
|---|---|
| Claude 把别人写的 200 行函数重写成 250 行风格不同 | `CLAUDE.md` 加铁律:"不要重构未在本 task 范围内的代码,用 Edit 不用 Write" |
| Claude 引入新依赖(npm / pip) | 新依赖必须 PR 单独提,锁版本 |
| Claude 改文件后忘记同步镜像 | 让每个人的 Claude 在 PR 前跑 `bash scripts/deploy.sh --skip-vercel` |
| 两个 Claude 各自写了一个同名 helper 函数 | 拆模块 + CODEOWNERS 解决 99%;剩下 1% 在 code review 拍掉 |
| 一个人的 Claude 改了 `Games.x.update` 签名 | 接口契约写在 `prototype/games/_interface.md`,Claude 启动时读到 |
| 别人改的 CSS class 名冲突 | 用 `.fps-` `.moba-` `.sheet-` `.howto-` 模块前缀 |

---

**文档维护**:本文档为本地 staging,与飞书 [Product Brief v0.8](https://bytedance.larkoffice.com/docx/PzXnd27k8oWMRYxJIx4mgw4uy8c) 同步。**设计真理在飞书,本地是实现试探**。修改设计时:先改飞书,review 完再回贴本地。
