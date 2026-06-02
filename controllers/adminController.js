const mongoose = require('mongoose');
const User = require('../models/User');
const ProfileRequest = require('../models/ProfileRequest');
const StatusLog = require('../models/StatusLog');
const Response = require('../models/Response');
const Draft = require('../models/Draft');
const PrecallCompletion = require('../models/PrecallCompletion');
const sendEmail = require('../utils/mailer');
const { runTransaction } = require('../utils/runTransaction');

exports.listProfileRequests = async (req, res) => {
  try {
    const requests = await ProfileRequest.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.resolveProfileRequest = async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await ProfileRequest.findById(req.params.id).populate('userId');
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already resolved' });
    }

    request.status = status;
    request.adminNote = adminNote;
    request.resolvedAt = Date.now();
    await request.save();

    if (status === 'approved') {
      const user = await User.findById(request.userId._id);
      if (user) {
        if (request.type === 'name') user.name = request.requestedValue;
        if (request.type === 'email') user.email = request.requestedValue;
        await user.save();
      }
    }

    try {
      await sendEmail({
        to: request.userId.email,
        subject: `Baseera Profile Request Update: ${status.toUpperCase()}`,
        text: `Hello ${request.userId.name},\n\nYour request to change your ${request.type} to "${request.requestedValue}" has been ${status.toUpperCase()}.\n\n${adminNote ? `Admin Note: ${adminNote}\n\n` : ''}Thank you,\nBaseera Team`,
      });
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr.message);
    }

    res.json({ message: `Request successfully ${status}` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find(
      {},
      'name email role currentStatus statusStartedAt suspended createdAt'
    ).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account while logged in.' });
    }

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin account.' });
      }
    }

    await runTransaction(async (session) => {
      await ProfileRequest.deleteMany({ userId: targetId }, { session });
      await StatusLog.deleteMany({ userId: targetId }, { session });
      await Draft.deleteMany({ agentId: targetId }, { session });
      await PrecallCompletion.deleteMany({ userId: targetId }, { session });
      await Response.deleteMany({ agentId: targetId }, { session });
      await User.deleteOne({ _id: targetId }, { session });
    });

    const io = req.app.get('io');
    if (io) io.emit('stats-update');

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
