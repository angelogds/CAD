const defaultDb = require('../../database/db');
const { normalizeRole, ROLE } = require('../../config/rbac');

const CONFIG = Object.freeze({ reincidenciaDias: 15, falhasReforma: 3, criticasUrgente: 2, osAbertaLimiteDias: 7 });
const FAILURE_TYPES = ['CORRETIVA', 'EMERGENCIAL', 'CRITICA', 'CRÍTICA', 'FALHA', 'QUEBRA'];
const CANCELLED = ['CANCELADA', 'CANCELADO'];

function cols(db, table) { try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)); } catch (_) { return new Set(); } }
function hasTable(db, table) { try { return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table); } catch (_) { return false; } }
function norm(v) { return String(v || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
function isoDate(d) { return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { const da = new Date(a); const db = new Date(b); if (Number.isNaN(+da) || Number.isNaN(+db)) return null; return Math.max(0, Math.round((db - da) / 86400000)); }
function avg(ns) { return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : null; }
function trend(intervals) { if (intervals.length < 2) return 'Dados insuficientes'; const first = intervals.slice(0, Math.ceil(intervals.length / 2)); const second = intervals.slice(Math.floor(intervals.length / 2)); const a = avg(first); const b = avg(second); if (a == null || b == null) return 'Dados insuficientes'; if (b < a) return 'Piora: intervalo entre falhas reduziu'; if (b > a) return 'Melhora: intervalo entre falhas aumentou'; return 'Estável'; }

function parseFilters(query = {}) {
  const now = new Date();
  const days = [7, 30, 60, 90, 180].includes(Number(query.periodo)) ? Number(query.periodo) : 30;
  const end = query.fim || isoDate(now);
  const startDate = new Date(`${end}T00:00:00Z`); startDate.setUTCDate(startDate.getUTCDate() - days + 1);
  const start = query.inicio || isoDate(startDate);
  return { start, end, days, setor: query.setor || '', equipamento_id: query.equipamento_id || '', criticidade: query.criticidade || '', tipo: query.tipo || '', status: query.status || '', ativo: query.ativo || '' };
}

function canView(role) { return [ROLE.ADMIN, ROLE.DIRETORIA, ROLE.PCM, ROLE.MANUTENCAO_SUPERVISOR, ROLE.ENCARREGADO_MANUTENCAO, ROLE.MECANICO].includes(normalizeRole(role)); }
function canManage(role) { return [ROLE.ADMIN, ROLE.PCM, ROLE.MANUTENCAO_SUPERVISOR, ROLE.ENCARREGADO_MANUTENCAO].includes(normalizeRole(role)); }

function osExpr(c, names, fallback = "''") { const parts = names.filter(n => c.has(n)).map(n => `o.${n}`); return `COALESCE(${[...parts, fallback].join(',')})`; }
function critExpr(c) { return `COALESCE(${[c.has('grau')?'o.grau':null, c.has('prioridade')?'o.prioridade':null, c.has('ai_criticidade')?'o.ai_criticidade':null, 'e.criticidade', "'MEDIA'"].filter(Boolean).join(',')})`; }
function typeExpr(c) { return osExpr(c, ['tipo_manutencao','tipo'], "''"); }
function buildWhere(c, f, failureOnly = false) {
  const w = ['date(o.opened_at) BETWEEN date(@start) AND date(@end)'];
  if (c.has('status')) w.push(`UPPER(COALESCE(o.status,'')) NOT IN (${CANCELLED.map(s => `'${s}'`).join(',')})`);
  if (failureOnly) w.push(`UPPER(${typeExpr(c)}) IN (${FAILURE_TYPES.map(s => `'${s}'`).join(',')})`);
  if (f.setor) w.push("COALESCE(e.setor, '') = @setor");
  if (f.equipamento_id) w.push('COALESCE(o.equipamento_id, e.id) = @equipamento_id');
  if (f.criticidade) w.push(`UPPER(${critExpr(c)}) = UPPER(@criticidade)`);
  if (f.tipo) w.push(`UPPER(${typeExpr(c)}) = UPPER(@tipo)`);
  if (f.status) w.push('UPPER(COALESCE(o.status,\'\')) = UPPER(@status)');
  if (f.ativo !== '') w.push('COALESCE(e.ativo, 1) = @ativo');
  return w.join(' AND ');
}

function createOperationalCriticalityService(db = defaultDb) {
  function getFiltersOptions() {
    if (!hasTable(db, 'equipamentos')) return { setores: [], equipamentos: [] };
    return { setores: db.prepare("SELECT DISTINCT setor FROM equipamentos WHERE COALESCE(setor,'')<>'' ORDER BY setor").all().map(r => r.setor), equipamentos: db.prepare('SELECT id,nome,setor,ativo FROM equipamentos ORDER BY nome').all() };
  }
  function listFailures(f) {
    if (!hasTable(db, 'os')) return [];
    const c = cols(db, 'os');
    const equipJoin = hasTable(db, 'equipamentos') && c.has('equipamento_id') ? 'LEFT JOIN equipamentos e ON e.id=o.equipamento_id' : 'LEFT JOIN (SELECT NULL id,NULL nome,NULL setor,NULL ativo,NULL criticidade,NULL status_operacional) e ON 1=0';
    const selectEqId = c.has('equipamento_id') ? 'o.equipamento_id' : 'NULL';
    return db.prepare(`SELECT o.id, ${selectEqId} equipamento_id, COALESCE(e.nome,o.equipamento,'Sem equipamento') equipamento_nome, COALESCE(e.setor,'-') setor, COALESCE(e.status_operacional, CASE WHEN COALESCE(e.ativo,1)=1 THEN 'ATIVO' ELSE 'INATIVO' END) situacao_atual, ${typeExpr(c)} tipo, COALESCE(o.status,'') status, ${critExpr(c)} criticidade, o.opened_at, o.closed_at, o.descricao FROM os o ${equipJoin} WHERE ${buildWhere(c, f, true)} ORDER BY equipamento_nome, datetime(o.opened_at)`).all(f);
  }
  function intervals(rows) { const by = new Map(); for (const r of rows) { const k = r.equipamento_id || r.equipamento_nome; if (!by.has(k)) by.set(k, []); by.get(k).push(r); } const out = new Map(); for (const [k, rs] of by) { const diffs = []; for (let i=1;i<rs.length;i++) { const d = daysBetween(rs[i-1].opened_at, rs[i].opened_at); if (d != null) diffs.push(d); } out.set(k, { diffs, media: avg(diffs), menor: diffs.length ? Math.min(...diffs) : null, maior: diffs.length ? Math.max(...diffs) : null, anterior: diffs.at(-1) ?? null, tendencia: trend(diffs), insuficiente: rs.length < 2 }); } return out; }
  function getRanking(f) { const rows = listFailures(f); const ints = intervals(rows); const map = new Map(); for (const r of rows) { const k = r.equipamento_id || r.equipamento_nome; const item = map.get(k) || { equipamento_id: r.equipamento_id, equipamento_nome: r.equipamento_nome, setor: r.setor, total_falhas: 0, os_criticas: 0, reincidencias: 0, ultima_falha: null, situacao_atual: r.situacao_atual, criticidade: r.criticidade }; item.total_falhas++; if (['CRITICA','CRITICO','EMERGENCIAL','ALTA','ALTO'].includes(norm(r.criticidade)) || ['EMERGENCIAL','CRITICA'].includes(norm(r.tipo))) item.os_criticas++; item.ultima_falha = !item.ultima_falha || new Date(r.opened_at) > new Date(item.ultima_falha) ? r.opened_at : item.ultima_falha; map.set(k, item); } for (const [k, item] of map) { const it = ints.get(k) || {}; item.reincidencias = (it.diffs || []).filter(d => d <= CONFIG.reincidenciaDias).length; item.intervalo = it; item.frequencia_media = it.media == null ? 'Dados insuficientes' : `${it.media.toFixed(1)} dias`; item.historico_url = item.equipamento_id ? `/equipamentos/${item.equipamento_id}?tab=historico` : `/os?equipamento=${encodeURIComponent(item.equipamento_nome)}`; } return [...map.values()].sort((a,b)=> b.total_falhas - a.total_falhas || b.os_criticas - a.os_criticas).slice(0,5); }
  function getOsResumo(f) { if (!hasTable(db, 'os')) return { abertas:0, aguardando_equipe:0, andamento:0, pausadas:0, criticas_emergenciais:0, finalizadas_periodo:0, vencidas:0, tempo_medio_fechamento_horas:null }; const c = cols(db,'os'); const join = hasTable(db,'equipamentos') && c.has('equipamento_id') ? 'LEFT JOIN equipamentos e ON e.id=o.equipamento_id' : 'LEFT JOIN (SELECT NULL id,NULL setor,NULL ativo,NULL criticidade) e ON 1=0'; const rows = db.prepare(`SELECT o.status, o.opened_at, o.closed_at, ${critExpr(c)} criticidade, ${typeExpr(c)} tipo FROM os o ${join} WHERE ${buildWhere(c,f,false)}`).all(f); const res = { abertas:0, aguardando_equipe:0, andamento:0, pausadas:0, criticas_emergenciais:0, finalizadas_periodo:0, vencidas:0, tempo_medio_fechamento_horas:null }; const closeHours=[]; for (const r of rows) { const s=norm(r.status); if(s==='ABERTA') res.abertas++; else if(s==='AGUARDANDO_EQUIPE') res.aguardando_equipe++; else if(['ANDAMENTO','EM_ANDAMENTO'].includes(s)) res.andamento++; else if(s==='PAUSADA') res.pausadas++; else if(['CONCLUIDA','FINALIZADA','FECHADA'].includes(s)) res.finalizadas_periodo++; if(['CRITICA','CRITICO','EMERGENCIAL'].includes(norm(r.criticidade)) || ['EMERGENCIAL','CRITICA'].includes(norm(r.tipo))) res.criticas_emergenciais++; if(!['CONCLUIDA','FINALIZADA','FECHADA'].includes(s) && daysBetween(r.opened_at, new Date().toISOString()) > CONFIG.osAbertaLimiteDias) res.vencidas++; if(r.closed_at){ const h=daysBetween(r.opened_at,r.closed_at); if(h!=null) closeHours.push(h*24); } } res.tempo_medio_fechamento_horas = avg(closeHours); return res; }
  function getIntervencoes(f) { return getRanking(f).filter(i => i.total_falhas >= CONFIG.falhasReforma || i.os_criticas >= CONFIG.criticasUrgente || i.reincidencias > 0).map(i => ({ ...i, origem:'AUTOMATICA', situacao_solicitacao:'Sugestão do sistema — requer avaliação da manutenção/PCM', motivo: i.os_criticas >= CONFIG.criticasUrgente ? 'Parada urgente por ocorrências críticas/emergenciais' : (i.total_falhas >= CONFIG.falhasReforma ? 'Reforma recomendada por falhas repetidas' : 'Necessita avaliação por reincidência'), classificacao: i.os_criticas >= CONFIG.criticasUrgente ? 'Parada urgente' : (i.total_falhas >= CONFIG.falhasReforma ? 'Reforma recomendada' : 'Necessita avaliação'), responsavel:'Manutenção/PCM' })); }
  function getDashboard(query={}) { const filters = parseFilters(query); return { config: CONFIG, filters, options: getFiltersOptions(), ranking: getRanking(filters), osResumo: getOsResumo(filters), intervencoes: getIntervencoes(filters), canManage, canView }; }
  function getDetalhe(equipamentoId, query={}) { const filters = parseFilters({ ...query, equipamento_id: equipamentoId }); return { filters, ocorrencias: listFailures(filters) }; }
  return { parseFilters, getDashboard, getRanking, getOsResumo, getIntervencoes, getDetalhe, canView, canManage, _listFailures: listFailures };
}

module.exports = createOperationalCriticalityService();
module.exports.createOperationalCriticalityService = createOperationalCriticalityService;
module.exports.CONFIG = CONFIG;
