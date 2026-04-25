// modules/dashboard/dashboard.controller.js
const service = require('./dashboard.service');
const alertsHub = require('../alerts/alerts.hub');
const alertsService = require('../alerts/alerts.service');
const webPushService = require('../notifications/webpush.service');
const db = require('../../database/db');

function isMecanicoLikeRole(role = '') {
  const norm = String(role || '').toUpperCase();
  return norm.includes('MECANICO')
    || norm.includes('MECÂNICO')
    || norm.includes('MANUTENCAO')
    || norm.includes('MANUTENÇÃO');
}

function listMecanicosOnline(limit = 8) {
  try {
    const nowMs = Date.now();
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND lower(name) IN ('sessions','session') ORDER BY name")
      .all();
    const tableName = tableInfo[0]?.name;
    if (!tableName) return [];

    const columns = new Set(
      db.prepare(`PRAGMA table_info(${tableName})`).all().map((col) => String(col?.name || '').toLowerCase())
    );
    if (!columns.has('sess')) return [];

    const hasExpired = columns.has('expired');
    const hasExpires = columns.has('expires');
    let query = `SELECT sess${hasExpired ? ', expired' : ''}${hasExpires ? ', expires' : ''} FROM ${tableName}`;
    if (hasExpired) query += ' WHERE expired >= ?';
    const rows = hasExpired ? db.prepare(query).all(nowMs) : db.prepare(query).all();

    const byUser = new Map();
    for (const row of rows) {
      if (!row?.sess) continue;
      let payload = null;
      try {
        payload = JSON.parse(row.sess);
      } catch (_e) {
        continue;
      }

      if (!hasExpired && row?.expires != null) {
        const expiresMs = Number.isFinite(Number(row.expires)) ? Number(row.expires) : Date.parse(String(row.expires));
        if (Number.isFinite(expiresMs) && expiresMs < nowMs) continue;
      }

      const user = payload?.user || payload?.session?.user || payload?.passport?.user || null;
      const userId = Number(user?.id || user?.user_id || 0);
      if (!userId) continue;

      const nome = String(user?.name || user?.username || '').trim();
      if (!nome || !isMecanicoLikeRole(user?.role || '')) continue;

      if (!byUser.has(userId)) {
        byUser.set(userId, { id: userId, nome });
      }
    }

    return Array.from(byUser.values())
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }))
      .slice(0, limit);
  } catch (_e) {
    return [];
  }
}

function buildDashboardPayload({ tvMode = false } = {}) {
  const ranking = service.getMecanicosRankingSemana() || {};
  return {
    title: tvMode ? 'Modo TV' : 'Painel',
    activeMenu: 'dashboard',
    cards: service.getCards(),
    osResumo: service.getOSResumoStatus(),
    osPainel: service.getOSPainel(tvMode ? 30 : 15),
    osEmAndamento: service.getOSEmAndamento(),
    historicoEquipamentos: service.getHistoricoEquipamentos(10),
    motoresResumo: service.getMotoresResumoDashboard(),
    comprasResumo: service.getComprasResumoDashboard(),
    estoqueResumo: service.getEstoqueResumoDashboard(),
    demandasResumo: service.getDemandasResumoDashboard(),
    preventivas: service.getPreventivasDashboard(),
    escala: service.getEscalaPainelSemana() || service.getEscalaSemana(),
    rankingMecanicos: ranking,
    avisos: service.getAvisosDashboard(12),
    alertaAtivo: alertsService.getAlertaAtivo(),
    tvMode,
  };
}

function index(req, res) {
  const tvMode = ['1', 'true', 'tv'].includes(String(req.query.tv || '').toLowerCase());
  return res.render('dashboard/index', buildDashboardPayload({ tvMode }));
}

function tv(_req, res) {
  return res.redirect('/tv');
}

