const bcrypt = require('bcryptjs');
const db = require('../../database/db');
const qrService = require('../colaboradores/colaboradores.qr.service');

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
  getPortalData,
  updateOwnPhoto,
  changeOwnPassword,
  ensureOwnCard,
  getOwnCard,
};
