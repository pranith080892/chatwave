const router       = require('express').Router();
const path         = require('path');
const fs           = require('fs');
const multer       = require('multer');
const auth         = require('../middleware/auth');
const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');

// ── Multer storage ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, '..', 'uploads', 'images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ─────────────────────────────────────────────────────────────────
// IMPORTANT: /upload must be registered BEFORE /:conversationId
// so Express doesn't match "upload" as a conversationId
// ─────────────────────────────────────────────────────────────────

// POST /api/messages/upload
router.post('/upload', auth, upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    res.json({ imageUrl: `/uploads/images/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/messages/:conversationId?page=1&limit=50
router.get('/:conversationId', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Validate membership
    const conv = await Conversation.findById(conversationId).lean();
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    const isMember = conv.participants.map(p => p.toString()).includes(req.user._id.toString());
    if (!isMember) return res.status(403).json({ message: 'Access denied' });

    const page  = Math.max(1,   parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);

    const messages = await Message.find({ conversation: conversationId })
      .populate('sender', 'username avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();   // return plain JS objects, not Mongoose documents

    // Return in chronological order; ensure all IDs are strings
    const result = messages.reverse().map(m => {
      let senderInfo = { _id: '', username: 'Unknown User', avatar: '' };
      
      if (m.sender && typeof m.sender === 'object') {
        senderInfo = {
          _id:      m.sender._id ? m.sender._id.toString() : '',
          username: m.sender.username || 'Unknown User',
          avatar:   m.sender.avatar || ''
        };
      } else if (m.sender) {
        senderInfo._id = m.sender.toString();
      }

      return {
        ...m,
        _id:          m._id.toString(),
        conversation: m.conversation.toString(),
        sender:       senderInfo,
        readBy:       (m.readBy || []).map(id => id.toString()),
        createdAt:    m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
        updatedAt:    m.updatedAt instanceof Date ? m.updatedAt.toISOString() : m.updatedAt
      };
    });

    res.json(result);
  } catch (err) {
    console.error('GET messages error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
