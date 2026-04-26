const express = require('express');
const { requireLogin } = require('../modules/auth/auth.middleware');
const tvController = require('../controllers/tv.controller');

const router = express.Router();

router.get('/tv', requireLogin, tvController.tvPage);
router.get('/api/tv-data', requireLogin, tvController.getTVData);
router.get('/api/tv-stream', requireLogin, tvController.streamTVData);

module.exports = router;
