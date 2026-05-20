# Claude Code 多项目管理 Cheatsheet

> 把 Claude Code 当成一个**严格按目录隔离**的 IDE 用——不同项目绝对不要混在同一目录, 否则权限、记忆、上下文全部互相污染。

## 核心原则: 一个目录 = 一个 Claude Code 项目

每个目录独立维护:
- `.claude/settings.local.json` — 权限白名单
- `.claude/launch.json` — dev server 配置
- `CLAUDE.md` — 项目背景, 每次自动注入到对话
- `~/.claude/projects/<目录编码>/memory/MEMORY.md` — 对话记忆 + 历史

**`cd` 到不同目录 = 完全不同的 Claude 项目, 互不可见。**

## 标准目录布局

```
~/Documents/
├── project-a/
│   ├── .claude/
│   │   ├── settings.local.json     # 该项目的权限白名单
│   │   ├── launch.json             # dev server 配置
│   │   └── (其他 hooks)
│   ├── CLAUDE.md                   # 一句话讲清楚我是谁、在做什么
│   ├── docs/                       # 设计笔记 / Lark 链接索引
│   ├── (代码或资产)
│   └── .gitignore
│
└── project-b/
    └── ...
```

## 开新项目的 4 步

### 1. 建目录骨架

```bash
PROJECT=my-new-project
mkdir -p ~/Documents/$PROJECT/{docs,.claude}
cd ~/Documents/$PROJECT
```

### 2. 写 `CLAUDE.md` (必须)

放项目根目录, 一页内, 包含:

```markdown
# <项目名>

## 我是谁
<你的角色, 例: TikTok Gaming PM>

## 项目是什么
<一句话讲清楚>

## 核心已定决策
<已经定下来的关键设计, 不要在对话中反复推翻>

## 关联资源
- Lark / 外部文档 URL
- 依赖的服务 / 数据源

## 不在范围内
<明确划掉, 避免 AI 主动跑题>
```

### 3. 第一次开会话

```bash
cd ~/Documents/$PROJECT
# 启动 Claude Code (你常用的命令)
```

CLAUDE.md 会被自动注入到上下文。

### 4. 按需扩 `.claude/settings.local.json`

第一次遇到权限请求 → 选 "Allow always" → 自动累积到这个项目独有的白名单。

## 在多个项目间切换

```bash
# 离开当前项目
exit

# 切换
cd ~/Documents/<other-project>
# 启动 Claude Code
```

**绝对不要**: 在项目 A 的 session 里去操作项目 B 的文件——会污染项目 A 的权限、记忆、CLAUDE.md 一致性。

## 临时实验

- 短期不属于任何项目的探索 → 用 `/tmp/`, 但**重启会丢**
- 跨项目通用工具 → 建 `~/Documents/sandbox/` 项目

## 清理已经污染的项目

如果发现某个项目的 `.claude/settings.local.json` 累积了不相关权限:

1. **备份**
   ```bash
   cp .claude/settings.local.json .claude/settings.local.json.bak
   ```
2. **筛掉** 不属于本项目的权限条目 (手编辑 JSON, 或重头开始留空)
3. **重新归类**: 不属于这里的权限, 在对应的"正确项目"里重新触发授权
4. **MEMORY.md** 同理——如果记忆里混杂了无关项目的内容, 编辑 `~/.claude/projects/<目录编码>/memory/MEMORY.md`

## 飞书 / 云端资产

文档主体放飞书, **项目目录里只放索引**:
- `docs/README.md` 列出所有 Lark URL
- 不要把飞书文档下载下来当本地真理 (容易脱钩)

## 临时文件 `/tmp/`

| 用途 | OK? |
|---|---|
| 短期对话内的中间产物 (ffmpeg 输出, curl 下载) | ✅ |
| 跨 session 长期工作产物 (原型代码, 设计文档) | ❌ — 会丢 |
| 测试视频 / 大文件中转 | ⚠️ 用完立刻迁到项目下 |

## 反模式 (千万别)

| 反模式 | 后果 |
|---|---|
| 默认在 `~/` 或 `~/Documents/` 启 Claude Code | 所有项目都污染 home 目录的 `.claude/` |
| 在项目 A 里写项目 B 的代码 | 权限白名单膨胀, CLAUDE.md 跑偏 |
| 把代码、设计、素材、临时测试堆同一目录平铺 | 找不到东西, AI 也搞不清 |
| 把长期产物丢 `/tmp/` | 系统清理时灭团 |
| 几个不相关项目共享一个 git repo | merge conflict + 历史混淆 |

## 我的项目地图 (例)

```
~/Documents/
├── Polly Claude/                  # FICC trading agent (Python CLI / 数据管线)
├── encore-hackathon/              # AI Hackathon: Encore (TikTok Gaming)
├── tiktok-video-review/           # TikTok 游戏视频质量审核工作流
└── ...
```

每个目录有自己独立的 CLAUDE.md + .claude/ + 记忆。
