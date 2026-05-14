const express = require('express');
const router = express.Router();
const multer = require('multer');
const { adminAuth, staffAuth, auth } = require('../middleware/auth');
const { validateSurveyId } = require('../middleware/validation');
const adminController = require('../controllers/adminController');
const responseController = require('../controllers/responseController');
const surveyController = require('../controllers/surveyController');

const upload = multer({ dest: 'uploads/' });

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users', adminAuth, adminController.listUsers);
router.delete('/users/:id', adminAuth, adminController.deleteUser);
router.get('/users/list', staffAuth, adminController.getUsersList);

// ─── Profile Requests ─────────────────────────────────────────────────────────
router.get('/profile-requests', adminAuth, adminController.getAllProfileRequests);
router.post('/resolve-profile-request/:id', adminAuth, adminController.resolveProfileRequest);

// ─── Phone Numbers ─────────────────────────────────────────────────────────────
router.post('/survey/:id/numbers', [adminAuth, validateSurveyId, upload.single('xlsx')], adminController.uploadNumbers);
router.get('/survey/:id/numbers', [staffAuth, validateSurveyId], adminController.listNumbers);
router.get('/survey/:id/numbers/disqualified/export', [staffAuth, validateSurveyId], adminController.exportDisqualifiedNumbers);
router.delete('/survey/:id/numbers', [adminAuth, validateSurveyId], adminController.clearNumbers);

// ─── Analytics & Stats ─────────────────────────────────────────────────────────
router.get('/analytics', staffAuth, adminController.getAnalytics);
router.get('/surveys-stats', staffAuth, surveyController.getSurveysStats);

// ─── Responses (admin view) ────────────────────────────────────────────────────
router.get('/responses', staffAuth, responseController.getResponses);
router.get('/export-survey/:id', [staffAuth, validateSurveyId], responseController.exportCsv);
router.get('/export-advanced', staffAuth, responseController.exportAdvanced);

// ─── Reviews ─────────────────────────────────────────────────────────────────
router.get('/reviews', staffAuth, adminController.getReviews);
router.post('/reviews', staffAuth, adminController.createReview);
router.post('/reviews/mark-seen', staffAuth, adminController.markReviewsSeen);
router.get('/reviews/unseen-count', staffAuth, adminController.getUnseenReviewCount);

// ─── SOPs ─────────────────────────────────────────────────────────────────────
router.get('/sops', auth, adminController.getSops);
router.post('/sops', staffAuth, adminController.createSop);
router.post('/sops/mark-seen', auth, adminController.markSopsSeen);
router.get('/sops/unseen-count', auth, adminController.getUnseenSopCount);

// ─── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings/dailyGoal', auth, adminController.getDailyGoal);
router.put('/settings/dailyGoal', adminAuth, adminController.setDailyGoal);

module.exports = router;
