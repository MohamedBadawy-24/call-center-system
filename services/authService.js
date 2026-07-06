const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ProfileRequest = require('../models/ProfileRequest');
const StatusLog = require('../models/StatusLog');
const sendEmail = require('../utils/mailer');
const { computePrecallCompletedForSession } = require('./precallService');
const { runTransaction } = require('../utils/runTransaction');

const env = require('../config/env');

const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const validatePassword = (password) => {
  const regex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@_\-.])[a-zA-Z\d@_\-.]{8,}$/;
  if (!regex.test(password)) {
    return 'Password must be at least 8 characters long, contain letters, a number, and AT LEAST ONE allowed symbol (@, -, _, .). No other symbols are allowed!';
  }
  return null;
};

const signToken = (payload) =>
  new Promise((resolve, reject) => {
    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) return reject(new Error('JWT_SECRET missing'));
    jwt.sign(payload, jwtSecret, { expiresIn: '8h' }, (err, token) => {
      if (err) reject(err);
      else resolve(token);
    });
  });

exports.hasUsers = async () => {
  const count = await User.countDocuments();
  return count > 0;
};

exports.register = async (data, requestingUserId = null) => {
  const { name, email, password, role, researcherCode } = data;
  const userCount = await User.countDocuments();
  let finalRole = role || 'agent';

  if (userCount > 0) {
    if (!requestingUserId) {
      throw createError('Unauthorized', 401);
    }
    const requestingUser = await User.findById(requestingUserId).select('role');
    if (!requestingUser || requestingUser.role !== 'admin') {
      throw createError('Only admins can register users', 403);
    }
  } else {
    finalRole = 'admin';
  }

  const existing = await User.findOne({ email });
  if (existing) throw createError('User already exists', 400);

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  
  await User.create({
    name,
    email,
    password: hashedPassword,
    role: finalRole,
    researcherCode: researcherCode ? String(researcherCode).trim() : null
  });
};

exports.login = async (email, password) => {
  const user = await User.findOne({ email });
  if (!user) throw createError('Invalid credentials', 400);

  if (user.suspended) {
    throw createError('Your account has been temporarily suspended. Please contact your quality supervisor.', 403);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw createError('Invalid credentials', 400);

  const payload = {
    id: user._id,
    name: user.name,
    role: user.role,
    researcherCode: user.researcherCode,
  };

  if (user.role !== 'admin') {
    const now = new Date();
    await runTransaction(async (session) => {
      const lastLog = await StatusLog.findOne(
        { userId: user._id, endTime: { $exists: false } }
      )
        .sort({ startTime: -1 })
        .session(session);

      if (lastLog) {
        lastLog.endTime = now;
        lastLog.durationSecs = Math.floor((now - lastLog.startTime) / 1000);
        await lastLog.save({ session });
      }

      user.currentStatus = 'preparing';
      user.statusStartedAt = now;
      user.precallCompletedForActiveSession = false;
      await user.save({ session });

      await StatusLog.create(
        [{ userId: user._id, status: 'preparing', startTime: now }],
        { session }
      );
    });

    payload.currentStatus = 'preparing';
    payload.statusStartedAt = user.statusStartedAt;
  }

  const token = await signToken(payload);
  return { token, user: payload };
};

exports.getMe = async (userId) => {
  const user = await User.findById(userId).select('-password');
  if (!user) throw createError('User no longer exists', 401);

  let precallCompletedForActiveSession = true;
  if (user.role === 'agent' && user.currentStatus === 'active') {
    precallCompletedForActiveSession = await computePrecallCompletedForSession(user);
  }

  return {
    id: user._id.toString(),
    name: user.name,
    role: user.role,
    researcherCode: user.researcherCode,
    currentStatus: user.currentStatus,
    statusStartedAt: user.statusStartedAt,
    precallCompletedForActiveSession,
  };
};

exports.forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw createError('User not found', 404);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const salt = await bcrypt.genSalt(10);
  user.resetCode = await bcrypt.hash(code, salt);
  user.resetCodeExpires = Date.now() + 5 * 60 * 1000;
  await user.save();

  try {
    await sendEmail({
      to: email,
      subject: 'Baseera System - Password Verify Code',
      text: `Hello ${user.name},\n\nYour 6-digit verification code is: ${code}\n\nIt expires in 5 minutes.`,
    });
  } catch (emailErr) {
    const logger = require('../utils/logger');
    logger.error(`[SECURITY] Email failure: ${emailErr.message}`);
    throw createError('Failed to send email. Ensure SMTP variables in .env are correct.', 500);
  }
};

exports.resetPassword = async (email, code, newPassword) => {
  const passError = validatePassword(newPassword);
  if (passError) throw createError(passError, 400);

  const user = await User.findOne({ email });
  if (!user || !user.resetCode || !user.resetCodeExpires) {
    throw createError('Invalid request', 400);
  }
  if (Date.now() > user.resetCodeExpires) {
    throw createError('Code has expired', 400);
  }

  const isMatch = await bcrypt.compare(code, user.resetCode);
  if (!isMatch) throw createError('Invalid reset code', 400);

  const isSameAsOld = await bcrypt.compare(newPassword, user.password);
  if (isSameAsOld) {
    throw createError('New password must be different from the old password.', 400);
  }

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  user.resetCode = undefined;
  user.resetCodeExpires = undefined;
  await user.save();
};

