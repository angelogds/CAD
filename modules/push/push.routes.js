const express = require('express');

const router = express.Router();
const pushController = require('./push.controller');

const requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ ok: false, error: 'Autenticação necessária' });
  return next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session?.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Acesso restrito a administradores' });
  }

  return next();
};

router.get('/vapid-public-key', pushController.getVapidPublicKey);

router.post('/subscribe', requireAuth, pushController.subscribe);
router.post('/unsubscribe', requireAuth, pushController.unsubscribe);
router.get('/preferences', requireAuth, pushController.getPreferences);
router.post('/preferences', requireAuth, pushController.updatePreferences);
router.get('/stats', requireAuth, pushController.getStats);

router.post('/test', requireAuth, requireAdmin, pushController.sendTest);
router.post('/emergency', requireAuth, requireAdmin, pushController.sendEmergency);

router.get('/config', requireAuth, (req, res) => {
  res.render('push/config', {
    title: 'Configurações de Notificações',
    activeMenu: 'push',
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  });
});

module.exports = router;
