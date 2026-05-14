const bcrypt = require("bcryptjs");
const User = require("../models/User");
const StatusLog = require("../models/StatusLog");

/**
 * Validates password strength based on system rules.
 */
const validatePasswordStrength = (password) => {
  const regex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@_\-.])[a-zA-Z\d@_\-.]{8,}$/;
  if (!regex.test(password)) {
    return "Password must be at least 8 characters long, contain letters, a number, and AT LEAST ONE allowed symbol (@, -, _, .). No other symbols are allowed!";
  }
  return null;
};

/**
 * Handles the logic for closing old status logs and opening new ones when status changes.
 */
async function transitionUserStatus(user, newStatus, breakReason = null) {
  const now = new Date();
  
  // Close any current open logs
  const lastLog = await StatusLog.findOne({ 
    userId: user._id, 
    endTime: { $exists: false } 
  }).sort({ startTime: -1 });

  if (lastLog) {
    lastLog.endTime = now;
    lastLog.durationSecs = Math.floor((now - lastLog.startTime) / 1000);
    await lastLog.save();
  }

  // Update user model
  user.currentStatus = newStatus;
  user.statusStartedAt = now;
  if (newStatus === 'break') {
    user.currentBreakReason = breakReason;
  } else {
    user.currentBreakReason = null;
  }
  await user.save();

  // Create new log entry
  const newLog = new StatusLog({
    userId: user._id,
    status: newStatus,
    breakReason: newStatus === 'break' ? breakReason : null,
    startTime: now
  });
  await newLog.save();

  return { status: newStatus, statusStartedAt: now };
}

module.exports = {
  validatePasswordStrength,
  transitionUserStatus
};
