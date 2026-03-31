const router       = require('express').Router();
const auth         = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');

// GET /api/conversations  – all conversations for current user
router.get('/', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate('participants', 'username avatar isOnline lastSeen')
      .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'username' } })
      .sort({ updatedAt: -1 });

    const result = await Promise.all(conversations.map(async conv => {
      const unreadCount = await Message.countDocuments({
        conversation: conv._id,
        sender:       { $ne: req.user._id },
        readBy:       { $ne: req.user._id }
      });
      return { ...conv.toObject(), unreadCount };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/conversations/direct  – start or find a DM
router.post('/direct', auth, async (req, res) => {
  try {
    const { participantId } = req.body;
    if (!participantId) return res.status(400).json({ message: 'participantId required' });
    if (participantId === req.user._id.toString())
      return res.status(400).json({ message: 'Cannot message yourself' });

    let conv = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [req.user._id, participantId], $size: 2 }
    }).populate('participants', 'username avatar isOnline lastSeen')
      .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'username' } });

    if (!conv) {
      conv = await Conversation.create({
        participants: [req.user._id, participantId],
        isGroup: false
      });
      conv = await Conversation.findById(conv._id)
        .populate('participants', 'username avatar isOnline lastSeen');
    }

    const unreadCount = await Message.countDocuments({
      conversation: conv._id,
      sender:       { $ne: req.user._id },
      readBy:       { $ne: req.user._id }
    });

    res.json({ ...conv.toObject(), unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/conversations/group  – create a group chat
router.post('/group', auth, async (req, res) => {
  try {
    const { groupName, participantIds } = req.body;
    if (!groupName || !groupName.trim())
      return res.status(400).json({ message: 'Group name required' });
    if (!Array.isArray(participantIds) || participantIds.length < 1)
      return res.status(400).json({ message: 'At least one other participant required' });

    const participants = [req.user._id, ...participantIds];

    const conv = await Conversation.create({
      participants,
      isGroup:   true,
      groupName: groupName.trim(),
      admin:     req.user._id
    });

    const populated = await Conversation.findById(conv._id)
      .populate('participants', 'username avatar isOnline lastSeen')
      .populate('admin', 'username');

    res.status(201).json({ ...populated.toObject(), unreadCount: 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    const isMember = conv.participants.map(p => p.toString()).includes(req.user._id.toString());
    if (!isMember) return res.status(403).json({ message: 'Access denied' });

    await Message.deleteMany({ conversation: conv._id });
    await conv.deleteOne();
    res.json({ message: 'Conversation deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
