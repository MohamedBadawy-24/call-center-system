const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.get('/profile-requests', adminAuth, adminController.listProfileRequests);
router.post('/resolve-profile-request/:id', adminAuth, adminController.resolveProfileRequest);
router.get('/users', adminAuth, adminController.listUsers);
router.delete('/users/:id', adminAuth, adminController.deleteUser);

module.exports = router;
