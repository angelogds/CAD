const bcrypt = require('bcryptjs');
const db = require('../../database/db');
const qrService = require('../colaboradores/colaboradores.qr.service');

const LINK_MANAGER_ROLES = new Set(['ADMIN', 'RH']);

function normalizeRole(value) {
  return String(value || '').trim().toUpperCase();
}

function canManageLink(role) {
  return LINK_MANAGER_ROLES.has(normalizeRole(role));
}

function getUserById(userId, { includePassword = false } = {}) {
  const fields = includePassword
    ? 'id,name,email,role,photo_path,telefone_whatsapp,created_at,password_hash'
    : 'id,name,email,role,photo_path,telefone_whatsapp,created_at';
  return db.prepare(`SELECT ${fields} FROM users WHERE id = ? LIMIT 1`).get(Number(userId));
}

function getLinkedColaborador(userId) {
  const row = db.prepare(`
    SELECT id
    FROM colaboradores
    WHERE user_id = ? AND COALESCE(deleted_at, '') = ''
    LIMIT 1
  `).get(Number(userId));
  if (!row) return null;
  return qrService.getById(row.id);
}

function listAvailableColaboradores() {
  return db.prepare(`
    SELECT id, nome, apelido, funcao, setor, status, foto_url
    FROM colaboradores
    WHERE COALESCE(deleted_at, '') = ''
      AND (user_id IS NULL OR user_id = 0)
    ORDER BY nome COLLATE NOCASE ASC
  `).all();
}

function linkOwnUserToColaborador(userId, colaboradorId, actorRole) {
  const id = Number(userId);
  const collaboratorId = Number(colaboradorId);

  if (!id || !collaboratorId) throw new Error('Selecione uma ficha de colaborador válida.');
  if (!canManageLink(actorRole)) throw new Error('Somente RH ou ADMIN pode realizar o vínculo.');

  const tx = db.transaction(() => {
    const user = getUserById(id);
    if (!user) throw new Error('Usuário não encontrado.');

    const existingLink = db.prepare(`
      SELECT id, nome
      FROM colaboradores
      WHERE user_id = ? AND COALESCE(deleted_at, '') = ''
      LIMIT 1
    `).get(id);

    if (existingLink) {
      if (Number(existingLink.id) === collaboratorId) return;
      throw new Error(`Este usuário já está vinculado a ${existingLink.nome}.`);
    }

    const colaborador = db.prepare(`
      SELECT id, nome, foto_url, user_id
      FROM colaboradores
      WHERE id = ? AND COALESCE(deleted_at, '') = ''
      LIMIT 1
    `).get(collaboratorId);

    if (!colaborador) throw new Error('Ficha de colaborador não encontrada.');
    if (Number(colaborador.user_id || 0) && Number(colaborador.user_id) !== id) {
      throw new Error('Esta ficha já está vinculada a outro usuário.');
    }

    const result = db.prepare(`
      UPDATE colaboradores
      SET user_id = ?,
          foto_url = CASE
            WHEN (foto_url IS NULL OR trim(foto_url) = '') AND ? IS NOT NULL THEN ?
            ELSE foto_url
          END,
          updated_at = datetime('now')
      WHERE id = ?
        AND COALESCE(deleted_at, '') = ''
        AND (user_id IS NULL OR user_id = 0 OR user_id = ?)
    `).run(id, user.photo_path || null, user.photo_path || null, collaboratorId, id);

    if (!result.changes) throw new Error('Não foi possível concluir o vínculo. Atualize a página e tente novamente.');

    if (!user.photo_path && colaborador.foto_url) {
      db.prepare('UPDATE users SET photo_path = ? WHERE id = ?').run(colaborador.foto_url, id);
    }
  });

  tx();
  return getPortalData(id);
}

function getPortalData(userId) {
  const user = getUserById(userId);
  if (!user) throw new Error('Usuário não encontrado.');
  return { user, colaborador: getLinkedColaborador(userId) };
}

function updateOwnPhoto(userId, photoPath) {
  const id = Number(userId);
  if (!id || !photoPath) throw new Error('Foto inválida.');

  const tx = db.transaction(() => {
    const result = db.prepare('UPDATE users SET photo_path = ? WHERE id = ?').run(photoPath, id);
    if (!result.changes) throw new Error('Usuário não encontrado.');

    db.prepare(`
      UPDATE colaboradores
      SET foto_url = ?, updated_at = datetime('now')
      WHERE user_id = ? AND COALESCE(deleted_at, '') = ''
    `).run(photoPath, id);
  });
  tx();
  return getPortalData(id);
}

function changeOwnPassword(userId, currentPassword, newPassword) {
  const id = Number(userId);
  const user = getUserById(id, { includePassword: true });
  if (!user) throw new Error('Usuário não encontrado.');
  if (!bcrypt.compareSync(String(currentPassword || ''), String(user.password_hash || ''))) {
    throw new Error('Senha atual incorreta.');
  }

  const passwordHash = bcrypt.hashSync(String(newPassword), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function ensureOwnCard(userId) {
  const colaborador = getLinkedColaborador(userId);
  if (!colaborador) throw new Error('Seu usuário ainda não está vinculado a um colaborador. Procure o RH ou o administrador.');

  if (String(colaborador.status || '').toUpperCase() !== 'ATIVO') {
    throw new Error('O cartão está disponível somente para colaboradores ativos.');
  }

  if (colaborador.qr_token && Number(colaborador.qr_ativo || 0) !== 1) {
    throw new Error('Seu cartão foi revogado. Procure o RH ou o administrador para uma nova emissão.');
  }

  if (colaborador.qr_token && Number(colaborador.qr_ativo || 0) === 1) return colaborador;
  return qrService.emitToken(colaborador.id, { rotate: false });
}

function getOwnCard(userId) {
  const { user, colaborador } = getPortalData(userId);
  if (!colaborador) throw new Error('Seu usuário ainda não está vinculado a um colaborador.');
  return { user, colaborador };
}

module.exports = {
  canManageLink,
  listAvailableColaboradores,
  linkOwnUserToColaborador,
  getPortalData,
  updateOwnPhoto,
  changeOwnPassword,
  ensureOwnCard,
  getOwnCard,
};
