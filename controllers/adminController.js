const adminService = require('../services/adminService');

exports.listProfileRequests = async (req, res, next) => {
  try {
    const requests = await adminService.listProfileRequests();
    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.resolveProfileRequest = async (req, res, next) => {
  try {
    const { status, adminNote } = req.body;
    const io = req.app.get('io');
    await adminService.resolveProfileRequest(req.params.id, status, adminNote, io);
    res.json({ message: `Request successfully ${status}` });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.listUsers = async (req, res, next) => {
  try {
    const users = await adminService.listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const io = req.app.get('io');
    await adminService.deleteUser(targetId, req.user.id, io);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.updateResearcherCode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { researcherCode } = req.body;
    const io = req.app.get('io');
    const user = await adminService.updateResearcherCode(id, researcherCode, io);
    res.json(user);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.forceClearAgentSession = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const { id } = req.params;
    await User.findByIdAndUpdate(id, {
      $set: {
        precallCompletedForActiveSession: false,
        currentStatus: 'off-duty'
      }
    });
    const io = req.app.get('io');
    if (io) {
      io.emit('stats-update');
    }
    res.json({ message: "Agent session forcefully cleared." });
  } catch (err) {
    next(err);
  }
};

exports.unlockResponseEdit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const io = req.app.get('io');
    const response = await adminService.unlockResponseEdit(id, io);
    res.json({ ok: true, responseId: response._id, isEditUnlocked: response.isEditUnlocked });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};
