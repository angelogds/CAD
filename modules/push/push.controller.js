const pushService = require('./push.service');

class PushController {
  getVapidPublicKey(req, res) {
    const key = pushService.getVapidPublicKey();

    if (!key) {
      return res.status(503).json({ ok: false, error: 'Push notifications não configurado no servidor' });
    }

    return res.json({ ok: true, publicKey: key });
  }

  async subscribe(req, res) {
    try {
      const { subscription } = req.body;
      const userId = req.session?.user?.id;

      if (!userId) return res.status(401).json({ ok: false, error: 'Autenticação necessária' });
      if (!subscription?.endpoint) {
        return res.status(400).json({ ok: false, error: 'Dados de assinatura inválidos' });
      }

      const userAgent = req.headers['user-agent'];
      const result = await pushService.subscribe(userId, subscription, userAgent);
      return res.json({ ok: true, message: 'Assinatura registrada com sucesso', data: result });
    } catch (err) {
      console.error('Erro na assinatura push:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao registrar assinatura' });
    }
  }

  async unsubscribe(req, res) {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ ok: false, error: 'Endpoint necessário' });

      await pushService.unsubscribe(endpoint);
      return res.json({ ok: true, message: 'Assinatura removida com sucesso' });
    } catch (err) {
      console.error('Erro ao cancelar assinatura:', err);
      return res.status(500).json({ ok: false, error: 'Erro ao remover assinatura' });
    }
  }

  getPreferences(req, res) {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Autenticação necessária' });

      return res.json({ ok: true, data: pushService.getPreferences(userId) });
    } catch (_err) {
      return res.status(500).json({ ok: false, error: 'Erro ao buscar preferências' });
    }
  }

  updatePreferences(req, res) {
    try {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Autenticação necessária' });

      const allowedFields = [
        'os_critica', 'os_alta', 'os_media', 'os_baixa',
        'preventivas_atrasadas', 'preventivas_hoje',
        'mudanca_status_os', 'lembretes_compliance', 'alertas_emergencia',
        'quiet_hours_start', 'quiet_hours_end', 'timezone',
      ];

      const updates = {};
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      });

      pushService.updatePreferences(userId, updates);
      return res.json({ ok: true, message: 'Preferências atualizadas com sucesso' });
    } catch (_err) {
      return res.status(500).json({ ok: false, error: 'Erro ao atualizar preferências' });
    }
  }

  getStats(req, res) {
    try {
      const userId = req.session?.user?.id;
      const isAdmin = req.session?.user?.role === 'admin';
      const targetUserId = isAdmin && req.query.userId ? req.query.userId : userId;

      return res.json({ ok: true, data: pushService.getStats(targetUserId) });
    } catch (_err) {
      return res.status(500).json({ ok: false, error: 'Erro ao buscar estatísticas' });
    }
  }

  async sendTest(req, res) {
    try {
      const { title, body, targetUserId } = req.body;
      if (!title || !body) {
        return res.status(400).json({ ok: false, error: 'Título e corpo são obrigatórios' });
      }

      const payload = { title: `🧪 TESTE: ${title}`, body, type: 'TEST', requireInteraction: false };
      const result = targetUserId
        ? await pushService.sendToUser(targetUserId, payload)
        : await pushService.sendToAll(payload);

      return res.json({ ok: true, message: 'Notificação de teste enviada', result });
    } catch (err) {
      console.error('Erro no teste de notificação:', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  async sendEmergency(req, res) {
    try {
      const { message, url } = req.body;
      if (!message) {
        return res.status(400).json({ ok: false, error: 'Mensagem de emergência é obrigatória' });
      }

      const result = await pushService.notifyEmergency(message, url);
      return res.json({ ok: true, message: 'Alerta de emergência enviado', result });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }
}

module.exports = new PushController();
