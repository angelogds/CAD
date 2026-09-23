const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const tvController = require('./tv.controller');
const tvConfigController = require('./tv-config.controller');
const tvConfigService = require('./tv-config.service');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const meuPortalRoutes = require('../meu-portal/meu-portal.routes');

let ensureAuthenticated = (req, _res, next) => next();

try {
  const auth = require('../../middlewares/auth.middleware');
  ensureAuthenticated =
    auth.ensureAuthenticated || auth.isAuthenticated || auth.requireAuth || ensureAuthenticated;
} catch (_err) {
  try {
    const auth = require('../auth/auth.middleware');
    ensureAuthenticated = auth.requireLogin || ensureAuthenticated;
  } catch (_err2) {
    console.warn('[TV] Middleware de autenticação não localizado. Usando fallback.');
  }
}

// Este router já é montado em "/" pelo servidor. Mantemos o Portal em módulo próprio
// e apenas expomos o prefixo raiz aqui para evitar duplicar lógica no arquivo principal.
router.use('/meu-portal', meuPortalRoutes);

const TV_CONFIG_ACCESS = ['ADMIN', 'ENCARREGADO_MANUTENCAO'];
fs.mkdirSync(tvConfigService.TV_UPLOAD_DIR, { recursive: true });

const tvUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tvConfigService.TV_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const base = path.basename(file.originalname || 'midia', ext)
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80) || 'midia';
      cb(null, `${Date.now()}-${base}${ext}`);
    },
  }),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || '').toLowerCase();
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/webm',
    ];
    if (allowed.includes(mime)) return cb(null, true);
    return cb(new Error('Formato inválido. Use JPG, PNG, WEBP, MP4 ou WEBM.'));
  },
});

const mascotUpload = (req, res, next) => {
  tvUpload.single('mascote_os')(req, res, (err) => {
    if (!err) return next();
    req.flash('error', err.code === 'LIMIT_FILE_SIZE'
      ? 'Vídeo muito grande. Limite: 80 MB.'
      : (err.message || 'Falha no upload do vídeo.'));
    return res.redirect('/tv/configuracoes');
  });
};

const mediaUpload = (req, res, next) => {
  tvUpload.single('midia')(req, res, (err) => {
    if (!err) return next();
    req.flash('error', err.code === 'LIMIT_FILE_SIZE'
      ? 'Arquivo muito grande. Limite: 80 MB.'
      : (err.message || 'Falha no upload da mídia.'));
    return res.redirect('/tv/configuracoes');
  });
};

router.get('/tv', ensureAuthenticated, tvController.page);
router.get('/tv/configuracoes', requireLogin, requireRole(TV_CONFIG_ACCESS), tvConfigController.page);
router.post('/tv/configuracoes', requireLogin, requireRole(TV_CONFIG_ACCESS), tvConfigController.updateConfig);
router.post('/tv/configuracoes/mascote-os', requireLogin, requireRole(TV_CONFIG_ACCESS), mascotUpload, tvConfigController.uploadMascot);
router.post('/tv/configuracoes/midias', requireLogin, requireRole(TV_CONFIG_ACCESS), mediaUpload, tvConfigController.uploadMedia);
router.post('/tv/configuracoes/midias/:id/toggle', requireLogin, requireRole(TV_CONFIG_ACCESS), tvConfigController.toggleMedia);
router.post('/tv/configuracoes/midias/:id/excluir', requireLogin, requireRole(TV_CONFIG_ACCESS), tvConfigController.deleteMedia);

router.get('/dashboard/tv', ensureAuthenticated, (_req, res) => {
  res.redirect(301, '/tv');
});

router.get('/api/tv/snapshot', ensureAuthenticated, tvController.snapshot);
router.get('/api/tv/stream', ensureAuthenticated, tvController.stream);
router.get('/api/tv/weather', ensureAuthenticated, tvController.weather);

module.exports = router;
