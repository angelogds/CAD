// modules/dashboard/dashboard.routes.js
const express = require('express');
const router = express.Router();

const { requireLogin, requireRole } = require('../auth/auth.middleware');
const { ACCESS } = require('../../config/rbac');
const ctrl = require('./dashboard.controller');

// padrão igual aos outros módulos (auth/compras/estoque/etc)
// + já marca o menu ativo do dashboard
const wrap = (fn, name) =>
  typeof fn === 'function'
    ? (req, res, next) => {
        res.locals.activeMenu = 'dashboard';
        try {
          return fn(req, res, next);
        } catch (err) {
          return next(err);
        }
      }
    : (_req, res) => {
        console.error(`❌ [dashboard] Handler ${name} indefinido.`);
        return res.status(500).send(`Erro interno: handler ${name} indefinido.`);
      };

router.get('/', requireLogin, wrap(ctrl.index, 'index'));
router.get('/tv', requireLogin, wrap(ctrl.tv, 'tv'));
router.post('/avisos', requireLogin, wrap(ctrl.createAviso, 'createAviso'));

router.get('/alertas/stream', requireLogin, wrap(ctrl.sse, 'sse'));
router.post('/alertas/reconhecer', requireLogin, wrap(ctrl.reconhecerAlerta, 'reconhecerAlerta'));
router.post('/push/subscribe', requireLogin, wrap(ctrl.subscribePush, 'subscribePush'));
router.post('/preventivas/:execucaoId/iniciar', requireLogin, wrap(ctrl.iniciarPreventiva, 'iniciarPreventiva'));
router.post('/preventivas/:execucaoId/finalizar', requireLogin, wrap(ctrl.finalizarPreventiva, 'finalizarPreventiva'));

module.exports = router;
