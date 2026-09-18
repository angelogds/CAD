const bcrypt = require('bcryptjs');
const db = require('../../database/db');
const qrService = require('../colaboradores/colaboradores.qr.service');
const userQrService = require('../usuarios/usuarios.qr.service');
const { isDirectUserIdentityRole, deriveUserFunctionSector } = require('../usuarios/usuarios.perfil');

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
  const fields = [
    'id','name','email','role','photo_path','telefone_whatsapp','created_at',
    includePassword ? 'password_hash' : null,
    hasColumn('users','funcao') ? 'funcao' : 'NULL AS funcao',
    hasColumn('users','setor') ? 'setor' : 'NULL AS setor',
    hasColumn('users','qr_token') ? 'qr_token' : 'NULL AS qr_token',
    hasColumn('users','qr_ativo') ? 'qr_ativo' : '0 AS qr_ativo',
    hasColumn('users','qr_emitido_em') ? 'qr_emitido_em' : 'NULL AS qr_emitido_em',
    hasColumn('users','qr_revogado_em') ? 'qr_revogado_em' : 'NULL AS qr_revogado_em',
    'COALESCE(ativo,1) AS ativo',
    'deleted_at',
  ].filter(Boolean).join(',');

  const user = db.prepare(`SELECT ${fields} FROM users WHERE id = ? LIMIT 1`).get(Number(userId));
  if (!user) return null;
  const derived = deriveUserFunctionSector(user.role);
  user.funcao = user.funcao || derived.funcao || null;
  user.setor = user.setor || derived.setor || null;
  return user;
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
  if (!canManageLink(actorRole)) throw new Error('Somente o RH pode realizar o vínculo.');

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

  if (isDirectUserIdentityRole(user.role)) {
    return {
      user,
      colaborador: null,
      directUserIdentity: true,
      identidade: {
        identity_type: 'USUARIO',
        id: Number(user.id),
        user_id: Number(user.id),
        colaborador_id: null,
        nome: user.name,
        apelido: null,
        funcao: user.funcao || user.role,
        setor: user.setor || null,
        status: Number(user.ativo ?? 1) === 1 && !user.deleted_at ? 'ATIVO' : 'INATIVO',
        foto_url: user.photo_path || null,
        qr_token: user.qr_token || null,
        qr_ativo: Number(user.qr_ativo || 0),
        qr_emitido_em: user.qr_emitido_em || null,
        qr_revogado_em: user.qr_revogado_em || null,
      },
    };
  }

  const colaborador = getLinkedColaborador(userId);
  return {
    user,
    colaborador,
    directUserIdentity: false,
    identidade: colaborador ? {
      identity_type: 'COLABORADOR',
      id: Number(colaborador.id),
      user_id: Number(user.id),
      colaborador_id: Number(colaborador.id),
      nome: colaborador.nome,
      apelido: colaborador.apelido,
      funcao: colaborador.funcao,
      setor: colaborador.setor,
      status: colaborador.status,
      foto_url: colaborador.foto_url,
      qr_token: colaborador.qr_token,
      qr_ativo: colaborador.qr_ativo,
      qr_emitido_em: colaborador.qr_emitido_em,
      qr_revogado_em: colaborador.qr_revogado_em,
    } : null,
  };
}

function emptyMaterialHistory({ colaborador = null, identidade = null, filters = {}, available = true } = {}) {
  return {
    vinculado: Boolean(colaborador || identidade),
    disponivel: Boolean(available),
    colaborador,
    identidade,
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
  const portal = getPortalData(userId);
  const user = portal.user;
  const direct = Boolean(portal.directUserIdentity);
  const colaborador = portal.colaborador;
  const identidade = portal.identidade;

  if (!direct && !colaborador) return emptyMaterialHistory({ filters: normalizedFilters });

  const identityColumn = direct ? 'retirado_por_user_id' : 'retirado_por_colaborador_id';
  const schemaAvailable = tableExists('estoque_movimentos')
    && tableExists('estoque_itens')
    && hasColumn('estoque_movimentos', identityColumn);
  if (!schemaAvailable) {
    return emptyMaterialHistory({ colaborador, identidade, filters: normalizedFilters, available: false });
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
    `m.${identityColumn} = ?`,
    "UPPER(COALESCE(m.tipo,'')) LIKE 'SAIDA%'",
  ];
  const params = [direct ? Number(user.id) : Number(colaborador.id)];

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
    identidade,
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
  const portal = getPortalData(userId);

  if (portal.directUserIdentity) {
    const identity = portal.identidade;
    if (String(identity?.status || '').toUpperCase() !== 'ATIVO') {
      throw new Error('O cartão está disponível somente para usuário ativo.');
    }
    if (identity.qr_token && Number(identity.qr_ativo || 0) !== 1) {
      throw new Error('Seu cartão foi revogado. Procure o administrador para uma nova emissão.');
    }
    if (identity.qr_token && Number(identity.qr_ativo || 0) === 1) return userQrService.getById(userId);
    return userQrService.emitToken(userId, { rotate: false });
  }

  const colaborador = portal.colaborador;
  if (!colaborador) throw new Error('Seu usuário ainda não está vinculado a um colaborador. Procure o RH.');
  if (String(colaborador.status || '').toUpperCase() !== 'ATIVO') {
    throw new Error('O cartão está disponível somente para colaboradores ativos.');
  }
  if (colaborador.qr_token && Number(colaborador.qr_ativo || 0) !== 1) {
    throw new Error('Seu cartão foi revogado. Procure o RH para uma nova emissão.');
  }
  if (colaborador.qr_token && Number(colaborador.qr_ativo || 0) === 1) return colaborador;
  return qrService.emitToken(colaborador.id, { rotate: false });
}

function getOwnCard(userId) {
  const portal = getPortalData(userId);
  if (!portal.identidade) {
    throw new Error('Seu usuário ainda não possui uma identidade habilitada para o Almoxarifado.');
  }
  return portal;
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
