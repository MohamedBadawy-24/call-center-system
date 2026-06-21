/**
 * DIAGNOSTIC - Review.js
 * Current fields: agentId, qualityId, responseId, surveyId, serialNumber, type,
 * feedbackText, flagged, flagNote, flagCategory, seenAt, shadowAnswers, openedAt,
 * resolved, resolvedBy, resolvedAt, createdAt.
 *
 * Changes: Add 'audit' to type enum, add precallSnapshot and evaluationOutcome fields to support Feature 5.
 */
const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  qualityId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  responseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Response' },
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey' },
  serialNumber: { type: String, index: true },
  type: { type: String, enum: ['Feedback', 'Comment', 'Flag', 'ShadowReview', 'audit'], default: 'Feedback' },
  precallSnapshot: { type: mongoose.Schema.Types.Mixed },
  evaluationOutcome: { type: String, enum: ['passed', 'failed', 'needs_follow_up'] },
  feedbackText: { type: String },
  flagged: { type: Boolean, default: false },
  flagNote: { type: String, maxlength: 500 },
  flagCategory: {
    type: String,
    enum: ['wrong_answer', 'suspicious', 'incomplete', 'coaching', 'other'],
    required: function() { return this.type === 'Flag'; }
  },
  seenAt: { type: Date, default: null },
  shadowAnswers: { type: Array },
  openedAt: { type: Date },
  resolved: { type: Boolean, default: false },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Review", ReviewSchema);
