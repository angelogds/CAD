const tvService = require('./tv.service');

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

exports.reconhecerAlerta = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.session?.user || req.user || null;
    await tvService.reconhecerAlerta(id, user);
    res.json({ ok: true });
  } catch (err) {
    console.error('[TV] Erro ao reconhecer alerta:', err);
    res.status(500).json({
      ok: false,
      error: 'Erro ao reconhecer alerta.',
    });
  }
};
