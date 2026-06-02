const mongoose = require("mongoose");

/**
 * The ProfileRequest model stores requests submitted by an Agent to change their
 * personal information (like name or email). These requests sit in a "pending"
 * state until an Admin reviews and approves/rejects them.
 */
const ProfileRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['name', 'email'],
    required: true
  },
  requestedValue: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  adminNote: {
    type: String
  },
  resolvedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

ProfileRequestSchema.index({ status: 1, createdAt: -1 });
ProfileRequestSchema.index({ userId: 1, type: 1, status: 1 });

module.exports = mongoose.model("ProfileRequest", ProfileRequestSchema);
