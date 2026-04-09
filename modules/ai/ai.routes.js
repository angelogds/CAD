const express = require('express');
const multer = require('multer');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./ai.controller');
const iaCtrl = require('../ia/ia.controller');

const router = express.Router();

const AI_ACCESS = Array.from(new Set([
  ...(ACCESS.os_view || []),
  ...(ACCESS.preventivas_view || []),
  ...(ACCESS.academia_view || []),
]));

const AI_TRANSCRICAO_ACCESS = Array.from(new Set([
  ...(ACCESS.os_view || []),
  ...(ACCESS.preventivas_view || []),
]));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.OPENAI_AUDIO_MAX_BYTES || 12 * 1024 * 1024),
    files: 1,
  },
});

router.get('/chat', requireLogin, requireRole(AI_ACCESS), ctrl.renderChat);
router.post('/ask', requireLogin, requireRole(AI_ACCESS), ctrl.askGeneral);
router.post('/os/:id/analyze', requireLogin, requireRole(ACCESS.os_view), ctrl.analyzeOS);
router.post('/preventivas/:id/analyze', requireLogin, requireRole(ACCESS.preventivas_view), ctrl.analyzePreventiva);
router.post('/os/transcrever-abertura', requireLogin, requireRole(AI_TRANSCRICAO_ACCESS), upload.single('audio'), iaCtrl.transcreverAbertura);
router.post('/os/transcrever-fechamento', requireLogin, requireRole(AI_TRANSCRICAO_ACCESS), upload.single('audio'), iaCtrl.transcreverFechamento);
router.post('/os/analisar', requireLogin, requireRole(AI_TRANSCRICAO_ACCESS), iaCtrl.analisarAberturaOS);

module.exports = router;
