# Encore 4 人协作上手指南 (Hackathon 版)

> 给非技术背景的 4 人 hackathon 小组用 — 不需要懂 git 原理,跟着操作就能跑。
>
> 默认你已经安装好 **一个 AI 编程助手**(Claude Code / Codex / Cursor 任选, 协作不挑工具), 有 GitHub 账号, Mac 上能开 Terminal。
>
> 一句话原则:**90% 的事让 AI 助手帮你做,你只要会"复制粘贴"和"看红字"。**
>
> 项目级 AI 规则放在仓库根目录的 `CLAUDE.md` (也通过 `AGENTS.md` 符号链接暴露)。Claude Code 自动读 `CLAUDE.md`,Codex / Cursor 自动读 `AGENTS.md` — 两个文件指向同一份内容,**4 个人的 AI 看到的规则一致**。

---

## 一、第一次上手 (10 分钟,只做一次)

### 1. 加入仓库

让 Polly (项目 owner) 把你的 GitHub 用户名加进仓库 collaborator,你会收到邀请邮件,点接受。

### 2. 把代码拉到你电脑上

开一个 Terminal 窗口,**逐条复制粘贴**下面命令(看到 `→` 是预期的输出,看到错误就停下来问 Polly):

```bash
cd ~/Documents
git clone https://github.com/pollyza/encore-hackathon.git
cd encore-hackathon
ls
# → 应该能看到 prototype/ docs/ scripts/ CLAUDE.md 等
```

### 3. 配置你自己的身份(只配一次)

```bash
git config user.name "你的英文名"               # 例如: Polly Zhang
git config user.email "你的 GitHub 邮箱"        # 跟 GitHub 账号一致即可
```

### 4. 装好两个工具

```bash
# GitHub CLI — 用来开 PR
brew install gh
gh auth login                  # 跟着提示选 GitHub.com → HTTPS → 浏览器登录

# Vercel CLI — 用来部署
npm install -g vercel
vercel login                   # 同样浏览器登录
```

### 5. 跑一次本地预览,确认环境 OK

```bash
python3 -m http.server 8080
# → 应该看到 "Serving HTTP on :: port 8080"
```

浏览器打开 `http://localhost:8080/prototype/encore_prototype.html`,能看到 ENCORE 启动页 + 3 个模板卡片就算成功。Ctrl+C 关掉服务器。

### 6. 认识你负责的目录

打开仓库根目录的 `.github/CODEOWNERS` 文件,找你的名字,记住你负责哪几个目录。`prototype/games/_interface.md` 和 `prototype/v2g/schema.md` 是 **4 人共同契约**,改之前必须群里同步。

---

## 二、每天的标准动作 (3 步循环)

> 不管你写什么代码,都是这个循环。每天可能跑 5-10 次。

### 第 1 步 · 拉最新代码 + 开一个新分支

每次开始干活之前,**必跑**:

```bash
cd ~/Documents/encore-hackathon
git checkout main                            # 切回主分支
git pull                                     # 拉同事最新的提交
git checkout -b feat/<你的字母>-<干啥>        # 开一个新分支
```

`<你的字母>` 是 A/B/C/D,`<干啥>` 用英文小写连字符。例如:

| 你是 | 做什么 | 分支名 |
|---|---|---|
| A | 修 FPS 命中 | `feat/A-fps-aim-fix` |
| B | 调 Vision prompt | `feat/B-vision-prompt-v2` |
| C | 加 jungle 主题 | `feat/C-jungle-theme` |
| D | 改教程卡 | `feat/D-howto-tweak` |

### 第 2 步 · 让 AI 助手干活

启动你常用的 AI 助手(Claude Code 跑 `claude`,Codex 跑 `codex`,Cursor 打开 IDE),然后:

- 用大白话告诉它你要做什么
- 让它改完之后,**手动浏览器打开页面玩一玩**,确认没坏
- 如果你改的是游戏逻辑(瞄准/开火/胜利条件),跑一次检查:
  - **Claude Code 用户**:`/playtest-check`(5 步结构化报告)
  - **其他 AI 用户**:跑 `bash scripts/playtest-check.sh`,把输出贴给你的 AI 让它判断 ✅/⚠️/❌

