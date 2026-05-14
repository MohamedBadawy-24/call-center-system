const mongoose = require('mongoose');

/**
 * Draft model — persists in-progress survey answers on the server.
 * Replaces the fragile localStorage approach. Keyed by agentId + serialNumber.
 * A TTL index auto-expires old drafts after 7 days so they don't accumulate forever.
 */
const DraftSchema = new mongoose.Schema({
  agentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  surveyId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', required: true },
  serialNumber: { type: String, required: true },
  answers:      { type: mongoose.Schema.Types.Mixed, default: {} },
  currentIdx:   { type: Number, default: 0 },
  updatedAt:    { type: Date, default: Date.now },
});

// Unique: one draft per agent+serial
DraftSchema.index({ agentId: 1, serialNumber: 1 }, { unique: true });

// Auto-expire drafts after 7 days of inactivity
DraftSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('Draft', DraftSchema);
