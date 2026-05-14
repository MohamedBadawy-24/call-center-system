const mongoose = require('mongoose');
const User = require('../models/User');
const ProfileRequest = require('../models/ProfileRequest');
const StatusLog = require('../models/StatusLog');
const Response = require('../models/Response');
const PhoneNumber = require('../models/PhoneNumber');
const PrecallCompletion = require('../models/PrecallCompletion');
const Survey = require('../models/Survey');
const Review = require('../models/Review');
const SopUpdate = require('../models/SopUpdate');
const sendEmail = require('../utils/mailer');
const xlsx = require('xlsx');
const multer = require('multer');
const fs = require('fs');
const { getNextSerialNumber } = require('../services/serialService');

// ─── Users ────────────────────────────────────────────────────────────────────

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'name email role currentStatus statusStartedAt createdAt').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ error: 'Invalid user id' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account while logged in.' });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await ProfileRequest.deleteMany({ userId: targetId }, { session });
      await StatusLog.deleteMany({ userId: targetId }, { session });
      await Response.deleteMany({ agentId: targetId }, { session });
      await User.deleteOne({ _id: targetId }, { session });
      await session.commitTransaction();
    } catch (txnErr) {
      await session.abortTransaction();
      throw txnErr;
    } finally {
      session.endSession();
    }

    const io = req.app.get('io');
    if (io) io.emit('stats-update');
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Profile Requests ─────────────────────────────────────────────────────────

exports.getAllProfileRequests = async (req, res) => {
  try {
    const requests = await ProfileRequest.find().populate('userId', 'name email').sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.resolveProfileRequest = async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const request = await ProfileRequest.findById(req.params.id).populate('userId');
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already resolved' });

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

// ─── Phone Numbers ─────────────────────────────────────────────────────────────

exports.uploadNumbers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'XLSX file required' });
    const surveyId = req.params.id;
    const results = [];

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    for (const row of data) {
      const keys = Object.keys(row);
      const phoneKey = keys.find(k => {
        const lowerK = String(k).toLowerCase().trim();
        return ['number', 'phone', 'mobile', 'telephone', 'cell', 'num'].includes(lowerK);
      });

      let numberValue = phoneKey ? row[phoneKey] : null;
      if (!numberValue) {
        numberValue = Object.values(row).find(v => {
          const s = String(v).replace(/[^0-9]/g, '');
          return s.length >= 7 && s.length <= 15;
        });
      }

      if (numberValue) {
        const serial = await getNextSerialNumber('survey_numbers');
        results.push({ surveyId, number: String(numberValue).trim(), status: 'pending', serialNumber: serial });
      }
    }

    if (results.length > 0) {
      await PhoneNumber.insertMany(results, { ordered: false }).catch(err => {
        if (err.code !== 11000) console.error('InsertMany partial failure:', err.message);
      });
    }

    fs.unlinkSync(req.file.path);
    res.json({ message: `${results.length} numbers imported successfully.`, count: results.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    console.error('XLSX Import Error:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
};

exports.listNumbers = async (req, res) => {
  try {
    const list = await PhoneNumber.find({ surveyId: req.params.id }).sort({ createdAt: -1 }).limit(200);
    const [total, pending, called, qualified, disqualified, postponed] = await Promise.all([
      PhoneNumber.countDocuments({ surveyId: req.params.id }),
      PhoneNumber.countDocuments({ surveyId: req.params.id, status: 'pending' }),
      PhoneNumber.countDocuments({ surveyId: req.params.id, status: 'called' }),
      PhoneNumber.countDocuments({ surveyId: req.params.id, status: 'completed' }),
      PhoneNumber.countDocuments({ surveyId: req.params.id, status: 'disqualified' }),
      PhoneNumber.countDocuments({ surveyId: req.params.id, status: 'postponed' }),
    ]);
    res.json({ list, stats: { total, pending, called, qualified, disqualified, postponed } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch numbers' });
  }
};

exports.exportDisqualifiedNumbers = async (req, res) => {
  try {
    const disqualified = await PhoneNumber.find({ surveyId: req.params.id, status: 'disqualified' }, 'number calledAt -_id').lean();
    if (disqualified.length === 0) return res.status(404).json({ error: 'No disqualified numbers found' });

    const formattedData = disqualified.map(d => ({
      Number: d.number,
      'Called At': d.calledAt ? new Date(d.calledAt).toLocaleString() : 'N/A',
    }));
    const ws = xlsx.utils.json_to_sheet(formattedData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Disqualified');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename=disqualified_numbers_${req.params.id}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export disqualified numbers' });
  }
};

exports.clearNumbers = async (req, res) => {
  try {
    await PhoneNumber.deleteMany({ surveyId: req.params.id });
    res.json({ message: 'Numbers list cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear numbers list' });
  }
};

// ─── Analytics & Stats ─────────────────────────────────────────────────────────

exports.getAnalytics = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const analytics = await Response.aggregate([
      { $match: { completedAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalDurationSecs: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$durationSecs', 0] } },
        },
      },
      {
        $project: {
          date: '$_id',
          completed: 1,
          aht: {
            $cond: [
              { $gt: ['$completed', 0] },
              { $floor: { $divide: ['$totalDurationSecs', '$completed'] } },
              0,
            ],
          },
          _id: 0,
        },
      },
      { $sort: { date: 1 } },
    ]);

    res.json(analytics);
  } catch (err) {
    console.error('Analytics Error:', err);
    res.status(500).json({ error: 'Server Error' });
  }
};

exports.getAgentStats = async (req, res) => {
  try {
    const filter = (req.user.role === 'admin' || req.user.role === 'quality')
      ? { role: { $in: ['agent', 'quality'] } }
      : { _id: new mongoose.Types.ObjectId(req.user.id) };

    const stats = await User.aggregate([
      { $match: filter },
      { $addFields: { _idStr: { $toString: '$_id' } } },
      { $lookup: { from: 'responses', localField: '_idStr', foreignField: 'agentId', as: 'responses' } },
      { $lookup: { from: 'precallcompletions', localField: '_id', foreignField: 'userId', as: 'precalls' } },
      { $lookup: { from: 'reviews', localField: '_id', foreignField: 'qualityId', as: 'reviews' } },
      {
        $project: {
          agentName: '$name',
          agentEmail: '$email',
          role: '$role',
          currentStatus: 1,
          statusStartedAt: 1,
          totalSurveys: { $size: '$precalls' },
          totalReviews: { $size: '$reviews' },
          completed: { $size: { $filter: { input: '$responses', as: 'r', cond: { $eq: ['$$r.status', 'completed'] } } } },
          disqualified: { $size: { $filter: { input: '$precalls', as: 'p', cond: { $eq: ['$$p.disqualified', true] } } } },
          totalDurationSecs: { $sum: '$responses.durationSecs' },
        },
      },
      { $sort: { completed: -1 } },
    ]);

    res.json(stats);
  } catch (err) {
    console.error('Stats Aggregation Error:', err);
    res.status(500).json({ error: 'Server Error' });
  }
};

// ─── Reviews ─────────────────────────────────────────────────────────────────

exports.getReviews = async (req, res) => {
  try {
    const reviews = await Review.find().populate('agentId', 'name email').populate('qualityId', 'name email').sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

exports.createReview = async (req, res) => {
  try {
    const { agentId, type, feedbackText } = req.body;
    if (!feedbackText) return res.status(400).json({ error: 'Feedback text is required' });
    const reviewData = { qualityId: req.user.id, feedbackText, type: type || 'Feedback' };

    if (agentId && agentId !== 'none') {
      const targetUser = await User.findById(agentId);
      if (!targetUser) return res.status(404).json({ error: 'User not found' });
      if (req.user.role === 'quality' && targetUser.role === 'admin') {
        return res.status(403).json({ error: 'Quality accounts cannot submit feedback for Admins.' });
      }
      reviewData.agentId = agentId;
    }

    const review = new Review(reviewData);
    await review.save();
    const io = req.app.get('io');
    if (io) io.emit('stats-update');
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create review' });
  }
};

exports.markReviewsSeen = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.lastSeenFeedbackAt = new Date();
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update seen status' });
  }
};

exports.getUnseenReviewCount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const lastSeen = user.lastSeenFeedbackAt || new Date(0);
    const count = await Review.countDocuments({ createdAt: { $gt: lastSeen }, qualityId: { $ne: user._id } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unseen count' });
  }
};

// ─── SOPs ─────────────────────────────────────────────────────────────────────

exports.getSops = async (req, res) => {
  try {
    const sops = await SopUpdate.find().populate('createdBy', 'name role').sort({ createdAt: -1 });
    res.json(sops);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SOP updates' });
  }
};

exports.createSop = async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
    const sop = new SopUpdate({ title, content, createdBy: req.user.id });
    await sop.save();
    res.json(sop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create SOP update' });
  }
};