function getTVData(req, res) {
  const osResumo = service.getOSResumoStatus();
  const osPainel = service.getOSPainel(30);
  const preventivas = service.getPreventivasDashboard();
  const rankingRaw = service.getMecanicosRankingSemana() || {};
  const escalaRaw = service.getEscalaPainelSemana() || service.getEscalaSemana() || {};
  const demandasResumo = service.getDemandasResumoDashboard();
  const avisos = service.getAvisosDashboard(10);
  const alertaAtivo = alertsService.getAlertaAtivo();
  const mecanicosOnline = listMecanicosOnline(12);

  const ranking = (rankingRaw.itemsMecanicos || rankingRaw.items || [])
    .slice(0, 5)
    .map((item, idx) => ({
      posicao: idx + 1,
      nome: item.nome || '-',
      pontuacao: Number(item.pontos || item.score || 0),
      foto: item.foto_path || null,
    }));

  const dia = (escalaRaw.diurno_mecanicos || []).map((p) => p.nome).filter(Boolean);
  const noite = (escalaRaw.noturno || []).map((p) => p.nome).filter(Boolean);
  const apoio = (escalaRaw.apoio_operacional || []).map((p) => p.nome).filter(Boolean);

  const osCriticas = (osPainel.items || []).filter((o) => {
    const grau = String(o.grau || o.prioridade || '').toUpperCase();
    return ['CRITICO', 'CRÍTICO', 'ALTO', 'ALTA', 'EMERGENCIAL'].includes(grau);
  }).length;

  const preventivasCrit = preventivas.criticidade || {};
  const equipeSerie = ranking.map((r) => ({ nome: r.nome, concluidas: r.pontuacao }));

  const alertas = [
    ...(alertaAtivo ? [{ tipo: 'OS_CRITICA', mensagem: `OS crítica ativa no equipamento ${alertaAtivo.equipamento || '-'}.` }] : []),
    ...((demandasResumo.paradas || 0) > 0 ? [{ tipo: 'OS_PARADAS', mensagem: `${demandasResumo.paradas || 0} demanda(s) parada(s) aguardando ação.` }] : []),
    ...avisos.slice(0, 3).map((a) => ({ tipo: 'FALHA_RECENTE', mensagem: `${a.titulo || 'Aviso'}: ${String(a.mensagem || '').slice(0, 100)}` })),
  ];

  return res.json({
    updatedAt: new Date().toISOString(),
    sistemaOnline: true,
    os: {
      abertas: Number(osResumo.abertas || 0),
      andamento: Number(osResumo.andamento || 0),
      fechadas: Number(osResumo.fechadas || 0),
      criticas: osCriticas,
      totalAtivas: Number(osPainel.total || 0),
      itens: osPainel.items || [],
    },
    preventivas: {
      total: Number(preventivas.totalAtivas || (preventivas.items || []).length || 0),
      status: {
        verde: Number(preventivas.resumo?.fechadas || 0),
        amarelo: Number(preventivas.resumo?.andamento || 0),
        vermelho: Number(preventivas.resumo?.abertas || 0),
      },
      criticidade: {
        baixa: Number(preventivasCrit.BAIXA || 0),
        media: Number(preventivasCrit.MEDIA || 0),
        alta: Number(preventivasCrit.ALTA || 0),
        critica: Number(preventivasCrit.CRITICA || 0),
      },
      itens: preventivas.items || [],
    },
    ranking,
    mecanicosOnline,
    escala: { dia, noite, apoio },
    alertas,
    charts: {
      osStatus: {
        abertas: Number(osResumo.abertas || 0),
        andamento: Number(osResumo.andamento || 0),
        fechadas: Number(osResumo.fechadas || 0),
      },
      preventivasCriticidade: {
        baixa: Number(preventivasCrit.BAIXA || 0),
        media: Number(preventivasCrit.MEDIA || 0),
        alta: Number(preventivasCrit.ALTA || 0),
        critica: Number(preventivasCrit.CRITICA || 0),
      },
      equipePerformance: equipeSerie,
    },
  });
}

function iniciarPreventiva(req, res) {
  const execucaoId = Number(req.params.execucaoId);
  const result = service.iniciarPreventiva(execucaoId, req.session?.user || null);
  if (!result?.ok) {
    const msg = result?.reason === 'forbidden'
      ? 'Sem permissão para iniciar esta preventiva.'
      : result?.reason === 'invalid_status'
        ? 'A preventiva precisa estar PENDENTE para iniciar.'
        : 'Não foi possível iniciar a preventiva.';
    req.flash('error', msg);
    return res.redirect('/dashboard');
  }
  req.flash('success', `Preventiva #${execucaoId} iniciada com sucesso.`);
  return res.redirect('/dashboard');
}

function finalizarPreventiva(req, res) {
  const execucaoId = Number(req.params.execucaoId);
  const result = service.finalizarPreventiva(execucaoId, req.session?.user || null);
  if (!result?.ok) {
    const msg = result?.reason === 'forbidden'
      ? 'Sem permissão para finalizar esta preventiva.'
      : result?.reason === 'invalid_status'
        ? 'A preventiva precisa estar EM_ANDAMENTO para finalizar.'
        : 'Não foi possível finalizar a preventiva.';
    req.flash('error', msg);
    return res.redirect('/dashboard');
  }
  req.flash('success', `Preventiva #${execucaoId} finalizada com sucesso.`);
  return res.redirect('/dashboard');
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
    try {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch (_e) {
      // noop
    }
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
    alertsHub.publish('alerta_reconhecido', {
      os_id: result.os_id,
      reconhecido_por: req.session?.user?.id || null,
    });
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
  req.flash('success', 'Cadastro de avisos foi movido para o módulo Avisos.');
  return res.redirect('/avisos');
}

module.exports = {
  index,
  tv,
  getTVData,
  createAviso,
  sse,
  reconhecerAlerta,
  subscribePush,
  iniciarPreventiva,
  finalizarPreventiva,
};
