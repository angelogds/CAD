const fs = require('node:fs');
const path = require('node:path');
const db = require('../../database/db');
const storage = require('../../config/storage');
const dateBr = require('../../utils/data-hora-br');
const escala = require('../escala/escala.service');

const ATESTADO_DIR = path.join(storage.DATA_DIR, 'rh', 'atestados');
const STATUS = new Set(['ENVIADO', 'RECEBIDO', 'ARQUIVADO']);
fs.mkdirSync(ATESTADO_DIR, { recursive: true });

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
  catch (_error) { return false; }
}

function normalizeDate(value) {
  const raw = String(value || '').slice(0, 10);
  return dateBr.isValidISODate(raw) ? raw : null;
}

function getById(id) {
  if (!tableExists('rh_atestados')) return null;
  return db.prepare(`
    SELECT a.*, c.nome AS colaborador_nome, c.funcao, c.setor,
           u.name AS enviado_por_nome, r.name AS recebido_por_nome
    FROM rh_atestados a
    JOIN colaboradores c ON c.id=a.colaborador_id
    LEFT JOIN users u ON u.id=a.user_id
    LEFT JOIN users r ON r.id=a.recebido_por_user_id
    WHERE a.id=?
    LIMIT 1
  `).get(Number(id)) || null;
}

function listForCollaborator(colaboradorId, { limit = 50 } = {}) {
  if (!tableExists('rh_atestados')) return [];
  const max = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db.prepare(`
    SELECT a.*
    FROM rh_atestados a
    WHERE a.colaborador_id=?
    ORDER BY date(a.data_inicio) DESC, a.id DESC
    LIMIT ?
  `).all(Number(colaboradorId), max);
}

function listAll(filters = {}) {
  if (!tableExists('rh_atestados')) return [];
  const params = [];
  let where = '1=1';
  if (filters.status && STATUS.has(String(filters.status).toUpperCase())) {
    where += ' AND a.status=?';
    params.push(String(filters.status).toUpperCase());
  }
  if (filters.colaborador_id) {
    where += ' AND a.colaborador_id=?';
    params.push(Number(filters.colaborador_id));
  }
  if (normalizeDate(filters.inicio)) {
    where += ' AND a.data_fim>=?';
    params.push(normalizeDate(filters.inicio));
  }
  if (normalizeDate(filters.fim)) {
    where += ' AND a.data_inicio<=?';
    params.push(normalizeDate(filters.fim));
  }
  const max = Math.min(Math.max(Number(filters.limit) || 300, 1), 500);
  params.push(max);
  return db.prepare(`
    SELECT a.*, c.nome AS colaborador_nome, c.funcao, c.setor,
           u.name AS enviado_por_nome, r.name AS recebido_por_nome
    FROM rh_atestados a
    JOIN colaboradores c ON c.id=a.colaborador_id
    LEFT JOIN users u ON u.id=a.user_id
    LEFT JOIN users r ON r.id=a.recebido_por_user_id
    WHERE ${where}
    ORDER BY CASE a.status WHEN 'ENVIADO' THEN 0 WHEN 'RECEBIDO' THEN 1 ELSE 2 END,
             datetime(a.created_at) DESC, a.id DESC
    LIMIT ?
  `).all(...params);
}

function createFromPortal({ userId, payload = {}, file = null }) {
  if (!tableExists('rh_atestados')) throw new Error('Estrutura de atestados ainda não está disponível. Execute as migrations.');
  if (!file?.filename) throw new Error('Selecione o arquivo do atestado.');

  const colaborador = escala.buscarColaboradorDoUsuario(Number(userId));
  if (!colaborador?.id) throw new Error('Seu usuário ainda não está vinculado a um colaborador ativo.');

  const inicio = normalizeDate(payload.data_inicio);
  const fim = normalizeDate(payload.data_fim || payload.data_inicio);
  if (!inicio || !fim) throw new Error('Informe o período coberto pelo atestado.');
  if (fim < inicio) throw new Error('A data final não pode ser anterior à data inicial.');

  const observacao = String(payload.observacao || '').trim().slice(0, 500) || null;
  const info = db.prepare(`
    INSERT INTO rh_atestados
      (colaborador_id, user_id, data_inicio, data_fim, observacao,
       arquivo_nome, arquivo_nome_original, arquivo_mime, arquivo_tamanho,
       status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENVIADO', datetime('now'), datetime('now'))
  `).run(
    Number(colaborador.id),
    Number(userId),
    inicio,
    fim,
    observacao,
    path.basename(String(file.filename)),
    String(file.originalname || '').slice(0, 255) || null,
    String(file.mimetype || '').slice(0, 120),
    Number(file.size || 0) || null,
  );
  const atestadoId = Number(info.lastInsertRowid);

  try {
    const folgaId = escala.programarFolgaCompensatoria({
      user_id: Number(userId),
      colaborador_id: Number(colaborador.id),
      tipo_lancamento: 'ATESTADO',
      data_folga: inicio,
      data_fim: fim,
      minutos_descontados: 0,
      motivo: 'Atestado médico informado pelo colaborador via Meu RH.',
      anexo_path: null,
      usuario: { id: Number(userId), role: 'COLABORADOR' },
    });
    db.prepare('UPDATE rh_atestados SET folga_id=?, updated_at=datetime(\'now\') WHERE id=?')
      .run(Number(folgaId), atestadoId);
  } catch (error) {
    db.prepare('DELETE FROM rh_atestados WHERE id=?').run(atestadoId);
    throw error;
  }

  return getById(atestadoId);
}

function updateStatus(id, status, actor = {}) {
  const normalized = String(status || '').trim().toUpperCase();
  if (!['RECEBIDO', 'ARQUIVADO'].includes(normalized)) throw new Error('Status de atestado inválido.');
  const atual = getById(id);
  if (!atual) throw new Error('Atestado não encontrado.');
  const actorId = Number(actor.id || actor.user_id || 0) || null;
  db.prepare(`
    UPDATE rh_atestados
    SET status=?,
        recebido_por_user_id=COALESCE(recebido_por_user_id, ?),
        recebido_em=CASE WHEN ?='RECEBIDO' AND recebido_em IS NULL THEN datetime('now') ELSE recebido_em END,
        arquivado_em=CASE WHEN ?='ARQUIVADO' THEN datetime('now') ELSE arquivado_em END,
        updated_at=datetime('now')
    WHERE id=?
  `).run(normalized, actorId, normalized, normalized, Number(id));
  return getById(id);
}

function resolveFile(row) {
  if (!row?.arquivo_nome) return null;
  const base = path.resolve(ATESTADO_DIR);
  const filePath = path.resolve(ATESTADO_DIR, path.basename(String(row.arquivo_nome)));
  if (!filePath.startsWith(`${base}${path.sep}`)) return null;
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

function getPrivateFile(id) {
  const row = getById(id);
  const filePath = resolveFile(row);
  return filePath ? { ...row, filePath } : null;
}

function getOwnPrivateFile(id, colaboradorId) {
  const row = getPrivateFile(id);
  if (!row || Number(row.colaborador_id) !== Number(colaboradorId)) return null;
  return row;
}

module.exports = {
  ATESTADO_DIR,
  STATUS,
  getById,
  listForCollaborator,
  listAll,
  createFromPortal,
  updateStatus,
  getPrivateFile,
  getOwnPrivateFile,
};
