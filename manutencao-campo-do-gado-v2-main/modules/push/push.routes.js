const express = require('express');
const router = express.Router();

const { requireLogin } = require('../auth/auth.middleware');
const pushService = require('./push.service');

router.post('/subscribe', requireLogin, (req, res) => {
  try {
    const userId = req.session?.user?.id || null;
    pushService.saveSubscription({ userId, subscription: req.body?.subscription });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Falha ao salvar inscrição push.' });
  }
});

module.exports = router;
