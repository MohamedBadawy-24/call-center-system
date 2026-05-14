const mongoose = require("mongoose");

/**
 * The PrecallCompletion model acts as the data vault for the Pre-Call Checklist phase.
 * It stores operational logistics like phone type, interview outcomes (if failed/postponed),
 * and agent notes *before* the respondent enters the main survey questionnaire.
 */
const PrecallCompletionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  statusStartedAt: { type: Date, required: true },
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: "Survey" },
  completedAt: { type: Date, default: Date.now },
  interviewDate: { type: String, default: "" },
  interviewStartedAt: { type: Date },
  interviewStartDisplay: { type: String, default: "" },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  interviewOutcome: { type: String, default: "" },
  /** qualified: completed/partial; postponed; disqualified: refused / no_qualified / not_contacted */
  outcomeCategory: {
    type: String,
    enum: ["qualified", "postponed", "disqualified"],
    default: "qualified",
  },
  outcomeReason: { type: String, default: "" },
  disqualified: { type: Boolean, default: false },
  under18NotQualified: { type: Boolean, default: false },
  serialNumber: { type: String, unique: true, sparse: true },
});

PrecallCompletionSchema.index({ userId: 1, statusStartedAt: 1, completedAt: -1 });
PrecallCompletionSchema.index({ serialNumber: 1, userId: 1 });

module.exports = mongoose.model("PrecallCompletion", PrecallCompletionSchema);
