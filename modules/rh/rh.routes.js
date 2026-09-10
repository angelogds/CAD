const express = require('express');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS, ROLE } = require('../../config/rbac');
const controller = require('./rh.controller');

const router = express.Router();
const rhRead = ACCESS.rh_view || [ROLE.ADMIN, ROLE.RH, ROLE.DIRETORIA];
const rhManage = ACCESS.rh_manage || [ROLE.ADMIN, ROLE.RH];
const rhSensitive = ACCESS.rh_sensitive || [ROLE.ADMIN, ROLE.RH];

router.use(requireLogin, (req, res, next) => {
  res.locals.activeMenu = 'rh';
  return next();
});

// Central administrativa do RH. Diretoria mantém somente a visão gerencial
// e as páginas operacionais não sensíveis já previstas pelo RBAC.
router.get('/', requireRole(rhRead), controller.index);
router.get('/colaboradores', requireRole(rhRead), controller.colaboradores);
router.get('/jornada', requireRole(rhRead), controller.jornada);

// Fluxos nominais/pessoais e anexos permanecem exclusivos de RH/ADMIN.
router.get('/colaboradores/:id', requireRole(rhManage), controller.colaborador);
router.get('/folgas', requireRole(rhManage), controller.folgas);
router.get('/exames', requireRole(rhSensitive), controller.exames);
router.get('/documentos', requireRole(rhManage), controller.documentos);
router.get('/treinamentos', requireRole(rhManage), controller.treinamentos);

module.exports = router;
