const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  isGroup:      { type: Boolean, default: false },
  groupName:    { type: String,  default: '' },
  groupAvatar:  { type: String,  default: '' },
  admin:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastMessage:  { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }
}, { timestamps: true });

// Index for fast participant lookups
conversationSchema.index({ participants: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
