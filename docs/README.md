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

## 当前进度

### ✅ 已完成
- 产品定义 (Brief v0.1, 11 章 + 附录)
- 痛点 + 北极星 + 4 阶段目标
- 双形态架构: LIVE Encore + Video Encore (Encore Replay)
- 5 阶段技术路线 (Phase 1 → Phase 4)
- 4 层礼物经济 + 主播分成铁律 + 18 个月 GMV 框架
- 8 状态 UX 旅程 + Sheet 状态机画板
- Demo Dev Plan v0.2 (双形态编排, 7 天逐日)
- V2G AI Vision 可行性验证 (2 个真实 TikTok LIVE 视频跑通)
- Prototype v0.4 (MOBA 模板, 1v3 龙坑反杀, 含触屏 + 音效)

### 🔄 进行中
- Prototype 加入 FPS 模板 (Valorant Bind 1v3, 之前有 v0.3, 需要合并)
- Prototype 加入 BR 模板 (PUBG / Free Fire 终局, 待开发)
- Splash 加 "AI 检测游戏类型" 模板切换器

### 📋 待做
- Pitch deck (10 张, 90 秒 demo 段)
- 评委 Q&A 应答表
- Plan B / Plan C 兜底视频录制
- 内测 (找 8 个同事真扫码玩)
- 团队组建 (1 PM + 2 Dev + 1 设计)

## 给后续 Claude Code session 的提示

每次开新 session 前: **`cd ~/Documents/encore-hackathon`** 再启 Claude Code, 不要在其他目录里干 hackathon 的活。

`CLAUDE.md` 已经写好项目背景, 会自动注入。
