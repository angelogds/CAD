const path = require('node:path');
const db = require('../../database/db');
const storage = require('../../config/storage');
const dateBr = require('../../utils/data-hora-br');
const escala = require('../escala/escala.service');
const folgaSolicitacoes = require('../escala/escala.folga-solicitacao.service');
const colaboradoresService = require('../colaboradores/colaboradores.service');
const { normalizeRole, canAccessModule } = require('../../config/rbac');

const EXAM_DIR = path.join(storage.DATA_DIR, 'rh', 'exames');
const EXAM_TYPES = new Set(['ADMISSIONAL', 'PERIODICO', 'RETORNO_TRABALHO', 'MUDANCA_FUNCAO', 'DEMISSIONAL', 'OUTRO']);

function tableExists(name) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name=?").get(String(name || '')));
  } catch (_error) {
    return false;
  }
}

function columns(table) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name); }
  catch (_error) { return []; }
}

function hasColumn(table, column) { return columns(table).includes(column); }

function normalizeExamType(value) {
  const normalized = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s/-]+/g, '_');
  return EXAM_TYPES.has(normalized) ? normalized : 'OUTRO';
}

function normalizeISODate(value) {
  const raw = String(value || '').slice(0, 10);
  return dateBr.isValidISODate(raw) ? raw : null;
}

function daysBetween(fromISO, toISO) {
  if (!dateBr.isValidISODate(fromISO) || !dateBr.isValidISODate(toISO)) return null;
  return Math.floor((Date.parse(`${toISO}T12:00:00Z`) - Date.parse(`${fromISO}T12:00:00Z`)) / 86400000);
}

function examVisualStatus(validity, today = dateBr.todayISO()) {
  const date = normalizeISODate(validity);
  if (!date) return { code: 'SEM_VALIDADE', label: 'Sem validade', days: null };
  const diff = daysBetween(today, date);
  if (diff < 0) return { code: 'VENCIDO', label: `Vencido há ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'}`, days: diff };
  if (diff <= 30) return { code: 'VENCE_EM_BREVE', label: `Vence em ${diff} dia${diff === 1 ? '' : 's'}`, days: diff };
  return { code: 'VALIDO', label: 'Válido', days: diff };
}

function certificateVisualStatus(validity, official, today = dateBr.todayISO()) {
  const status = String(official || '').toUpperCase();
  if (status === 'REPROVADO') return 'REPROVADO';
  const date = normalizeISODate(validity);
  if (date) {
    const diff = daysBetween(today, date);
    if (diff < 0) return 'VENCIDO';
    if (diff <= 30) return 'VENCE_EM_BREVE';
  }
  return status === 'APROVADO' ? 'VALIDO' : 'PENDENTE';
}

function listExams({ colaboradorId = null, includeFile = false } = {}) {
  if (!tableExists('rh_exames_ocupacionais')) return [];
  const params = [];
  let where = "COALESCE(e.deleted_at,'')=''";
  if (colaboradorId) { where += ' AND e.colaborador_id=?'; params.push(Number(colaboradorId)); }
  const rows = db.prepare(`
    SELECT e.*, c.nome AS colaborador_nome, c.funcao, c.setor
    FROM rh_exames_ocupacionais e
    JOIN colaboradores c ON c.id=e.colaborador_id
    WHERE ${where}
    ORDER BY CASE WHEN e.validade_ate IS NULL OR e.validade_ate='' THEN 1 ELSE 0 END,
             date(e.validade_ate) ASC, e.id DESC
    LIMIT 500
  `).all(...params);
  return rows.map((row) => {
    const status = examVisualStatus(row.validade_ate);
    const safe = { ...row, status_visual: status.code, status_label: status.label, dias_validade: status.days };
    if (!includeFile) {
      delete safe.arquivo_nome;
      delete safe.arquivo_nome_original;
      delete safe.arquivo_mime;
    }
    return safe;
  });
}

function getLinkedCollaborator(userId) {
  if (!tableExists('colaboradores') || !hasColumn('colaboradores', 'user_id')) return null;
  const deleted = hasColumn('colaboradores', 'deleted_at') ? "AND COALESCE(deleted_at,'')=''" : '';
  return db.prepare(`SELECT * FROM colaboradores WHERE user_id=? ${deleted} LIMIT 1`).get(Number(userId)) || null;
}

function safeUrl(value) {
  const raw = String(value || '').trim();
  return /^https?:\/\//i.test(raw) || raw.startsWith('/') ? raw : null;
}

