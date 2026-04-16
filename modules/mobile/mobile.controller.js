const mobileService = require('./mobile.service');

class MobileController {
  register(req, res) {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Autenticação necessária' });

      const { token, platform, appVersion, deviceLabel } = req.body || {};
      if (!token) return res.status(400).json({ ok: false, error: 'Token é obrigatório' });

      mobileService.registerDevice({ userId, token, platform, appVersion, deviceLabel });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message || 'Falha ao registrar dispositivo' });
    }
  }

  revoke(req, res) {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Autenticação necessária' });

      const { token } = req.body || {};
      if (!token) return res.status(400).json({ ok: false, error: 'Token é obrigatório' });

      mobileService.revokeDevice({ userId, token });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message || 'Falha ao revogar dispositivo' });
    }
  }
}

module.exports = new MobileController();
