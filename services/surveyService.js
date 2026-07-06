const mongoose = require('mongoose');
const Survey = require('../models/Survey');
const User = require('../models/User');
const { getSurveyEligibilityState } = require('./precallService');

const createError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

exports.createSurvey = async (data) => {
  const survey = new Survey(data);
  await survey.save();
  return survey;
};

exports.updateSurvey = async (surveyId, data) => {
  const survey = await Survey.findById(surveyId);
  if (!survey) throw createError('Survey not found', 404);
  if (survey.isActive !== false) {
    throw createError('Cannot edit an active campaign. Please end it first.', 400);
  }
  Object.assign(survey, data);
  await survey.save();
  return survey;
};

exports.getAllSurveys = async (userRole) => {
  let filter = {};
  if (userRole === 'agent') {
    filter.isActive = { $ne: false };
    filter.$or = [
      { targetAudience: { $in: ['agent', 'both'] } },
      { targetAudience: { $exists: false } },
      { targetAudience: null }
    ];
  } else if (userRole === 'quality') {
    filter.isActive = { $ne: false };
    filter.$or = [
      { targetAudience: { $in: ['quality', 'both'] } },
      { targetAudience: { $exists: false } },
      { targetAudience: null }
    ];
  }
  return await Survey.find(filter, 'title description isActive createdAt').sort({ createdAt: -1 });
};

exports.toggleSurveyStatus = async (surveyId) => {
  const survey = await Survey.findById(surveyId);
  if (!survey) throw createError('Survey not found', 404);
  survey.isActive = survey.isActive === undefined ? false : !survey.isActive;
  await survey.save();
  return survey;
};

exports.getSurvey = async (surveyId) => {
  const survey = await Survey.findById(surveyId);
  if (!survey) throw createError('Survey not found', 404);
  return survey;
};

exports.deleteSurvey = async (surveyId) => {
  const survey = await Survey.findById(surveyId);
  if (!survey) throw createError('Survey not found', 404);
  if (survey.isActive !== false) {
    throw createError('Cannot delete an active campaign. Please end the campaign first.', 400);
  }

  await Survey.findByIdAndDelete(surveyId);
};

exports.getSurveyEligibility = async (userId, userRole, surveyId, serial) => {
  const isStaff = userRole === 'admin' || userRole === 'quality';
  if (!isStaff && userRole !== 'agent') {
    throw createError('Unauthorized', 403);
  }
  const user = await User.findById(userId);
  const state = await getSurveyEligibilityState(user, surveyId, serial);
  return {
    canStartSurvey: state.canStartSurvey,
    reason: state.canStartSurvey ? undefined : state.reason,
    precallSerialNumber: state.precallSerialNumber,
    precallPayload: state.payload || {},
    existingAnswers: state.existingAnswers || {},
  };
};

exports.getOutboundPrecall = async (userRole, surveyId) => {
  const isStaff = userRole === 'admin' || userRole === 'quality';
  if (!isStaff && userRole !== 'agent') {
    throw createError('Agents only', 403);
  }
  
  let survey;
  if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
    survey = await Survey.findById(surveyId).lean();
  } else {
    survey = await Survey.findOne({ isActive: { $ne: false } }).sort({ createdAt: -1 }).lean();
  }
  
  if (!survey) return { surveyId: null, outboundPrecall: null, surveyTitle: null };
  return {
    surveyId: survey._id.toString(),
    outboundPrecall: survey.outboundPrecall || null,
    surveyTitle: survey.title || null,
  };
};

exports.getSurveysStats = async () => {
  return await Survey.aggregate([
    {
      $lookup: {
        from: 'responses',
        localField: '_id',
        foreignField: 'surveyId',
        as: 'responses',
      },
    },
    {
      $lookup: {
        from: 'precallcompletions',
        localField: '_id',
        foreignField: 'surveyId',
        as: 'precalls',
      },
    },
    {
      $project: {
        title: 1,
        isActive: 1,
        createdAt: 1,
        totalHandled: { $size: '$precalls' },
        completed: {
          $size: {
            $filter: { input: '$responses', as: 'r', cond: { $eq: ['$$r.status', 'completed'] } },
          },
        },
        disqualified: {
          $size: {
            $filter: { input: '$precalls', as: 'p', cond: { $eq: ['$$p.disqualified', true] } },
          },
        },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);
};
