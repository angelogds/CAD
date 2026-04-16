const express = require('express');
const ctrl = require('./mobile.controller');

const router = express.Router();

const requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ ok: false, error: 'Autenticação necessária' });
  return next();
};

router.post('/devices/register', requireAuth, (req, res) => ctrl.register(req, res));
router.post('/devices/revoke', requireAuth, (req, res) => ctrl.revoke(req, res));

module.exports = router;
