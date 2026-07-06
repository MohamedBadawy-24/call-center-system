const qualityAuditService = require('../services/qualityAuditService');

exports.getAgentPrecall = async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const result = await qualityAuditService.getAgentPrecall(agentId);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.submitAudit = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const review = await qualityAuditService.submitAudit(req.user.id, req.body, io);
    res.json(review);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};
