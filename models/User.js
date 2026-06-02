const mongoose = require("mongoose");

/**
 * The User model represents an employee in the call center system.
 * It handles authentications and role-based access for agents, admins, and quality control staff.
 * It also tracks their current working status (active, on break, etc.).
 */
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['agent', 'admin', 'quality'], default: 'agent' },
  resetCode: { type: String },
  resetCodeExpires: { type: Date },
  emailVerificationCode: { type: String },
  emailVerificationExpires: { type: Date },
  currentStatus: { type: String, enum: ['active', 'preparing', 'break', 'off-duty'], default: 'off-duty' },
  currentBreakReason: { type: String, enum: ['Lunch', 'Meeting'], default: null },
  statusStartedAt: { type: Date, default: Date.now },
  lastSeenSopAt: { type: Date, default: Date.now },
  lastSeenFeedbackAt: { type: Date, default: Date.now },
  precallCompletedForActiveSession: { type: Boolean, default: false },
  suspended: { type: Boolean, default: false },
  suspendedReason: { type: String },
  createdAt: { type: Date, default: Date.now },
});

UserSchema.index({ role: 1, currentStatus: 1 });

module.exports = mongoose.model("User", UserSchema);
