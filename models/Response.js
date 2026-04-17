const mongoose = require("mongoose");

const AnswerSchema = new mongoose.Schema({
  questionId: String,
  value: String,
});

const ResponseSchema = new mongoose.Schema({
  surveyId: String,
  agentId: String, // who took the call
  status: { type: String, default: "completed" }, // completed, disqualified, abandoned
  answers: [AnswerSchema],
  durationSecs: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
});

module.exports = mongoose.model("Response", ResponseSchema);