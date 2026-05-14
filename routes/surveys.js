const express = require('express');
const router = express.Router();
const { auth, adminAuth, staffAuth } = require('../middleware/auth');
const { validateSurveyId } = require('../middleware/validation');
const surveyController = require('../controllers/surveyController');

// Admin-only CRUD
router.post('/', adminAuth, surveyController.createSurvey);
router.put('/:id', [adminAuth, validateSurveyId], surveyController.updateSurvey);
router.put('/:id/toggle', [adminAuth, validateSurveyId], surveyController.toggleSurveyStatus);
router.delete('/:id', [adminAuth, validateSurveyId], surveyController.deleteSurvey);

// Staff
router.get('/stats', staffAuth, surveyController.getSurveysStats);

// Auth required (agents get only active)
router.get('/', auth, surveyController.getAllSurveys);
router.get('/:id', [auth, validateSurveyId], surveyController.getSurvey);

// Precall / Eligibility (agent-facing)
router.get('/agent/outbound-precall', auth, surveyController.getOutboundPrecall);
router.get('/agent/eligibility', auth, surveyController.getSurveyEligibility);

module.exports = router;
