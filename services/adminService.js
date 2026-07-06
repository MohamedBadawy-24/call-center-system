const mongoose = require('mongoose');
const User = require('../models/User');
const ProfileRequest = require('../models/ProfileRequest');
const StatusLog = require('../models/StatusLog');
const Response = require('../models/Response');
const Draft = require('../models/Draft');
const PrecallCompletion = require('../models/PrecallCompletion');
const sendEmail = require('../utils/mailer');
const { runTransaction } = require('../utils/runTransaction');

const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

exports.listProfileRequests = async () => {
  return await ProfileRequest.find()
    .populate('userId', 'name email')
    .sort({ createdAt: -1 });
};

exports.resolveProfileRequest = async (id, status, adminNote, io) => {
  if (!['approved', 'rejected'].includes(status)) {
    throw createError('Invalid status', 400);
  }

  const request = await ProfileRequest.findById(id).populate('userId');
  if (!request) throw createError('Request not found', 404);
  if (request.status !== 'pending') {
    throw createError('Request already resolved', 400);
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
    const logger = require('../utils/logger');
    logger.error(`Email notification failed: ${emailErr.message}`);
  }

  if (io) io.emit('stats-update');
};

exports.listUsers = async () => {
  return await User.find(
    {},
    'name email role currentStatus statusStartedAt suspended researcherCode createdAt'
  ).sort({ createdAt: -1 });
};

exports.deleteUser = async (targetId, adminId, io) => {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw createError('Invalid user id', 400);
  }
  if (String(targetId) === String(adminId)) {
    throw createError('You cannot delete your own account while logged in.', 400);
  }

  const target = await User.findById(targetId);
  if (!target) throw createError('User not found', 404);

  if (target.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      throw createError('Cannot delete the last admin account.', 400);
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

  if (io) io.emit('stats-update');
};

exports.updateResearcherCode = async (id, researcherCode, io) => {
  let finalCode = researcherCode;
  if (finalCode !== undefined && finalCode !== null) {
    finalCode = String(finalCode).trim();
    if (finalCode.length > 50) {
      throw createError('Researcher code exceeds maximum length of 50 characters', 400);
    }
    if (/[",]/.test(finalCode)) {
      throw createError('Researcher code cannot contain commas or double quotes', 400);
    }
  } else {
    finalCode = null;
  }

  const user = await User.findById(id);
  if (!user) throw createError('User not found', 404);

  user.researcherCode = finalCode;
  await user.save();

  if (io) io.emit('stats-update');
  return user;
};
