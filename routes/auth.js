const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const { validateRegister, validateLogin, validatePasswordReset } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');

const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many attempts, please try again later." }
});

router.get('/has-users', authController.hasUsers);
router.post('/register', validateRegister, authController.register);
router.post('/login', [strictAuthLimiter, validateLogin], authController.login);
router.get('/me', auth, authController.getMe);
router.post('/forgot-password', strictAuthLimiter, authController.forgotPassword);
router.post('/reset-password', [strictAuthLimiter, validatePasswordReset], authController.resetPassword);
router.put('/profile', auth, authController.updateProfile);
router.post('/request-profile-change', auth, authController.requestProfileChange);
router.get('/my-profile-requests', auth, authController.getMyProfileRequests);
router.post('/request-email-change-code', auth, authController.requestEmailChangeCode);
router.post('/verify-email-change-code', auth, authController.verifyEmailChangeCode);
router.post('/status', auth, authController.updateStatus);

module.exports = router;
