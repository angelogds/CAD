const db = require('../../database/db');
const dateBr = require('../../utils/data-hora-br');

function tableExists(name) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name=?").get(String(name || '')));
  } catch (_error) {
    return false;
  }
}

function getColumns(table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  } catch (_error) {
    return [];
  }
}

function normalizeISODate(value) {
  const raw = String(value || '').trim();
  return dateBr.isValidISODate(raw) ? raw : '';
}

function getLinkedColaborador(userId) {
  if (!tableExists('colaboradores')) return null;
  const cols = getColumns('colaboradores');
  if (!cols.includes('user_id')) return null;
  const deleted = cols.includes('deleted_at') ? "AND COALESCE(deleted_at,'')=''" : '';
  return db.prepare(`SELECT * FROM colaboradores WHERE user_id=? ${deleted} LIMIT 1`).get(Number(userId)) || null;
}

function calculateTenure(startDate) {
  const start = String(startDate || '').slice(0, 10);
  const today = dateBr.todayISO();
  if (!dateBr.isValidISODate(start) || !dateBr.isValidISODate(today) || start > today) return null;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let months = (ty - sy) * 12 + tm - sm - (td < sd ? 1 : 0);
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ano${years === 1 ? '' : 's'}`);
  if (rest || !parts.length) parts.push(`${rest} ${rest === 1 ? 'mês' : 'meses'}`);
  return { meses: months, label: parts.join(' e ') };
}

function getOwnProfessionalData(userId) {
  const colaborador = getLinkedColaborador(userId);
  if (!colaborador) return { vinculado: false, colaborador: null, liderNome: null, contaEmail: null, tempoCasa: null };

  let liderNome = null;
  if (colaborador.lider_id) {
    liderNome = db.prepare("SELECT nome FROM colaboradores WHERE id=? AND COALESCE(deleted_at,'')='' LIMIT 1")
      .get(Number(colaborador.lider_id))?.nome || null;
  }

  let contaEmail = null;
  if (tableExists('users') && getColumns('users').includes('email')) {
    contaEmail = db.prepare('SELECT email FROM users WHERE id=? LIMIT 1').get(Number(userId))?.email || null;
  }

  return {
    vinculado: true,
    colaborador,
    liderNome,
    contaEmail,
    tempoCasa: calculateTenure(colaborador.data_admissao),
  };
}

function certificateVisualStatus(row, today = dateBr.todayISO()) {
  const official = String(row?.status_validacao || '').trim().toUpperCase();
  const validity = String(row?.validade || '').slice(0, 10);
  if (official === 'REPROVADO') return 'REPROVADO';
  if (official === 'VENCIDO') return 'VENCIDO';
  if (official === 'PENDENTE') return 'PENDENTE_VALIDACAO';

  if (dateBr.isValidISODate(validity)) {
    if (validity < today) return 'VENCIDO';
    const diffDays = Math.floor(
      (Date.parse(`${validity}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000
    );
    if (diffDays <= 30) return 'VENCE_EM_BREVE';
  }
  return official === 'APROVADO' ? 'VALIDO' : 'PENDENTE_VALIDACAO';
}

function safeCertificateUrl(value) {
  const raw = String(value || '').trim();
  return /^https?:\/\//i.test(raw) || raw.startsWith('/') ? raw : null;
}

