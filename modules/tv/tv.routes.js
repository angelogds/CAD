const express = require('express');

const router = express.Router();
const tvController = require('./tv.controller');

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

router.get('/tv', ensureAuthenticated, tvController.page);

router.get('/dashboard/tv', ensureAuthenticated, (_req, res) => {
  res.redirect(301, '/tv');
});

router.get('/api/tv/snapshot', ensureAuthenticated, tvController.snapshot);
router.get('/api/tv/weather', ensureAuthenticated, tvController.weather);
router.post('/api/tv/alertas/:id/reconhecer', ensureAuthenticated, tvController.reconhecerAlerta);

module.exports = router;
