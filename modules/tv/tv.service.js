const db = require('../../database/db');

const STATUS_ENCERRADOS = new Set(['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CANCELADA', 'CANCELADO']);
const STATUS_ATIVOS = new Set(['ABERTA', 'EM_ANDAMENTO', 'ANDAMENTO', 'PAUSADA', 'AGUARDANDO', 'AGUARDANDO_EQUIPE']);

function semAcentos(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function normalizarStatusOS(value) {
  const status = semAcentos(value).replace(/[\s-]+/g, '_');
  if (STATUS_ENCERRADOS.has(status)) return status === 'CANCELADO' ? 'CANCELADA' : 'CONCLUIDA';
  if (['ANDAMENTO', 'EXECUTANDO', 'EM_EXECUCAO'].includes(status)) return 'EM_ANDAMENTO';
  if (['AGUARDANDO', 'AGUARDANDO_PECA', 'AGUARDANDO_MATERIAL'].includes(status)) return 'PAUSADA';
  if (['ABERTO', 'PENDENTE', 'NOVA', 'AGUARDANDO_EQUIPE'].includes(status)) return 'ABERTA';
  return STATUS_ATIVOS.has(status) ? status : 'ABERTA';
}

function isOSAtiva(os) {
  const raw = semAcentos(typeof os === 'object' ? os?.status : os).replace(/[\s-]+/g, '_');
  return !STATUS_ENCERRADOS.has(raw) && normalizarStatusOS(raw) !== 'CONCLUIDA';
}

function normalizarPrioridade(value) {
  const prioridade = semAcentos(value);
  if (['EMERGENCIAL', 'URGENTE', 'CRITICA', 'CRITICO'].includes(prioridade)) return 'CRITICA';
  if (prioridade === 'ALTA') return 'ALTA';
  if (['MEDIA', 'MEDIO'].includes(prioridade)) return 'MEDIA';
  return 'BAIXA';
}

function safe(fn, fallback = []) {
  try { return fn(); } catch (error) { console.warn('[TV]', error.message); return fallback; }
}

function tableExists(name) {
  return Boolean(safe(() => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name), null));
}

function imagePath(value) {
  if (!value) return null;
  const path = String(value).trim();
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path;
  return `/${path.replace(/^public\//, '')}`;
}

function tempoDesde(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'tempo não informado';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}

function getOS() {
  if (!tableExists('os')) return [];
  const rows = safe(() => db.prepare(`
    SELECT o.id, o.id AS numero, COALESCE(e.nome, o.equipamento_manual, o.equipamento, 'Equipamento não informado') equipamento,
      COALESCE(o.descricao, '') descricao, o.status, COALESCE(NULLIF(o.grau,''), o.prioridade, 'MEDIA') prioridade,
      o.opened_at, o.closed_at, o.data_conclusao,
      TRIM(COALESCE(uc.nome, um.name, ur.name, '') || CASE WHEN COALESCE(ua.nome, ux.name, '') <> '' THEN ', ' || COALESCE(ua.nome, ux.name) ELSE '' END) responsavel
    FROM os o
    LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    LEFT JOIN colaboradores uc ON uc.id=o.executor_colaborador_id
    LEFT JOIN colaboradores ua ON ua.id=o.auxiliar_colaborador_id
    LEFT JOIN users um ON um.id=o.mecanico_user_id
    LEFT JOIN users ux ON ux.id=o.auxiliar_user_id
    LEFT JOIN users ur ON ur.id=o.responsavel_user_id
    ORDER BY datetime(o.opened_at) DESC, o.id DESC LIMIT 100
  `).all(), []);
  return rows.map((row) => ({
    ...row,
    numero: `OS #${row.numero}`,
    equipamento: String(row.equipamento).toUpperCase(),
    responsavel: row.responsavel || 'A definir',
    status: normalizarStatusOS(row.status),
    statusOriginal: row.status,
    prioridade: normalizarPrioridade(row.prioridade),
    tempo: tempoDesde(row.opened_at),
    abertura: row.opened_at,
  }));
}