function getOwnTrainings(userId) {
  const colaborador = getLinkedColaborador(userId);
  const empty = (available = true) => ({
    vinculado: Boolean(colaborador),
    disponivel: available,
    colaborador,
    resumo: { total: 0, validos: 0, vencendo: 0, vencidos: 0, pendentes: 0 },
    certificados: [],
  });
  if (!colaborador) return empty();
  if (!tableExists('certificados')) return empty(false);

  const cols = getColumns('certificados');
  if (!cols.includes('colaborador_id')) return empty(false);
  const deleted = cols.includes('deleted_at') ? "AND COALESCE(deleted_at,'')=''" : '';
  const rows = db.prepare(`
    SELECT * FROM certificados
    WHERE colaborador_id=? ${deleted}
    ORDER BY id DESC
    LIMIT 300
  `).all(Number(colaborador.id));

  const certificados = rows.map((row) => ({
    ...row,
    status_visual: certificateVisualStatus(row),
    arquivo_seguro: safeCertificateUrl(row.arquivo_url),
  })).sort((a, b) => {
    const av = dateBr.isValidISODate(String(a.validade || '').slice(0, 10)) ? String(a.validade).slice(0, 10) : '9999-12-31';
    const bv = dateBr.isValidISODate(String(b.validade || '').slice(0, 10)) ? String(b.validade).slice(0, 10) : '9999-12-31';
    return av.localeCompare(bv) || Number(b.id || 0) - Number(a.id || 0);
  });

  return {
    vinculado: true,
    disponivel: true,
    colaborador,
    resumo: {
      total: certificados.length,
      validos: certificados.filter((r) => r.status_visual === 'VALIDO').length,
      vencendo: certificados.filter((r) => r.status_visual === 'VENCE_EM_BREVE').length,
      vencidos: certificados.filter((r) => r.status_visual === 'VENCIDO').length,
      pendentes: certificados.filter((r) => r.status_visual === 'PENDENTE_VALIDACAO').length,
    },
    certificados,
  };
}

function normalizeServiceFilters(filters = {}) {
  const normalized = {
    q: String(filters.q || '').trim().slice(0, 80),
    inicio: normalizeISODate(filters.inicio),
    fim: normalizeISODate(filters.fim),
    tipo: String(filters.tipo || '').trim().toUpperCase().slice(0, 30),
  };
  if (normalized.inicio && normalized.fim && normalized.inicio > normalized.fim) {
    throw new Error('Período inválido: a data inicial não pode ser posterior à data final.');
  }
  return normalized;
}

function parseTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function durationMinutes(startValue, endValue) {
  const start = parseTimestamp(startValue);
  const end = parseTimestamp(endValue);
  if (!start || !end || end < start) return null;
  return Math.round((end - start) / 60000);
}

function buildConditions(columns, userId, colaboradorId, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const specs = [
    ['executor_user_id', userId],
    ['mecanico_user_id', userId],
    ['responsavel_user_id', userId],
    ['auxiliar_user_id', userId],
    ['executor_colaborador_id', colaboradorId],
    ['mecanico_colaborador_id', colaboradorId],
    ['auxiliar_colaborador_id', colaboradorId],
  ];
  const sql = [];
  const params = [];
  for (const [column, value] of specs) {
    if (value && columns.includes(column)) {
      sql.push(`${prefix}${column}=?`);
      params.push(Number(value));
    }
  }
  return { sql, params };
}

function resolveRole(row, userId, colaboradorId) {
  const uid = Number(userId);
  const cid = Number(colaboradorId);
  if (
    Number(row.executor_user_id || 0) === uid ||
    Number(row.mecanico_user_id || 0) === uid ||
    Number(row.responsavel_user_id || 0) === uid ||
    Number(row.executor_colaborador_id || 0) === cid ||
    Number(row.mecanico_colaborador_id || 0) === cid
  ) return 'EXECUTOR';
  if (Number(row.auxiliar_user_id || 0) === uid || Number(row.auxiliar_colaborador_id || 0) === cid) return 'AUXILIAR';
  return String(row.papel || 'PARTICIPANTE').toUpperCase() === 'RESPONSAVEL' ? 'EXECUTOR' : String(row.papel || 'PARTICIPANTE').toUpperCase();
}

