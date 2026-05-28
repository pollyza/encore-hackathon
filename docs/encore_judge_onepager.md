# Encore · TikTok Gaming Hackathon 2026

> **TikTok LIVE 观众侧"并行 agency"层——主播继续打 ranked,观众 30 秒玩自己的版本,自动产出 split-screen 短视频回流 feed。**
> TikTok Gaming · 团队成员: Mario / Zihui / Lingyi / Polly · PM: Jason

**Demo**: 🌐 https://encore-deploy.vercel.app · 📱 扫码体验见 landing page · 📦 https://github.com/pollyza/encore-hackathon · 🎥 90 秒演示视频(随交付)

---

## 问题

TikTok LIVE 观众侧互动 SKU 栈(礼物 / 弹幕 / 关注 / 礼物互动 mini-game / Polls)里,**没有一个 SKU 让观众"自己做点什么"**:

- 礼物 = 单向打赏,无操作感
- 弹幕 = 文字流,信息低密度
- 关注 = 0/1 长期决策,无中间档位
- **礼物互动 mini-game** = 借主播的手玩,代价是**蚕食 gaming LIVE 本身**(主播变 MC,不再 play)
- Polls / 竞猜 = 二手体验,无操作感

观众的"我也想动手"被这个栈整体堵在外面。

## 方案 (一句话)

**Encore = AI 检测 LIVE 高光 → 30 秒重构成观众侧 mini-game → 主播继续打 ranked,观众平行玩 → 自动产出"主播版 vs 玩家版" split-screen 短视频回流 TikTok feed,带流量也带 game center CTA。**

第一原则:**Non-interference**——主播侧只做"是否 promote 这条高光"的选择题,从不做操作题。Encore 是观众侧并行栈,不是主播侧工具栈。

## 业务价值

**收入模型(MVP 单一收入流)**:观众侧付费功能(Enhance + Spotlight)+ 主播可设礼物 gift-gate 解锁付费入口 → 礼物走 TikTok LIVE 正常分成给主播。

**MVP 不预设 ARPU lift 百分比** —— 没有 TikTok gaming LIVE 真实付费数据,任何具体数字都是 marketing 不是 business。要 5-10 主播灰度 1 周拿真实 baseline 后再算。

**可算清的部分**(基于 Anthropic 公开价 + 公开 cloud spot 实例报价):

| 项 | 数 | 阶段 |
|---|---|---|
| Vision 检测 | $6.75/直播间·h | 单位成本 |
| 内测 5 主播 × 5h/日 | $170/日 | M9 内测 |
| Phase 1 灰度 100 主播 | $3.4K/日 | M10 |
| Phase 2 灰度 1,000 主播 | $34K/日 | M11 |
| **优化前全量(50K 同时在播)** | **$50M/月** | 不可上线 |
| **优化后全量(关键帧 diff + 小模型分流 + cache + 规则 fallback)** | **~$1M/月** | 可上线目标 |

**非直接收入的平台价值**:观众 dwell time(每场新增 Encore 玩 + 排名 + winner clip 等待)/ #Encore tag 下的 split-screen 短视频是 TikTok 算法可吸收的新内容池 / `Play [Game]` CTA 走 game center 是免费的游戏发行漏斗。

## 创新点 (评分维度: 创新性 20%)

1. **唯一"零干预主播"的 LIVE 观众 agency** —— 对照 TikTok 现有礼物互动 mini-game(主播被动承受 buff/障碍,gaming LIVE 退化为派对游戏),Encore 在保留主播 player 身份的同时新增观众 agency。**Encore 保护 gaming LIVE 品类,不消费它**。
2. **AI 是 enabler 不是 hero** —— Phase 1 模板路由可被规则系统替代;**只有 Phase 2 的 Remix 功能**(LLM 生成自定义参数)是 AI 真不可替代用例。诚实的 AI 叙事比"AI 实时检测"包装更值得信任。
3. **二次分发闭环** —— Top 3 winner 自动产出 split-screen 短视频(主播 15s + viewer 15s)发布到 viewer profile + @tag 主播,主播 30 min 内可选 Duet 升级为 Collab Post。观众的内容杠杆 + 主播的被动产出 + 平台的 organic install referral 三方都赢。

## 完成度 (评分维度: 完成度 20% · 30 秒可验证)

