/**
 * live-chrome.js · Stage 2
 *
 * Drives the TikTok-style chrome:
 *   - 主播条 follow button (toggles "+Follow" / "Following")
 *   - chat 滚动 (fake messages every 4-8s, max 5 visible)
 *   - 右侧 action bar 4 个装饰 icon "+1" 飘字
 *   - 底部 Type input (Enter → 本地 chat 显示, 不上传)
 *   - autoplay-shim 解锁 video
 *   - FORCE 按钮触发 mock highlight
 *   - ⚡ ENCORE 按钮 → 调用 cfg.onEncoreClick(配套 default config)
 *
 * Public API:
 *   LiveChrome.init({
 *     video, shim, forceBtn, encoreBtn, followBtn, closeBtn,
 *     chatArea, chatInput, sideButtons (NodeList),
 *     onStatus(stateClass, text),
 *     onStart(),
 *     onEncoreClick(),
 *     onForceHighlight(),
 *   })
 */
(function (root) {
  'use strict';

  // ── Fake chat message pool ──────────────────────────────────────────
  const FAKE_CHATS = [
    { kind: 'join', uname: 'polly_zazaza', body: 'joined' },
    { kind: 'msg',  uname: 'thanh_99',     body: 'gg let go' },
    { kind: 'join', uname: 'tk_soi',       body: 'joined' },
    { kind: 'msg',  uname: 'mario_xd',     body: '🌹🌹🌹' },
    { kind: 'msg',  uname: 'zihui_ai',     body: 'nice clutch' },
    { kind: 'host', uname: 'host',         body: 'tysm for the gift!' },
    { kind: 'msg',  uname: 'lingyi_art',   body: '+1 🔥' },
    { kind: 'join', uname: 'free_fire_fan',body: 'joined' },
    { kind: 'msg',  uname: 'aaron_99',     body: 'wp wp' },
    { kind: 'msg',  uname: 'kim_v3',       body: 'GG bro' },
    { kind: 'join', uname: 'ngoc_2024',    body: 'joined' },
    { kind: 'host', uname: 'host',         body: 'try the encore button ↗️' },
    { kind: 'msg',  uname: 'arena_god',    body: 'INSANE' },
    { kind: 'msg',  uname: 'rikimaru',     body: 'lol' },
    { kind: 'msg',  uname: 'qmage',        body: '💜💜' },
  ];

  const MAX_VISIBLE_CHATS = 6;
  const CHAT_INTERVAL_MIN_MS = 3000;
  const CHAT_INTERVAL_MAX_MS = 7000;

  let cfg = null;
  let chatIdx = 0;
  let chatTimer = null;
  let following = false;

  function pushChat({ uname, body, kind }) {
    if (!cfg.chatArea) return;
    const el = document.createElement('div');
    el.className = 'chat-msg' + (kind ? ' ' + kind : '');
    const u = document.createElement('span');
    u.className = 'uname';
    u.textContent = kind === 'host' ? '👑 ' + uname : uname;
    const b = document.createElement('span');
    b.className = 'body';
    b.textContent = (kind === 'join' ? ' joined' : ' · ' + body);
    el.appendChild(u);
    el.appendChild(b);
    cfg.chatArea.appendChild(el);
    while (cfg.chatArea.children.length > MAX_VISIBLE_CHATS) {
      cfg.chatArea.removeChild(cfg.chatArea.firstChild);
    }
  }

  function tickChat() {
    const msg = FAKE_CHATS[chatIdx % FAKE_CHATS.length];
    chatIdx++;
    pushChat(msg);
    const next = CHAT_INTERVAL_MIN_MS + Math.random() * (CHAT_INTERVAL_MAX_MS - CHAT_INTERVAL_MIN_MS);
    chatTimer = setTimeout(tickChat, next);
  }

  function startChat() {
    if (chatTimer) return;
    // Seed with 3 immediate joins so the chat doesn't look empty
    pushChat(FAKE_CHATS[0]);
    setTimeout(() => pushChat(FAKE_CHATS[1]), 700);
    setTimeout(() => pushChat(FAKE_CHATS[2]), 1500);
    chatIdx = 3;
    chatTimer = setTimeout(tickChat, 2500);
  }

  function spawnPlusOne(button) {
    const rect = button.getBoundingClientRect();
    const hostRect = button.closest('#host').getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'plus-one';
    el.textContent = '+1';
    el.style.left = (rect.left + rect.width/2 - hostRect.left) + 'px';
    el.style.top  = (rect.top  - hostRect.top - 6) + 'px';
    document.getElementById('host').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function bindAutoplayShim() {
    cfg.shim.addEventListener('click', () => {
      cfg.shim.classList.add('hidden');
      // Chat + onStart fire immediately so the room feels alive even if
      // the video file 404s (it does in the local preview mirror — the
      // reference/ folder isn't synced. Production deploy has it).
      startChat();
      cfg.onStart && cfg.onStart();
      cfg.video.play().catch(err => {
        cfg.onStatus && cfg.onStatus('idle', 'video play failed: ' + err.message);
      });
    });
  }

  function bindForceButton() {
    if (!cfg.forceBtn) return;
    cfg.forceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cfg.onForceHighlight && cfg.onForceHighlight();
    });
  }

  function bindEncoreButton() {
    if (!cfg.encoreBtn) return;
    cfg.encoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cfg.onEncoreClick && cfg.onEncoreClick();
    });
  }

  function bindFollowButton() {
    if (!cfg.followBtn) return;
    cfg.followBtn.addEventListener('click', () => {
      following = !following;
      cfg.followBtn.textContent = following ? '✓ Following' : '+ Follow';
      cfg.followBtn.style.background = following ? 'rgba(255,255,255,0.18)' : '#ff4655';
    });
  }

  function bindCloseButton() {
    if (!cfg.closeBtn) return;
    cfg.closeBtn.addEventListener('click', () => {
      // Mock close: pop a toast then no-op (this IS the demo)
      pushChat({ kind: 'msg', uname: 'demo', body: '(close — demo only, refresh to restart)' });
    });
  }

  function bindSideButtons() {
    if (!cfg.sideButtons) return;
    cfg.sideButtons.forEach(btn => {
      if (btn.id === 'encore-entry') return; // encore button has its own handler
      btn.addEventListener('click', (e) => {
        spawnPlusOne(btn);
        // bump count if applicable
        const lbl = btn.querySelector('.count');
        if (lbl) {
          const v = parseFloat(lbl.dataset.val || '0') + 1;
          lbl.dataset.val = v;
          // Keep K-suffix readable
          if (v >= 1000) lbl.textContent = (v/1000).toFixed(1) + 'K';
          else lbl.textContent = '' + v;
        }
      });
    });
  }

  function bindChatInput() {
    if (!cfg.chatInput) return;
    cfg.chatInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const text = cfg.chatInput.value.trim();
      if (!text) return;
      pushChat({ kind: 'msg', uname: 'you', body: text });
      cfg.chatInput.value = '';
    });
  }

  root.LiveChrome = {
    init(config) {
      cfg = config;
      bindAutoplayShim();
      bindForceButton();
      bindEncoreButton();
      bindFollowButton();
      bindCloseButton();
      bindSideButtons();
      bindChatInput();
    },
    pushChat,
  };
})(window);
