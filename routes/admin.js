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
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { adminAuth } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Multer storage for campaign attachments with recursive directory creation (IISNode safe)
const campaignStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const surveyId = req.params.id;
    const uploadDir = path.resolve(__dirname, '..', 'uploads', 'campaigns', surveyId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

const campaignUpload = multer({
  storage: campaignStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB strict limit
});

const handleCampaignUpload = (req, res, next) => {
  const uploadSingle = campaignUpload.single('file');
  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds maximum allowed limit (10MB)' });
      }
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ error: `File upload failed: ${err.message}` });
    }
    next();
  });
};

router.get('/profile-requests', adminAuth, adminController.listProfileRequests);
router.post('/resolve-profile-request/:id', adminAuth, adminController.resolveProfileRequest);
router.get('/users', adminAuth, adminController.listUsers);
router.delete('/users/:id', adminAuth, adminController.deleteUser);
router.patch('/users/:id/researcher-code', adminAuth, adminController.updateResearcherCode);
router.post('/agents/:id/force-clear', adminAuth, adminController.forceClearAgentSession);
router.patch('/responses/:id/unlock-edit', adminAuth, adminController.unlockResponseEdit);

// Campaign Assets & Attachments Hub routes
router.post('/campaigns/:id/attachments', adminAuth, handleCampaignUpload, adminController.uploadCampaignAttachment);
router.put('/campaigns/:id/notes', adminAuth, adminController.updateCampaignNotes);
router.delete('/campaigns/:id/attachments/:attachmentId', adminAuth, adminController.deleteCampaignAttachment);
router.post('/campaigns/:id/clone', adminAuth, adminController.cloneCampaign);

module.exports = router;

