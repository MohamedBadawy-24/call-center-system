const express = require('express');
const router = express.Router();
const { auth, agentActiveAuth } = require('../middleware/auth');
const { validatePrecallComplete } = require('../middleware/validation');
const agentController = require('../controllers/agentController');
const { getSurveyEligibilityState } = require('../services/precallService');
const User = require('../models/User');

router.get('/precall-session-count', auth, agentController.getPrecallSessionCount);

router.get('/outbound-precall', auth, async (req, res) => {
  try {
    const isStaff = req.user.role === 'admin' || req.user.role === 'quality';
    if (!isStaff && req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Agents only' });
    }
    const mongoose = require('mongoose');
    const Survey = require('../models/Survey');
    const { surveyId } = req.query;
    let survey;
    if (surveyId && mongoose.Types.ObjectId.isValid(surveyId)) {
      survey = await Survey.findById(surveyId).lean();
    } else {
      survey = await Survey.findOne({ isActive: { $ne: false } }).sort({ createdAt: -1 }).lean();
    }
    if (!survey) {
      return res.json({ surveyId: null, outboundPrecall: null, surveyTitle: null });
    }
    res.json({
      surveyId: survey._id.toString(),
      outboundPrecall: survey.outboundPrecall || null,
      surveyTitle: survey.title || null,
      targetGovernorate: survey.targetGovernorate || 'All',
      numberAssignmentMode: survey.numberAssignmentMode || 'queue_only',
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/survey-eligibility', auth, async (req, res) => {
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
      payload: state.payload || {},
      existingAnswers: state.existingAnswers || {},
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/precall-complete', [auth, agentActiveAuth, validatePrecallComplete], agentController.completePrecall);
router.get('/next-serial', auth, agentController.getNextSerial);
router.get('/search-serial/:serial', auth, agentController.searchBySerial);
router.get('/draft/:serialNumber', auth, agentController.getDraft);
router.post('/draft', auth, agentController.saveDraft);
router.post('/handover', auth, agentController.handoverCall);
router.get('/next-number', agentActiveAuth, agentController.getNextNumber);
router.post('/assign-manual-number', agentActiveAuth, agentController.assignManualNumber);
router.post('/mark-number/:id', [auth, agentActiveAuth], agentController.markNumberCalled);
router.get('/pending-serials', auth, agentController.getPendingSerials);
router.get('/handover-candidates', auth, agentController.listHandoverCandidates);

module.exports = router;