function getPreventivas() {
  if (!tableExists('preventiva_execucoes') || !tableExists('preventiva_planos')) return [];
  return safe(() => db.prepare(`
    SELECT pe.id, COALESCE(e.nome, pp.titulo) equipamento, pp.titulo tarefa, pe.data_prevista,
      UPPER(COALESCE(pe.status,'PENDENTE')) status, COALESCE(pe.responsavel,'A definir') responsavel,
      UPPER(COALESCE(e.criticidade,'MEDIA')) criticidade
    FROM preventiva_execucoes pe JOIN preventiva_planos pp ON pp.id=pe.plano_id
    LEFT JOIN equipamentos e ON e.id=pp.equipamento_id
    WHERE UPPER(COALESCE(pe.status,'')) NOT IN ('CONCLUIDA','FINALIZADA','CANCELADA')
    ORDER BY date(pe.data_prevista), pe.id LIMIT 30
  `).all().map((item) => ({ ...item, dataPrevista: item.data_prevista, criticidade: semAcentos(item.criticidade) })), []);
}

function getEquipe(osAtivas) {
  let escala = null;
  let ranking = null;
  try {
    const dashboard = require('../dashboard/dashboard.service');
    escala = dashboard.getEscalaPainelSemana?.() || null;
    ranking = dashboard.getMecanicosRankingSemana?.() || null;
  } catch (_error) {}
  const pessoas = new Map();
  const add = (p, turno, situacao = 'disponivel') => {
    const nome = String(p?.nome || '').trim();
    if (!nome) return;
    const key = semAcentos(nome);
    const rank = [...(ranking?.itemsMecanicos || ranking?.items || [])].find((x) => semAcentos(x.nome) === key);
    const ocupada = osAtivas.some((os) => semAcentos(os.responsavel).includes(key));
    pessoas.set(key, { id: p.user_id || p.id || null, nome, funcao: p.funcao || 'Mecânico', turno, situacao: ocupada ? 'ocupado' : situacao, foto: imagePath(p.photo_path || rank?.photo_path), osAtual: ocupada ? osAtivas.find((os) => semAcentos(os.responsavel).includes(key))?.numero : null });
  };
  (escala?.diurno_mecanicos || []).forEach((p) => add(p, 'Dia'));
  (escala?.apoio_operacional || []).forEach((p) => add(p, 'Dia'));
  (escala?.noturno || []).forEach((p) => add(p, 'Noite'));
  (escala?.folgas_afastamentos || []).forEach((p) => add(p, 'Fora da escala', 'indisponivel'));
  const equipe = [...pessoas.values()];
  const rankItems = (ranking?.itemsMecanicos || ranking?.items || []).filter((r) => Number(r.os_total || 0) || Number(r.score || 0));
  return {
    equipe,
    escalaVigente: escala ? {
      dia: equipe.filter((p) => p.turno === 'Dia' && p.situacao !== 'indisponivel'),
      noite: equipe.filter((p) => p.turno === 'Noite'),
      finalSemana: (escala.final_semana_responsavel || []).map((p) => p.nome),
      afastados: equipe.filter((p) => p.situacao === 'indisponivel'),
      foraEscala: [],
    } : null,
    rankingEquipe: rankItems.map((item, index) => ({
      posicao: index + 1, nome: item.nome, foto: imagePath(item.photo_path),
      os_finalizadas: Number(item.os_total || 0), pontos: Number(item.score || 0),
      criticas: Number(item.os_criticas || 0), altas: Number(item.os_altas || 0),
      cargaAtual: osAtivas.filter((os) => semAcentos(os.responsavel).includes(semAcentos(item.nome))).length,
    })),
  };
}

