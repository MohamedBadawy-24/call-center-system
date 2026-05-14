const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  qualityId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  responseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Response' },
  type: { type: String, enum: ['Feedback', 'Comment'], default: 'Feedback' },
  feedbackText: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Review", ReviewSchema);
