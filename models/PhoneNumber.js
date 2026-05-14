const mongoose = require("mongoose");

/**
 * The PhoneNumber model represents the call queue and individual respondent targets.
 * Each document binds a specific phone number to a Survey campaign.
 * It tracks the call outcome status (e.g. 'pending', 'called', 'completed') and handles agent assignments.
 */
const PhoneNumberSchema = new mongoose.Schema({
  surveyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Survey", 
    required: true, 
    index: true 
  },
  number: { 
    type: String, 
    required: true,
    index: true
  },
  status: { 
    type: String, 
    enum: ['pending', 'called', 'completed', 'disqualified', 'postponed'], 
    default: 'pending'
  },
  outcomeReason: { type: String },
  agentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    index: true 
  },
  sessionStatusStartedAt: { type: Date },
  precallCompletionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "PrecallCompletion" 
  },
  assignedAt: { type: Date, default: Date.now },
  calledAt: { type: Date },
  serialNumber: { type: String, unique: true, sparse: true },
  createdAt: { type: Date, default: Date.now }
});

PhoneNumberSchema.index({ surveyId: 1, status: 1 });
PhoneNumberSchema.index({ agentId: 1, status: 1 });

module.exports = mongoose.model("PhoneNumber", PhoneNumberSchema);