function loadOsMap(ids) {
  const unique = [...new Set(ids.map(Number).filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const placeholders = chunk.map(() => '?').join(',');
    db.prepare(`SELECT * FROM os WHERE id IN (${placeholders})`).all(...chunk)
      .forEach((row) => map.set(Number(row.id), row));
  }
  return map;
}

function loadEquipmentMap(osRows = []) {
  if (!tableExists('equipamentos')) return new Map();
  const ids = [...new Set(osRows.map((row) => Number(row.equipamento_id || 0)).filter(Boolean))];
  if (!ids.length) return new Map();
  const map = new Map();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const placeholders = chunk.map(() => '?').join(',');
    db.prepare(`SELECT id,nome FROM equipamentos WHERE id IN (${placeholders})`).all(...chunk)
      .forEach((row) => map.set(Number(row.id), row.nome));
  }
  return map;
}

function normalizeServiceRow(os, participation, equipmentMap, userId, colaboradorId, source) {
  const executionStart = participation.iniciado_em || participation.iniciado_at || participation.started_at || participation.created_at || participation.alocado_em;
  const hasExecutionEndField = ['finalizado_em', 'finalizado_at', 'ended_at'].some((field) => Object.prototype.hasOwnProperty.call(participation, field));
  const executionEnd = participation.finalizado_em || participation.finalizado_at || participation.ended_at || null;
  const osStart = os.data_inicio || os.opened_at || os.created_at || null;
  const osEnd = os.data_conclusao || os.closed_at || os.updated_at || null;
  const start = source === 'EXECUCAO' ? (executionStart || osStart) : (participation.created_at || osStart);
  const end = source === 'EXECUCAO' ? (hasExecutionEndField ? executionEnd : osEnd) : null;

  return {
    os_id: Number(os.id),
    os_numero: os.numero || os.numero_os || os.id,
    equipamento_nome: equipmentMap.get(Number(os.equipamento_id || 0)) || os.equipamento_manual || os.equipamento || '-',
    tipo: os.tipo || os.tipo_manutencao || '-',
    status: os.status || '-',
    prioridade: os.prioridade || os.grau || os.grau_dificuldade || os.criticidade || '-',
    descricao: os.descricao || os.acao_executada || '',
    participacao_inicio: start,
    participacao_fim: end,
    papel: resolveRole(participation, userId, colaboradorId),
    fonte: source,
    duracao_minutos: source === 'EXECUCAO' ? durationMinutes(start, end) : null,
    duracao_confiavel: source === 'EXECUCAO',
  };
}