function getEquipamentos(os) {
  if (!tableExists('equipamentos')) return [];
  const equipamentos = safe(() => db.prepare('SELECT id,nome,criticidade,status_operacional FROM equipamentos WHERE ativo=1').all(), []);
  return equipamentos.map((eq) => {
    const ocorrencias = os.filter((item) => String(item.equipamento).toUpperCase() === String(eq.nome).toUpperCase());
    const ativa = ocorrencias.find(isOSAtiva);
    return { nome: eq.nome, falhas: ocorrencias.length, reincidencias: Math.max(0, ocorrencias.length - 1), mtbf: null, criticidade: semAcentos(eq.criticidade || 'NAO INFORMADA'), situacao: ativa ? ativa.status : (eq.status_operacional || 'DISPONIVEL') };
  }).filter((eq) => eq.falhas > 0).sort((a, b) => b.falhas - a.falhas).slice(0, 5);
}

function buildOperationalSnapshot(os, preventivas) {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(`${today}T12:00:00`); weekEnd.setDate(weekEnd.getDate() + 7);
  const active = os.filter(isOSAtiva);
  const waiting = active.filter((item) => item.status === 'PAUSADA' && /MATERIAL|PECA|COMPRA|ROLAMENTO/.test(semAcentos(item.descricao)));
  const overduePreventivas = preventivas.filter((p) => p.dataPrevista && p.dataPrevista < today);
  const preventiveTotal = preventivas.length;
  const total = active.length + preventiveTotal;
  return {
    os: { abertas: active.filter((o) => o.status === 'ABERTA').length, andamento: active.filter((o) => o.status === 'EM_ANDAMENTO').length, pausadas: active.filter((o) => o.status === 'PAUSADA').length, atrasadas: 0, criticas: active.filter((o) => o.prioridade === 'CRITICA').length, concluidasHoje: os.filter((o) => !isOSAtiva(o) && String(o.closed_at || o.data_conclusao || '').slice(0, 10) === today).length },
    preventivas: { pendentes: preventiveTotal, vencidas: overduePreventivas.length, hoje: preventivas.filter((p) => p.dataPrevista === today).length, semana: preventivas.filter((p) => p.dataPrevista >= today && new Date(`${p.dataPrevista}T12:00:00`) <= weekEnd).length, corretivas: active.length, percentualPreventivas: total ? Math.round(preventiveTotal / total * 100) : 0, percentualCorretivas: total ? Math.round(active.length / total * 100) : 0 },
    aguardandoMaterial: waiting.map((o) => ({ os: o.numero, equipamento: o.equipamento, material: o.descricao || null, espera: o.tempo })),
    programacao: preventivas,
  };
}

function getTicker(active) {
  const weight = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
  return active.slice().sort((a, b) => weight[a.prioridade] - weight[b.prioridade] || new Date(a.abertura) - new Date(b.abertura)).map((o) => ({ id: `os-${o.id}`, texto: `${o.numero} • ${o.equipamento} • ${o.responsavel} • ${o.prioridade} • ${o.status} HÁ ${o.tempo}`, criticidade: o.prioridade }));
}

async function getSnapshot(user) {
  const os = getOS();
  const active = os.filter(isOSAtiva);
  const preventivas = getPreventivas();
  const team = getEquipe(active);
  const weather = await getWeather();
  return { os, mecanicos: team.equipe, equipeManutencao: team.equipe, escalaVigente: team.escalaVigente, rankingEquipe: team.rankingEquipe, preventivas, weather, alertas: active.filter((o) => o.prioridade === 'CRITICA'), performance: {}, operacao: { ...buildOperationalSnapshot(os, preventivas), equipamentos: getEquipamentos(os) }, ticker: getTicker(active), system: { online: true, user: user ? { id: user.id, nome: user.nome || user.name } : null } };
}

async function getWeather() {
  try { return await require('./weather.service').getWeather(); }
  catch (_error) { return { available: false, city: 'Feira de Santana - Campo do Gado', week: [] }; }
}

module.exports = { getSnapshot, getWeather, normalizarStatusOS, normalizarPrioridade, isOSAtiva, buildOperationalSnapshot };
