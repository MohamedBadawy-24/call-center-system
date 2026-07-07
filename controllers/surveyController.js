const surveyService = require('../services/surveyService');

exports.createSurvey = async (req, res, next) => {
  try {
    const survey = await surveyService.createSurvey(req.body);
    res.json(survey);
  } catch (err) {
    console.error('Survey Creation Error:', err);
    res.status(500).json({ error: 'Failed to create survey' });
  }
};

exports.updateSurvey = async (req, res, next) => {
  try {
    const survey = await surveyService.updateSurvey(req.params.id, req.body);
    res.json(survey);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getAllSurveys = async (req, res, next) => {
  try {
    const surveys = await surveyService.getAllSurveys(req.user.role, req.user._id);
    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
};

exports.toggleSurveyStatus = async (req, res, next) => {
  try {
    const survey = await surveyService.toggleSurveyStatus(req.params.id);
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSurvey = async (req, res, next) => {
  try {
    const survey = await surveyService.getSurvey(req.params.id);
    res.json(survey);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.deleteSurvey = async (req, res, next) => {
  try {
    await surveyService.deleteSurvey(req.params.id);
    res.json({ message: 'Survey deleted successfully.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getSurveyEligibility = async (req, res, next) => {
  try {
    const { surveyId, serial } = req.query;
    const eligibility = await surveyService.getSurveyEligibility(req.user.id, req.user.role, surveyId, serial);
    res.json(eligibility);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getOutboundPrecall = async (req, res, next) => {
  try {
    const { surveyId } = req.query;
    const precall = await surveyService.getOutboundPrecall(req.user.role, surveyId, req.user._id);
    res.json(precall);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getSurveysStats = async (req, res, next) => {
  try {
    const stats = await surveyService.getSurveysStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
