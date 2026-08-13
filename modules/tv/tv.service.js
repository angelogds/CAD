const db = require('../../database/db');

const CLOSED = new Set(['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CANCELADA', 'CANCELADO']);
const DEADLINE_COLUMNS = ['prazo', 'data_prazo', 'data_prevista', 'previsao_conclusao'];
const RESPONSIBLE_COLUMNS = [
  ['executor_colaborador_id', 'colaboradores'], ['auxiliar_colaborador_id', 'colaboradores'],
  ['executor_secundario_colaborador_id', 'colaboradores'], ['auxiliar_secundario_colaborador_id', 'colaboradores'],
  ['mecanico_user_id', 'users'], ['auxiliar_user_id', 'users'], ['responsavel_user_id', 'users'],
];

function semAcentos(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); }
function normalizarStatusOS(value) {
  const valueNormalized = semAcentos(value).replace(/[\s-]+/g, '_');
  if (CLOSED.has(valueNormalized)) return valueNormalized.startsWith('CANCEL') ? 'CANCELADA' : 'CONCLUIDA';
  if (['ANDAMENTO', 'EXECUTANDO', 'EM_EXECUCAO'].includes(valueNormalized)) return 'EM_ANDAMENTO';
  if (['AGUARDANDO', 'AGUARDANDO_PECA', 'AGUARDANDO_MATERIAL'].includes(valueNormalized)) return 'PAUSADA';
  if (['ABERTO', 'PENDENTE', 'NOVA', 'AGUARDANDO_EQUIPE'].includes(valueNormalized)) return 'ABERTA';
  return valueNormalized || 'ABERTA';
}
function isOSAtiva(os) { return !CLOSED.has(semAcentos(typeof os === 'object' ? os?.status : os).replace(/[\s-]+/g, '_')); }
function normalizarPrioridade(value) {
  const p = semAcentos(value);
  if (['EMERGENCIAL', 'URGENTE', 'CRITICA', 'CRITICO'].includes(p)) return 'CRITICA';
  if (p === 'ALTA') return 'ALTA';
  if (['MEDIA', 'MEDIO'].includes(p)) return 'MEDIA';
  return 'BAIXA';
}
function warn(context, error) { console.warn(`[TV] ${context}: ${error?.message || error}`); }
function safe(context, fn, fallback = []) { try { return fn(); } catch (error) { warn(context, error); return fallback; } }
function tableExists(name) { return Boolean(safe(`falha ao inspecionar tabela ${name}`, () => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name), null)); }
function columns(name) { return tableExists(name) ? new Set(safe(`falha ao inspecionar colunas de ${name}`, () => db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name), [])) : new Set(); }
function firstValue(row, names) { for (const name of names) if (row[name] !== undefined && row[name] !== null && String(row[name]).trim()) return row[name]; return null; }
function validDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function imagePath(value) { if (!value) return null; const path = String(value).trim(); return /^https?:\/\//.test(path) || path.startsWith('/') ? path : `/${path.replace(/^public\//, '')}`; }
function tempoDesde(value) { const date = validDate(value); if (!date) return 'tempo não informado'; const min = Math.max(0, Math.floor((Date.now() - date) / 60000)); return min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}min` : ''}` : `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`; }

function loadNameMap(table) {
  const cols = columns(table); if (!cols.has('id')) return new Map();
  const name = ['nome', 'name', 'full_name'].find((column) => cols.has(column)); if (!name) return new Map();
  return new Map(safe(`falha ao resolver nomes em ${table}`, () => db.prepare(`SELECT id, ${name} AS nome FROM ${table}`).all(), []).map((row) => [String(row.id), row.nome]));
}
function resolveResponsaveis(row, maps) {
  const names = RESPONSIBLE_COLUMNS.flatMap(([column, table]) => {
    const id = row[column]; const name = id == null ? null : maps[table].get(String(id)); return name ? [String(name).trim()] : [];
  });
  return [...new Map(names.map((name) => [semAcentos(name), name])).values()].join(', ') || 'A definir';
}
function getOS() {
  const osColumns = columns('os');
  if (!osColumns.size) { warn('estrutura indisponível', 'tabela os não existe ou não possui colunas'); return { items: [], deadlineColumn: null }; }
  const rows = safe('falha ao carregar ordens de serviço', () => db.prepare('SELECT * FROM os ORDER BY id DESC LIMIT 500').all(), []);
  const equipmentMap = new Map();
  if (columns('equipamentos').has('id')) safe('falha ao resolver equipamentos', () => db.prepare('SELECT * FROM equipamentos').all(), []).forEach((row) => equipmentMap.set(String(row.id), row.nome || row.name));
  const maps = { users: loadNameMap('users'), colaboradores: loadNameMap('colaboradores') };
  const deadlineColumn = DEADLINE_COLUMNS.find((column) => osColumns.has(column)) || null;
  const items = rows.map((row) => {
    const opened = firstValue(row, ['opened_at', 'data_abertura', 'created_at', 'abertura']);
    const rawEquipment = equipmentMap.get(String(row.equipamento_id)) || firstValue(row, ['equipamento_manual', 'equipamento', 'nome_equipamento']) || 'Equipamento não informado';
    return { ...row, numero: `OS #${row.numero || row.id}`, equipamento: String(rawEquipment).toUpperCase(), descricao: firstValue(row, ['descricao', 'descricao_servico', 'problema', 'observacao']) || '', responsavel: resolveResponsaveis(row, maps), statusOriginal: row.status, status: normalizarStatusOS(row.status), prioridade: normalizarPrioridade(firstValue(row, ['grau', 'prioridade'])), abertura: opened, opened_at: opened, prazo: deadlineColumn ? row[deadlineColumn] : null, tempo: tempoDesde(opened), tipo: semAcentos(firstValue(row, ['tipo', 'tipo_manutencao', 'categoria'])) };
  });
  return { items, deadlineColumn };
}

