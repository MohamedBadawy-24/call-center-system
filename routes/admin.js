/**
 * DIAGNOSTIC - routes/admin.js
 * Registered routes: GET /profile-requests, POST /resolve-profile-request/:id,
 * GET /users, DELETE /users/:id.
 * All routes use adminAuth middleware.
 *
 * Changes:
 * - Register PATCH /users/:id/researcher-code admin route.
 */
const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.get('/profile-requests', adminAuth, adminController.listProfileRequests);
router.post('/resolve-profile-request/:id', adminAuth, adminController.resolveProfileRequest);
router.get('/users', adminAuth, adminController.listUsers);
router.delete('/users/:id', adminAuth, adminController.deleteUser);
router.patch('/users/:id/researcher-code', adminAuth, adminController.updateResearcherCode);
router.post('/agents/:id/force-clear', adminAuth, adminController.forceClearAgentSession);

module.exports = router;