exports.updateProfile = async (userId, data) => {
  delete data.researcherCode; // Safety guard
  const { name, email, oldPassword, password } = data;
  const user = await User.findById(userId);
  if (!user) throw createError('User not found', 404);

  if (user.role === 'agent') {
    if ((name && name !== user.name) || (email && email !== user.email)) {
      throw createError('Agents must submit a change request to update their name or email.', 403);
    }
  }

  if (password) {
    const passError = validatePassword(password);
    if (passError) throw createError(passError, 400);
    if (!oldPassword) throw createError('Old password is required to set a new password.', 400);
    if (oldPassword === password) {
      throw createError('New password must be different from the old password.', 400);
    }
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) throw createError('Old password is incorrect.', 400);
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
  }

  if (name) user.name = name;
  if (email) {
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.id !== userId) {
      throw createError('Email already in use', 400);
    }
    user.email = email;
  }
  await user.save();

  const payload = {
    id: user._id,
    name: user.name,
    role: user.role,
    currentStatus: user.currentStatus,
    statusStartedAt: user.statusStartedAt,
  };
  const token = await signToken(payload);
  return { token, user: payload };
};

exports.requestProfileChange = async (userId, type, requestedValue) => {
  if (!['name', 'email'].includes(type)) throw createError('Invalid request type', 400);

  const pending = await ProfileRequest.findOne({ userId, type, status: 'pending' });
  if (pending) throw createError(`You already have a pending ${type} change request.`, 400);

  const lastApproved = await ProfileRequest.findOne({
    userId,
    type,
    status: 'approved',
  }).sort({ resolvedAt: -1 });

  if (lastApproved?.resolvedAt) {
    const cooldownPeriod = 24 * 60 * 60 * 1000;
    const timeSinceResolution = Date.now() - lastApproved.resolvedAt.getTime();
    if (timeSinceResolution < cooldownPeriod) {
      const remainingHours = Math.ceil((cooldownPeriod - timeSinceResolution) / (60 * 60 * 1000));
      throw createError(`You must wait ${remainingHours} more hours before requesting another ${type} change after an approval.`, 403);
    }
  }

  await ProfileRequest.create({ userId, type, requestedValue });
};

exports.getMyProfileRequests = async (userId) => {
  return await ProfileRequest.find({ userId }).sort({ createdAt: -1 });
};

exports.requestEmailChangeCode = async (userId, newEmail) => {
  if (!newEmail) throw createError('New email is required', 400);

  const existingUser = await User.findOne({ email: newEmail });
  if (existingUser) throw createError('Email already in use', 400);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const user = await User.findById(userId);
  const salt = await bcrypt.genSalt(10);
  user.emailVerificationCode = await bcrypt.hash(code, salt);
  user.emailVerificationExpires = Date.now() + 5 * 60 * 1000;
  await user.save();

  try {
    await sendEmail({
      to: newEmail,
      subject: 'Baseera - Email Change Verification Code',
      text: `Hello,\n\nYour 6-digit verification code to change your email to this address is: ${code}\n\nIt expires in 5 minutes.`,
    });
  } catch (emailErr) {
    const logger = require('../utils/logger');
    logger.error(`Email dispatch failure: ${emailErr.message}`);
    throw createError('Failed to send verification email. Check SMTP settings.', 500);
  }
};

exports.verifyEmailChangeCode = async (userId, code, newEmail) => {
  const user = await User.findById(userId);

  if (!user.emailVerificationCode || !user.emailVerificationExpires) {
    throw createError('No active verification request found.', 400);
  }
  if (Date.now() > user.emailVerificationExpires) {
    throw createError('Verification code has expired.', 400);
  }
  const isMatch = await bcrypt.compare(code, user.emailVerificationCode);
  if (!isMatch) throw createError('Invalid verification code.', 400);

  user.emailVerificationCode = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  const pending = await ProfileRequest.findOne({ userId, type: 'email', status: 'pending' });
  if (pending) throw createError('You already have a pending email change request.', 400);

  await ProfileRequest.create({ userId, type: 'email', requestedValue: newEmail });
};

exports.updateStatus = async (userId, status, breakReason, io) => {
  if (!['active', 'preparing', 'break', 'off-duty'].includes(status)) {
    throw createError('Invalid status', 400);
  }
  if (status === 'break' && !['Lunch', 'Meeting'].includes(breakReason)) {
    throw createError('Invalid break reason', 400);
  }

  const user = await User.findById(userId);
  if (!user || !['agent', 'quality'].includes(user.role)) {
    throw createError('Unauthorized status role', 403);
  }

  const now = new Date();
  await runTransaction(async (session) => {
    const lastLog = await StatusLog.findOne(
      { userId: user._id, endTime: { $exists: false } }
    )
      .sort({ startTime: -1 })
      .session(session);

    if (lastLog) {
      lastLog.endTime = now;
      lastLog.durationSecs = Math.floor((now - lastLog.startTime) / 1000);
      await lastLog.save({ session });
    }

    user.currentStatus = status;
    user.currentBreakReason = status === 'break' ? breakReason : null;
    user.statusStartedAt = now;
    user.precallCompletedForActiveSession = false;
    await user.save({ session });

    await StatusLog.create(
      [{
        userId: user._id,
        status,
        breakReason: status === 'break' ? breakReason : null,
        startTime: now,
      }],
      { session }
    );
  });

  if (io) io.emit('stats-update');

  let precallCompletedForActiveSession = true;
  if (user.role === 'agent' && user.currentStatus === 'active') {
    precallCompletedForActiveSession = await computePrecallCompletedForSession(user);
  }

  return {
    status: user.currentStatus,
    statusStartedAt: user.statusStartedAt,
    precallCompletedForActiveSession,
  };
};