**AI 干活时给它的两条铁律**(直接说给它听 — `CLAUDE.md` / `AGENTS.md` 里也写了, 它启动时应该已经读到):

1. "只改我负责的目录,别动别人的"
2. "用 Edit 不用 Write,大段重写会撞别人"

### 第 3 步 · 保存 + 推到 GitHub + 开 PR

干完一段告诉你的 AI:**"帮我提交并开 PR"**。AI 会自动做这些事:

```bash
git add <改过的文件>
git commit -m "..."                          # 写有意义的提交说明
git push -u origin <你的分支>                 # 推到 GitHub
gh pr create --title "[X] ..." --body "..."  # 开 PR
```

Claude 完成后,**Vercel 会在 1-2 分钟内自动给你的 PR 评论一个预览 URL**。其他 3 个人点这个 URL 就能在浏览器看到你的版本,不用拉代码。

### 第 4 步 · 让 PR 进 main

- 自己点开 PR 的预览 URL,玩一遍,确认没问题
- 如果别人改的是相关模块,@他在 PR 里 review 一下
- Hackathon 节奏快,**自己 PR 自己 merge** 是 OK 的(没人有时间正经 review),但**先点预览玩一遍**这一步不能省
- GitHub PR 页面右下角有个绿色 "Merge pull request" 按钮,点它 → 选 "Squash and merge" → 确认

merge 完成后,这一轮就结束了。回到第 1 步开下一个分支。

---

## 三、合并节奏(强烈建议)

> Hackathon 期间最容易出事的是"4 个人都在自己分支干了 4 小时,合并时全冲突"。

| 时间 | 该做的事 |
|---|---|
| 每隔 **3-4 小时** | 当前手头的分支必须收尾、提 PR、合进 main |
| **每天早上开工前** | `git checkout main && git pull` 拉最新 |
| **集成节点(Day 1 晚 5 点、Day 2 中午 12 点)** | 当天的 "merge captain" 主持,4 个人都把 PR 合进 main,跑一次完整 demo |

**不要**一个分支干 8 小时不 push。**不要**一个分支干完不 merge 就开下一个。

---

## 四、常见情况怎么办

### 情况 1:跑 `git pull` 提示冲突

不要慌。直接告诉你的 AI 助手:**"git pull 出冲突了,帮我解决,优先保留 main 上的代码"**(或者反过来,看冲突文件是不是你刚改的)。

### 情况 2:别人合了一个 PR,把你正在改的文件改了

```bash
# 在你的分支上, 把 main 的新内容拉进来
git checkout main
git pull
git checkout <你的分支>
git merge main
# 如果有冲突, 让 Claude 帮忙处理
```

### 情况 3:想看别人的进度但不想拉代码

