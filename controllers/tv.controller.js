const dashboardService = require('../modules/dashboard/dashboard.service');
const alertsService = require('../modules/alerts/alerts.service');
const db = require('../database/db');

const FALLBACK_AVATAR = null;

function isMecanicoLikeRole(role = '') {
  const norm = String(role || '').toUpperCase();
  return norm.includes('MECANICO')
    || norm.includes('MECÂNICO')
    || norm.includes('MANUTENCAO')
    || norm.includes('MANUTENÇÃO');
}

function isApoioLikeRole(role = '', funcao = '') {
  const normRole = String(role || '').toUpperCase();
  const normFuncao = String(funcao || '').toUpperCase();
  return normRole.includes('APOIO')
    || normFuncao.includes('APOIO')
    || normFuncao.includes('OPERACIONAL')
    || normFuncao.includes('AUXILIAR');
}

function resolveUserPhoto(user = {}) {
  return user.photo_path || user.photo || user.avatar || FALLBACK_AVATAR;
}

function listColaboradoresOnline(limit = 12) {
  try {
    const nowMs = Date.now();
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND lower(name) IN ('sessions','session') ORDER BY name")
      .all();
    const tableName = tableInfo[0]?.name;
    if (!tableName) return { mecanicosOnline: [], apoioOnline: [] };

    const columns = new Set(
      db.prepare(`PRAGMA table_info(${tableName})`).all().map((col) => String(col?.name || '').toLowerCase())
    );
    if (!columns.has('sess')) return { mecanicosOnline: [], apoioOnline: [] };

    const hasExpired = columns.has('expired');
    const hasExpires = columns.has('expires');
    let query = `SELECT sess${hasExpired ? ', expired' : ''}${hasExpires ? ', expires' : ''} FROM ${tableName}`;
    if (hasExpired) query += ' WHERE expired >= ?';
    const rows = hasExpired ? db.prepare(query).all(nowMs) : db.prepare(query).all();

    const mecanicos = new Map();
    const apoio = new Map();

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
      if (!nome) continue;

      const entity = { id: userId, nome, foto: resolveUserPhoto(user) };
      if (isMecanicoLikeRole(user?.role || '')) mecanicos.set(userId, entity);
      if (isApoioLikeRole(user?.role || '', user?.funcao || '')) apoio.set(userId, entity);
    }

    const sorter = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
    return {
      mecanicosOnline: Array.from(mecanicos.values()).sort(sorter).slice(0, limit),
      apoioOnline: Array.from(apoio.values()).sort(sorter).slice(0, limit),
    };
  } catch (_e) {
    return { mecanicosOnline: [], apoioOnline: [] };
  }
}

