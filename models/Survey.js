const mongoose = require("mongoose");

const LogicSchema = new mongoose.Schema({
  conditionValue: String,
  action: String, // 'continue', 'terminate', 'skip'
  skipToQuestionId: String,
});

const ChoiceSchema = new mongoose.Schema({
  text: String,
  logic: LogicSchema // Added logical branching per choice
});

const QuestionSchema = new mongoose.Schema({
  questionId: { type: String, required: true }, // custom ID for logic refs
  text: String,
  script: String, // What the agent reads
  category: String, // intro, screening, demographic, main
  type: String, // text, single_choice, multiple_choice, info
  choices: [ChoiceSchema],
  visibility: { type: mongoose.Schema.Types.Mixed, default: undefined }, // Advanced nested logic
});

const SectionSchema = new mongoose.Schema({
  title: String,
  description: String,
  questions: [QuestionSchema],
});

/**
 * The Survey model holds the configuration for a campaign.
 * It defines the dynamic questions (sections and questions) for the main survey questionnaire,
 * as well as the 'outboundPrecall' configuration which powers the Agent Pre-Call Checklist.
 */
const SurveySchema = new mongoose.Schema({
  title: String,
  description: String,
  introScript: String, // Legacy; no longer edited in admin — outbound precall script replaces this for agents
  /** Optional outbound precall overrides: { fieldKey: string } — see admin-ui outboundPrecallConfig */
  outboundPrecall: { type: mongoose.Schema.Types.Mixed, default: undefined },
  sections: [SectionSchema],
  goal: { type: Number, default: 0 },
  governorateGoals: [{
    governorate: String,
    goal: Number
  }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Survey", SurveySchema);