const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const bcrypt  = require('bcryptjs');
const auth    = require('../middleware/auth');
const User    = require('../models/User');

// ── Multer for avatar uploads ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination (req, file, cb) {
    const dir = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${req.user._id}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter (req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// GET /api/users/search?q=
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) return res.json([]);

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { username: { $regex: q.trim(), $options: 'i' } },
        { email:    { $regex: q.trim(), $options: 'i' } }
      ]
    }).select('-password').limit(15);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/users/profile  (multipart form)
router.put('/profile', auth, upload.single('avatar'), async (req, res) => {
  try {
    const updates = {};
    const { username, bio, currentPassword, newPassword } = req.body;

    if (username) {
      if (username.length < 3)
        return res.status(400).json({ message: 'Username must be at least 3 characters' });
      const taken = await User.findOne({ username, _id: { $ne: req.user._id } });
      if (taken) return res.status(409).json({ message: 'Username already taken' });
      updates.username = username;
    }

    if (bio !== undefined) updates.bio = bio;

    if (req.file) {
      // Delete old avatar if custom
      if (req.user.avatar && req.user.avatar.startsWith('/uploads')) {
        const oldPath = path.join(__dirname, '..', req.user.avatar);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      updates.avatar = `/uploads/avatars/${req.file.filename}`;
    }

    if (newPassword) {
      if (!currentPassword)
        return res.status(400).json({ message: 'Current password required' });
      const user = await User.findById(req.user._id);
      const valid = await user.comparePassword(currentPassword);
      if (!valid) return res.status(401).json({ message: 'Current password incorrect' });
      if (newPassword.length < 6)
        return res.status(400).json({ message: 'New password must be at least 6 characters' });
      updates.password = await bcrypt.hash(newPassword, 12);
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
