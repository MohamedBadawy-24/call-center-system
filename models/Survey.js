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
});

const SectionSchema = new mongoose.Schema({
  title: String,
  description: String,
  questions: [QuestionSchema],
});

const SurveySchema = new mongoose.Schema({
  title: String,
  description: String,
  introScript: String, // Global script
  sections: [SectionSchema],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Survey", SurveySchema);