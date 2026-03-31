/* ═══════════════════════════════════════════════════════════════
   ChatWave – chat.js  (complete bug-fixed rewrite)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

// ── Auth guard ────────────────────────────────────────────────
const TOKEN = localStorage.getItem('token');
if (!TOKEN) { location.href = '/'; }

// ── Helpers ───────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const esc = t => {
  if (!t) return '';
  return String(t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>');
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };
const fmtBytes = b => b<1024 ? b+'B' : b<1048576 ? (b/1024).toFixed(1)+'KB' : (b/1048576).toFixed(1)+'MB';

function apiFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) }
  });
}

function avatarUrl(user, size = 40) {
  if (!user) return '/img/default-avatar.svg';
  if (user.avatar) return user.avatar;
  const name = encodeURIComponent(user.username || '?');
  return `https://ui-avatars.com/api/?name=${name}&background=7C3AED&color=fff&size=${size}&bold=true`;
}

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)     return 'now';
  if (s < 3600)   return `${Math.floor(s/60)}m`;
  if (s < 86400)  return `${Math.floor(s/3600)}h`;
  const d = new Date(date);
  if (s < 604800) return d.toLocaleDateString(undefined,{weekday:'short'});
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}

function fmtTime(date) {
  return new Date(date).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:true});
}

function fmtDate(date) {
  const d = new Date(date), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
}

function isEmojiOnly(str) {
  if (!str) return false;
  const s = str.replace(/\s/g,'');
  return s.length > 0 && s.length <= 8 &&
    /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})+$/u.test(s);
}

// ── App state ─────────────────────────────────────────────────
let ME           = null;          // current user object
let socket       = null;
let convos       = [];            // conversation list
let activeConvId = null;          // currently open conversation
let typingTmr    = null;
let isTyping     = false;
let pendingImg   = null;          // { file, url }
let emojiOpen    = false;
let bsGroupModal = null;
let groupSel     = [];            // selected users for group modal
let groupSearchR = [];
let ctxTarget    = null;          // right-clicked message wrapper
let pillTmr      = null;

// ── WebRTC ────────────────────────────────────────────────────
let pc           = null;          // RTCPeerConnection
let localStream  = null;
let callType     = null;          // 'audio' | 'video'
let callPeer     = null;          // { _id, username, avatar }
let callConvId   = null;
let pendingOffer = null;          // incoming offer held while user decides
let callTmr      = null;
let callSecs     = 0;
let muted = false, camOff = false, speakerOff = false;

const STUN = { iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}] };

// ── Emoji catalogue ───────────────────────────────────────────
const EMOJIS = [
  { l:'😊', n:'Smileys', e:['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😛','😝','😜','🤩','😎','🥳','😏','😒','😞','😟','😣','😫','🥺','😢','😭','😤','😠','😡','🤯','😳','🥶','😱','😨','🤗','🤔','😶','😐','😬','🙄','😮','🥱','😴','😵','🤐','🥴','🤢','🤮','😷','🤒','🤕'] },
  { l:'👍', n:'Hands',   e:['👋','🤚','✋','🖖','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','🤝','🙏','💪','💅','✍️'] },
  { l:'❤️', n:'Hearts',  e:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💯','🔥','✨','💫','⭐','🌟','🎉','🎊','🏆','🎯'] },
  { l:'🐶', n:'Animals', e:['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🦆','🦅','🦉','🦇','🐴','🦄','🌸','🌺','🌻','🌹','☀️','🌈','❄️','🌊'] },
  { l:'🍕', n:'Food',    e:['🍎','🍊','🍋','🍇','🍓','🍒','🥑','🍕','🍔','🍟','🌮','🌯','🍜','🍣','🍦','🎂','🍰','🧁','🍫','🍬','🍭','☕','🍵','🧃','🍺','🥂'] },
  { l:'🔥', n:'Objects', e:['🔥','💥','🎮','🕹','🎲','🎨','🎵','🎶','🎤','🎧','📱','💻','🖥','📷','📸','🎬','📺','💡','💎','🎁','🚀','✈️','🌍','🏠'] }
];

// ══ BOOT ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Fetch my profile
  try {
    const r = await apiFetch('/api/auth/me');
    if (!r.ok) { logout(); return; }
    const d = await r.json();
    ME = d.user;
    localStorage.setItem('user', JSON.stringify(ME));
  } catch { logout(); return; }

  $('myAvatar').src = avatarUrl(ME, 40);
  bsGroupModal = new bootstrap.Modal($('groupModal'));

  buildEmojiPicker();
  setupListeners();
  requestNotifPerm();
  connectSocket();
  await loadConversations();
});

// ══ SOCKET ════════════════════════════════════════════════════
function connectSocket() {
  socket = io({
    auth:               { token: TOKEN },
    transports:         ['websocket', 'polling'],
    reconnection:       true,
    reconnectionAttempts: Infinity,
    reconnectionDelay:  1500
  });

  socket.on('connect', () => {
    setStatus(true);
    pill('Connected ✓', 'reconnected', true);
    if (activeConvId) socket.emit('joinConversation', activeConvId);
  });
  socket.on('disconnect',    () => { setStatus(false); pill('Disconnected — reconnecting…', 'offline', false); });
  socket.on('connect_error', () => { setStatus(false); pill('Connection error — retrying…',  'offline', false); });
  socket.on('reconnect',     () => { setStatus(true);  pill('Back online ✓', 'reconnected', true); loadConversations(); });

  // ── Chat ──────────────────────────────────────────────────
  socket.on('newMessage', onNewMessage);
  socket.on('typing',      ({ userId, conversationId }) => {
    if (conversationId !== activeConvId || userId === ME._id) return;
    $('typingInd').style.display   = 'block';
    $('chatStatus').style.display  = 'none';
  });
  socket.on('stopTyping',  ({ userId, conversationId }) => {
    if (conversationId !== activeConvId || userId === ME._id) return;
    $('typingInd').style.display   = 'none';
    $('chatStatus').style.display  = 'block';
  });
  socket.on('userStatus', ({ userId, isOnline, lastSeen }) => {
    convos.forEach(c => c.participants.forEach(p => {
      if (p._id === userId) { p.isOnline = isOnline; if (lastSeen) p.lastSeen = lastSeen; }
    }));
    renderConvos();
    if (activeConvId) {
      const c = convos.find(c => c._id === activeConvId);
      if (c && !c.isGroup) updateHeader(c);
    }
  });
  socket.on('messagesRead', ({ conversationId }) => {
    if (conversationId !== activeConvId) return;
    document.querySelectorAll('.read-tick').forEach(el => el.classList.add('read'));
  });
  socket.on('notification', onNotification);

  // ── WebRTC signaling ───────────────────────────────────────
  socket.on('incomingCall', onIncomingCall);
  socket.on('callAnswered', onCallAnswered);
  socket.on('callRejected', onCallRejected);
  socket.on('iceCandidate', ({ candidate }) => {
    if (pc && candidate) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(()=>{});
  });
  socket.on('callEnded', cleanupCall);
}

// ── New message handler ────────────────────────────────────────
function onNewMessage(msg) {
  // Normalise IDs to strings (server sends plain strings, but be safe)
  const convId   = String(msg.conversation);
  const senderId = String(msg.sender?._id || msg.sender || '');

  // Update conversation list
  const idx = convos.findIndex(c => c._id === convId);
  if (idx !== -1) {
    convos[idx].lastMessage = msg;
    convos[idx].updatedAt   = msg.createdAt;
    if (senderId !== ME._id && convId !== activeConvId) {
      convos[idx].unreadCount = (convos[idx].unreadCount || 0) + 1;
    }
    // Move to top
    convos.unshift(convos.splice(idx, 1)[0]);
  } else {
    loadConversations();
    return;
  }
  renderConvos();

  if (convId === activeConvId) {
    // Remove empty-state if present
    const empty = $('msgContainer').querySelector('.empty-messages');
    if (empty) empty.remove();

    appendMsg(msg);

    const mc = $('msgContainer');
    const near = mc.scrollHeight - mc.scrollTop - mc.clientHeight < 140;
    if (near || senderId === ME._id) scrollBottom();

    safeEmit('markRead', { conversationId: activeConvId });
  }
}

// ── Notification ───────────────────────────────────────────────
function onNotification(data) {
  if (data.conversationId === activeConvId) return;
  showToast(data);
  playBeep();
  if (document.hidden) showBrowserNotif(
    data.isGroup ? data.groupName : data.senderName,
    (data.isGroup ? data.senderName + ': ' : '') + (data.preview || ''),
    data.senderAvatar
  );
}

// ══ CONVERSATIONS ══════════════════════════════════════════════
async function loadConversations() {
  try {
    const r = await apiFetch('/api/conversations');
    if (!r.ok) return;
    convos = await r.json();
    renderConvos();
  } catch (e) { console.error('loadConversations:', e); }
}

function renderConvos() {
  updateTitle();
  const list  = $('convList');
  const empty = $('emptyConvs');

  if (!convos.length) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = convos.map(c => {
    const isGroup = c.isGroup;
    const other   = !isGroup ? c.participants.find(p => p._id !== ME._id) : null;
    const name    = isGroup ? c.groupName : (other?.username || 'Unknown');
    const online  = !isGroup && other?.isOnline;
    const lm      = c.lastMessage;
    const preview = lm
      ? (lm.type === 'image' ? '📷 Photo' : (lm.content || '').slice(0, 45) + ((lm.content||'').length > 45 ? '…' : ''))
      : 'No messages yet';
    const ts     = timeAgo(c.updatedAt);
    const unread = c.unreadCount || 0;
    const active = c._id === activeConvId ? 'active' : '';
    const avHtml = isGroup
      ? `<div class="group-icon">👥</div>`
      : `<img src="${avatarUrl(other,44)}" alt="${esc(name)}" onerror="this.src='/img/default-avatar.svg'"/>`;

    return `<div class="conv-item ${active}" onclick="openConvo('${c._id}')">
      <div class="conv-avatar">
        ${avHtml}
        ${!isGroup ? `<span class="status-dot ${online?'online':'offline'}"></span>` : ''}
      </div>
      <div class="conv-body">
        <div class="conv-header">
          <span class="conv-name">${esc(name)}</span>
          <span class="conv-time">${ts}</span>
        </div>
        <div class="conv-meta">
          <span class="conv-preview">${esc(preview)}</span>
          ${unread ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══ OPEN CONVERSATION ══════════════════════════════════════════
async function openConvo(convId, forceReload = false) {
  // BUG FIX: allow forceReload to bypass the early-return guard (used by retry)
  if (activeConvId === convId && !forceReload) return;

  if (activeConvId && activeConvId !== convId) safeEmit('leaveConversation', activeConvId);
  activeConvId = convId;

  const conv = convos.find(c => c._id === convId);
  if (!conv) return;

  // Show chat window — BUG FIX: use display:flex (not display:block)
  $('welcomeScreen').style.display = 'none';
  $('chatWindow').style.display    = 'flex';

  // Mobile: hide sidebar, show chat
  if (window.innerWidth <= 768) {
    $('sidebar').classList.add('hidden');
    $('mainChat').classList.add('active');
  }

  renderConvos();
  updateHeader(conv);
  safeEmit('joinConversation', convId);

  // ── Load messages via REST ────────────────────────────────
  const mc = $('msgContainer');
  mc.innerHTML = `<div class="empty-messages"><i class="fa fa-spinner fa-spin fa-2x"></i></div>`;

  try {
    const r = await apiFetch(`/api/messages/${convId}?limit=60`);

    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: `HTTP ${r.status}` }));
      throw new Error(err.message);
    }

    const msgs = await r.json();

    if (!Array.isArray(msgs) || msgs.length === 0) {
      mc.innerHTML = `<div class="empty-messages">
        <i class="fa fa-comments fa-2x"></i>
        <p>No messages yet.<br/>Say hello! 👋</p>
      </div>`;
    } else {
      renderMsgs(msgs);
      scrollBottom(false);
    }
  } catch (err) {
    console.error('Load messages:', err);
    // BUG FIX: retry now works because forceReload=true bypasses early-return
    mc.innerHTML = `<div class="empty-messages" style="color:var(--danger)">
      <i class="fa fa-triangle-exclamation fa-2x"></i>
      <p>Failed to load messages.<br/>
        <button onclick="openConvo('${convId}', true)"
                style="margin-top:8px;background:var(--primary);border:none;color:#fff;
                       padding:5px 14px;border-radius:8px;cursor:pointer;font-size:.85rem">
          Try again
        </button>
      </p>
    </div>`;
  }

  // Mark read
  safeEmit('markRead', { conversationId: convId });
  const idx = convos.findIndex(c => c._id === convId);
  if (idx !== -1) { convos[idx].unreadCount = 0; renderConvos(); }
}

// ══ CHAT HEADER ════════════════════════════════════════════════
function updateHeader(conv) {
  const isGroup = conv.isGroup;
  const other   = !isGroup ? conv.participants.find(p => p._id !== ME._id) : null;
  const name    = isGroup ? conv.groupName : (other?.username || 'Unknown');

  $('chatName').textContent = name;

  // Avatar
  const av = $('chatAvatar');
  av.innerHTML = isGroup
    ? `<div class="group-avatar">👥</div>`
    : `<img src="${avatarUrl(other,40)}" alt="${esc(name)}"
            style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block"
            onerror="this.src='/img/default-avatar.svg'"/>`;

  // Status
  const st = $('chatStatus');
  if (isGroup) {
    st.textContent = `${conv.participants.length} members`;
    st.className   = 'chat-header-status';
  } else if (other?.isOnline) {
    st.textContent = 'Online';
    st.className   = 'chat-header-status online';
  } else {
    st.textContent = other?.lastSeen ? `Last seen ${timeAgo(other.lastSeen)}` : 'Offline';
    st.className   = 'chat-header-status';
  }
  st.style.display       = 'block';
  $('typingInd').style.display = 'none';

  // Call buttons — DMs only
  const showCall = !isGroup;
  $('btnVoice').style.display = showCall ? 'flex' : 'none';
  $('btnVideo').style.display = showCall ? 'flex' : 'none';
  if (showCall && other) { callPeer = other; callConvId = conv._id; }
}

// ══ RENDER MESSAGES ════════════════════════════════════════════
function renderMsgs(msgs) {
  const mc = $('msgContainer');
  mc.innerHTML = '';
  let lastDate = '';
  msgs.forEach(msg => {
    const ds = fmtDate(msg.createdAt);
    if (ds !== lastDate) {
      lastDate = ds;
      const div = document.createElement('div');
      div.className = 'date-divider'; div.textContent = ds;
      mc.appendChild(div);
    }
    mc.appendChild(buildMsg(msg));
  });
}

function appendMsg(msg) {
  const mc = $('msgContainer');
  const ds = fmtDate(msg.createdAt);
  const last = mc.querySelector('.date-divider:last-of-type');
  if (!last || last.textContent !== ds) {
    const div = document.createElement('div');
    div.className = 'date-divider'; div.textContent = ds;
    mc.appendChild(div);
  }
  mc.appendChild(buildMsg(msg));
}

function buildMsg(msg) {
  // BUG FIX: always compare as strings to avoid ObjectId vs string mismatch
  const senderId = String(msg.sender?._id || msg.sender || '');
  const isMine   = senderId === String(ME._id);

  const wrap = document.createElement('div');
  wrap.className      = `msg-wrapper ${isMine ? 'out' : 'in'}`;
  wrap.dataset.msgId  = msg._id;

  const conv     = convos.find(c => c._id === String(msg.conversation));
  const showName = !isMine && conv?.isGroup;

  let html = '';
  if (showName) html += `<div class="msg-sender-name">${esc(msg.sender?.username || '')}</div>`;

  if (msg.type === 'image' || msg.imageUrl) {
    html += `<div class="msg-bubble image-msg">
      <img class="msg-image" src="${msg.imageUrl}" alt="Image" loading="lazy"
           onclick="openLightbox('${msg.imageUrl}')"
           onerror="this.alt='Image unavailable';this.style.display='none'"/>
    </div>`;
  } else {
    const emojiOnly = isEmojiOnly(msg.content || '');
    html += `<div class="msg-bubble${emojiOnly ? ' emoji-only' : ''}">${esc(msg.content || '')}</div>`;
  }

  const read    = Array.isArray(msg.readBy) && msg.readBy.length > 1;
  html += `<div class="msg-meta">
    <span>${fmtTime(msg.createdAt)}</span>
    ${isMine ? `<i class="fa fa-check-double read-tick${read ? ' read' : ''}" title="${read ? 'Read' : 'Delivered'}"></i>` : ''}
  </div>`;

  wrap.innerHTML = html;
  return wrap;
}

// ══ SEND MESSAGE ═══════════════════════════════════════════════
async function sendMessage() {
  if (!activeConvId) return;

  const text   = $('msgInput').value.trim();
  const hasImg = !!pendingImg;
  if (!text && !hasImg) return;

  // BUG FIX: don't block on socket.connected; emit regardless
  // (socket.io queues events and replays on reconnect for connected-once sessions)
  if (hasImg) {
    const fd = new FormData();
    fd.append('image', pendingImg.file);
    try {
      const r = await apiFetch('/api/messages/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`Upload HTTP ${r.status}`);
      const { imageUrl } = await r.json();
      safeEmit('sendMessage', { conversationId: activeConvId, content: text || '', type: 'image', imageUrl });
    } catch (e) {
      console.error('Image upload failed:', e);
      pill('Image upload failed', 'offline');
      return;
    }
    removeImg();
  } else {
    safeEmit('sendMessage', {
      conversationId: activeConvId,
      content: text,
      type: isEmojiOnly(text) ? 'emoji' : 'text'
    });
  }

  $('msgInput').value = '';
  resizeTextarea();
  stopTypingSignal();
}

// ══ EVENT LISTENERS ════════════════════════════════════════════
function setupListeners() {
  // Keyboard
  $('msgInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  $('msgInput').addEventListener('input', () => { resizeTextarea(); handleTyping(); });

  // Close emoji picker on outside click
  document.addEventListener('click', e => {
    if (emojiOpen && !$('emojiPicker').contains(e.target) && e.target !== $('emojiBtn'))
      closeEmoji();
    if (!e.target.closest('.ctx-menu')) closeCtx();
  });

  // Right-click on message
  document.addEventListener('contextmenu', e => {
    const bubble = e.target.closest('.msg-bubble');
    if (!bubble) { closeCtx(); return; }
    e.preventDefault();
    ctxTarget = bubble.closest('.msg-wrapper');
    openCtx(e.clientX, e.clientY);
  });

  // Scroll-to-bottom button
  $('msgContainer').addEventListener('scroll', function() {
    const show = this.scrollHeight - this.scrollTop - this.clientHeight > 120;
    $('scrollBtn').style.display = show ? 'flex' : 'none';
  });

  // User search
  $('userSearchInput').addEventListener('input', debounce(searchUsers, 280));
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) $('searchResults').style.display = 'none';
  });

  // Group search (delegated via inline oninput, so nothing extra needed here)

  // Mobile resize
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      $('sidebar').classList.remove('hidden');
      $('mainChat').classList.remove('active');
    }
  });
}

function resizeTextarea() {
  const ta = $('msgInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// Inline handlers referenced from HTML
function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function onInput() { resizeTextarea(); handleTyping(); }

function handleTyping() {
  if (!activeConvId) return;
  if (!isTyping) { isTyping = true; safeEmit('typing', { conversationId: activeConvId }); }
  clearTimeout(typingTmr);
  typingTmr = setTimeout(stopTypingSignal, 2000);
}
function stopTypingSignal() {
  if (!isTyping || !activeConvId) return;
  isTyping = false;
  safeEmit('stopTyping', { conversationId: activeConvId });
}

function scrollBottom(smooth = true) {
  const mc = $('msgContainer');
  mc.scrollTo({ top: mc.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  $('scrollBtn').style.display = 'none';
}

// ── Safe socket emit (guards against null socket) ──────────────
function safeEmit(event, data) {
  if (socket) socket.emit(event, data);
}

// ── Image attachment ───────────────────────────────────────────
function handleFileSelect(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('Max image size is 10 MB'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    pendingImg = { file, url: e.target.result };
    $('imgPreviewThumb').src = e.target.result;
    $('imgFileName').textContent = file.name;
    $('imgFileSize').textContent = fmtBytes(file.size);
    $('imgPreviewBar').style.display = 'flex';
  };
  reader.readAsDataURL(file);
  input.value = '';
}
function removeImg() {
  pendingImg = null;
  $('imgPreviewBar').style.display = 'none';
  $('imgPreviewThumb').src = '';
}

// ── Emoji picker ───────────────────────────────────────────────
function buildEmojiPicker() {
  const cats = $('emojiCats');
  EMOJIS.forEach((cat, i) => {
    const btn = document.createElement('button');
    btn.className = 'emoji-cat' + (i === 0 ? ' active' : '');
    btn.textContent = cat.l; btn.title = cat.n;
    btn.onclick = () => {
      document.querySelectorAll('.emoji-cat').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fillEmojiGrid(cat.e);
    };
    cats.appendChild(btn);
  });
  fillEmojiGrid(EMOJIS[0].e);
}
function fillEmojiGrid(emojis) {
  $('emojiGrid').innerHTML = emojis.map(e =>
    `<button class="emoji-btn" onclick="insertEmoji('${e}')">${e}</button>`
  ).join('');
}
function insertEmoji(e) {
  const ta = $('msgInput'), pos = ta.selectionStart || ta.value.length;
  ta.value = ta.value.slice(0,pos) + e + ta.value.slice(pos);
  ta.selectionStart = ta.selectionEnd = pos + e.length;
  ta.focus(); resizeTextarea(); handleTyping();
}
function toggleEmoji(e) { e.stopPropagation(); emojiOpen ? closeEmoji() : openEmoji(); }
function openEmoji()  { $('emojiPicker').style.display='block'; emojiOpen=true;  $('emojiBtn').style.color='var(--primary-light)'; }
function closeEmoji() { $('emojiPicker').style.display='none';  emojiOpen=false; $('emojiBtn').style.color=''; }

// ── User search (sidebar) ──────────────────────────────────────
async function searchUsers() {
  const q = $('userSearchInput').value.trim();
  $('clearSearchBtn').style.display = q ? 'flex' : 'none';
  if (!q) { $('searchResults').style.display = 'none'; return; }
  try {
    const r = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const users = await r.json();
    renderSearchResults(users);
  } catch {}
}
function renderSearchResults(users) {
  const el = $('searchResults');
  if (!users.length) {
    el.innerHTML = `<div style="padding:.7rem 1rem;color:var(--text-muted);font-size:.84rem">No users found</div>`;
    el.style.display = 'block'; return;
  }
  el.innerHTML = users.map(u => `
    <div class="search-result-item" onclick="startDM('${u._id}')">
      <img src="${avatarUrl(u,34)}" alt="${esc(u.username)}" onerror="this.src='/img/default-avatar.svg'"/>
      <div>
        <div class="name">${esc(u.username)}</div>
        <div class="email">${esc(u.email)}</div>
      </div>
      ${u.isOnline ? '<i class="fa fa-circle" style="color:var(--online);font-size:.7rem;margin-left:auto"></i>' : ''}
    </div>`).join('');
  el.style.display = 'block';
}
function clearSearch() {
  $('userSearchInput').value = '';
  $('clearSearchBtn').style.display = 'none';
  $('searchResults').style.display  = 'none';
}
async function startDM(userId) {
  $('searchResults').style.display = 'none'; clearSearch();
  try {
    const r = await apiFetch('/api/conversations/direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: userId })
    });
    const conv = await r.json();
    const idx  = convos.findIndex(c => c._id === conv._id);
    if (idx === -1) convos.unshift(conv); else convos[idx] = { ...convos[idx], ...conv };
    renderConvos();
    openConvo(conv._id);
  } catch (e) { console.error('startDM:', e); }
}

// ── Group modal ────────────────────────────────────────────────
function openGroupModal() {
  groupSel = []; groupSearchR = [];
  $('groupName').value = ''; $('groupSearch').value = '';
  $('groupUserList').innerHTML = ''; $('groupChips').innerHTML = '';
  bsGroupModal.show();
}
const searchGroupUsers = debounce(async (q) => {
  if (!q.trim()) { $('groupUserList').innerHTML = ''; return; }
  try {
    const r = await apiFetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
    groupSearchR = await r.json();
    renderGroupList();
  } catch {}
}, 280);
function renderGroupList() {
  $('groupUserList').innerHTML = groupSearchR.map(u => {
    const sel = groupSel.some(s => s._id === u._id);
    return `<div class="user-select-item ${sel ? 'selected' : ''}" onclick="toggleGroupUser('${u._id}')">
      <img src="${avatarUrl(u,34)}" alt="${esc(u.username)}" onerror="this.src='/img/default-avatar.svg'"/>
      <div><div class="name">${esc(u.username)}</div><div class="email">${esc(u.email)}</div></div>
      <div class="check">${sel ? '<i class="fa fa-check"></i>' : ''}</div>
    </div>`;
  }).join('');
}
function toggleGroupUser(id) {
  const u   = groupSearchR.find(u => u._id === id); if (!u) return;
  const idx = groupSel.findIndex(u => u._id === id);
  if (idx !== -1) groupSel.splice(idx, 1); else groupSel.push(u);
  renderGroupList(); renderGroupChips();
}
function renderGroupChips() {
  $('groupChips').innerHTML = groupSel.map(u =>
    `<div class="selected-chip">
      <img src="${avatarUrl(u,18)}" alt="${esc(u.username)}"/>
      ${esc(u.username)}
      <span class="remove" onclick="toggleGroupUser('${u._id}')">✕</span>
    </div>`
  ).join('');
}
async function createGroup() {
  const name = $('groupName').value.trim();
  if (!name)           { alert('Enter a group name'); return; }
  if (!groupSel.length){ alert('Add at least one member'); return; }
  try {
    const r = await apiFetch('/api/conversations/group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: name, participantIds: groupSel.map(u => u._id) })
    });
    if (!r.ok) { const e = await r.json(); alert(e.message); return; }
    const conv = await r.json();
    convos.unshift(conv);
    renderConvos();
    bsGroupModal.hide();
    openConvo(conv._id);
  } catch (e) { console.error('createGroup:', e); alert('Failed to create group'); }
}

// ── Delete conversation ────────────────────────────────────────
async function deleteConversation() {
  if (!activeConvId || !confirm('Delete this conversation and all messages?')) return;
  try {
    const r = await apiFetch(`/api/conversations/${activeConvId}`, { method: 'DELETE' });
    if (!r.ok) { alert('Delete failed'); return; }
    safeEmit('leaveConversation', activeConvId);
    convos = convos.filter(c => c._id !== activeConvId);
    activeConvId = null;
    $('chatWindow').style.display    = 'none';
    $('welcomeScreen').style.display = 'flex';
    renderConvos();
  } catch { alert('Failed to delete'); }
}

// ── Lightbox ───────────────────────────────────────────────────
function openLightbox(src) { $('lightboxImg').src = src; $('lightbox').classList.add('open'); }
function closeLightbox()    { $('lightbox').classList.remove('open'); }

// ── Context menu ───────────────────────────────────────────────
function openCtx(x, y) {
  const m = $('ctxMenu'); m.classList.add('open');
  m.style.left = Math.min(x, innerWidth  - 170) + 'px';
  m.style.top  = Math.min(y, innerHeight - 100) + 'px';
  $('ctxDel').style.display = ctxTarget?.classList.contains('out') ? 'flex' : 'none';
}
function closeCtx() { $('ctxMenu').classList.remove('open'); }
function ctxCopy()  {
  const txt = ctxTarget?.querySelector('.msg-bubble')?.innerText || '';
  navigator.clipboard.writeText(txt).catch(() => {});
  closeCtx();
}
function ctxDeleteMsg() {
  if (!ctxTarget) return;
  ctxTarget.style.transition = 'opacity .2s';
  ctxTarget.style.opacity    = '0';
  setTimeout(() => ctxTarget?.remove(), 200);
  closeCtx();
}

// ── Notification toast ─────────────────────────────────────────
function showToast(data) {
  const t = document.createElement('div');
  t.className = 'notification-toast';
  t.innerHTML = `
    <img src="${data.senderAvatar || '/img/default-avatar.svg'}" alt=""
         onerror="this.src='/img/default-avatar.svg'"/>
    <div class="notif-body">
      <div class="name">${esc(data.isGroup ? data.groupName : data.senderName)}</div>
      <div class="preview">${data.isGroup ? esc(data.senderName)+': ' : ''}${esc(data.preview||'New message')}</div>
    </div>
    <button class="notif-close" onclick="this.parentElement.remove()"><i class="fa fa-times"></i></button>`;
  t.addEventListener('click', e => {
    if (!e.target.closest('.notif-close')) { openConvo(data.conversationId); t.remove(); }
  });
  document.body.appendChild(t);
  setTimeout(() => {
    if (t.parentElement) {
      t.style.animation = 'slideOutRight .3s ease forwards';
      setTimeout(() => t.remove(), 300);
    }
  }, 5000);
}

// ── UI helpers ─────────────────────────────────────────────────
function setStatus(online) {
  const dot = $('statusDot'), txt = $('statusTxt');
  if (!dot || !txt) return;
  dot.style.background = online ? 'var(--online)' : 'var(--danger)';
  txt.textContent = online ? 'Connected' : 'Reconnecting…';
}
function updateTitle() {
  const n = convos.reduce((s, c) => s + (c.unreadCount || 0), 0);
  document.title = n > 0 ? `(${n}) ChatWave` : 'ChatWave';
}
function pill(msg, type, autohide = false) {
  const p = $('connPill'), t = $('connTxt');
  clearTimeout(pillTmr);
  t.textContent = msg;
  p.className   = `connection-pill show ${type}`;
  if (autohide) pillTmr = setTimeout(() => p.classList.remove('show'), 3000);
}
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.frequency.value = 880;
    g.gain.setValueAtTime(.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .3);
    osc.start(); osc.stop(ctx.currentTime + .3);
  } catch {}
}
function requestNotifPerm() {
  if ('Notification' in window && Notification.permission === 'default')
    Notification.requestPermission();
}
function showBrowserNotif(title, body, icon) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const n = new Notification(title, { body, icon: icon || '/img/default-avatar.svg', silent: true }); setTimeout(() => n.close(), 5000); } catch {}
}
function closeMobile() {
  if (window.innerWidth > 768) return;
  $('sidebar').classList.remove('hidden');
  $('mainChat').classList.remove('active');
  safeEmit('leaveConversation', activeConvId);
  activeConvId = null;
}
function logout() {
  if (socket) socket.disconnect();
  localStorage.clear();
  location.href = '/';
}

// ═══════════════════════════════════════════════════════════════
//  WEBRTC — Voice & Video Calling
// ═══════════════════════════════════════════════════════════════

async function startCall(type) {
  if (!callPeer || !callConvId) return;
  if (pc) { alert('Already in a call'); return; }
  callType = type;

  showCallOverlay({ name: callPeer.username, avatar: avatarUrl(callPeer, 90), type, status: 'Calling…' });

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { width: 1280, height: 720 } : false
    });
  } catch {
    hideCallOverlay();
    alert(`${type === 'video' ? 'Camera/m' : 'M'}icrophone access denied.`);
    return;
  }

  if (type === 'video') { $('localVideo').srcObject = localStream; $('localVideo').style.display = 'block'; }

  pc = makePeerConnection(callPeer._id);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  safeEmit('callUser', {
    to:         callPeer._id,
    from:       ME._id,
    fromName:   ME.username,
    fromAvatar: ME.avatar || '',
    convId:     callConvId,
    type,
    offer
  });
}

function onIncomingCall({ from, fromName, fromAvatar, convId, type, offer }) {
  if (pc) { safeEmit('rejectCall', { to: from }); return; }
  pendingOffer = { from, fromName, fromAvatar, convId, type, offer };
  callPeer     = { _id: from, username: fromName, avatar: fromAvatar };
  callConvId   = convId;
  callType     = type;

  $('icImg').src       = fromAvatar || '/img/default-avatar.svg';
  $('icName').textContent  = fromName;
  $('icTypeIcon').className = type === 'video' ? 'fa fa-video' : 'fa fa-phone';
  $('icTypeTxt').textContent = type === 'video' ? 'Video call' : 'Voice call';
  $('incomingCall').classList.add('show');
  playRingtone();
}

async function acceptCall() {
  stopRingtone(); $('incomingCall').classList.remove('show');
  if (!pendingOffer) return;
  const { from, fromName, fromAvatar, type, offer } = pendingOffer;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { width: 1280, height: 720 } : false
    });
  } catch {
    safeEmit('rejectCall', { to: from });
    alert('Microphone/camera access denied.');
    return;
  }

  showCallOverlay({ name: fromName, avatar: fromAvatar || '/img/default-avatar.svg', type, status: 'Connecting…' });
  if (type === 'video') { $('localVideo').srcObject = localStream; $('localVideo').style.display = 'block'; }

  pc = makePeerConnection(from);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  safeEmit('answerCall', { to: from, answer });
  startCallTimer();
  pendingOffer = null;
}

function rejectCall() {
  stopRingtone(); $('incomingCall').classList.remove('show');
  if (pendingOffer) { safeEmit('rejectCall', { to: pendingOffer.from }); pendingOffer = null; }
}

function onCallAnswered({ answer }) {
  if (!pc) return;
  pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
  $('callPeerStatus').textContent = 'Connected';
  startCallTimer();
}
function onCallRejected() { cleanupCall(); pill('Call declined', 'offline'); }

function makePeerConnection(peerId) {
  const c = new RTCPeerConnection(STUN);
  c.onicecandidate = ({ candidate }) => {
    if (candidate) safeEmit('iceCandidate', { to: peerId, candidate });
  };
  c.ontrack = ({ streams }) => {
    const rv = $('remoteVideo');
    if (streams?.[0]) { rv.srcObject = streams[0]; if (callType === 'video') rv.style.display = 'block'; }
  };
  c.oniceconnectionstatechange = () => {
    if (['disconnected','failed','closed'].includes(c.iceConnectionState)) endCall();
  };
  return c;
}

function endCall() { safeEmit('endCall', { to: callPeer?._id }); cleanupCall(); }

function cleanupCall() {
  stopRingtone(); stopCallTimer();
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (pc)          { pc.close(); pc = null; }
  $('remoteVideo').srcObject = null; $('remoteVideo').style.display = 'none';
  $('localVideo').srcObject  = null; $('localVideo').style.display  = 'none';
  hideCallOverlay();
  $('incomingCall').classList.remove('show');
  muted = false; camOff = false; speakerOff = false;
  $('muteIcon').className    = 'fa fa-microphone';
  $('camIcon').className     = 'fa fa-video';
  $('speakerIcon').className = 'fa fa-volume-high';
  $('muteBtn').classList.remove('toggled');
  $('camBtn').classList.remove('toggled');
  $('speakerBtn').classList.remove('toggled');
  pendingOffer = null; callType = null;
}

function showCallOverlay({ name, avatar, type, status }) {
  $('callPeerImg').src         = avatar || '/img/default-avatar.svg';
  $('callPeerName').textContent = name;
  $('callPeerStatus').textContent = status;
  $('callTypeTxt').textContent  = type === 'video' ? 'Video Call' : 'Voice Call';
  $('callTypeIcon').className   = type === 'video' ? 'fa fa-video' : 'fa fa-phone';
  $('camBtn').style.display     = type === 'video' ? 'flex' : 'none';
  $('callTimer').textContent    = '';
  $('callOverlay').classList.add('active');
}
function hideCallOverlay() { $('callOverlay').classList.remove('active'); }

function startCallTimer() {
  callSecs = 0; stopCallTimer();
  callTmr = setInterval(() => {
    callSecs++;
    const m = String(Math.floor(callSecs/60)).padStart(2,'0');
    const s = String(callSecs%60).padStart(2,'0');
    $('callTimer').textContent = `${m}:${s}`;
  }, 1000);
}
function stopCallTimer() { clearInterval(callTmr); }

function toggleMute() {
  muted = !muted;
  localStream?.getAudioTracks().forEach(t => t.enabled = !muted);
  $('muteIcon').className = muted ? 'fa fa-microphone-slash' : 'fa fa-microphone';
  $('muteBtn').classList.toggle('toggled', muted);
}
function toggleCam() {
  camOff = !camOff;
  localStream?.getVideoTracks().forEach(t => t.enabled = !camOff);
  $('camIcon').className  = camOff ? 'fa fa-video-slash' : 'fa fa-video';
  $('camBtn').classList.toggle('toggled', camOff);
  $('localVideo').style.opacity = camOff ? '.3' : '1';
}
function toggleSpeaker() {
  speakerOff = !speakerOff;
  $('remoteVideo').muted  = speakerOff;
  $('speakerIcon').className = speakerOff ? 'fa fa-volume-xmark' : 'fa fa-volume-high';
  $('speakerBtn').classList.toggle('toggled', speakerOff);
}

let ringtoneCtx = null, ringTmr = null;
function playRingtone() {
  try {
    ringtoneCtx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      const o = ringtoneCtx.createOscillator(), g = ringtoneCtx.createGain();
      o.connect(g); g.connect(ringtoneCtx.destination);
      o.frequency.value = 660; o.type = 'sine';
      g.gain.setValueAtTime(.18, ringtoneCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ringtoneCtx.currentTime + .4);
      o.start(); o.stop(ringtoneCtx.currentTime + .4);
    };
    beep(); ringTmr = setInterval(beep, 1500);
  } catch {}
}
function stopRingtone() {
  clearInterval(ringTmr);
  try { ringtoneCtx?.close(); } catch {}
  ringtoneCtx = null;
}
