const db = require('../../database/db');

const MAINTENANCE_SELF_SERVICE_ROLES = new Set([
  'MECANICO',
  'MANUTENCAO_SUPERVISOR',
  'ENCARREGADO_MANUTENCAO',
]);

function normalizeRole(value) {
  const role = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (role === 'MANUTENCAO' || role === 'SUPERVISOR_MANUTENCAO') return 'MANUTENCAO_SUPERVISOR';
  if (['ENCARREGADO', 'ENCARREGADO_DE_MANUTENCAO'].includes(role)) return 'ENCARREGADO_MANUTENCAO';
  return role;
}

function normalizeName(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function hasColumn(table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
  } catch (_error) {
    return false;
  }
}

function canUseMaintenanceSelfService(role) {
  return MAINTENANCE_SELF_SERVICE_ROLES.has(normalizeRole(role));
}

function currentCollaboratorWhere(alias = 'c') {
  const conditions = [
    `COALESCE(${alias}.ativo, 1) = 1`,
    `COALESCE(${alias}.deleted_at, '') = ''`,
    `upper(COALESCE(${alias}.status, 'ATIVO')) NOT IN ('INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO')`,
  ];

  if (hasColumn('colaboradores', 'fora_escala')) {
    conditions.push(`COALESCE(${alias}.fora_escala, 0) = 0`);
  }
  if (hasColumn('colaboradores', 'integridade_pendente')) {
    conditions.push(`COALESCE(${alias}.integridade_pendente, 0) = 0`);
  }

  return conditions.join('\n      AND ');
}

function findExistingLink(userId) {
  return db.prepare(`
    SELECT c.id, c.nome, c.user_id
    FROM colaboradores c
    WHERE c.user_id = ?
      AND ${currentCollaboratorWhere('c')}
    LIMIT 1
  `).get(Number(userId));
}

function findAnyLink(userId) {
  return db.prepare(`
    SELECT c.id, c.nome, c.user_id, c.ativo, c.status, c.deleted_at
    FROM colaboradores c
    WHERE c.user_id = ?
    ORDER BY c.id ASC
    LIMIT 1
  `).get(Number(userId));
}

function candidateRowsByName(name) {
  const key = normalizeName(name);
  if (!key) return [];

  const whereCurrent = currentCollaboratorWhere('c');
  if (hasColumn('colaboradores', 'nome_integridade')) {
    return db.prepare(`
      SELECT c.id, c.nome, c.user_id, c.foto_url
      FROM colaboradores c
      WHERE c.nome_integridade = ?
        AND ${whereCurrent}
      ORDER BY c.id ASC
    `).all(key);
  }

  return db.prepare(`
    SELECT c.id, c.nome, c.user_id, c.foto_url
    FROM colaboradores c
    WHERE ${whereCurrent}
    ORDER BY c.id ASC
  `).all().filter((row) => normalizeName(row.nome) === key);
}

function ensureAutomaticMaintenanceLink(userId) {
  const id = Number(userId);
  if (!id) return { status: 'INVALID_USER', colaboradorId: null };

  const user = db.prepare(`
    SELECT id, name, role, photo_path
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(id);

  if (!user || !canUseMaintenanceSelfService(user.role)) {
    return { status: 'NOT_ELIGIBLE', colaboradorId: null };
  }

  const existing = findExistingLink(id);
  if (existing?.id) {
    return { status: 'LINKED', colaboradorId: Number(existing.id) };
  }

  // Se já existe qualquer vínculo antigo/inativo, não criamos um segundo vínculo
  // automaticamente. O histórico deve continuar preso ao mesmo colaborador.
  const staleLink = findAnyLink(id);
  if (staleLink?.id) {
    return { status: 'INACTIVE_LINK', colaboradorId: Number(staleLink.id) };
  }

  const candidates = candidateRowsByName(user.name);
  if (candidates.length !== 1) {
    return {
      status: candidates.length > 1 ? 'AMBIGUOUS' : 'NOT_FOUND',
      colaboradorId: null,
    };
  }

  const candidate = candidates[0];
  const candidateUserId = Number(candidate.user_id || 0);
  if (candidateUserId && candidateUserId !== id) {
    return { status: 'ALREADY_LINKED_TO_OTHER_USER', colaboradorId: null };
  }

  const tx = db.transaction(() => {
    const result = db.prepare(`
      UPDATE colaboradores
      SET user_id = ?, updated_at = datetime('now')
      WHERE id = ?
        AND (user_id IS NULL OR user_id = 0 OR user_id = ?)
        AND ${currentCollaboratorWhere('colaboradores')}
    `).run(id, Number(candidate.id), id);

    if (!result.changes) return false;

    if (!user.photo_path && candidate.foto_url) {
      db.prepare('UPDATE users SET photo_path = ? WHERE id = ?').run(candidate.foto_url, id);
    }
    return true;
  });

  if (!tx()) return { status: 'CONFLICT', colaboradorId: null };
  return { status: 'AUTO_LINKED', colaboradorId: Number(candidate.id) };
}

function attachAutomaticMaintenanceLink(req, res, next) {
  const user = req.session?.user || {};
  const eligible = canUseMaintenanceSelfService(user.role);
  res.locals.maintenanceSelfService = eligible;

  if (!eligible) return next();
  try {
    res.locals.maintenanceLink = ensureAutomaticMaintenanceLink(user.id);
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireMaintenanceSelfService(req, res, next) {
  const user = req.session?.user || {};
  if (!canUseMaintenanceSelfService(user.role)) {
    req.flash?.('error', 'Este autoatendimento está liberado inicialmente apenas para a equipe de Manutenção.');
    return res.redirect('/meu-portal');
  }

  try {
    const result = ensureAutomaticMaintenanceLink(user.id);
    if (['LINKED', 'AUTO_LINKED'].includes(result.status)) return next();

    const messages = {
      AMBIGUOUS: 'Há mais de uma ficha compatível com seu nome. O RH deve revisar o cadastro antes do vínculo.',
      INACTIVE_LINK: 'Seu usuário possui um vínculo antigo/inativo. O RH deve revisar a ficha antes de liberar o autoatendimento.',
      ALREADY_LINKED_TO_OTHER_USER: 'A ficha encontrada já está vinculada a outro usuário. O RH deve revisar o cadastro.',
      NOT_FOUND: 'Não encontramos uma ficha ativa da Manutenção com o mesmo nome do seu usuário.',
    };
    req.flash?.('error', messages[result.status] || 'Não foi possível confirmar seu vínculo com a ficha de colaborador.');
    return res.redirect('/meu-portal');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  MAINTENANCE_SELF_SERVICE_ROLES,
  normalizeRole,
  normalizeName,
  canUseMaintenanceSelfService,
  ensureAutomaticMaintenanceLink,
  attachAutomaticMaintenanceLink,
  requireMaintenanceSelfService,
};
