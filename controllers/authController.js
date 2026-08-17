const jwt = require('jsonwebtoken');
const authService = require('../services/authService');

exports.hasUsers = async (req, res, next) => {
  try {
    const hasUsers = await authService.hasUsers();
    res.json({ hasUsers });
  } catch (err) {
    next(err);
  }
};

exports.register = async (req, res, next) => {
  try {
    let requestingUserId = null;
    const hasUsers = await authService.hasUsers();
    
    if (hasUsers) {
      const tokenHeader = req.header('Authorization');
      if (!tokenHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return res.status(500).json({ error: 'System configuration error: JWT_SECRET missing' });
      }
      const decoded = jwt.verify(tokenHeader.replace('Bearer ', ''), jwtSecret);
      requestingUserId = decoded.id;
    }

    await authService.register(req.body, requestingUserId);
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const User = require('../models/User');
    // Nuclear Logout: aggressively wipe active session trackers
    await User.findByIdAndUpdate(req.user.id, {
      $set: { 
        precallCompletedForActiveSession: false,
        currentStatus: 'off-duty'
      }
    });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const result = await authService.getMe(req.user.id);
    res.json({ user: result });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);
    res.json({ message: 'Verification code sent to your email!' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;
    await authService.resetPassword(email, code, newPassword);
    res.json({ message: 'Password has been successfully changed! You may now login.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const result = await authService.updateProfile(req.user.id, req.body);
    res.json({ 
      token: result.token, 
      user: result.user, 
      message: 'Profile updated successfully' 
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.requestProfileChange = async (req, res, next) => {
  try {
    const { type, requestedValue } = req.body;
    await authService.requestProfileChange(req.user.id, type, requestedValue);
    res.json({ message: 'Change request submitted successfully for admin review.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.getMyProfileRequests = async (req, res, next) => {
  try {
    const requests = await authService.getMyProfileRequests(req.user.id);
    res.json(requests);
  } catch (err) {
    next(err);
  }
};

exports.requestEmailChangeCode = async (req, res, next) => {
  try {
    const { newEmail } = req.body;
    await authService.requestEmailChangeCode(req.user.id, newEmail);
    res.json({ message: 'Verification code sent to your new email address!' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.verifyEmailChangeCode = async (req, res, next) => {
  try {
    const { code, newEmail } = req.body;
    await authService.verifyEmailChangeCode(req.user.id, code, newEmail);
    res.json({ message: 'Email verified and change request submitted to admin for review.' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status, breakReason } = req.body;
    const io = req.app.get('io');
    const result = await authService.updateStatus(req.user.id, status, breakReason, io);
    res.json({
      message: 'Status updated',
      status: result.status,
      statusStartedAt: result.statusStartedAt,
      precallCompletedForActiveSession: result.precallCompletedForActiveSession,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
};