**评委验证路径**:扫码 → 进 streamer.html → 点 ⚡ FORCE 触发高光 → bottom sheet 上滑玩 30s → 看 result + ranking → bottom sheet 自动滑下回 LIVE。

```
✅ 3 套真实可玩模板    FPS Cover Strike / MOBA Dragon Pit / BR Final Circle
✅ 12 套主题            每模板 4 调色板, 开局随机滚
✅ V2G Vision pipeline  真接入 Claude Vision, 已用 2 个真实 TikTok LIVE 视频跑通
✅ LIVE shell 高保真    iPhone 14 phone frame + 4-phase FSM + ack overlay
                       (Claude Design handoff → vanilla JS 重建, 7 文件 2900+ 行)
✅ 部署 + 扫码          Vercel production + landing page + QR
✅ 多人协作基础设施     CODEOWNERS + 接口契约 + playtest-check + deploy.sh
```

技术栈: Canvas 2D + Vanilla JS + Claude Vision API + Vercel(无后端、无 WebGL,千元机兼容)。

**MVP 不解决的(诚实)**:30s 单局游戏品质需要 6-12 个月专项调优(Hackathon 不可能做到 Helix Jump 级"30 秒爽快感")。演示重点是范式 + 闭环 + 平台叙事,游戏一带而过。

## 可落地路径 (评分维度: 可落地性 20%)

- **集成**: bottom sheet **永不挤压** LIVE 主画面 / 永不 pause / 永不静音 / 主播 5s 倒计时 promote/skip 控制触发频率。Non-interference 第一原则锁死架构边界。
- **成本路径**: 单 Vision 检测 $6.75/直播间·h → 优化 4 步(关键帧 diff / 小模型分流 / prompt cache / 规则 fallback)→ 目标 ~50× 优化,全量 ~$1M/月。
- **法务 / IP**: 全程抽象像素 + 程序化美术,**零游戏 IP 资产**;Vision 仅读取视觉信号,无 OCR 游戏 UI 文字。
- **二次分发架构**: viewer 端只上传 input log(几 KB),服务端确定性重渲 → 全量 7.5M clip/日的渲染成本仅 ~$50-200/日,相比 Vision 可忽略。
- **Roadmap**:
  - **M9** — 5-10 头部主播内测,人工 FORCE 触发,验证体验是否扰乱主播
  - **M10** — Phase 1 灰度 100 主播,Vision 自动触发 + clip 二次分发 + 算法 reach 验证
  - **M11** — 礼物经济实装(Enhance + Spotlight + gift-gate),验证 unit economics
  - **M11+** — Remix 付费功能(AI 真生成式 DSL)
  - **M12+** — 短视频 feed 流入口(先验证 LIVE 闭环成立) + 模板扩展

## 工具 (评分维度: hackathon vibe coding 主题)

| 用途 | 工具 |
|---|---|
| 主开发 + 4 人并行协作 | Claude Code (4 sessions, CODEOWNERS 隔离) |
| V2G 核心 (视频→JSON config) | Claude Vision API |
| LIVE shell 高保真设计 | Claude Design (handoff → 真实代码库) |
| 部署 + 扫码体验 | Vercel + 生成式 QR |
| 设计真理协作 | Lark Docs ([Product Brief v0.8](https://bytedance.larkoffice.com/docx/PzXnd27k8oWMRYxJIx4mgw4uy8c) + Demo Dev Plan v0.2) |

## 风险 + 降级

Vision 检测不稳 → 演示走预录视频 + FORCE 按钮 / 集成卡壳 → 4 模块各自可独立演示 / 网络翻车 → localhost + 录屏视频备份。

**未来护城河**(诚实): Encore 技术不防 clone(Twitch / Kick 3-6 个月能复刻),领先靠 TikTok feed-LIVE 平台分发 + wallet/礼物中台原生集成 + 头部主播绑定。MVP 之后 PM 立刻推动钱包中台对齐,这是 v0.7 完全没写的最大空白。

---

**🏁 一句话总结**: Encore 不是又一个 LIVE 小游戏,是 TikTok 观众互动 SKU 矩阵里"零干预主播的并行 agency 层"——保护 gaming LIVE 品类的同时,把观众情绪峰值变成可玩、可回流、可变现的 30 秒。
