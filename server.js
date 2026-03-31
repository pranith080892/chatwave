require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');

const User         = require('./models/User');
const Message      = require('./models/Message');
const Conversation = require('./models/Conversation');

const app    = express();
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'chatwave_v3_secure_default_key_2024';

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7,
  pingTimeout: 60000,
  pingInterval: 25000
});

// ── Ensure upload dirs ────────────────────────────────────────────
['uploads/avatars', 'uploads/images'].forEach(dir => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// ── Middleware ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Database ──────────────────────────────────────────────────────
// ── Database ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌  CRITICAL ERROR: MONGODB_URI or MONGO_URI is missing from Environment Variables!');
  console.log('Please check your Render Environment tab and ensure the key is correctly named.');
  process.exit(1);
}

// Log connection attempt (hiding password for safety)
const sanitizedUri = MONGO_URI.replace(/:([^@]+)@/, ':****@');
console.log(`📡 Attempting to connect to: ${sanitizedUri.split('@')[1] || 'Unknown Host'}`);

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅  MongoDB connected successfully'))
  .catch(err => { 
    console.error('❌  MongoDB Connection Error:', err.message); 
    process.exit(1); 
  });

// ── API routes ────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/messages',      require('./routes/messages'));

// ── Page routes ───────────────────────────────────────────────────
app.get('/',        (_,res) => res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/chat',    (_,res) => res.sendFile(path.join(__dirname,'public/chat.html')));
app.get('/profile', (_,res) => res.sendFile(path.join(__dirname,'public/profile.html')));

// ── Socket.IO ─────────────────────────────────────────────────────
// userId -> Set<socketId>
const connectedUsers = new Map();

// Auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = String(decoded.userId); // always a string
    next();
  } catch {
    next(new Error('Bad token'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.userId;

  // Track sockets per user (multi-tab support)
  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socket.id);

  // Mark online
  try {
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit('userStatus', { userId, isOnline: true });
  } catch {}

  // ── Room management ───────────────────────────────────────────
  socket.on('joinConversation',  id => { if (id) socket.join(id); });
  socket.on('leaveConversation', id => { if (id) socket.leave(id); });

  // ── Send message ──────────────────────────────────────────────
  socket.on('sendMessage', async ({ conversationId, content, type = 'text', imageUrl }) => {
    try {
      if (!conversationId) return;

      const convo = await Conversation.findById(conversationId);
      if (!convo) return;

      const participantIds = convo.participants.map(p => p.toString());
      if (!participantIds.includes(userId)) return;

      const message = await Message.create({
        conversation: conversationId,
        sender:       userId,
        content:      content || '',
        type:         type || 'text',
        imageUrl:     imageUrl || '',
        readBy:       [userId]
      });

      // Populate sender for the broadcast
      await message.populate('sender', 'username avatar');

      // Update conversation's lastMessage
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        updatedAt:   new Date()
      });

      // FIX: emit a plain object, not a Mongoose document
      // This ensures _id and conversation are plain strings
      const plain = {
        _id:          message._id.toString(),
        conversation: conversationId.toString(),
        sender: {
          _id:      message.sender._id.toString(),
          username: message.sender.username,
          avatar:   message.sender.avatar || ''
        },
        content:   message.content,
        type:      message.type,
        imageUrl:  message.imageUrl,
        readBy:    message.readBy.map(id => id.toString()),
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString()
      };

      // Broadcast to everyone in the room (including sender)
      io.to(conversationId).emit('newMessage', plain);

      // Push notification to participants NOT in this room
      participantIds.forEach(pid => {
        if (pid === userId) return;
        const sids = connectedUsers.get(pid);
        if (!sids) return;
        const preview = type === 'image' ? '📷 Photo'
          : content && content.length > 60 ? content.slice(0, 60) + '…' : content;
        sids.forEach(sid => io.to(sid).emit('notification', {
          conversationId: conversationId.toString(),
          senderId:       userId,
          senderName:     plain.sender.username,
          senderAvatar:   plain.sender.avatar,
          preview:        preview || '',
          isGroup:        convo.isGroup,
          groupName:      convo.groupName || ''
        }));
      });
    } catch (err) {
      console.error('sendMessage error:', err.message);
    }
  });

  // ── Typing ────────────────────────────────────────────────────
  socket.on('typing',     ({ conversationId }) => {
    if (conversationId) socket.to(conversationId).emit('typing',     { userId, conversationId });
  });
  socket.on('stopTyping', ({ conversationId }) => {
    if (conversationId) socket.to(conversationId).emit('stopTyping', { userId, conversationId });
  });

  // ── Mark read ─────────────────────────────────────────────────
  socket.on('markRead', async ({ conversationId }) => {
    try {
      if (!conversationId) return;
      await Message.updateMany(
        { conversation: conversationId, sender: { $ne: userId }, readBy: { $nin: [userId] } },
        { $addToSet: { readBy: userId } }
      );
      io.to(conversationId).emit('messagesRead', { conversationId, userId });
    } catch {}
  });

  // ── WebRTC signaling ──────────────────────────────────────────
  const relayTo = (targetId, event, payload) => {
    const sids = connectedUsers.get(String(targetId));
    if (sids) sids.forEach(sid => io.to(sid).emit(event, payload));
  };

  socket.on('callUser',     d => relayTo(d.to, 'incomingCall',  d));
  socket.on('answerCall',   d => relayTo(d.to, 'callAnswered',  d));
  socket.on('rejectCall',   d => relayTo(d.to, 'callRejected',  {}));
  socket.on('iceCandidate', d => relayTo(d.to, 'iceCandidate',  { candidate: d.candidate }));
  socket.on('endCall',      d => relayTo(d.to, 'callEnded',     {}));

  // ── Disconnect ────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    const sids = connectedUsers.get(userId);
    if (!sids) return;
    sids.delete(socket.id);
    if (sids.size === 0) {
      connectedUsers.delete(userId);
      try {
        const lastSeen = new Date();
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
        io.emit('userStatus', { userId, isOnline: false, lastSeen: lastSeen.toISOString() });
      } catch {}
    }
  });
});

app.set('io', io);
app.set('connectedUsers', connectedUsers);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀  Server on port ${PORT}`));
