const mongoose = require('mongoose');
const User = require('../models/User');
const PrecallCompletion = require('../models/PrecallCompletion');
const Survey = require('../models/Survey');
const Review = require('../models/Review');
const { runTransaction } = require('../utils/runTransaction');

const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

exports.getAgentPrecall = async (agentId, serialNumber = null) => {
  if (!mongoose.Types.ObjectId.isValid(agentId)) {
    throw createError('Invalid agent ID format', 400);
  }

  const agent = await User.findById(agentId);
  if (!agent) throw createError('Agent not found', 404);

  // Resilient Precall lookup:
  // Priority 1: Match by serialNumber (most reliable — unaffected by status changes)
  // Priority 2: Match by statusStartedAt if still active
  // Priority 3: Fall back to most recent PrecallCompletion for this agent
  let precall = null;
  if (typeof serialNumber === 'string' && serialNumber.trim()) {
    precall = await PrecallCompletion.findOne({ userId: agentId, serialNumber: { $eq: String(serialNumber).trim() } }).lean();
  }
  if (!precall && agent.statusStartedAt) {
    precall = await PrecallCompletion.findOne({
      userId: agentId,
      statusStartedAt: agent.statusStartedAt
    }).sort({ completedAt: -1 }).lean();
  }
  if (!precall) {
    precall = await PrecallCompletion.findOne({
      userId: agentId
    }).sort({ completedAt: -1 }).lean();
  }

  if (!precall) {
    return {
      precall: null,
      agentName: agent.name,
      researcherCode: agent.researcherCode || ''
    };
  }

  let precallConfig = null;
  let surveyTitle = 'Survey';
  if (precall.surveyId) {
    const survey = await Survey.findById(precall.surveyId).lean();
    if (survey) {
      surveyTitle = survey.title;
      precallConfig = survey.outboundPrecall;
    }
  }

  return {
    precall,
    surveyTitle,
    precallConfig,
    agentName: agent.name,
    researcherCode: agent.researcherCode || ''
  };
};

exports.submitAudit = async (userId, data, io) => {
  const {
    agentId,
    evaluationOutcome,
    notes,
    qualityName,
    auditorAnswers,
    shadowAnswers,
    // Frontend now explicitly sends these so we don't have to reverse-engineer them
    serialNumber: payloadSerialNumber,
    surveyId: payloadSurveyId,
  } = data;

  if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) {
    throw createError('Valid agent ID is required', 400);
  }
  if (!evaluationOutcome || !['passed', 'failed', 'needs_follow_up'].includes(evaluationOutcome)) {
    throw createError('Valid evaluation outcome is required', 400);
  }

  const agent = await User.findById(agentId);
  if (!agent) throw createError('Agent not found', 404);

  // --- Resilient PrecallCompletion lookup ---
  // Priority 1: Match by serialNumber (most reliable — unaffected by status changes)
  // Priority 2: Most recent for this agent (covers break/status-change edge cases)
  // Priority 3: null — gracefully allowed for no_phone_required campaigns
  let precall = null;
  if (typeof payloadSerialNumber === 'string' && payloadSerialNumber.trim()) {
    precall = await PrecallCompletion.findOne({ serialNumber: { $eq: String(payloadSerialNumber).trim() }, userId: agentId }).lean();
  }
  if (!precall) {
    // Fall back to most recent session regardless of current statusStartedAt
    precall = await PrecallCompletion.findOne({ userId: agentId }).sort({ completedAt: -1 }).lean();
  }

  // Resolve surveyId and serialNumber: prefer payload values, fall back to precall
  const resolvedSurveyId = payloadSurveyId || precall?.surveyId || null;
  const resolvedSerialNumber = payloadSerialNumber || precall?.serialNumber || null;

  const review = await runTransaction(async (session) => {
    const reviewDoc = new Review({
      type: 'audit',
      qualityId: userId,
      agentId,
      surveyId: resolvedSurveyId,
      serialNumber: resolvedSerialNumber,
      // precallSnapshot is null-safe: no precall = no snapshot, audit still saves
      precallSnapshot: precall
        ? {
            qualityName: qualityName || '',
            agentAnswers: precall.payload,
            auditorAnswers: auditorAnswers || null,
          }
        : { qualityName: qualityName || '', agentAnswers: null, auditorAnswers: auditorAnswers || null },
      shadowAnswers: shadowAnswers || [],
      evaluationOutcome,
      feedbackText: notes || '',
      createdAt: new Date(),
    });

    await reviewDoc.save({ session });
    return reviewDoc;
  });

  if (io) io.emit('stats-update');
  return review;
};
