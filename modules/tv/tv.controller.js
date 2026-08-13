const tvService = require('./tv.service');
const alertsHub = require('../alerts/alerts.hub');

exports.page = async (req, res, next) => {
  try {
    res.render('tv/modo-tv', {
      title: 'Modo TV — Campo do Gado',
      layout: false,
      user: req.session?.user || req.user || null,
    });
  } catch (err) {
    next(err);
  }
};

exports.snapshot = async (req, res) => {
  try {
    const user = req.session?.user || req.user || null;
    const data = await tvService.getSnapshot(user);
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      data,
    });
  } catch (err) {
    console.error('[TV] Erro ao carregar snapshot:', err);
    res.status(500).json({
      ok: false,
      error: 'Erro ao carregar dados do Modo TV.',
    });
  }
};

exports.weather = async (_req, res) => {
  try {
    const data = await tvService.getWeather();
    res.set('Cache-Control', 'public, max-age=600');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[TV] Erro ao carregar clima:', err);
    res.status(500).json({
      ok: false,
      error: 'Erro ao carregar previsão do tempo.',
    });
  }
};

exports.stream = (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  alertsHub.subscribe('tv', res);
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  const ping = setInterval(() => res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`), 20000);
  req.on('close', () => { clearInterval(ping); alertsHub.unsubscribe('tv', res); });
};
