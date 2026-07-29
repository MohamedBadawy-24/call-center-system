/**
 * DIAGNOSTIC - Survey.js
 * Current schemas: LogicSchema, ChoiceSchema, QuestionSchema, SectionSchema, SurveySchema.
 * Current fields in QuestionSchema: questionId, text, script, category, type, choices, allowOther,
 * allowMultipleOther, minSelections, maxSelections, visibility.
 *
 * Changes: Add required field to QuestionSchema (Boolean, default: false) to support Feature 6.
 */
const mongoose = require("mongoose");

const LogicSchema = new mongoose.Schema({
  conditionValue: String,
  action: String, // 'continue', 'terminate', 'skip'
  skipToQuestionId: String,
});

const ChoiceSchema = new mongoose.Schema({
  text: String,
  value: String, // export code — exported instead of label text when set (optional)
  logic: LogicSchema // Added logical branching per choice
});

const QuestionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: function() {
      return this.type !== 'group';
    }
  }, // custom ID for logic refs
  required: { type: Boolean, default: false },
  optional: { type: Boolean, default: false },
  text: String,
  script: String, // What the agent reads
  category: String, // intro, screening, demographic, main
  type: String, // text, single_choice, multiple_choice, number, number_ratio, info, multi_input, ranking, group
  choices: [ChoiceSchema],
  allowOther: { type: Boolean, default: false },
  allowMultipleOther: { type: Boolean, default: false },
  minSelections: { type: Number },
  maxSelections: { type: Number },
  minLength: { type: Number },
  maxLength: { type: Number },
  visibility: { type: mongoose.Schema.Types.Mixed, default: undefined }, // Advanced nested logic
  
  // Cross-Question Validation (e.g. Sum of inputs must equal another question's answer)
  crossValidation: {
    targetQuestionIds: [{ type: String }],
    ruleType: { type: String, enum: ['sum_equals'] },
    errorMessage: String,
  },

  // For multi_input type
  subInputs: [{
    id: String,
    label: String,
    inputType: { type: String, enum: ['short_text', 'number', 'date', 'dropdown', 'choice'] },
    options: [String],
    required: { type: Boolean, default: false }
  }],

  // Group properties (if type === 'group')
  groupId: String,
  label: String,
});

QuestionSchema.add({
  questions: [QuestionSchema]
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
  layoutMode: { type: String, enum: ['single', 'multi'], default: 'single' },
  goal: { type: Number, default: 0 },
  targetGovernorate: { type: String, default: 'All' },
  governorateGoals: [{
    governorate: String,
    goal: Number
  }],
  numberAssignmentMode: { type: String, enum: ['queue_only', 'queue_then_manual', 'manual_allowed', 'no_phone_required'], default: 'queue_only' },
  targetAudience: { type: String, enum: ['agent', 'quality', 'both'], default: 'both' },
  linkedCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', default: null },
  comparisonMatchField: { type: String, default: 'serialNumber' },
  groups: [{
    label: String,
    questionIds: [String]
  }],
  assignedAgents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
  draftData: { type: mongoose.Schema.Types.Mixed, default: undefined },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Survey", SurveySchema);