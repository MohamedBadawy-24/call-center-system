/**
 * DIAGNOSTIC - qualityAuditController.js
 * Controller handling Quality audits of agent precall logs.
 *
 * Functions:
 * - getAgentPrecall(): retrieves an agent's latest active session precall data.
 * - submitAudit(): creates a Review of type 'audit' wrapping the precall payload, outcome, and notes.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const PrecallCompletion = require('../models/PrecallCompletion');
const Survey = require('../models/Survey');
const Review = require('../models/Review');
const { runTransaction } = require('../utils/runTransaction');

// GET /quality/agent-precall/:agentId
exports.getAgentPrecall = async (req, res) => {
  try {
    const { agentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID format' });
    }

    const agent = await User.findById(agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Find the latest PrecallCompletion for this agent's active session
    const precall = await PrecallCompletion.findOne({
      userId: agentId,
      statusStartedAt: agent.statusStartedAt
    }).sort({ completedAt: -1 }).lean();

    if (!precall) {
      return res.json({
        precall: null,
        agentName: agent.name,
        researcherCode: agent.researcherCode || ''
      });
    }

    // Fetch associated survey/precall config
    let precallConfig = null;
    let surveyTitle = 'Survey';
    if (precall.surveyId) {
      const survey = await Survey.findById(precall.surveyId).lean();
      if (survey) {
        surveyTitle = survey.title;
        precallConfig = survey.outboundPrecall;
      }
    }

    res.json({
      precall,
      surveyTitle,
      precallConfig,
      agentName: agent.name,
      researcherCode: agent.researcherCode || ''
    });
  } catch (err) {
    console.error('Get agent precall error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /quality/audit
exports.submitAudit = async (req, res) => {
  try {
    const { agentId, evaluationOutcome, notes, qualityName, auditorAnswers, shadowAnswers } = req.body;

    if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({ error: 'Valid agent ID is required' });
    }
    if (!evaluationOutcome || !['passed', 'failed', 'needs_follow_up'].includes(evaluationOutcome)) {
      return res.status(400).json({ error: 'Valid evaluation outcome is required' });
    }

    const agent = await User.findById(agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Find latest precall for this session
    const precall = await PrecallCompletion.findOne({
      userId: agentId,
      statusStartedAt: agent.statusStartedAt
    }).sort({ completedAt: -1 });

    if (!precall) {
      return res.status(400).json({ error: 'No active session precall found for this agent' });
    }

    const review = await runTransaction(async (session) => {
      const reviewDoc = new Review({
        type: 'audit',
        qualityId: req.user.id,
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

    // Broadcast update after successful commit
    const io = req.app.get('io');
    if (io) io.emit('stats-update');

    res.json(review);
  } catch (err) {
    console.error('Submit quality audit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
