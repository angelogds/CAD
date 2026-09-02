const crypto = require('crypto');
const db = require('../../database/db');

function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
}

function getById(id) {
  return db.prepare(`
    SELECT id,nome,apelido,funcao,setor,status,foto_url,user_id,
      ${hasColumn('colaboradores','qr_token') ? 'qr_token' : 'NULL'} qr_token,
      ${hasColumn('colaboradores','qr_ativo') ? 'qr_ativo' : '0'} qr_ativo,
      ${hasColumn('colaboradores','qr_emitido_em') ? 'qr_emitido_em' : 'NULL'} qr_emitido_em,
      ${hasColumn('colaboradores','qr_revogado_em') ? 'qr_revogado_em' : 'NULL'} qr_revogado_em
    FROM colaboradores WHERE id=? AND deleted_at IS NULL
  `).get(Number(id));
}

function emitToken(id, { rotate = false } = {}) {
  if (!hasColumn('colaboradores', 'qr_token')) throw new Error('Execute as migrations para habilitar cartões QR.');
  const colaborador = getById(id);
  if (!colaborador) throw new Error('Colaborador não encontrado.');
  if (String(colaborador.status || '').toUpperCase() !== 'ATIVO') throw new Error('Somente colaboradores ativos podem receber cartão de retirada.');

  if (colaborador.qr_token && Number(colaborador.qr_ativo || 0) === 1 && !rotate) return getById(id);

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(`
    UPDATE colaboradores
    SET qr_token=?,qr_ativo=1,qr_emitido_em=datetime('now'),qr_revogado_em=NULL,updated_at=datetime('now')
    WHERE id=?
  `).run(token, Number(id));
  return getById(id);
}

function revoke(id) {
  if (!hasColumn('colaboradores', 'qr_token')) return null;
  db.prepare(`UPDATE colaboradores SET qr_ativo=0,qr_revogado_em=datetime('now'),updated_at=datetime('now') WHERE id=?`).run(Number(id));
  return getById(id);
}

function encodePayload(colaborador) {
  if (!colaborador?.qr_token || Number(colaborador.qr_ativo || 0) !== 1) return null;
  return `CGCOL:${colaborador.qr_token}`;
}

module.exports = { getById, emitToken, revoke, encodePayload };
