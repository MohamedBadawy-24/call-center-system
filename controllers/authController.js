/**
 * DIAGNOSTIC - authController.js
 * register(): extracts name, email, password, role from req.body and creates User.
 * updateProfile(): extracts name, email, oldPassword, password, updates profile.
 * Other functions: login, getMe, forgotPassword, resetPassword, etc.
 *
 * Changes:
 * - register(): Support researcherCode field in req.body.
 * - updateProfile(): Strip researcherCode from body.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ProfileRequest = require('../models/ProfileRequest');
const StatusLog = require('../models/StatusLog');
const sendEmail = require('../utils/mailer');
const { computePrecallCompletedForSession } = require('../services/precallService');
const { runTransaction } = require('../utils/runTransaction');

const validatePassword = (password) => {
  const regex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@_\-.])[a-zA-Z\d@_\-.]{8,}$/;
  if (!regex.test(password)) {
    return 'Password must be at least 8 characters long, contain letters, a number, and AT LEAST ONE allowed symbol (@, -, _, .). No other symbols are allowed!';
  }
  return null;
};

const signToken = (payload) =>
  new Promise((resolve, reject) => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return reject(new Error('JWT_SECRET missing'));
    jwt.sign(payload, jwtSecret, { expiresIn: '8h' }, (err, token) => {
      if (err) reject(err);
      else resolve(token);
    });
  });

exports.hasUsers = async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ hasUsers: count > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, role, researcherCode } = req.body;
    const userCount = await User.countDocuments();
    let finalRole = role || 'agent';

    if (userCount === 0) {
      finalRole = 'admin';
    } else {
      const tokenHeader = req.header('Authorization');
      if (!tokenHeader) return res.status(401).json({ error: 'Unauthorized' });
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) return res.status(500).json({ error: 'System configuration error: JWT_SECRET missing' });
      const decoded = jwt.verify(tokenHeader.replace('Bearer ', ''), jwtSecret);
      const requestingUser = await User.findById(decoded.id).select('role');
      if (!requestingUser || requestingUser.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can register users' });
      }
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await User.create({
      name,
      email,
      password: hashedPassword,
      role: finalRole,
      researcherCode: researcherCode ? String(researcherCode).trim() : null
    });
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    if (user.suspended) {
      return res.status(403).json({
        error: 'Your account has been temporarily suspended. Please contact your quality supervisor.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

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
    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(401).json({ error: 'User no longer exists' });

    let precallCompletedForActiveSession = true;
    if (user.role === 'agent' && user.currentStatus === 'active') {
      precallCompletedForActiveSession = await computePrecallCompletedForSession(user);
    }

    res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
        researcherCode: user.researcherCode,
        currentStatus: user.currentStatus,
        statusStartedAt: user.statusStartedAt,
        precallCompletedForActiveSession,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

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
      res.json({ message: 'Verification code sent to your email!' });
    } catch (emailErr) {
      console.error('[SECURITY] Email failure:', emailErr.message);
      res.status(500).json({ error: 'Failed to send email. Ensure SMTP variables in .env are correct.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const passError = validatePassword(newPassword);
    if (passError) return res.status(400).json({ error: passError });

    const user = await User.findOne({ email });
    if (!user || !user.resetCode || !user.resetCodeExpires) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    if (Date.now() > user.resetCodeExpires) {
      return res.status(400).json({ error: 'Code has expired' });
    }

    const isMatch = await bcrypt.compare(code, user.resetCode);
    if (!isMatch) return res.status(400).json({ error: 'Invalid reset code' });

    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return res.status(400).json({ error: 'New password must be different from the old password.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();
    res.json({ message: 'Password has been successfully changed! You may now login.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    delete req.body.researcherCode; // Safety guard: profile updates cannot modify researcherCode
    const { name, email, oldPassword, password } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'agent') {
      if ((name && name !== user.name) || (email && email !== user.email)) {
        return res.status(403).json({ error: 'Agents must submit a change request to update their name or email.' });
      }
    }

    if (password) {
      const passError = validatePassword(password);
      if (passError) return res.status(400).json({ error: passError });
      if (!oldPassword) return res.status(400).json({ error: 'Old password is required to set a new password.' });
      if (oldPassword === password) {
        return res.status(400).json({ error: 'New password must be different from the old password.' });
      }
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) return res.status(400).json({ error: 'Old password is incorrect.' });
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    if (name) user.name = name;
    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({ error: 'Email already in use' });
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
    res.json({ token, user: payload, message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.requestProfileChange = async (req, res) => {
  try {
    const { type, requestedValue } = req.body;
    if (!['name', 'email'].includes(type)) return res.status(400).json({ error: 'Invalid request type' });

    const pending = await ProfileRequest.findOne({ userId: req.user.id, type, status: 'pending' });
    if (pending) return res.status(400).json({ error: `You already have a pending ${type} change request.` });

    const lastApproved = await ProfileRequest.findOne({
      userId: req.user.id,
      type,
      status: 'approved',
    }).sort({ resolvedAt: -1 });

    if (lastApproved?.resolvedAt) {
      const cooldownPeriod = 24 * 60 * 60 * 1000;
      const timeSinceResolution = Date.now() - lastApproved.resolvedAt.getTime();
      if (timeSinceResolution < cooldownPeriod) {
        const remainingHours = Math.ceil((cooldownPeriod - timeSinceResolution) / (60 * 60 * 1000));
        return res.status(403).json({
          error: `You must wait ${remainingHours} more hours before requesting another ${type} change after an approval.`,
        });
      }
    }

    await ProfileRequest.create({ userId: req.user.id, type, requestedValue });
    res.json({ message: 'Change request submitted successfully for admin review.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMyProfileRequests = async (req, res) => {
  try {
    const requests = await ProfileRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.requestEmailChangeCode = async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ error: 'New email is required' });

    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) return res.status(400).json({ error: 'Email already in use' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const user = await User.findById(req.user.id);
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
      res.json({ message: 'Verification code sent to your new email address!' });
    } catch (emailErr) {
      console.error('Email dispatch failure:', emailErr.message);
      res.status(500).json({ error: 'Failed to send verification email. Check SMTP settings.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.verifyEmailChangeCode = async (req, res) => {
  try {
    const { code, newEmail } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.emailVerificationCode || !user.emailVerificationExpires) {
      return res.status(400).json({ error: 'No active verification request found.' });
    }
    if (Date.now() > user.emailVerificationExpires) {
      return res.status(400).json({ error: 'Verification code has expired.' });
    }
    const isMatch = await bcrypt.compare(code, user.emailVerificationCode);
    if (!isMatch) return res.status(400).json({ error: 'Invalid verification code.' });

    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    const pending = await ProfileRequest.findOne({ userId: user.id, type: 'email', status: 'pending' });
    if (pending) return res.status(400).json({ error: 'You already have a pending email change request.' });

    await ProfileRequest.create({ userId: user.id, type: 'email', requestedValue: newEmail });
    res.json({ message: 'Email verified and change request submitted to admin for review.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, breakReason } = req.body;
    if (!['active', 'preparing', 'break', 'off-duty'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (status === 'break' && !['Lunch', 'Meeting'].includes(breakReason)) {
      return res.status(400).json({ error: 'Invalid break reason' });
    }

    const user = await User.findById(req.user.id);
    if (!user || !['agent', 'quality'].includes(user.role)) {
      return res.status(403).json({ error: 'Unauthorized status role' });
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

    const io = req.app.get('io');
    if (io) io.emit('stats-update');

    let precallCompletedForActiveSession = true;
    if (user.role === 'agent' && user.currentStatus === 'active') {
      precallCompletedForActiveSession = await computePrecallCompletedForSession(user);
    }

    res.json({
      message: 'Status updated',
      status: user.currentStatus,
      statusStartedAt: user.statusStartedAt,
      precallCompletedForActiveSession,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
