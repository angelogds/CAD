const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const storagePaths = require('../../config/storage');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const ctrl = require('./meu-portal.controller');
const fase2bCtrl = require('./meu-portal-fase2b.controller');
const rhPortalCtrl = require('../rh/rh.portal.controller');

const router = express.Router();
const LINK_MANAGER_ROLES = ['ADMIN', 'RH'];
const uploadDir = path.join(storagePaths.IMAGE_DIR, 'users');
fs.mkdirSync(uploadDir, { recursive: true });

const extByMime = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = extByMime[String(file.mimetype || '').toLowerCase()] || '.jpg';
      cb(null, `user-${Number(req.session?.user?.id || 0)}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!extByMime[mime]) return cb(new Error('Formato inválido. Use JPG, PNG ou WEBP.'));
    return cb(null, true);
  },
});

router.use(requireLogin);
router.get('/', ctrl.index);
router.get('/perfil', ctrl.perfil);
router.get('/conta', ctrl.conta);
router.get('/materiais', ctrl.materiais);
router.get('/treinamentos', fase2bCtrl.treinamentos);
router.get('/dados-profissionais', fase2bCtrl.dadosProfissionais);
router.get('/servicos', fase2bCtrl.servicos);
router.get('/rh', rhPortalCtrl.index);
router.get('/rh/documentos/:documentoId/arquivo', rhPortalCtrl.documentoArquivo);
router.post('/vinculo', requireRole(LINK_MANAGER_ROLES), ctrl.linkColaborador);
router.post('/foto', upload.single('photo'), ctrl.updatePhoto);
router.post('/senha', ctrl.changePassword);
router.post('/cartao/emitir', ctrl.emitCard);
router.get('/cartao', ctrl.card);

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || /Formato inválido/.test(String(err?.message || ''))) {
    const message = err?.code === 'LIMIT_FILE_SIZE'
      ? 'A foto deve ter no máximo 5 MB.'
      : (err.message || 'Não foi possível processar a foto.');
    req.flash('error', message);
    return res.redirect('/meu-portal/perfil');
  }
  return next(err);
});

module.exports = router;