exports.markSopsSeen = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.lastSeenSopAt = new Date();
    await user.save();
    res.json({ success: true, lastSeenSopAt: user.lastSeenSopAt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update seen status' });
  }
};

exports.getUnseenSopCount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const lastSeen = user.lastSeenSopAt || new Date(0);
    const count = await SopUpdate.countDocuments({ createdAt: { $gt: lastSeen } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unseen count' });
  }
};

// ─── Settings ─────────────────────────────────────────────────────────────────

exports.getDailyGoal = async (req, res) => {
  try {
    // Access SystemSetting via the app-level model reference
    const SystemSetting = req.app.get('SystemSetting');
    const setting = await SystemSetting.findOne({ key: 'dailyGoal' });
    res.json({ dailyGoal: setting ? setting.value : 50 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily goal' });
  }
};

exports.setDailyGoal = async (req, res) => {
  try {
    const { dailyGoal } = req.body;
    if (typeof dailyGoal !== 'number') return res.status(400).json({ error: 'Invalid daily goal' });
    const SystemSetting = req.app.get('SystemSetting');
    await SystemSetting.findOneAndUpdate({ key: 'dailyGoal' }, { value: dailyGoal }, { upsert: true, returnDocument: 'after' });
    res.json({ success: true, dailyGoal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save daily goal' });
  }
};

// ─── Users List (Staff) ────────────────────────────────────────────────────────

exports.getUsersList = async (req, res) => {
  try {
    const users = await User.find({}, 'name email role').lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
};
