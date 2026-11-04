const express = require('express');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS, ROLE } = require('../../config/rbac');
const ctrl = require('./roteiros.controller');

const operacional = express.Router();
operacional.use(requireLogin, requireRole([ROLE.MECANICO, ...ACCESS.pcm_manage]));
operacional.get('/', ctrl.index);
operacional.get('/:id', ctrl.show);
operacional.post('/:id/registrar', requireRole([ROLE.MECANICO]), ctrl.registrar);

const pcm = express.Router();
pcm.use(requireLogin, requireRole(ACCESS.pcm_manage));
pcm.get('/', ctrl.index);
pcm.post('/', ctrl.create);
pcm.get('/:id', ctrl.show);
pcm.post('/:id/itens/:itemId/programar', ctrl.programar);
pcm.post('/:id/concluir', ctrl.concluir);

module.exports = { operacional, pcm };
