const crypto = require('node:crypto');
const { normalizeRole } = require('../../config/rbac');

function sessionRevision(user) {
  return crypto.createHash('sha256').update(JSON.stringify([
    Number(user.id), String(user.password_hash || ''), normalizeRole(user.role),
  ])).digest('hex');
}

function validateCurrentSession(req, _res, next) {
  const current = req.session?.user;
  if (!current) return next();
  try {
    const user = require('./auth.service').getUserById(current.id);
    if (!user || Number(user.ativo ?? 1) !== 1 || user.deleted_at
        || !current.auth_revision || current.auth_revision !== sessionRevision(user)) {
      // Mantém a sessão anônima disponível para o flash/login, sem poderes antigos.
      delete req.session.user;
      return req.session.save(next);
    }
    current.name = user.name;
    current.photo_path = user.photo_path || null;
    return next();
  } catch (error) { return next(error); }
}

module.exports = { sessionRevision, validateCurrentSession };
