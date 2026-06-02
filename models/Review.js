const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  qualityId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  responseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Response' },
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey' },
  serialNumber: { type: String, index: true },
  type: { type: String, enum: ['Feedback', 'Comment', 'Flag', 'ShadowReview'], default: 'Feedback' },
  feedbackText: { type: String },
  flagged: { type: Boolean, default: false },
  flagNote: { type: String },
  seenAt: { type: Date, default: null },
  shadowAnswers: { type: Array },
  openedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Review", ReviewSchema);