function getTopEquipamentosIncidencia(osItens = []) {
  const counts = new Map();
  (osItens || []).forEach((item) => {
    const nome = String(item?.equipamento || item?.equipamento_nome || '-').trim() || '-';
    counts.set(nome, (counts.get(nome) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([equipamento, total]) => ({ equipamento, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function normalizeAvisoPriority(aviso = {}) {
  const raw = String(aviso.prioridade || aviso.tipo || '').toUpperCase();
  if (raw.includes('ALTA') || raw.includes('CRIT')) return 'alta';
  if (raw.includes('MED')) return 'media';
  return 'baixa';
}

function tvPage(_req, res) {
  return res.render('tv/index', {
    title: 'Modo TV',
    activeMenu: 'dashboard',
    authFullscreen: true,
  });
}

function getTVData(_req, res) {
  const osResumo = dashboardService.getOSResumoStatus();
  const osPainel = dashboardService.getOSPainel(30);
  const preventivas = dashboardService.getPreventivasDashboard();
  const rankingRaw = dashboardService.getMecanicosRankingSemana() || {};
  const escalaRaw = dashboardService.getEscalaPainelSemana() || dashboardService.getEscalaSemana() || {};
  const demandasResumo = dashboardService.getDemandasResumoDashboard();
  const avisos = dashboardService.getAvisosDashboard(10);
  const alertaAtivo = alertsService.getAlertaAtivo();
  const online = listColaboradoresOnline(12);

  const rankingMecanicos = (rankingRaw.itemsMecanicos || rankingRaw.items || [])
    .slice(0, 5)
    .map((item, idx) => ({
      posicao: idx + 1,
      nome: item.nome || '-',
      pontuacao: Number(item.pontos || item.score || 0),
      foto: item.foto_path || null,
    }));

  const rankingApoio = (rankingRaw.itemsApoio || [])
    .slice(0, 5)
    .map((item, idx) => ({
      posicao: idx + 1,
      nome: item.nome || '-',
      pontuacao: Number(item.pontos || item.score || 0),
      foto: item.foto_path || null,
    }));

  const dia = (escalaRaw.diurno_mecanicos || []).map((p) => ({ nome: p.nome, foto: p.foto_path || null })).filter((p) => p.nome);
  const noite = (escalaRaw.noturno || []).map((p) => ({ nome: p.nome, foto: p.foto_path || null })).filter((p) => p.nome);
  const apoio = (escalaRaw.apoio_operacional || []).map((p) => ({ nome: p.nome, foto: p.foto_path || null })).filter((p) => p.nome);

  const osItens = osPainel.items || [];
  const osCriticas = osItens.filter((o) => {
    const grau = String(o.grau || o.prioridade || '').toUpperCase();
    return ['CRITICO', 'CRÍTICO', 'ALTO', 'ALTA', 'EMERGENCIAL'].includes(grau);
  }).length;

  const prevItens = preventivas.items || [];
  const now = new Date();
  const prevAtrasadas = prevItens.filter((p) => {
    const status = String(p.status || '').toUpperCase();
    if (status.includes('FINAL') || status.includes('FECH')) return false;
    const date = p.data_prevista ? new Date(p.data_prevista) : null;
    return date && !Number.isNaN(date.getTime()) && date < now;
  }).length;

  const preventivasCrit = preventivas.criticidade || {};
  const equipeSerie = rankingMecanicos.map((r) => ({ nome: r.nome, concluidas: r.pontuacao }));
  const equipamentosIncidencia = getTopEquipamentosIncidencia(osItens);

  const activeAlerts = [
    ...(alertaAtivo ? [{ tipo: 'OS_CRITICA', nivel: 'alta', mensagem: `OS crítica ativa no equipamento ${alertaAtivo.equipamento || '-'}.` }] : []),
    ...((demandasResumo.paradas || 0) > 0 ? [{ tipo: 'OS_PARADAS', nivel: 'alta', mensagem: `${demandasResumo.paradas || 0} demanda(s) parada(s) aguardando ação.` }] : []),
    ...((avisos || []).slice(0, 4).map((a) => ({ tipo: 'AVISO', nivel: normalizeAvisoPriority(a), mensagem: `${a.titulo || 'Aviso'}: ${String(a.mensagem || '').slice(0, 120)}` }))),
  ];

  const ticker = (avisos || []).length
    ? avisos.map((a) => ({
      prioridade: normalizeAvisoPriority(a),
      texto: `${a.titulo || 'Aviso'} • ${String(a.mensagem || '').trim()}`,
    }))
    : [
      { prioridade: 'media', texto: '⚠️ Atenção: manter roscas vazias ao desligar equipamentos.' },
      { prioridade: 'baixa', texto: 'Preventivas pendentes devem ser iniciadas conforme escala.' },
      { prioridade: 'baixa', texto: 'Sistema atualizado em tempo real para monitoramento da manutenção.' },
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
      itens: osItens,
    },
    preventivas: {
      abertas: Number(preventivas.resumo?.abertas || 0),
      andamento: Number(preventivas.resumo?.andamento || 0),
      fechadas: Number(preventivas.resumo?.fechadas || 0),
      atrasadas: Number(prevAtrasadas || 0),
      total: Number(preventivas.totalAtivas || prevItens.length || 0),
      criticidade: {
        baixa: Number(preventivasCrit.BAIXA || 0),
        media: Number(preventivasCrit.MEDIA || 0),
        alta: Number(preventivasCrit.ALTA || 0),
        critica: Number(preventivasCrit.CRITICA || 0),
      },
      itens: prevItens,
    },
    ranking: {
      mecanicos: rankingMecanicos,
      apoio: rankingApoio,
    },
    escala: {
      dia,
      noite,
      apoio,
      responsavelNoite: noite[0] || null,
    },
    online,
    alertas: activeAlerts,
    equipamentosIncidencia,
    ticker,
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
      preventivasStatus: {
        abertas: Number(preventivas.resumo?.abertas || 0),
        andamento: Number(preventivas.resumo?.andamento || 0),
        fechadas: Number(preventivas.resumo?.fechadas || 0),
        atrasadas: Number(prevAtrasadas || 0),
      },
      equipePerformance: equipeSerie,
    },
  });
}

module.exports = {
  tvPage,
  getTVData,
};
