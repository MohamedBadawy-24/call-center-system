const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validatePrecallComplete } = require('../middleware/validation');
const agentController = require('../controllers/agentController');

router.get('/precall-session-count', auth, agentController.getPrecallSessionCount);
router.post('/precall-complete', [auth, validatePrecallComplete], agentController.completePrecall);
router.get('/next-number', auth, agentController.getNextNumber);
router.post('/mark-number/:id', auth, agentController.markNumberCalled);
router.get('/pending-serials', auth, agentController.getPendingSerials);
router.get('/next-serial', auth, agentController.getNextSerial);
router.get('/handover-candidates', auth, agentController.listHandoverCandidates);
router.get('/search-serial/:serial', auth, agentController.searchBySerial);
router.post('/handover', auth, agentController.handoverCall);

// Proxy routes that were on /agent but belong to surveys
// (kept here for backwards-compat with front-end URLs)
const surveyController = require('../controllers/surveyController');
router.get('/outbound-precall', auth, surveyController.getOutboundPrecall);
router.get('/survey-eligibility', auth, surveyController.getSurveyEligibility);

module.exports = router;
