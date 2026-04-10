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


const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.OPENAI_IMAGE_MAX_BYTES || 8 * 1024 * 1024), files: 1 },
});

router.get('/chat', requireLogin, requireRole(AI_ACCESS), ctrl.renderChat);
router.post('/ask', requireLogin, requireRole(AI_ACCESS), ctrl.askGeneral);
router.post('/os/:id/analyze', requireLogin, requireRole(ACCESS.os_view), ctrl.analyzeOS);
router.post('/preventivas/:id/analyze', requireLogin, requireRole(ACCESS.preventivas_view), ctrl.analyzePreventiva);
router.post('/os/transcrever-abertura', requireLogin, requireRole(AI_TRANSCRICAO_ACCESS), upload.single('audio'), iaCtrl.transcreverAbertura);
router.post('/os/transcrever-fechamento', requireLogin, requireRole(AI_TRANSCRICAO_ACCESS), upload.single('audio'), iaCtrl.transcreverFechamento);
router.post('/os/analisar', requireLogin, requireRole(AI_TRANSCRICAO_ACCESS), iaCtrl.analisarAberturaOS);

router.post('/os/diagnosticar', requireLogin, requireRole(ACCESS.os_view), ctrl.diagnosticarOS);
router.post('/os/melhorar-descricao', requireLogin, requireRole(ACCESS.os_view), ctrl.melhorarDescricaoOS);
router.post('/os/analisar-imagem', requireLogin, requireRole(ACCESS.os_view), uploadImage.single('imagem'), ctrl.analisarImagemOS);
router.get('/os/ranking-falhas', requireLogin, requireRole(ACCESS.os_view), ctrl.rankingFalhas);
router.post('/os/diagnostico-estruturado', requireLogin, requireRole(ACCESS.os_view), ctrl.diagnosticoEstruturado);

router.get('/status', requireLogin, requireRole(AI_ACCESS), ctrl.status);
router.post('/test-connection', requireLogin, requireRole(AI_ACCESS), ctrl.testConnection);
router.post('/cache/clear', requireLogin, requireRole(AI_ACCESS), ctrl.clearAICache);
router.post('/chatbot/message', requireLogin, requireRole(AI_ACCESS), ctrl.chatbotMessage);
router.post('/chatbot/stream', requireLogin, requireRole(AI_ACCESS), ctrl.chatbotStream);
router.post('/search/semantic', requireLogin, requireRole(AI_ACCESS), ctrl.semanticSearchHandler);
router.post('/report/executive', requireLogin, requireRole(AI_ACCESS), ctrl.executiveReport);
router.post('/equipamentos/:id/recommendations', requireLogin, requireRole(ACCESS.os_view), ctrl.equipamentoRecommendations);
router.get('/equipamentos/:id/health', requireLogin, requireRole(ACCESS.os_view), ctrl.equipamentoHealth);
router.post('/analyze-image', requireLogin, requireRole(ACCESS.os_view), ctrl.analyzeImage);
router.get('/dashboard', requireLogin, requireRole(AI_ACCESS), ctrl.dashboard);
router.post('/webhook/os-created', requireLogin, requireRole(ACCESS.os_view), ctrl.webhookOSCreated);

module.exports = router;
