const mongoose = require('mongoose');
const Survey = require('../models/Survey');
const { getSurveyEligibilityState } = require('../services/precallService');
const User = require('../models/User');

exports.createSurvey = async (req, res) => {
  try {
    const survey = new Survey(req.body);
    await survey.save();
    res.json(survey);
  } catch (err) {
    console.error('Survey Creation Error:', err);
    res.status(500).json({ error: 'Failed to create survey' });
  }
};

exports.updateSurvey = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    if (survey.isActive !== false) {
      return res.status(400).json({ error: 'Cannot edit an active campaign. Please end it first.' });
    }
    Object.assign(survey, req.body);
    await survey.save();
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAllSurveys = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'agent') filter.isActive = { $ne: false };
    const surveys = await Survey.find(filter, 'title description isActive createdAt');
    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

exports.toggleSurveyStatus = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    survey.isActive = survey.isActive === undefined ? false : !survey.isActive;
    await survey.save();
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSurvey = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteSurvey = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    if (survey.isActive !== false) {
      return res.status(400).json({ error: 'Cannot delete an active campaign. Please end the campaign first.' });
    }
    const Response = require('../models/Response');
    const responseCount = await Response.countDocuments({ surveyId: req.params.id });
    if (responseCount > 0) {
      return res.status(400).json({ error: 'Cannot delete a survey that has collected responses. To hide it, ensure it is set to inactive.' });
    }

    await Survey.findByIdAndDelete(req.params.id);
    res.json({ message: 'Survey deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSurveyEligibility = async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const user = await User.findById(req.user.id);
    const { surveyId, serial } = req.query;
    const state = await getSurveyEligibilityState(user, surveyId, serial);
    res.json({
      canStartSurvey: state.canStartSurvey,
      reason: state.canStartSurvey ? undefined : state.reason,
      precallSerialNumber: state.precallSerialNumber,
      precallPayload: state.payload || {},
      existingAnswers: state.existingAnswers || {},
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getOutboundPrecall = async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Agents only' });
    }
    const { surveyId } = req.query;
    let survey;
    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
      survey = await Survey.findById(surveyId).lean();
    } else {
      survey = await Survey.findOne({ isActive: { $ne: false } }).sort({ createdAt: -1 }).lean();
    }
    if (!survey) return res.json({ surveyId: null, outboundPrecall: null, surveyTitle: null });
    res.json({
      surveyId: survey._id.toString(),
      outboundPrecall: survey.outboundPrecall || null,
      surveyTitle: survey.title || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSurveysStats = async (req, res) => {
  try {
    const stats = await Survey.aggregate([
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
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