function matchesFilters(row, filters) {
  const rowDate = String(row.participacao_inicio || '').slice(0, 10);
  if ((filters.inicio || filters.fim) && !dateBr.isValidISODate(rowDate)) return false;
  if (filters.inicio && rowDate < filters.inicio) return false;
  if (filters.fim && rowDate > filters.fim) return false;
  if (filters.tipo && String(row.tipo || '').toUpperCase() !== filters.tipo) return false;
  if (filters.q) {
    const haystack = [row.os_numero, row.os_id, row.equipamento_nome, row.descricao, row.tipo, row.status].join(' ').toLowerCase();
    if (!haystack.includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

function getOwnServiceHistory(userId, filters = {}) {
  const filtros = normalizeServiceFilters(filters);
  const colaborador = getLinkedColaborador(userId);
  const empty = (available = true) => ({
    vinculado: Boolean(colaborador),
    disponivel: available,
    colaborador,
    filtros,
    resumo: { osParticipadas: 0, minutosRegistrados: 0, corretivas: 0, preventivas: 0 },
    servicos: [],
    tiposDisponiveis: [],
    limiteAtingido: false,
  });
  if (!colaborador) return empty();
  if (!tableExists('os')) return empty(false);

  const executionRows = [];
  if (tableExists('os_execucoes')) {
    const cols = getColumns('os_execucoes');
    const conditions = buildConditions(cols, userId, colaborador.id);
    if (cols.includes('os_id') && conditions.sql.length) {
      executionRows.push(...db.prepare(`
        SELECT * FROM os_execucoes
        WHERE ${conditions.sql.join(' OR ')}
        ORDER BY rowid DESC LIMIT 600
      `).all(...conditions.params));
    }
  }

  const executionOsMap = loadOsMap(executionRows.map((row) => row.os_id));
  const directCols = getColumns('os');
  const directConditions = buildConditions(directCols, userId, colaborador.id);
  const directRows = directConditions.sql.length
    ? db.prepare(`SELECT * FROM os WHERE ${directConditions.sql.join(' OR ')} ORDER BY id DESC LIMIT 600`).all(...directConditions.params)
    : [];

  let allocationRows = [];
  if (tableExists('os_alocacoes')) {
    const cols = getColumns('os_alocacoes');
    if (cols.includes('os_id') && cols.includes('user_id')) {
      allocationRows = db.prepare('SELECT * FROM os_alocacoes WHERE user_id=? ORDER BY rowid DESC LIMIT 600').all(Number(userId));
    }
  }

  const allOsMap = loadOsMap([
    ...executionRows.map((row) => row.os_id),
    ...directRows.map((row) => row.id),
    ...allocationRows.map((row) => row.os_id),
  ]);
  const equipmentMap = loadEquipmentMap([...allOsMap.values()]);
  const seenOs = new Set();
  const merged = [];

  for (const execution of executionRows) {
    const os = executionOsMap.get(Number(execution.os_id)) || allOsMap.get(Number(execution.os_id));
    if (!os) continue;
    seenOs.add(Number(os.id));
    merged.push(normalizeServiceRow(os, execution, equipmentMap, userId, colaborador.id, 'EXECUCAO'));
  }

  for (const os of directRows) {
    if (seenOs.has(Number(os.id))) continue;
    seenOs.add(Number(os.id));
    merged.push(normalizeServiceRow(os, os, equipmentMap, userId, colaborador.id, 'OS'));
  }

  for (const allocation of allocationRows) {
    if (seenOs.has(Number(allocation.os_id))) continue;
    const os = allOsMap.get(Number(allocation.os_id));
    if (!os) continue;
    seenOs.add(Number(os.id));
    merged.push(normalizeServiceRow(os, allocation, equipmentMap, userId, colaborador.id, 'ALOCACAO'));
  }

  const tiposDisponiveis = [...new Set(merged.map((r) => String(r.tipo || '').toUpperCase()).filter((v) => v && v !== '-'))].sort();
  const filtered = merged.filter((row) => matchesFilters(row, filtros)).sort((a, b) => {
    const at = parseTimestamp(a.participacao_inicio)?.getTime() || 0;
    const bt = parseTimestamp(b.participacao_inicio)?.getTime() || 0;
    return bt - at || Number(b.os_id) - Number(a.os_id);
  });
  const limiteAtingido = filtered.length > 300;
  const servicos = filtered.slice(0, 300);

  const byOs = new Map();
  servicos.forEach((row) => { if (!byOs.has(row.os_id)) byOs.set(row.os_id, row); });
  const osValues = [...byOs.values()];

  return {
    vinculado: true,
    disponivel: true,
    colaborador,
    filtros,
    resumo: {
      osParticipadas: byOs.size,
      minutosRegistrados: servicos
        .filter((row) => row.duracao_confiavel && Number.isFinite(Number(row.duracao_minutos)))
        .reduce((sum, row) => sum + Math.max(0, Number(row.duracao_minutos)), 0),
      corretivas: osValues.filter((row) => String(row.tipo || '').toUpperCase().includes('CORRET')).length,
      preventivas: osValues.filter((row) => String(row.tipo || '').toUpperCase().includes('PREVENT')).length,
    },
    servicos,
    tiposDisponiveis,
    limiteAtingido,
  };
}

module.exports = {
  getOwnProfessionalData,
  getOwnTrainings,
  getOwnServiceHistory,
  certificateVisualStatus,
};