function getPreventivas() {
  const executionCols = columns('preventiva_execucoes'), planCols = columns('preventiva_planos');
  if (!executionCols.size || !planCols.size) return [];
  const plans = new Map(safe('falha ao carregar planos preventivos', () => db.prepare('SELECT * FROM preventiva_planos').all(), []).map((row) => [String(row.id), row]));
  const equipment = new Map(safe('falha ao carregar equipamentos das preventivas', () => tableExists('equipamentos') ? db.prepare('SELECT * FROM equipamentos').all() : [], []).map((row) => [String(row.id), row]));
  return safe('falha ao carregar preventivas', () => db.prepare('SELECT * FROM preventiva_execucoes ORDER BY id DESC LIMIT 100').all(), [])
    .filter(isOSAtiva).map((row) => { const plan = plans.get(String(row.plano_id)) || {}; const eq = equipment.get(String(plan.equipamento_id)) || {}; return { ...row, dataPrevista: firstValue(row, ['data_prevista', 'prazo', 'data_prazo']), equipamento: row.equipamento || eq.nome || plan.titulo || 'Equipamento não informado', tarefa: row.tarefa || row.descricao || plan.titulo || 'Preventiva', responsavel: row.responsavel || 'A definir', criticidade: semAcentos(row.criticidade || eq.criticidade || 'NAO INFORMADA') }; });
}
function getEquipe(osAtivas) {
  let escala = null; let ranking = null;
  try { const dashboard = require('../dashboard/dashboard.service'); escala = dashboard.getEscalaPainelSemana?.() || null; ranking = dashboard.getMecanicosRankingSemana?.() || null; } catch (error) { warn('módulo auxiliar de equipe indisponível', error); }
  const pessoas = new Map(); const rankingItems = ranking?.itemsMecanicos || ranking?.items || [];
  const add = (p, turno, situacao = 'disponivel') => { const nome = String(p?.nome || '').trim(); if (!nome) return; const key = semAcentos(nome); const occupied = osAtivas.some((os) => semAcentos(os.responsavel).includes(key)); const rank = rankingItems.find((item) => semAcentos(item.nome) === key); pessoas.set(key, { id: p.user_id || p.id || null, nome, funcao: p.funcao || 'Mecânico', turno, situacao: occupied ? 'ocupado' : situacao, foto: imagePath(p.photo_path || rank?.photo_path), osAtual: occupied ? osAtivas.find((os) => semAcentos(os.responsavel).includes(key))?.numero : null }); };
  (escala?.diurno_mecanicos || []).forEach((p) => add(p, 'Dia')); (escala?.apoio_operacional || []).forEach((p) => add(p, 'Dia')); (escala?.noturno || []).forEach((p) => add(p, 'Noite')); (escala?.folgas_afastamentos || []).forEach((p) => add(p, 'Fora da escala', 'indisponivel'));
  const equipe = [...pessoas.values()];
  return { equipe, escalaVigente: escala ? { dia: equipe.filter((p) => p.turno === 'Dia' && p.situacao !== 'indisponivel'), noite: equipe.filter((p) => p.turno === 'Noite'), finalSemana: (escala.final_semana_responsavel || []).map((p) => p.nome), afastados: equipe.filter((p) => p.situacao === 'indisponivel'), foraEscala: [] } : null, rankingEquipe: rankingItems.filter((r) => Number(r.os_total || r.score || 0)).map((item, index) => ({ posicao: index + 1, nome: item.nome, foto: imagePath(item.photo_path), os_finalizadas: Number(item.os_total || 0), pontos: Number(item.score || 0), criticas: Number(item.os_criticas || 0), altas: Number(item.os_altas || 0), cargaAtual: osAtivas.filter((os) => semAcentos(os.responsavel).includes(semAcentos(item.nome))).length })) };
}
function calculateMTBF(occurrences) {
  const dates = occurrences.map((os) => validDate(os.abertura || os.opened_at)).filter(Boolean).sort((a, b) => a - b); if (dates.length < 2) return null;
  const intervals = dates.slice(1).map((date, index) => date - dates[index]).filter((ms) => ms > 0); if (!intervals.length) return null;
  const hours = intervals.reduce((sum, ms) => sum + ms, 0) / intervals.length / 3600000; return hours >= 48 ? `${(hours / 24).toFixed(1)} dias` : `${hours.toFixed(1)} h`;
}
function getEquipamentos(allOS) {
  const byEquipment = new Map();
  allOS.filter((os) => os.tipo === 'CORRETIVA' || !os.tipo).forEach((os) => { const key = semAcentos(os.equipamento); if (!byEquipment.has(key)) byEquipment.set(key, []); byEquipment.get(key).push(os); });
  const criticality = new Map(); safe('falha ao carregar criticidade dos equipamentos', () => tableExists('equipamentos') ? db.prepare('SELECT * FROM equipamentos').all() : [], []).forEach((eq) => criticality.set(semAcentos(eq.nome || eq.name), eq.criticidade));
  return [...byEquipment.entries()].map(([key, occurrences]) => ({ nome: occurrences[0].equipamento, falhas: occurrences.length, reincidencias: Math.max(0, occurrences.length - 1), mtbf: calculateMTBF(occurrences), criticidade: semAcentos(criticality.get(key) || 'NAO INFORMADA'), situacao: occurrences.some(isOSAtiva) ? occurrences.find(isOSAtiva).status : 'DISPONIVEL' })).sort((a, b) => b.falhas - a.falhas).slice(0, 5);
}
function buildOperationalSnapshot(os, preventivas, options = {}) {
  const today = (options.now ? new Date(options.now) : new Date()).toISOString().slice(0, 10); const weekEnd = new Date(`${today}T12:00:00`); weekEnd.setDate(weekEnd.getDate() + 7); const active = os.filter(isOSAtiva);
  const overdue = options.deadlineAvailable ? active.filter((item) => { const deadline = validDate(item.prazo); return deadline && deadline < new Date(`${today}T00:00:00`); }).length : null;
  const overduePreventivas = preventivas.filter((p) => p.dataPrevista && p.dataPrevista < today); const total = active.length + preventivas.length;
  return { os: { abertas: active.filter((o) => o.status === 'ABERTA').length, andamento: active.filter((o) => o.status === 'EM_ANDAMENTO').length, pausadas: active.filter((o) => o.status === 'PAUSADA').length, atrasadas: overdue, atrasadasDisponivel: Boolean(options.deadlineAvailable), criticas: active.filter((o) => o.prioridade === 'CRITICA').length, concluidasHoje: os.filter((o) => !isOSAtiva(o) && String(o.closed_at || o.data_conclusao || '').slice(0, 10) === today).length }, preventivas: { pendentes: preventivas.length, vencidas: overduePreventivas.length, hoje: preventivas.filter((p) => p.dataPrevista === today).length, semana: preventivas.filter((p) => p.dataPrevista >= today && new Date(`${p.dataPrevista}T12:00:00`) <= weekEnd).length, corretivas: active.filter((o) => o.tipo === 'CORRETIVA' || !o.tipo).length, percentualPreventivas: total ? Math.round(preventivas.length / total * 100) : 0, percentualCorretivas: total ? Math.round(active.length / total * 100) : 0 }, aguardandoMaterial: active.filter((item) => item.status === 'PAUSADA' && /MATERIAL|PECA|COMPRA|ROLAMENTO/.test(semAcentos(item.descricao))).map((o) => ({ os: o.numero, equipamento: o.equipamento, material: o.descricao || null, espera: o.tempo })), programacao: preventivas };
}
function getTicker(active) { const weight = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 }; return active.slice().sort((a, b) => weight[a.prioridade] - weight[b.prioridade] || new Date(a.abertura) - new Date(b.abertura)).map((o) => ({ id: `os-${o.id}`, texto: `${o.numero} • ${o.equipamento} • ${o.responsavel} • ${o.prioridade} • ${o.status} HÁ ${o.tempo}`, criticidade: o.prioridade })); }
async function getWeather() { try { return await require('./weather.service').getWeather(); } catch (error) { warn('clima indisponível', error); return { available: false, city: 'Feira de Santana - Campo do Gado', week: [] }; } }
async function getSnapshot(user) {
  const result = getOS(), os = result.items, active = os.filter(isOSAtiva), preventivas = getPreventivas(), team = getEquipe(active), operation = buildOperationalSnapshot(os, preventivas, { deadlineAvailable: Boolean(result.deadlineColumn) });
  return { os: active, mecanicos: team.equipe, equipeManutencao: team.equipe, escalaVigente: team.escalaVigente, rankingEquipe: team.rankingEquipe, preventivas, weather: await getWeather(), alertas: active.filter((o) => o.prioridade === 'CRITICA'), performance: { mecanicosDisponiveis: team.equipe.filter((p) => p.situacao === 'disponivel').length, mecanicosOcupados: team.equipe.filter((p) => p.situacao === 'ocupado').length, rankingEquipe: team.rankingEquipe }, operacao: { ...operation, equipamentos: getEquipamentos(os) }, ticker: getTicker(active), system: { online: true, deadlineColumn: result.deadlineColumn, user: user ? { id: user.id, nome: user.nome || user.name } : null } };
}
module.exports = { getSnapshot, getWeather, normalizarStatusOS, normalizarPrioridade, isOSAtiva, buildOperationalSnapshot, calculateMTBF, resolveResponsaveis };
