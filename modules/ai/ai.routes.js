const express = require('express');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./ai.controller');

const router = express.Router();

const AI_ACCESS = Array.from(new Set([
  ...(ACCESS.os_view || []),
  ...(ACCESS.preventivas_view || []),
  ...(ACCESS.academia_view || []),
]));

router.get('/chat', requireLogin, requireRole(AI_ACCESS), ctrl.renderChat);
router.post('/ask', requireLogin, requireRole(AI_ACCESS), ctrl.askGeneral);
router.post('/os/:id/analyze', requireLogin, requireRole(ACCESS.os_view), ctrl.analyzeOS);
router.post('/preventivas/:id/analyze', requireLogin, requireRole(ACCESS.preventivas_view), ctrl.analyzePreventiva);

module.exports = router;
