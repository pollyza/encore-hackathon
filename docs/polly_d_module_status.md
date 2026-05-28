# Polly · D-module Status Card

> One-page summary of what's done in the LIVE interaction module, what
> interfaces are stable for the other 3 owners to plug into, and what
> the open follow-ups are.
>
> Last updated: 2026-05-28. Maintainer: Polly.

## TL;DR

**LIVE 交互模块 v0.7 高保真重建完成 + 上线**:
- 公开 URL: https://encore-deploy.vercel.app/ (landing) → https://encore-deploy.vercel.app/prototype/live/streamer.html (LIVE demo)
- 现场扫 landing 页的 QR 即可在自己手机上体验完整 9-step 流程
- Mario 的 3 个真模板 (FPS / MOBA / BR) 已通过 iframe + V2G postMessage v1.1 集成,每次开 sheet 随机抽
- 给 Zihui / Mario / Lingyi 都留好了零摩擦的接入点,本轮 Polly 工作可以暂停

## 文件清单

```
prototype/live/
├── streamer.html              集成 shell + iPhone 14 frame + fit-scale JS
├── css/
│   ├── live-shell.css         TikTok chrome + 11 个共享 keyframes
│   ├── ai-panel.css           Sheet shell + 4 phases + ack overlay
│   └── mini-games.css         Aim/Rhythm/Dodge 样式 (当前不加载,保留备用)
├── js/
│   ├── live-room.js           chrome 编排 + entry-mode 渐进 + chat 滚 + ack pills
│   ├── encore-sheet.js        4-phase 状态机 + iframe protocol + result/ranking/ack
│   ├── mini-games.js          3 demo 游戏 (备用,当前不加载)
│   └── observer-client.js     V2G 客户端 (dormant,等 Zihui 接入)
└── README.md                  模块导航
```

## 状态机

```
LIVE chrome (highlight popup 默认显示)
    ↓ tap ⚡ Play  或  tap bar Encore 按钮 (auto-mode 渐进后)
    ↓
[ loading ]  2.7s 高光缩略图 + scan + 状态循环 + 进度条
    ↓ transitionend
[ game ]     iframe 加载 Mario template (V2G postMessage)
             - parent → iframe: { type: 'launch', config: V2GResponse }
             - iframe → parent: { type: 'encore_ready' } 
             - iframe → parent: { type: 'encore_done', stats: {...} }
    ↓ encore_done
[ result ]   score chip + Encore Rank pill + Gift Remix + Fun/Hard/Remix + Play again
    ↓ tap Encore Rank
[ ranking ]  排行榜子页 + 自动滚到 You 行
    ↓ tap back
[ result ] → tap Fun/Hard/Remix
[ ack ]      950ms radial-ring overlay + ack pill 飘字
    ↓ auto-close
LIVE chrome (bar Encore 按钮可见,可循环)
```

## 给其他 3 个 owner 的接入点

### Zihui (V2G / AI) · `observer-client.js`

**当前状态**: dormant — `streamer.html` 不调用它。`pickConfig` hook 已预留:

```js
// streamer.html
let cachedDetection = null;
const pickConfig = () => {
  if (cachedDetection) { const c = cachedDetection; cachedDetection = null; return c; }
  return null; // null → encore-sheet 自己 makeRandomConfig()
};
EncoreSheet.init({ ..., pickConfig, ... });
```

**接入步骤**:
1. `observer-client.js` 在后台 4s 一次采样视频帧(已写好)
2. Vision 返回 highlight + confidence ≥ 0.6 → 调 `streamer.html` 暴露的 setter 写到 `cachedDetection`
3. 下次开 sheet 就用真实检测,不走 random
4. 可以同时 toast "AI 看到高光了" 增强 demo 说服力

需要约定:`observer-client.start({onHighlight: (config) => { cachedDetection = config; pushToast('⚡ Encore ready'); }})`。我可以暴露一个全局函数 `window.setEncoreDetection(config)` — 你点头我就加。

### Mario (玩法引擎) · `encore_prototype.html` (你的)

**当前状态**: 3 模板已接通,td 占位已就绪。

**td 接入步骤** (你那边):
1. 在 `Games` object 里加 `Games.td = { name: 'Wave Defense', init, update, draw, refit, finishGame, ... }` 按 `prototype/games/_interface.md` 实现
2. `Games.td.scenario` 字段读 `wave_count / enemy_per_wave / tower_budget` (schema.md 里已写好)
3. 不用动我这边任何代码

**Polly 这边的对应改动**: `encore-sheet.js` 的 `TEMPLATES` 数组现在是 `['fps', 'moba', 'br']`,加一行 `'td'` 就开启 td 随机抽样。**你 ship 后告诉我一声,2 分钟改完**。

### Lingyi (美术内容) · 命名规范确认

**当前命名 pattern 已立** (D-module):
- `prototype/live/css/{live-shell, ai-panel, mini-games}.css`
- `prototype/live/js/{live-room, encore-sheet, mini-games, observer-client}.js`

**与你的 sprite 路径关系**: 完全解耦。你的 sprites 仍然在 `prototype/assets/atlas.{png,json}`,Mario 的 iframe 游戏读那个路径。**D-module 不直接渲染任何精灵**,只是 host chrome。

唯一需要确认: landing page 上要不要换成你的 hero 角色作为 wordmark 旁的装饰?现在用的是 emoji + SVG 占位。

## 已知 caveats

1. **headless Chromium 节流** — `transitionend` 在隐藏 tab 里不一定触发。已用 CSS transition + setTimeout fallback (LOADING_MS + 600ms) 兜底,真浏览器前台 OK
2. **Vercel SSO 拦截** — preview deployment 默认要登录才能访问。production (`encore-deploy.vercel.app`) 默认放开,demo 用 production URL 即可
3. **chat 滚动覆盖问题** — 现在 chat 区位置可能跟 LIVE 视频的装饰元素(joystick HUD 等)在视觉上叠合,真直播视频不会有 joystick,M11+ 接真视频时这个问题自然消失
4. **iframe sandbox** — 当前不加 sandbox 属性(同源),Mario 的代码与 parent 双向 postMessage 无障碍
5. **score 维度** — 当前 `score = kills, max = duration`(秒数)。如果你们想换成 `score = damage / time, max = host_score`,改 `encore-sheet.js` 的 `onGameDone` 一行即可

## P1 / P2 跟进事项

详见 [`README.md`](README.md) 的 P1/P2 章节。

---

**反向请求**:
- Mario: td 模板什么时候能 ship?Day 1 上午能定吗?
- Zihui: observer.py 准备好之后,我们对一下 `cachedDetection` 的写入约定 (上面方案行不行?)
- Lingyi: 需要我把 landing page 上的占位换成你的 hero 角色吗?
