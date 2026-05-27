/**
 * live-room.js — TikTok LIVE chrome orchestrator
 *
 * Manages the LIVE-room scoped state:
 *   - seenHighlight (session-scoped): once user dismisses popup OR plays, the
 *     popup collapses permanently into a bottom-bar Encore button.
 *   - chat scroll (15 fake messages on a rotating 3-7s interval)
 *   - Follow toggle
 *   - +1 plus-one toast on decorative icon taps
 *   - Floating ack pills (encoreFloatUp animation, 1.4s)
 *
 * The Encore sheet itself is owned by EncoreSheet (encore-sheet.js).
 * This module just decides WHICH entry surfaces are visible right now.
 */
(() => {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────
  const ENTRY_MODE = 'auto';   // 'auto' | 'bar' | 'highlight' | 'all'
  const HL_AUTO_POP_MS = 0;    // 0 = show immediately, >0 = delay after start

  // ── Fake chat pool ────────────────────────────────────────────────────
  const CHAT_POOL = [
    { name: 'Thanh',         text: 'Sick play 🔥',         joined: false },
    { name: 'Polly_zazaza',  joined: true },
    { name: 'minhquan',      text: 'GG host',              joined: false },
    { name: 'TK Sói',        text: 'cmt nhe ace',          joined: false, host: true },
    { name: 'echo.cat',      text: 'this clutch tho 🙌',   joined: false },
    { name: 'duy.le',        joined: true },
    { name: 'soimoon',       text: 'wait that was insane', joined: false },
    { name: 'LunaWolf_92',   text: '+1 follow done',       joined: false },
    { name: 'PixelHawk',     text: 'lmao what',            joined: false },
    { name: 'Khoa.real',     text: 'top 1 baby',           joined: false },
    { name: 'gigi.tt',       joined: true },
    { name: 'TK Sói',        text: 'thanks ae 💪',         joined: false, host: true },
    { name: 'a1.zhao',       text: '🌹🌹🌹',                joined: false },
    { name: 'mido.99',       text: 'kèo gì tiếp host',     joined: false },
    { name: 'pinkfox',       text: 'omg',                  joined: false },
  ];

  // Avatar palette — generated from name hash
  function avatarFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    const hue = ((h % 360) + 360) % 360;
    return `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 60) % 360} 55% 35%))`;
  }

  // ── State ─────────────────────────────────────────────────────────────
  let cfg = null;
  let seenHighlight = false;
  let chatIntervalId = null;
  let hlTimeoutId = null;

  // ── Entry visibility logic ────────────────────────────────────────────
  function applyEntryVisibility() {
    const showBar = ENTRY_MODE === 'bar' || ENTRY_MODE === 'all'
                 || (ENTRY_MODE === 'auto' && seenHighlight);
    const showHL  = ENTRY_MODE === 'highlight' || ENTRY_MODE === 'all'
                 || (ENTRY_MODE === 'auto' && !seenHighlight);

    // Bottom-bar Encore replaces the audience-interaction button
    cfg.audienceBtn.style.display = showBar ? 'none' : '';
    cfg.encoreBtn.style.display   = showBar ? 'flex' : 'none';

    // Highlight popup
    cfg.hlPopup.classList.toggle('hidden', !showHL);
  }

  // ── Chat scroll ───────────────────────────────────────────────────────
  function appendChatRow({ name, text, joined, host, system }) {
    const row = document.createElement('div');

    if (system) {
      row.className = 'chat-system';
      row.innerHTML = `
        <div class="ico">✦</div>
        <div class="body">
          <div class="eyebrow">AI Encore</div>
          <div class="head">${escapeHtml(text)}</div>
        </div>
        <button class="play">Play</button>
      `;
      row.querySelector('.play').addEventListener('click', () => cfg.onEncoreOpen && cfg.onEncoreOpen());
    } else {
      row.className = 'chat-row' + (joined ? ' joined' : '');
      const ava = document.createElement('div');
      ava.className = 'avatar';
      ava.style.background = avatarFor(name);
      ava.textContent = joined ? '👋' : '🎮';
      row.appendChild(ava);

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      const nameRow = document.createElement('div');
      nameRow.className = 'name';
      nameRow.appendChild(textNode(name));
      if (host) {
        const tag = document.createElement('span');
        tag.className = 'host-tag';
        tag.textContent = 'Host';
        nameRow.appendChild(tag);
      }
      const body = document.createElement('div');
      body.className = 'text';
      body.textContent = joined ? `joined ${name === 'Polly_zazaza' ? 'just now' : ''}`.trim() : (text || '');
      bubble.appendChild(nameRow);
      bubble.appendChild(body);
      row.appendChild(bubble);
    }

    cfg.chatArea.appendChild(row);

    // Keep the chat area trimmed (max ~8 rows visible)
    while (cfg.chatArea.children.length > 8) {
      cfg.chatArea.removeChild(cfg.chatArea.firstChild);
    }
  }

  function pickRandomChat() {
    return CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)];
  }

  function startChat() {
    // Seed 3 messages immediately so it doesn't look empty
    appendChatRow({ name: 'Polly_zazaza', joined: true });
    appendChatRow({ name: 'Thanh',       text: 'Sick play 🔥' });
    appendChatRow({ name: 'TK Sói',      text: 'ecc vip to ts linkbio gg', host: true });

    const schedule = () => {
      const delay = 3000 + Math.random() * 4000;
      chatIntervalId = setTimeout(() => {
        appendChatRow(pickRandomChat());
        schedule();
      }, delay);
    };
    schedule();
  }

  // ── Plus-one floats ───────────────────────────────────────────────────
  function spawnPlusOne(btn) {
    const plus = document.createElement('div');
    plus.className = 'plus-one';
    plus.textContent = '+1';
    const rect = btn.getBoundingClientRect();
    const hostRect = document.getElementById('host').getBoundingClientRect();
    plus.style.left = (rect.left - hostRect.left + rect.width / 2 - 8) + 'px';
    plus.style.top  = (rect.top  - hostRect.top  - 4) + 'px';
    document.getElementById('host').appendChild(plus);
    setTimeout(() => plus.remove(), 1000);
  }

  // ── Floating ack pills ────────────────────────────────────────────────
  function pushAck(label) {
    const pill = document.createElement('div');
    pill.className = 'ack-pill';
    pill.textContent = label;
    cfg.ackLayer.appendChild(pill);
    setTimeout(() => pill.remove(), 1400);
  }

  // ── Follow toggle ─────────────────────────────────────────────────────
  function wireFollow() {
    let following = false;
    cfg.followBtn.addEventListener('click', () => {
      following = !following;
      cfg.followBtn.classList.toggle('following', following);
      cfg.followBtn.textContent = following ? '✓ Following' : '+ Follow';
    });
  }

  // ── Chat input echo ───────────────────────────────────────────────────
  function wireChatInput() {
    cfg.chatInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const text = cfg.chatInput.value.trim();
      if (!text) return;
      appendChatRow({ name: 'you', text });
      cfg.chatInput.value = '';
    });
  }

  // ── Decorative icon taps → +1 ─────────────────────────────────────────
  function wireDecorativeIcons() {
    cfg.iconBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Skip the audience btn — it's a real entry surface (replaced by Encore btn in auto)
        if (btn.dataset.action === 'audience') {
          // In bar-not-yet mode, clicking 🤝 also opens Encore (lenient)
          cfg.onEncoreOpen && cfg.onEncoreOpen();
          return;
        }
        spawnPlusOne(btn);
      });
    });
  }

  // ── Entry actions ─────────────────────────────────────────────────────
  function openSheet() {
    seenHighlight = true;
    applyEntryVisibility();
    cfg.onEncoreOpen && cfg.onEncoreOpen();
  }
  function dismissHighlight() {
    seenHighlight = true;
    applyEntryVisibility();
    pushAck('Got it — Encore is in the bar');
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init(c) {
    cfg = c;

    // Try to start video
    cfg.video.play().catch(() => { /* ignore — shim will retry */ });

    // Autoplay shim — tap to enter, then start everything
    const onShimTap = () => {
      cfg.shim.classList.add('hidden');
      cfg.video.play().catch(() => {});
      startChat();

      // Trigger highlight popup after optional delay
      if (HL_AUTO_POP_MS > 0) {
        cfg.hlPopup.classList.add('hidden'); // hide while waiting
        hlTimeoutId = setTimeout(() => {
          if (!seenHighlight) applyEntryVisibility();
        }, HL_AUTO_POP_MS);
      } else {
        applyEntryVisibility();
      }
    };
    cfg.shim.addEventListener('click', onShimTap, { once: true });

    // Entry wiring
    cfg.hlPlay.addEventListener('click', openSheet);
    cfg.hlDismiss.addEventListener('click', (e) => { e.stopPropagation(); dismissHighlight(); });
    cfg.encoreBtn.addEventListener('click', openSheet);
    cfg.railEncore && cfg.railEncore.addEventListener('click', openSheet);

    // Chrome wiring
    wireFollow();
    wireChatInput();
    wireDecorativeIcons();

    // Close button — toast and call it a day
    cfg.closeBtn.addEventListener('click', () => pushAck('See you next LIVE'));

    // Initial entry visibility (everything hidden until shim tapped)
    cfg.hlPopup.classList.add('hidden');
    cfg.encoreBtn.style.display = 'none';
    cfg.audienceBtn.style.display = '';
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function textNode(s) { return document.createTextNode(s); }

  // ── Export ────────────────────────────────────────────────────────────
  window.LiveRoom = { init, pushAck };
})();
