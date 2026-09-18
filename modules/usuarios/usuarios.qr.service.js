const crypto = require('crypto');
const db = require('../../database/db');
const { isDirectUserIdentityRole, deriveUserFunctionSector } = require('./usuarios.perfil');

function hasColumn(table, name) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
  } catch (_error) {
    return false;
  }
}

function getById(id) {
  const hasFuncao = hasColumn('users', 'funcao');
  const hasSetor = hasColumn('users', 'setor');
  const hasQrToken = hasColumn('users', 'qr_token');
  const hasQrAtivo = hasColumn('users', 'qr_ativo');
  const hasQrEmitido = hasColumn('users', 'qr_emitido_em');
  const hasQrRevogado = hasColumn('users', 'qr_revogado_em');

  const row = db.prepare(`
    SELECT id, name, email, role, photo_path,
      ${hasFuncao ? 'funcao' : 'NULL'} funcao,
      ${hasSetor ? 'setor' : 'NULL'} setor,
      ${hasQrToken ? 'qr_token' : 'NULL'} qr_token,
      ${hasQrAtivo ? 'qr_ativo' : '0'} qr_ativo,
      ${hasQrEmitido ? 'qr_emitido_em' : 'NULL'} qr_emitido_em,
      ${hasQrRevogado ? 'qr_revogado_em' : 'NULL'} qr_revogado_em,
      COALESCE(ativo,1) ativo,
      deleted_at
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(Number(id));

  if (!row) return null;
  const derived = deriveUserFunctionSector(row.role);
  row.funcao = row.funcao || derived.funcao || row.role;
  row.setor = row.setor || derived.setor || null;
  return row;
}

function emitToken(id, { rotate = false } = {}) {
  if (!hasColumn('users', 'qr_token')) {
    throw new Error('Execute as migrations para habilitar o cartão de usuário.');
  }

  const user = getById(id);
  if (!user) throw new Error('Usuário não encontrado.');
  if (!isDirectUserIdentityRole(user.role)) {
    throw new Error('Este perfil utiliza identificação de colaborador.');
  }
  if (Number(user.ativo ?? 1) !== 1 || user.deleted_at) {
    throw new Error('Cartão disponível somente para usuário ativo.');
  }

  if (user.qr_token && Number(user.qr_ativo || 0) === 1 && !rotate) return user;

  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(`
    UPDATE users
    SET qr_token = ?,
        qr_ativo = 1,
        qr_emitido_em = datetime('now'),
        qr_revogado_em = NULL
    WHERE id = ?
  `).run(token, Number(id));

  return getById(id);
}

function revoke(id) {
  if (!hasColumn('users', 'qr_token')) return null;
  db.prepare(`
    UPDATE users
    SET qr_ativo = 0,
        qr_revogado_em = datetime('now')
    WHERE id = ?
  `).run(Number(id));
  return getById(id);
}

function encodePayload(user) {
  if (!user?.qr_token || Number(user.qr_ativo || 0) !== 1) return null;
  return `CGUSR:${user.qr_token}`;
}

function getByQr(value) {
  let token = String(value || '').trim();
  if (/^CGUSR:/i.test(token)) token = token.replace(/^CGUSR:/i, '');
  if (!token || !hasColumn('users', 'qr_token')) return null;

  try {
    if (/^https?:\/\//i.test(token)) {
      const parsed = new URL(token);
      token = parsed.searchParams.get('token') || parsed.pathname.split('/').filter(Boolean).pop() || '';
    }
  } catch (_error) {}

  const user = db.prepare(`
    SELECT id
    FROM users
    WHERE qr_token = ?
      AND COALESCE(qr_ativo,0) = 1
      AND COALESCE(ativo,1) = 1
      AND COALESCE(deleted_at,'') = ''
    LIMIT 1
  `).get(token.trim());

  if (!user) return null;
  const identity = getById(user.id);
  return identity && isDirectUserIdentityRole(identity.role) ? identity : null;
}

module.exports = { getById, emitToken, revoke, encodePayload, getByQr };
