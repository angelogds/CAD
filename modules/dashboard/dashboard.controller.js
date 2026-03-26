// modules/dashboard/dashboard.controller.js
const service = require("./dashboard.service");
const alertsHub = require('../alerts/alerts.hub');
const alertsService = require('../alerts/alerts.service');
const webPushService = require('../notifications/webpush.service');

function index(req, res) {
  const tvMode = ['1', 'true', 'tv'].includes(String(req.query.tv || '').toLowerCase());
  const cards = service.getCards();
  const osResumo = service.getOSResumoStatus();
  const osPainel = service.getOSPainel(tvMode ? 30 : 15);
  const osEmAndamento = service.getOSEmAndamento();
  const historicoEquipamentos = service.getHistoricoEquipamentos(10);
  const motoresResumo = service.getMotoresResumoDashboard();
  const comprasResumo = service.getComprasResumoDashboard();
  const estoqueResumo = service.getEstoqueResumoDashboard();
  const demandasResumo = service.getDemandasResumoDashboard();
  const preventivas = service.getPreventivasDashboard();
  const escala = service.getEscalaPainelSemana() || service.getEscalaSemana();
  const avisos = service.getAvisosDashboard(12);
  const alertaAtivo = alertsService.getAlertaAtivo();

  return res.render("dashboard/index", {
    title: "Painel",
    activeMenu: "dashboard",
    cards,
    osResumo,
    osPainel,
    osEmAndamento,
    historicoEquipamentos,
    motoresResumo,
    comprasResumo,
    estoqueResumo,
    demandasResumo,
    preventivas,
    escala,
    avisos,
    alertaAtivo,
    tvMode,
  });
}

function iniciarPreventiva(req, res) {
  const execucaoId = Number(req.params.execucaoId);
  const result = service.iniciarPreventiva(execucaoId, req.session?.user || null);
  if (!result?.ok) {
    const msg = result?.reason === "forbidden"
      ? "Sem permissão para iniciar esta preventiva."
      : result?.reason === "invalid_status"
        ? "A preventiva precisa estar PENDENTE para iniciar."
        : "Não foi possível iniciar a preventiva.";
    req.flash("error", msg);
    return res.redirect("/dashboard");
  }
  req.flash("success", `Preventiva #${execucaoId} iniciada com sucesso.`);
  return res.redirect("/dashboard");
}

function sse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  alertsHub.subscribe('dashboard', res);

  const atual = alertsService.getAlertaAtivo();
  res.write(`event: estado_inicial\ndata: ${JSON.stringify({ alertaAtivo: atual })}\n\n`);

  const ping = setInterval(() => {
    try { res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`); } catch (_e) {}
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    alertsHub.unsubscribe('dashboard', res);
  });

  req.flash("success", "Aviso publicado no mural.");
  return res.redirect("/dashboard");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function sse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  alertsHub.subscribe('dashboard', res);

  const atual = alertsService.getAlertaAtivo();
  res.write(`event: estado_inicial\ndata: ${JSON.stringify({ alertaAtivo: atual })}\n\n`);

  const ping = setInterval(() => {
    try { res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`); } catch (_e) {}
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    alertsHub.unsubscribe('dashboard', res);
  });
}

function reconhecerAlerta(req, res) {
  try {
    const result = alertsService.reconhecerAlerta({
      os_id: req.body.os_id,
      user_id: req.session?.user?.id || null,
      observacao: req.body.observacao || null,
    });
    alertsHub.publish('alerta_reconhecido', { os_id: result.os_id, reconhecido_por: req.session?.user?.id || null });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Erro ao reconhecer alerta.' });
  }
}


function subscribePush(req, res) {
  try {
    const result = webPushService.saveSubscription({
      userId: req.session?.user?.id,
      subscription: req.body?.subscription,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Falha ao registrar push.' });
  }
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function sse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  alertsHub.subscribe('dashboard', res);

  const atual = alertsService.getAlertaAtivo();
  res.write(`event: estado_inicial\ndata: ${JSON.stringify({ alertaAtivo: atual })}\n\n`);

  const ping = setInterval(() => {
    try { res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`); } catch (_e) {}
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    alertsHub.unsubscribe('dashboard', res);
  });
}

function reconhecerAlerta(req, res) {
  try {
    const result = alertsService.reconhecerAlerta({
      os_id: req.body.os_id,
      user_id: req.session?.user?.id || null,
      observacao: req.body.observacao || null,
    });
    alertsHub.publish('alerta_reconhecido', { os_id: result.os_id, reconhecido_por: req.session?.user?.id || null });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Erro ao reconhecer alerta.' });
  }
}


function subscribePush(req, res) {
  try {
    const result = webPushService.saveSubscription({
      userId: req.session?.user?.id,
      subscription: req.body?.subscription,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Falha ao registrar push.' });
  }
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

function sse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  alertsHub.subscribe('dashboard', res);

  const atual = alertsService.getAlertaAtivo();
  res.write(`event: estado_inicial\ndata: ${JSON.stringify({ alertaAtivo: atual })}\n\n`);

  const ping = setInterval(() => {
    try { res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`); } catch (_e) {}
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    alertsHub.unsubscribe('dashboard', res);
  });
}

function reconhecerAlerta(req, res) {
  try {
    const result = alertsService.reconhecerAlerta({
      os_id: req.body.os_id,
      user_id: req.session?.user?.id || null,
      observacao: req.body.observacao || null,
    });
    alertsHub.publish('alerta_reconhecido', { os_id: result.os_id, reconhecido_por: req.session?.user?.id || null });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Erro ao reconhecer alerta.' });
  }
}


function subscribePush(req, res) {
  try {
    const result = webPushService.saveSubscription({
      userId: req.session?.user?.id,
      subscription: req.body?.subscription,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Falha ao registrar push.' });
  }
}

function createAviso(req, res) {
  req.flash("success", "Cadastro de avisos foi movido para o módulo Avisos.");
  return res.redirect("/avisos");
}

module.exports = { index, createAviso, sse, reconhecerAlerta, subscribePush, iniciarPreventiva };
