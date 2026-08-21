const express = require('express');
const multer = require('multer');
const router = express.Router();
const ctrl = require('./desenho-tecnico.controller');
const nestingCtrl = require('./nesting.controller');
const archiveCtrl = require('./desenho-tecnico.archive.controller');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS, canAccessModule } = require('../../config/rbac');

const VIEW_ACCESS = ACCESS.desenho_tecnico_view || ['ADMIN'];
const MANAGE_ACCESS = ACCESS.desenho_tecnico_manage || ['ADMIN'];
const DELETE_ACCESS = ACCESS.desenho_tecnico_delete || ['ADMIN'];
const dxfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const ensureCan = (req) => {
  if (typeof req.can === 'function') return;
  req.can = (key) => canAccessModule(req.session?.user?.role, key);
};

const withMenu = (handler) => (req, res, next) => {
  ensureCan(req);
  res.locals.activeMenu = 'desenho-tecnico';
  res.locals.canDelete = req.can('desenho_tecnico_delete');
  return handler(req, res, next);
};

const centralIndex = (req, res, next) => {
  if (!Object.prototype.hasOwnProperty.call(req.query || {}, 'status')) {
    req.query.status = 'ATIVO';
  }
  return withMenu(ctrl.index)(req, res, next);
};

const openCad = (req, res, next) => {
  ensureCan(req);
  if (req.can('desenho_tecnico_manage')) {
    return res.redirect(`/desenho-tecnico/cad/${req.params.id}/editor`);
  }
  return withMenu(ctrl.showCad)(req, res, next);
};

router.get('/', requireLogin, requireRole(VIEW_ACCESS), centralIndex);
router.get('/dashboard', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.dashboard));

router.get('/cad/novo', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.novoCad));
router.post('/cad', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.createCad));
router.get('/cad/:id/editor', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.cadEditor));
router.get('/cad/:id/python/status', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.pythonStatus));
router.post('/cad/:id/analisar', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.analyzeCadPython));
router.post('/cad/:id/nesting', requireLogin, requireRole(MANAGE_ACCESS), withMenu(nestingCtrl.nestingCadPython));
router.get('/cad/:id/dxf', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.exportCadDxf));
router.post('/cad/:id/dxf/importar', requireLogin, requireRole(MANAGE_ACCESS), dxfUpload.single('dxf'), withMenu(ctrl.importCadDxf));
router.post('/cad/:id/arquivar', requireLogin, requireRole(DELETE_ACCESS), withMenu(archiveCtrl.archiveCad));
router.get('/cad/:id', requireLogin, requireRole(VIEW_ACCESS), openCad);
router.post('/cad/:id', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.saveCad));
router.post('/cad/:id/metadata', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.updateCadMetadata));
router.post('/cad/:id/objeto', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.saveCad));
router.post('/cad/:id/render-3d', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.renderCad3d));
router.get('/cad/:id/pdf', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.gerarPdf));

router.get('/:id', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.openById));

module.exports = router;
