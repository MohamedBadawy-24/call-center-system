const mongoose = require("mongoose");

const AnswerSchema = new mongoose.Schema({
  questionId: String,
  value: mongoose.Schema.Types.Mixed,
});

/**
 * The Response model stores the final submitted answers for a completed (or partially completed) survey questionnaire.
 * It links back to the agent who conducted the interview and the survey it belongs to.
 */
const ResponseSchema = new mongoose.Schema({
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', required: true, index: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** completed | partial | postponed | disqualified | abandoned */
  status: {
    type: String,
    enum: ['completed', 'partial', 'postponed', 'disqualified', 'abandoned'],
    default: 'completed',
  },
  /** completed | partial | postponed → not disqualified; refused | no_qualified | not_contacted → disqualified */
  interviewOutcome: { type: String, default: "" },
  outcomeCategory: {
    type: String,
    enum: ["qualified", "postponed", "disqualified"],
    default: "qualified",
  },
  outcomeReason: { type: String, default: "" },
  /** Same clock as User.statusStartedAt when the call was submitted — used with precall gate */
  sessionStatusStartedAt: { type: Date },
  answers: [AnswerSchema],
  durationSecs: { type: Number, default: 0 },
  serialNumber: { type: String, unique: true, sparse: true },
  numberSource: { type: String, enum: ['queue', 'manual'], default: 'queue' },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  isOfflineSync: { type: Boolean, default: false },
  syncedAt: { type: Date },
  offlineStartedAt: { type: Date },
  offlineCompletedAt: { type: Date },
});

ResponseSchema.index({ agentId: 1, startedAt: -1 });
ResponseSchema.index({ serialNumber: 1, agentId: 1 });

module.exports = mongoose.model("Response", ResponseSchema);
