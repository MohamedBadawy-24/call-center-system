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

exports.getAgentPrecall = async (agentId) => {
  if (!mongoose.Types.ObjectId.isValid(agentId)) {
    throw createError('Invalid agent ID format', 400);
  }

  const agent = await User.findById(agentId);
  if (!agent) throw createError('Agent not found', 404);

  const precall = await PrecallCompletion.findOne({
    userId: agentId,
    statusStartedAt: agent.statusStartedAt
  }).sort({ completedAt: -1 }).lean();

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
  const { agentId, evaluationOutcome, notes, qualityName, auditorAnswers, shadowAnswers } = data;

  if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) {
    throw createError('Valid agent ID is required', 400);
  }
  if (!evaluationOutcome || !['passed', 'failed', 'needs_follow_up'].includes(evaluationOutcome)) {
    throw createError('Valid evaluation outcome is required', 400);
  }

  const agent = await User.findById(agentId);
  if (!agent) throw createError('Agent not found', 404);

  const precall = await PrecallCompletion.findOne({
    userId: agentId,
    statusStartedAt: agent.statusStartedAt
  }).sort({ completedAt: -1 });

  if (!precall) {
    throw createError('No active session precall found for this agent', 400);
  }

  const review = await runTransaction(async (session) => {
    const reviewDoc = new Review({
      type: 'audit',
      qualityId: userId,
      agentId,
      surveyId: precall.surveyId,
      serialNumber: precall.serialNumber,
      precallSnapshot: {
        qualityName: qualityName || '',
        agentAnswers: precall.payload,
        auditorAnswers: auditorAnswers || null
      },
      shadowAnswers: shadowAnswers || [],
      evaluationOutcome,
      feedbackText: notes || '',
      createdAt: new Date()
    });

    await reviewDoc.save({ session });
    return reviewDoc;
  });

  if (io) io.emit('stats-update');
  return review;
};