function listCertificates() {
  if (!tableExists('certificados')) return [];
  return db.prepare(`
    SELECT cert.*, c.nome AS colaborador_nome
    FROM certificados cert
    JOIN colaboradores c ON c.id=cert.colaborador_id
    WHERE COALESCE(cert.deleted_at,'')=''
    ORDER BY cert.id DESC
    LIMIT 600
  `).all().map((row) => ({ ...row, status_visual: certificateVisualStatus(row.validade, row.status_validacao) }));
}

function buildDashboard(user = {}) {
  let painel = { colaboradores: [], pendentes: 0 };
  try { painel = escala.listarPainelEscala({ user, canViewAll: true }) || painel; } catch (_error) {}
  const colaboradores = Array.isArray(painel.colaboradores) ? painel.colaboradores : [];
  const solicitacoes = tableExists('escala_folga_solicitacoes') ? folgaSolicitacoes.listarSolicitacoes({ limit: 300 }) : [];
  const exams = listExams({ includeFile: false });
  const certs = listCertificates();
  const pendencias = [];

  solicitacoes.filter((s) => String(s.status || '').toUpperCase() === 'PENDENTE_APROVACAO').forEach((s) => {
    pendencias.push({ tipo: 'FOLGA', nivel: 'atencao', colaborador: s.colaborador_nome, titulo: `Folga solicitada para ${s.data_folga}`, detalhe: 'Aguardando decisão operacional da Manutenção.', data: s.solicitado_em || s.data_folga });
  });
  exams.filter((e) => ['VENCIDO', 'VENCE_EM_BREVE'].includes(e.status_visual)).forEach((e) => {
    pendencias.push({ tipo: 'EXAME', nivel: e.status_visual === 'VENCIDO' ? 'critico' : 'atencao', colaborador: e.colaborador_nome, titulo: `${String(e.tipo || 'Exame').replaceAll('_', ' ')}`, detalhe: e.status_label, data: e.validade_ate });
  });
  certs.filter((c) => ['VENCIDO', 'VENCE_EM_BREVE', 'PENDENTE'].includes(c.status_visual)).slice(0, 100).forEach((c) => {
    pendencias.push({ tipo: 'TREINAMENTO', nivel: c.status_visual === 'VENCIDO' ? 'critico' : 'atencao', colaborador: c.colaborador_nome, titulo: c.titulo || 'Treinamento/certificado', detalhe: c.status_visual === 'PENDENTE' ? 'Pendente de validação' : (c.status_visual === 'VENCIDO' ? 'Vencido' : 'Vence em até 30 dias'), data: c.validade || c.data_emissao });
  });

  const totalBankMinutes = colaboradores.reduce((sum, item) => sum + Number(item.saldo?.minutos || 0), 0);
  const overtimeMonth = colaboradores.reduce((sum, item) => sum + Number(item.horasExtrasMesMinutos || 0), 0);
  const pendingLeaves = solicitacoes.filter((s) => String(s.status || '').toUpperCase() === 'PENDENTE_APROVACAO').length;
  const expiredExams = exams.filter((e) => e.status_visual === 'VENCIDO').length;
  const dueExams = exams.filter((e) => e.status_visual === 'VENCE_EM_BREVE').length;
  const role = normalizeRole(user.role);
  const canSensitive = canAccessModule(role, 'rh_sensitive');
  const canManage = canAccessModule(role, 'rh_manage');

  return {
    painel,
    colaboradores,
    solicitacoes,
    exams,
    certs,
    pendencias: pendencias.sort((a, b) => (a.nivel === 'critico' ? -1 : 0) - (b.nivel === 'critico' ? -1 : 0)).slice(0, 120),
    indicadores: {
      colaboradoresAtivos: colaboradores.length,
      folgasPendentes: pendingLeaves,
      horasExtrasMesMinutos: overtimeMonth,
      bancoHorasMinutos: totalBankMinutes,
      examesVencidos: expiredExams,
      examesVencendo: dueExams,
      treinamentosPendentes: certs.filter((c) => ['VENCIDO', 'VENCE_EM_BREVE', 'PENDENTE'].includes(c.status_visual)).length,
    },
    canSensitive,
    canManage,
  };
}

