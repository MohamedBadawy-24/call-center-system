const agentService = require('../services/agentService');

exports.getPrecallSessionCount = async (req, res, next) => {
  try {
    const count = await agentService.getPrecallSessionCount(req.user.id, req.user.role);
    res.json({ count });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.completePrecall = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const serialNumber = await agentService.completePrecall(req.user.id, req.user.role, req.body, io);
    res.json({ ok: true, serialNumber });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.startNoPhoneSession = async (req, res, next) => {
  try {
    const { surveyId } = req.body;
    const io = req.app.get('io');
    const serialNumber = await agentService.startNoPhoneSession(req.user.id, req.user.role, surveyId, io);
    res.json({ ok: true, serialNumber });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getNextNumber = async (req, res, next) => {
  try {
    const { governorate, surveyId } = req.query;
    const number = await agentService.getNextNumber(req.user.id, req.user.role, governorate, surveyId);
    res.json(number);
  } catch (err) {
    next(err);
  }
};

exports.markNumberCalled = async (req, res, next) => {
  try {
    const { status } = req.body;
    const number = await agentService.markNumberCalled(req.params.id, req.user.id, req.user.role, status);
    res.json(number);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getPendingSerials = async (req, res, next) => {
  try {
    const serials = await agentService.getPendingSerials(req.user.id, req.user.role);
    res.json(serials);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getNextSerial = async (req, res, next) => {
  try {
    const result = await agentService.getNextSerial();
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.listHandoverCandidates = async (req, res, next) => {
  try {
    const rows = await agentService.listHandoverCandidates(req.user.id, req.user.role);
    res.json(rows);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.searchBySerial = async (req, res, next) => {
  try {
    const { serial } = req.params;
    const result = await agentService.searchBySerial(serial, req.user.id, req.user.role);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.handoverCall = async (req, res, next) => {
  try {
    const { serialNumber, targetAgentId } = req.body;
    const io = req.app.get('io');
    const targetAgentName = await agentService.handoverCall(req.user.id, targetAgentId, serialNumber, io);
    res.json({ message: `Successfully handed over to ${targetAgentName}` });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.saveDraft = async (req, res, next) => {
  try {
    const { surveyId, serialNumber, answers, currentIdx } = req.body;
    const draft = await agentService.saveDraft(req.user.id, surveyId, serialNumber, answers, currentIdx);
    res.json({ success: true, draft });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getDraft = async (req, res, next) => {
  try {
    const { serialNumber } = req.params;
    const result = await agentService.getDraft(req.user.id, serialNumber);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.assignManualNumber = async (req, res, next) => {
  try {
    const { surveyId, number, governorate } = req.body;
    const newPhoneDoc = await agentService.assignManualNumber(req.user.id, req.user.role, surveyId, number, governorate);
    res.json(newPhoneDoc);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};
