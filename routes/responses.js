const express = require('express');
const router = express.Router();
const { auth, staffAuth } = require('../middleware/auth');
const { validateResponseSubmit, validateSurveyId } = require('../middleware/validation');
const responseController = require('../controllers/responseController');

// Agent/Staff submit
router.post('/', [auth, validateResponseSubmit], responseController.submitResponse);

// Admin/Quality view
router.get('/', staffAuth, responseController.getResponses);
router.get('/survey/:surveyId', staffAuth, responseController.getResponsesBySurveyId);

// Exports
router.get('/export/csv/:id', [staffAuth, validateSurveyId], responseController.exportCsv);
router.get('/export/advanced', staffAuth, responseController.exportAdvanced);

module.exports = router;
