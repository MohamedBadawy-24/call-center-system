const mongoose = require('mongoose');
const Draft = require('../models/Draft');

/**
 * GET /drafts/:serial
 * Returns the saved draft for the authenticated agent + serial number.
 */
exports.getDraft = async (req, res) => {
  try {
    const { serial } = req.params;
    if (!serial || !serial.trim()) return res.json(null);

    const draft = await Draft.findOne({
      agentId: req.user.id,
      serialNumber: serial.trim(),
    }).lean();

    res.json(draft || null);
  } catch (err) {
    console.error('Get Draft Error:', err);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
};

/**
 * POST /drafts
 * Upserts a draft for the authenticated agent.
 * Body: { surveyId, serialNumber, answers, currentIdx }
 */
exports.saveDraft = async (req, res) => {
  try {
    const { surveyId, serialNumber, answers, currentIdx } = req.body;

    if (!serialNumber || !serialNumber.trim()) {
      return res.status(400).json({ error: 'serialNumber is required' });
    }
    if (!surveyId || !mongoose.Types.ObjectId.isValid(surveyId)) {
      return res.status(400).json({ error: 'Valid surveyId is required' });
    }

    const draft = await Draft.findOneAndUpdate(
      { agentId: req.user.id, serialNumber: serialNumber.trim() },
      {
        $set: {
          surveyId,
          answers: answers || {},
          currentIdx: typeof currentIdx === 'number' ? currentIdx : 0,
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after', new: true }
    );

    res.json({ ok: true, draft });
  } catch (err) {
    console.error('Save Draft Error:', err);
    res.status(500).json({ error: 'Failed to save draft' });
  }
};

/**
 * DELETE /drafts/:serial
 * Deletes a saved draft after a survey is submitted or abandoned.
 */
exports.deleteDraft = async (req, res) => {
  try {
    const { serial } = req.params;
    await Draft.deleteOne({ agentId: req.user.id, serialNumber: serial });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete Draft Error:', err);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
};
