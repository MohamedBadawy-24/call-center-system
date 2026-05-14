const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const draftController = require('../controllers/draftController');

router.get('/:serial', auth, draftController.getDraft);
router.post('/', auth, draftController.saveDraft);
router.delete('/:serial', auth, draftController.deleteDraft);

module.exports = router;
