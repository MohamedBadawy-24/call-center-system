const mongoose = require("mongoose");

/**
 * The PostponedSerial model specifically tracks call targets that the agent marked as "Postponed".
 * This allows the system to easily retrieve these serial numbers later so the agent can resume
 * the call with the respondent at a more convenient time.
 */
const PostponedSerialSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: "Survey" },
  statusStartedAt: { type: Date, required: true },
  serialNumber: { type: String, required: true },
  source: { type: String, enum: ["precall", "survey"], default: "precall" },
  precallCompletionId: { type: mongoose.Schema.Types.ObjectId, ref: "PrecallCompletion" },
  createdAt: { type: Date, default: Date.now },
});

PostponedSerialSchema.index({ agentId: 1, createdAt: -1 });
PostponedSerialSchema.index({ serialNumber: 1 });
PostponedSerialSchema.index({ agentId: 1, statusStartedAt: 1 });

module.exports = mongoose.model("PostponedSerial", PostponedSerialSchema);