去 GitHub 的 Pull Requests 页面 ([github.com/pollyza/encore-hackathon/pulls](https://github.com/pollyza/encore-hackathon/pulls)),点别人的 PR,Vercel bot 评论里有预览 URL,点开就能玩。

> ⚠️ 第一次访问会提示登录 Vercel — 如果你不在 Vercel team,会看到 401 错误页。Polly 需要在 Vercel dashboard 把 Preview Deployments 的 SSO 关掉,或者把你加进 team。

### 情况 4:我改坏了,想全部撤销

```bash
# 撤销所有还没提交的修改 (DANGER, 不可恢复)
git checkout -- .
git clean -fd
```

如果**已经 commit 但还没 push**:

```bash
git reset --hard HEAD~1     # 撤销最后 1 个 commit
```

如果**已经 push 了**,告诉你的 AI 助手让它帮你 revert,不要自己 force push。

### 情况 5:AI 重写了一大段不该动的代码

立刻 Ctrl+C 打断它,告诉它 **"撤销刚才的改动,只动 `<你最初要它改的文件>`"**。如果实在乱了:`git checkout -- .` 全部撤销重来。

> Codex / Cursor 用户尤其要警惕这一条 — 这两个工具默认比 Claude Code 更激进地一次重写整个文件。先在群里让 AI 复述一遍它打算改什么再放手。

### 情况 6:本地预览看着 OK,部署到 Vercel 之后样式坏了

跑一次部署同步脚本就能修(它会把 CSS / 镜像目录都同步好):

```bash
bash scripts/deploy.sh --skip-vercel    # 只同步, 不部署
# 然后再
bash scripts/deploy.sh                  # 同步 + 部署
```

### 情况 7:不知道某个目录是谁的

打开 `.github/CODEOWNERS` 看模块归属。或者在群里 @ 一下 Polly。

---

## 五、速查表 (90% 的时间只用这几条)

```bash
# 开始新一轮干活
cd ~/Documents/encore-hackathon
git checkout main && git pull
git checkout -b feat/X-something

# 让 Claude 干活, 改完之后浏览器玩一遍

# 提交 + 推 + 开 PR (让 Claude 做这一段)
git add . && git commit -m "..." && git push -u origin HEAD
gh pr create

# 别人合了 main, 我想跟上
git checkout main && git pull
git checkout <我的分支> && git merge main

# 看别人在干啥
# → 浏览器打开 https://github.com/pollyza/encore-hackathon/pulls

# 部署
bash scripts/deploy.sh
```

---

## 六、Encore 项目专属约定

### 谁管哪里(详见 `.github/CODEOWNERS`)

| 你 | 你的目录 | 别动 |
|---|---|---|
| **A · 玩法引擎** | `prototype/engine/` `prototype/games/` | v2g/ live/ assets/ |
| **B · V2G/AI** | `prototype/v2g/` | engine/ games/ ui/ assets/ |
| **C · 美术** | `prototype/assets/` `prototype/themes.js` | engine/ games/ v2g/ |
| **D · LIVE 集成** | `prototype/live/` `prototype/ui/` `prototype/styles.css` `docs/` | engine/ games/ v2g/ |

### 4 人共同契约(改之前必须群里同步)

- `prototype/games/_interface.md` — 游戏接口契约
- `prototype/v2g/schema.md` — V2G JSON 协议
- `CLAUDE.md` — 项目级 AI 指引
- `prototype/encore_prototype.html` — 暂时还是大家共用入口,改完一定 @ 群

### 改完游戏逻辑必跑的检查

5 步检查:输入覆盖、被动玩家能否玩、能不能赢、教程对得上、3 模板一致性。

| 你用的工具 | 怎么跑 |
|---|---|
| Claude Code | `/playtest-check` 直接出 ✅/⚠️/❌ 报告 |
| Codex / Cursor / 其他 AI | 跑 `bash scripts/playtest-check.sh`,把输出贴给 AI 让它出判断 |
| 不用 AI | 跑 `bash scripts/playtest-check.sh`,自己看证据 |

### PR 标题格式

`[A/B/C/D] 一句话说改了什么`

例:`[A] FPS 加桌面鼠标瞄准 + auto-fire`

### Commit 信息怎么写

不用很长,**一句话说"做了什么、为什么"** 即可。让 Claude 帮你写就行。例:

> `fix(moba): drop dragon HP 120→70 so 30s timer is winnable`

---

## 七、实在搞不定?

按顺序试:

1. **先问 Claude Code** — 把报错完整复制给它,80% 它能解
2. **群里 @ Polly** — 截图 + 描述刚才在干啥
3. **完全无解就回滚** — `git checkout -- .` + `git checkout main`,等于"什么都没发生过",再请 Polly 远程看一眼

记住:hackathon 期间**没有人会怪你弄坏代码**,大家都靠你"先尝试"才能往前推 — 怕弄坏导致不动手才是最大的成本。

---

## 八、Hackathon 期间的检查节奏

每个 PR 自己合之前,问自己 4 件事:

1. ✅ 我本地浏览器玩过一局了吗?
2. ✅ Vercel preview URL 我点开看过了吗?
3. ✅ 我只动了 CODEOWNERS 里属于我的文件吗?(`git diff --stat` 看一眼)
4. ✅ 改的是游戏逻辑/胜负条件吗?跑过 `/playtest-check` 了吗?

四个都 ✅ → 大胆 merge。任何一个 ❌ → 回去补,或者 @ 群求救。

---

**最后**:这份指南是 hackathon 期间的"求活手册",不是 GitHub 教科书。等 hackathon 结束、有空了再学正经的 git 知识。在那之前 — **跟着上面照做就够用**。
