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

function tableExists(name) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE (type='table' OR type='view') AND name=?").get(name));
  } catch (_error) {
    return false;
  }
}

function hasColumn(table, name) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
  } catch (_error) {
    return false;
  }
}

function normalizeISODate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return '';
  return raw;
}

function normalizeMaterialFilters(filters = {}) {
  const normalized = {
    q: String(filters.q || '').trim().slice(0, 80),
    inicio: normalizeISODate(filters.inicio),
    fim: normalizeISODate(filters.fim),
  };
  if (normalized.inicio && normalized.fim && normalized.inicio > normalized.fim) {
    throw new Error('Período inválido: a data inicial não pode ser posterior à data final.');
  }
  return normalized;
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

function emptyMaterialHistory({ colaborador = null, filters = {}, available = true } = {}) {
  return {
    vinculado: Boolean(colaborador),
    disponivel: Boolean(available),
    colaborador,
    filtros: filters,
    resumo: {
      totalRetiradas: 0,
      materiaisDiferentes: 0,
      osVinculadas: 0,
      ultimaRetirada: null,
    },
    movimentos: [],
    limiteAtingido: false,
  };
}

function listOwnMaterialWithdrawals(userId, filters = {}) {
  const normalizedFilters = normalizeMaterialFilters(filters);
  const colaborador = getLinkedColaborador(userId);
  if (!colaborador) return emptyMaterialHistory({ filters: normalizedFilters });

  const schemaAvailable = tableExists('estoque_movimentos')
    && tableExists('estoque_itens')
    && hasColumn('estoque_movimentos', 'retirado_por_colaborador_id');
  if (!schemaAvailable) {
    return emptyMaterialHistory({ colaborador, filters: normalizedFilters, available: false });
  }

  const hasDataMov = hasColumn('estoque_movimentos', 'data_mov');
  const hasOsId = hasColumn('estoque_movimentos', 'os_id');
  const hasEquipamentoId = hasColumn('estoque_movimentos', 'equipamento_id');
  const hasSolicitacaoId = hasColumn('estoque_movimentos', 'solicitacao_id');
  const hasEntreguePor = hasColumn('estoque_movimentos', 'entregue_por_user_id');
  const hasOrigem = hasColumn('estoque_movimentos', 'identificacao_origem');
  const hasItemUnidade = hasColumn('estoque_itens', 'unidade');
  const canJoinSolicitacao = hasSolicitacaoId && tableExists('solicitacoes') && hasColumn('solicitacoes', 'numero');
  const canJoinEquipamento = hasEquipamentoId && tableExists('equipamentos') && hasColumn('equipamentos', 'nome');
  const canJoinEntreguePor = hasEntreguePor && tableExists('users');
  const dataExpr = hasDataMov ? 'COALESCE(m.data_mov,m.created_at)' : 'm.created_at';

  const where = [
    'm.retirado_por_colaborador_id = ?',
    "UPPER(COALESCE(m.tipo,'')) LIKE 'SAIDA%'",
  ];
  const params = [Number(colaborador.id)];

  if (normalizedFilters.inicio) {
    where.push(`date(${dataExpr}) >= date(?)`);
    params.push(normalizedFilters.inicio);
  }
  if (normalizedFilters.fim) {
    where.push(`date(${dataExpr}) <= date(?)`);
    params.push(normalizedFilters.fim);
  }
  if (normalizedFilters.q) {
    where.push("LOWER(COALESCE(i.nome,'')) LIKE ?");
    params.push(`%${normalizedFilters.q.toLowerCase()}%`);
  }

  const whereSql = where.join(' AND ');
  const resumo = db.prepare(`
    SELECT
      COUNT(*) total_retiradas,
      COUNT(DISTINCT m.item_id) materiais_diferentes,
      ${hasOsId ? 'COUNT(DISTINCT m.os_id)' : '0'} os_vinculadas,
      MAX(${dataExpr}) ultima_retirada
    FROM estoque_movimentos m
    JOIN estoque_itens i ON i.id = m.item_id
    WHERE ${whereSql}
  `).get(...params);

  const solicitacaoJoin = canJoinSolicitacao ? 'LEFT JOIN solicitacoes s ON s.id=m.solicitacao_id' : '';
  const equipamentoJoin = canJoinEquipamento ? 'LEFT JOIN equipamentos eq ON eq.id=m.equipamento_id' : '';
  const entregueJoin = canJoinEntreguePor ? 'LEFT JOIN users eu ON eu.id=m.entregue_por_user_id' : '';
  const movimentos = db.prepare(`
    SELECT
      m.id,
      ${dataExpr} data_mov,
      ABS(COALESCE(m.quantidade,0)) quantidade,
      i.nome item_nome,
      ${hasItemUnidade ? "COALESCE(i.unidade,'UN')" : "'UN'"} item_unidade,
      ${hasOsId ? 'm.os_id' : 'NULL'} os_id,
      ${hasSolicitacaoId ? 'm.solicitacao_id' : 'NULL'} solicitacao_id,
      ${canJoinSolicitacao ? 's.numero' : 'NULL'} solicitacao_numero,
      ${hasEquipamentoId ? 'm.equipamento_id' : 'NULL'} equipamento_id,
      ${canJoinEquipamento ? 'eq.nome' : 'NULL'} equipamento_nome,
      ${canJoinEntreguePor ? 'eu.name' : 'NULL'} entregue_por_nome,
      ${hasOrigem ? 'm.identificacao_origem' : 'NULL'} identificacao_origem
    FROM estoque_movimentos m
    JOIN estoque_itens i ON i.id = m.item_id
    ${solicitacaoJoin}
    ${equipamentoJoin}
    ${entregueJoin}
    WHERE ${whereSql}
    ORDER BY ${dataExpr} DESC, m.id DESC
    LIMIT 300
  `).all(...params);

  return {
    vinculado: true,
    disponivel: true,
    colaborador,
    filtros: normalizedFilters,
    resumo: {
      totalRetiradas: Number(resumo?.total_retiradas || 0),
      materiaisDiferentes: Number(resumo?.materiais_diferentes || 0),
      osVinculadas: Number(resumo?.os_vinculadas || 0),
      ultimaRetirada: resumo?.ultima_retirada || null,
    },
    movimentos,
    limiteAtingido: movimentos.length >= 300,
  };
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
  listOwnMaterialWithdrawals,
  updateOwnPhoto,
  changeOwnPassword,
  ensureOwnCard,
  getOwnCard,
};
