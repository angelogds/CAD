const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./ferramental.controller');

const VIEW_ACCESS = ACCESS.ferramental_view || [];

router.get('/qr/:token', requireLogin, requireRole(VIEW_ACCESS), ctrl.qrLookup);
router.get('/ferramentas/:ferramentaId/qrcode.png', requireLogin, requireRole(VIEW_ACCESS), ctrl.qrImage);

module.exports = router;
