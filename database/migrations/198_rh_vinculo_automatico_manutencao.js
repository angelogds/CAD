function normalizeName(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

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

const ELIGIBLE_ROLES = new Set([
  'MECANICO',
  'MANUTENCAO_SUPERVISOR',
  'ENCARREGADO_MANUTENCAO',
]);

module.exports = function up({ db, tableExists, columnExists }) {
  if (!tableExists('users') || !tableExists('colaboradores')) return;
  if (!columnExists('colaboradores', 'user_id')) return;

  const conditions = [
    'COALESCE(c.ativo, 1) = 1',
    "COALESCE(c.deleted_at, '') = ''",
    "upper(COALESCE(c.status, 'ATIVO')) NOT IN ('INATIVO','DESLIGADO','EXCLUIDO','REMOVIDO','APAGADO')",
  ];
  if (columnExists('colaboradores', 'fora_escala')) conditions.push('COALESCE(c.fora_escala, 0) = 0');
  if (columnExists('colaboradores', 'integridade_pendente')) conditions.push('COALESCE(c.integridade_pendente, 0) = 0');

  const currentWhere = conditions.join(' AND ');
  const users = db.prepare('SELECT id, name, role FROM users ORDER BY id ASC').all();
  const currentCollaborators = db.prepare(`
    SELECT c.id, c.nome, c.user_id
    FROM colaboradores c
    WHERE ${currentWhere}
    ORDER BY c.id ASC
  `).all();

  const byName = new Map();
  for (const collaborator of currentCollaborators) {
    const key = normalizeName(collaborator.nome);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(collaborator);
  }

  const anyLink = db.prepare('SELECT id FROM colaboradores WHERE user_id = ? LIMIT 1');
  const updateSql = columnExists('colaboradores', 'updated_at')
    ? "UPDATE colaboradores SET user_id = ?, updated_at = datetime('now') WHERE id = ? AND (user_id IS NULL OR user_id = 0 OR user_id = ?)"
    : 'UPDATE colaboradores SET user_id = ? WHERE id = ? AND (user_id IS NULL OR user_id = 0 OR user_id = ?)';
  const update = db.prepare(updateSql);

  const apply = db.transaction(() => {
    for (const user of users) {
      if (!ELIGIBLE_ROLES.has(normalizeRole(user.role))) continue;
      if (anyLink.get(Number(user.id))) continue;

      const candidates = byName.get(normalizeName(user.name)) || [];
      if (candidates.length !== 1) continue;

      const candidate = candidates[0];
      const owner = Number(candidate.user_id || 0);
      if (owner && owner !== Number(user.id)) continue;

      update.run(Number(user.id), Number(candidate.id), Number(user.id));
    }
  });

  apply();
};
