const express = require('express');
const multer = require('multer');
const router = express.Router();
const ctrl = require('./desenho-tecnico.controller');
const nestingCtrl = require('./nesting.controller');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');

const VIEW_ACCESS = ACCESS.desenho_tecnico_view || ['ADMIN'];
const MANAGE_ACCESS = ACCESS.desenho_tecnico_manage || ['ADMIN'];
const dxfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const withMenu = (handler) => (req, res, next) => {
  res.locals.activeMenu = 'desenho-tecnico';
  return handler(req, res, next);
};

router.get('/', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.index));
router.get('/dashboard', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.dashboard));

router.get('/cad/novo', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.novoCad));
router.post('/cad', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.createCad));
router.get('/cad/:id/editor', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.cadEditor));
router.get('/cad/:id/python/status', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.pythonStatus));
router.post('/cad/:id/analisar', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.analyzeCadPython));
router.post('/cad/:id/nesting', requireLogin, requireRole(MANAGE_ACCESS), withMenu(nestingCtrl.nestingCadPython));
router.get('/cad/:id/dxf', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.exportCadDxf));
router.post('/cad/:id/dxf/importar', requireLogin, requireRole(MANAGE_ACCESS), dxfUpload.single('dxf'), withMenu(ctrl.importCadDxf));
router.get('/cad/:id', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.showCad));
router.post('/cad/:id', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.saveCad));
router.post('/cad/:id/metadata', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.updateCadMetadata));
router.post('/cad/:id/objeto', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.saveCad));
router.post('/cad/:id/render-3d', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.renderCad3d));
router.get('/cad/:id/pdf', requireLogin, requireRole(MANAGE_ACCESS), withMenu(ctrl.gerarPdf));

router.get('/:id', requireLogin, requireRole(VIEW_ACCESS), withMenu(ctrl.openById));

module.exports = router;
