const express = require('express');
const multer = require('multer');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./ia.controller');

const router = express.Router();

const IA_TRANSCRICAO_ACCESS = Array.from(new Set([
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

router.post('/transcrever/abertura', requireLogin, requireRole(IA_TRANSCRICAO_ACCESS), upload.single('audio'), ctrl.transcreverAbertura);
router.post('/transcrever/fechamento', requireLogin, requireRole(IA_TRANSCRICAO_ACCESS), upload.single('audio'), ctrl.transcreverFechamento);

module.exports = router;