function getCollaboratorDetail(id, user = {}) {
  const colaboradorId = Number(id);
  if (!colaboradorId) return null;
  const colaborador = colaboradoresService.getColaboradorById(colaboradorId);
  if (!colaborador) return null;
  const role = normalizeRole(user.role);
  const canSensitive = canAccessModule(role, 'rh_sensitive');
  const canManage = canAccessModule(role, 'rh_manage');
  let painelPessoa = null;
  try {
    const p = escala.listarPainelEscala({ user, canViewAll: true });
    painelPessoa = (p?.colaboradores || []).find((c) => Number(c.id) === colaboradorId) || null;
  } catch (_error) {}
  const tabs = canManage ? colaboradoresService.getTabData(colaboradorId) : { documentos: [], cursosInternos: [], certificadosExternos: [] };
  const solicitacoes = tableExists('escala_folga_solicitacoes') ? folgaSolicitacoes.listarSolicitacoes({ colaborador_id: colaboradorId, limit: 80 }) : [];
  return {
    colaborador,
    painelPessoa,
    saldo: escala.calcularSaldoBancoHoras(colaboradorId),
    folgas: typeof escala.listarFolgas === 'function' ? escala.listarFolgas({ colaborador_id: colaboradorId }).slice(0, 80) : [],
    solicitacoes,
    exames: canSensitive ? listExams({ colaboradorId, includeFile: true }) : [],
    documentos: canManage ? (tabs.documentos || []).map((d) => ({ ...d, arquivo_seguro: safeUrl(d.arquivo_url) })) : [],
    certificados: canManage ? [...(tabs.cursosInternos || []), ...(tabs.certificadosExternos || [])] : [],
    canSensitive,
    canManage,
  };
}

function createExam(colaboradorId, payload = {}, file = null, actor = {}) {
  if (!tableExists('rh_exames_ocupacionais')) throw new Error('Estrutura de exames ainda não está disponível. Execute as migrations.');
  const colaborador = colaboradoresService.getColaboradorById(Number(colaboradorId));
  if (!colaborador) throw new Error('Colaborador não encontrado.');
  const tipo = normalizeExamType(payload.tipo);
  const realizada = normalizeISODate(payload.data_realizacao);
  const validade = normalizeISODate(payload.validade_ate);
  if (!realizada) throw new Error('Informe a data de realização do exame.');
  if (!validade) throw new Error('Informe a validade do exame.');
  if (validade < realizada) throw new Error('A validade não pode ser anterior à realização do exame.');

  const info = db.prepare(`
    INSERT INTO rh_exames_ocupacionais
      (colaborador_id, tipo, data_realizacao, validade_ate, clinica, observacao,
       arquivo_nome, arquivo_nome_original, arquivo_mime, criado_por_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    Number(colaboradorId), tipo, realizada, validade,
    String(payload.clinica || '').trim().slice(0, 160) || null,
    String(payload.observacao || '').trim().slice(0, 1000) || null,
    file?.filename || null,
    file?.originalname ? String(file.originalname).slice(0, 255) : null,
    file?.mimetype ? String(file.mimetype).slice(0, 120) : null,
    Number(actor.id || actor.user_id || 0) || null
  );
  return Number(info.lastInsertRowid);
}

function getExamForDownload(examId, colaboradorId) {
  if (!tableExists('rh_exames_ocupacionais')) return null;
  const row = db.prepare(`
    SELECT * FROM rh_exames_ocupacionais
    WHERE id=? AND colaborador_id=? AND COALESCE(deleted_at,'')=''
    LIMIT 1
  `).get(Number(examId), Number(colaboradorId));
  if (!row?.arquivo_nome) return null;
  const base = path.resolve(EXAM_DIR);
  const filePath = path.resolve(EXAM_DIR, path.basename(String(row.arquivo_nome)));
  if (!filePath.startsWith(`${base}${path.sep}`)) return null;
  return { ...row, filePath };
}

function getOwnPortalData(userId) {
  const colaborador = getLinkedCollaborator(userId);
  if (!colaborador) return { vinculado: false, colaborador: null, exames: [], documentos: [], solicitacoes: [] };
  let documentos = [];
  try {
    const tabs = colaboradoresService.getTabData(colaborador.id);
    documentos = (tabs.documentos || []).map((d) => ({
      id: d.id,
      tipo: d.tipo,
      data: d.data,
      confirmado_em: d.confirmado_em || null,
      arquivo_seguro: safeUrl(d.arquivo_url),
    }));
  } catch (_error) {}
  return {
    vinculado: true,
    colaborador,
    exames: listExams({ colaboradorId: colaborador.id, includeFile: false }),
    documentos,
    solicitacoes: tableExists('escala_folga_solicitacoes') ? folgaSolicitacoes.listarSolicitacoes({ colaborador_id: colaborador.id, limit: 50 }) : [],
    saldo: escala.calcularSaldoBancoHoras(colaborador.id),
  };
}

module.exports = {
  EXAM_DIR,
  EXAM_TYPES,
  examVisualStatus,
  buildDashboard,
  getCollaboratorDetail,
  createExam,
  getExamForDownload,
  getOwnPortalData,
};
