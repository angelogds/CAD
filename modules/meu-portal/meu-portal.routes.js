const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const multer = require('multer');
const storagePaths = require('../../config/storage');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const ctrl = require('./meu-portal.controller');
const fase2bCtrl = require('./meu-portal-fase2b.controller');
const rhPortalCtrl = require('../rh/rh.portal.controller');
const vinculo = require('./meu-portal.vinculo');

const router = express.Router();
const LINK_MANAGER_ROLES = ['ADMIN', 'RH'];
const uploadDir = path.join(storagePaths.IMAGE_DIR, 'users');
const atestadoDir = path.join(storagePaths.DATA_DIR, 'rh', 'atestados');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(atestadoDir, { recursive: true });

const extByMime = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const atestadoExtByMime = {
  ...extByMime,
  'application/pdf': '.pdf',
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

const atestadoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, atestadoDir),
    filename: (_req, file, cb) => {
      const mime = String(file.mimetype || '').toLowerCase();
      const ext = atestadoExtByMime[mime] || '.bin';
      cb(null, `atestado-${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!atestadoExtByMime[mime]) {
      return cb(new Error('Formato de atestado inválido. Use PDF, JPG, PNG ou WEBP.'));
    }
    return cb(null, true);
  },
});

router.use(requireLogin);
router.use(vinculo.attachAutomaticMaintenanceLink);

router.get('/', ctrl.index);
router.get('/perfil', ctrl.perfil);
router.get('/conta', ctrl.conta);

// Autoatendimento profissional: liberado inicialmente somente para a equipe de Manutenção.
router.get('/materiais', vinculo.requireMaterialSelfService, ctrl.materiais);
router.get('/treinamentos', vinculo.requireMaintenanceSelfService, fase2bCtrl.treinamentos);
router.get('/dados-profissionais', vinculo.requireMaintenanceSelfService, fase2bCtrl.dadosProfissionais);
router.get('/servicos', vinculo.requireMaintenanceSelfService, fase2bCtrl.servicos);
router.get('/rh', vinculo.requireMaintenanceSelfService, rhPortalCtrl.index);
router.get('/rh/documentos/:documentoId/arquivo', vinculo.requireMaintenanceSelfService, rhPortalCtrl.documentoArquivo);
router.get('/rh/atestados/:atestadoId/arquivo', vinculo.requireMaintenanceSelfService, rhPortalCtrl.atestadoArquivo);
router.get('/rh/folgas/:solicitacaoId/pdf', vinculo.requireMaintenanceSelfService, rhPortalCtrl.folgaPdf);
router.post('/rh/atestados', vinculo.requireMaintenanceSelfService, atestadoUpload.single('arquivo'), rhPortalCtrl.enviarAtestado);

// O vínculo manual permanece como contingência administrativa para casos ambíguos.
router.post('/vinculo', requireRole(LINK_MANAGER_ROLES), ctrl.linkColaborador);
router.post('/foto', upload.single('photo'), ctrl.updatePhoto);
router.post('/senha', ctrl.changePassword);
router.post('/cartao/emitir', vinculo.requireMaterialSelfService, ctrl.emitCard);
router.get('/cartao', vinculo.requireMaterialSelfService, ctrl.card);

router.use((err, req, res, next) => {
  const uploadError = err instanceof multer.MulterError || /Formato .*inválido|Formato inválido/i.test(String(err?.message || ''));
  if (uploadError) {
    const isAtestado = String(req.originalUrl || '').includes('/rh/atestados');
    const message = err?.code === 'LIMIT_FILE_SIZE'
      ? (isAtestado ? 'O atestado deve ter no máximo 10 MB.' : 'A foto deve ter no máximo 5 MB.')
      : (err.message || 'Não foi possível processar o arquivo.');
    req.flash('error', message);
    return res.redirect(isAtestado ? '/meu-portal/rh#atestados' : '/meu-portal/perfil');
  }
  return next(err);
});

module.exports = router;
