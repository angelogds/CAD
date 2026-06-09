const db = require("../../database/db");
const { normalizeRole } = require("../../config/rbac");

const STATUS = {
  ABERTA: "ABERTA",
  EM_COTACAO: "EM_COTACAO",
  AGUARDANDO_APROVACAO: "AGUARDANDO_APROVACAO",
  APROVADA_DIRETORIA: "APROVADA_DIRETORIA",
  DEVOLVIDA_REVISAO: "DEVOLVIDA_REVISAO",
  REPROVADA: "REPROVADA",
  COMPRADA: "COMPRADA",
  EM_RECEBIMENTO: "EM_RECEBIMENTO",
  RECEBIDA_PARCIAL: "RECEBIDA_PARCIAL",
  RECEBIDA_TOTAL: "RECEBIDA_TOTAL",
  SEPARADA_PARA_RETIRADA: "SEPARADA_PARA_RETIRADA",
  ENTREGUE_SOLICITANTE: "ENTREGUE_SOLICITANTE",
  FECHADA: "FECHADA",
  REABERTA: "REABERTA",
  CANCELADA: "CANCELADA",
};

const LIST_STATUS = [
  STATUS.ABERTA,
  STATUS.EM_COTACAO,
  STATUS.COMPRADA,
  STATUS.EM_RECEBIMENTO,
  STATUS.RECEBIDA_PARCIAL,
  STATUS.RECEBIDA_TOTAL,
  STATUS.FECHADA,
  STATUS.REABERTA,
  STATUS.CANCELADA,
];

function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
}

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function tableColumns(table) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name); } catch { return []; }
}

const columnExists = hasColumn;

function selectableColumn(table, preferred, fallback = "NULL") {
  return tableExists(table) && hasColumn(table, preferred) ? preferred : fallback;
}
const ITEM_HAS_ITEM_NOME = hasColumn("solicitacao_itens", "item_nome");
const ITEM_HAS_ITEM_DESCRICAO = hasColumn("solicitacao_itens", "item_descricao");
const ITEM_HAS_ESTOQUE_ITEM_ID = hasColumn("solicitacao_itens", "estoque_item_id");
const ITEM_HAS_QTD_SOLICITADA = hasColumn("solicitacao_itens", "qtd_solicitada");
const ITEM_HAS_ITEM_ID = hasColumn("solicitacao_itens", "item_id");
const ITEM_HAS_DESCRICAO = hasColumn("solicitacao_itens", "descricao");
const ITEM_HAS_QUANTIDADE = hasColumn("solicitacao_itens", "quantidade");

function getFallbackItemId() {
  const row = db.prepare("SELECT id FROM estoque_itens ORDER BY id LIMIT 1").get();
  if (row?.id) return row.id;
  const cols = db.prepare("PRAGMA table_info(estoque_itens)").all().map((c) => c.name);
  const payload = { codigo: "AUTO", nome: "Item automático", unidade: "UN", ativo: 1, estoque_min: 0, categoria: "GERAL" };
  const useCols = Object.keys(payload).filter((c) => cols.includes(c));
  const placeholders = useCols.map(() => "?").join(",");
  const info = db.prepare(`INSERT INTO estoque_itens (${useCols.join(",")}) VALUES (${placeholders})`).run(...useCols.map((c) => payload[c]));
  return Number(info.lastInsertRowid);
}


function canManageByRole(role) {
  const r = normalizeRole(role);
  return {
    isAdmin: r === "ADMIN",
    isCompras: r === "COMPRAS",
    isAlmox: r === "ALMOXARIFADO",
    isDiretoria: ["DIRETORIA", "GESTAO"].includes(r),
    isSolicitante: ["ENCARREGADO_MANUTENCAO", "MANUTENCAO_SUPERVISOR", "ENCARREGADO_PRODUCAO", "INSPECAO_QUALIDADE"].includes(r),
  };
}

function canViewSolicitacao(solicitacao, user) {
  if (!solicitacao || !user) return false;
  const roleInfo = canManageByRole(user.role);
  return roleInfo.isAdmin
    || roleInfo.isCompras
    || roleInfo.isAlmox
    || roleInfo.isDiretoria
    || Number(solicitacao.solicitante_user_id) === Number(user.id);
}

function canEditSolicitacao(solicitacao, user) {
  if (!solicitacao || !user) return false;
  const role = normalizeRole(user.role);
  const editableStatuses = [STATUS.ABERTA, STATUS.DEVOLVIDA_REVISAO];
  const isOwner = Number(solicitacao.solicitante_user_id) === Number(user.id);
  const isManager = ["ADMIN", "ENCARREGADO_MANUTENCAO", "MANUTENCAO_SUPERVISOR"].includes(role);
  return editableStatuses.includes(solicitacao.status) && (isOwner || isManager);
}

function nextNumero() {
  const year = new Date().getFullYear();
  const like = `SOL-${year}-%`;
  const row = db.prepare("SELECT numero FROM solicitacoes WHERE numero LIKE ? ORDER BY id DESC LIMIT 1").get(like);
  const seq = row?.numero ? Number(String(row.numero).split("-").pop()) + 1 : 1;
  return `SOL-${year}-${String(seq).padStart(6, "0")}`;
}

function sanitizePositiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function validateEstoqueItemId(value) {
  const id = sanitizePositiveId(value);
  if (!id) return null;
  const exists = db.prepare("SELECT 1 FROM estoque_itens WHERE id = ?").get(id);
  return exists ? id : null;
}

function createSolicitacao({ userId, setor_origem, prioridade, titulo, descricao, equipamento_id, preventiva_id, os_id, demanda_id, itens }) {
  const fallbackItemId = ITEM_HAS_ITEM_ID ? getFallbackItemId() : null;
  const solColumns = tableColumns("solicitacoes");
  const solPayload = {
    numero: nextNumero(),
    solicitante_user_id: sanitizePositiveId(userId),
    setor_origem: setor_origem || "Manutenção",
    prioridade: prioridade || "MEDIA",
    titulo: titulo || "Solicitação de material",
    descricao: descricao || null,
    equipamento_id: sanitizePositiveId(equipamento_id),
    preventiva_id: sanitizePositiveId(preventiva_id),
    os_id: sanitizePositiveId(os_id),
    demanda_id: sanitizePositiveId(demanda_id),
    tipo_origem: sanitizePositiveId(os_id) ? "OS" : "SOLICITACAO",
    status: STATUS.ABERTA,
  };
  const insertSolColumns = Object.keys(solPayload).filter((column) => solColumns.includes(column));
  const insertSol = db.prepare(`
    INSERT INTO solicitacoes (${insertSolColumns.join(", ")})
    VALUES (${insertSolColumns.map(() => "?").join(", ")})
  `);

  const itemColumns = ["solicitacao_id"];
  if (ITEM_HAS_ITEM_NOME) itemColumns.push("item_nome");
  if (ITEM_HAS_ITEM_DESCRICAO) itemColumns.push("item_descricao");
  itemColumns.push("unidade");
  if (ITEM_HAS_ESTOQUE_ITEM_ID) itemColumns.push("estoque_item_id");
  if (ITEM_HAS_QTD_SOLICITADA) itemColumns.push("qtd_solicitada");
  if (ITEM_HAS_ITEM_ID) itemColumns.push("item_id");
  if (ITEM_HAS_DESCRICAO) itemColumns.push("descricao");
  if (ITEM_HAS_QUANTIDADE) itemColumns.push("quantidade");
  const insertItem = db.prepare(`INSERT INTO solicitacao_itens (${itemColumns.join(",")}) VALUES (${itemColumns.map(() => "?").join(",")})`);

  return db.transaction(() => {
    const info = insertSol.run(...insertSolColumns.map((column) => solPayload[column]));

    const solicitacaoId = Number(info.lastInsertRowid);

    for (const item of itens || []) {
      const row = [solicitacaoId];
      if (ITEM_HAS_ITEM_NOME) row.push(item.item_nome);
      if (ITEM_HAS_ITEM_DESCRICAO) row.push(item.item_descricao || null);
      row.push((item.unidade || "UN").toUpperCase());
      const estoqueItemId = validateEstoqueItemId(item.estoque_item_id);
      if (ITEM_HAS_ESTOQUE_ITEM_ID) row.push(estoqueItemId);
      if (ITEM_HAS_QTD_SOLICITADA) row.push(Number(item.qtd_solicitada || 0));
      if (ITEM_HAS_ITEM_ID) row.push(estoqueItemId || fallbackItemId || null);
      if (ITEM_HAS_DESCRICAO) row.push(item.item_descricao || item.item_nome);
      if (ITEM_HAS_QUANTIDADE) row.push(Number(item.qtd_solicitada || 0));
      insertItem.run(...row);
    }

    return solicitacaoId;
  })();
}

function parseItensFromBody(body = {}) {
  const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === "") return [];
    return [value];
  };

  const nomes = toArray(body.itens_nome ?? body['itens_nome[]'] ?? body.item_nome);
  const especificacoes = toArray(body.itens_especificacao ?? body['itens_especificacao[]'] ?? body.item_descricao);
  const unidades = toArray(body.itens_un ?? body['itens_un[]'] ?? body.unidade);
  const quantidades = toArray(body.itens_qtd ?? body['itens_qtd[]'] ?? body.qtd_solicitada);
  const itemIds = toArray(body.itens_item_id ?? body['itens_item_id[]'] ?? body.estoque_item_id);

  const tamanho = Math.max(nomes.length, especificacoes.length, unidades.length, quantidades.length, itemIds.length);
  return Array.from({ length: tamanho }, (_, i) => ({
    item_nome: String(nomes[i] || "").trim(),
    item_descricao: String(especificacoes[i] || "").trim(),
    unidade: String(unidades[i] || "UN").trim() || "UN",
    qtd_solicitada: Number(quantidades[i] || 0),
    estoque_item_id: itemIds[i] ? Number(itemIds[i]) : null,
  })).filter((item) => item.item_nome && item.qtd_solicitada > 0);
}

function insertSolicitacaoItens(solicitacaoId, itens) {
  const fallbackItemId = ITEM_HAS_ITEM_ID ? getFallbackItemId() : null;
  const itemColumns = ["solicitacao_id"];
  if (ITEM_HAS_ITEM_NOME) itemColumns.push("item_nome");
  if (ITEM_HAS_ITEM_DESCRICAO) itemColumns.push("item_descricao");
  itemColumns.push("unidade");
  if (ITEM_HAS_ESTOQUE_ITEM_ID) itemColumns.push("estoque_item_id");
  if (ITEM_HAS_QTD_SOLICITADA) itemColumns.push("qtd_solicitada");
  if (ITEM_HAS_ITEM_ID) itemColumns.push("item_id");
  if (ITEM_HAS_DESCRICAO) itemColumns.push("descricao");
  if (ITEM_HAS_QUANTIDADE) itemColumns.push("quantidade");
  const insertItem = db.prepare(`INSERT INTO solicitacao_itens (${itemColumns.join(",")}) VALUES (${itemColumns.map(() => "?").join(",")})`);

  for (const item of itens || []) {
    const row = [solicitacaoId];
    if (ITEM_HAS_ITEM_NOME) row.push(item.item_nome);
    if (ITEM_HAS_ITEM_DESCRICAO) row.push(item.item_descricao || null);
    row.push((item.unidade || "UN").toUpperCase());
    const estoqueItemId = validateEstoqueItemId(item.estoque_item_id);
    if (ITEM_HAS_ESTOQUE_ITEM_ID) row.push(estoqueItemId);
    if (ITEM_HAS_QTD_SOLICITADA) row.push(Number(item.qtd_solicitada || 0));
    if (ITEM_HAS_ITEM_ID) row.push(estoqueItemId || fallbackItemId || null);
    if (ITEM_HAS_DESCRICAO) row.push(item.item_descricao || item.item_nome);
    if (ITEM_HAS_QUANTIDADE) row.push(Number(item.qtd_solicitada || 0));
    insertItem.run(...row);
  }
}

function updateSolicitacao(id, data = {}) {
  const itens = data.itens || parseItensFromBody(data);
  if (!itens.length) throw new Error("Informe ao menos um item válido.");

  return db.transaction(() => {
    db.prepare(`
      UPDATE solicitacoes
      SET setor_origem = ?, prioridade = ?, titulo = ?, descricao = ?, equipamento_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      data.setor_origem || "Manutenção",
      data.prioridade || "MEDIA",
      data.titulo,
      data.descricao || null,
      sanitizePositiveId(data.equipamento_id),
      id
    );

    db.prepare("DELETE FROM solicitacao_itens WHERE solicitacao_id = ?").run(id);
    insertSolicitacaoItens(id, itens);
    return getSolicitacaoById(id);
  })();
}

function canListAllSolicitacoes(user) {
  const role = normalizeRole(user?.role);
  return ["ADMIN", "COMPRAS", "ALMOXARIFADO", "DIRETORIA", "GESTAO", "ENCARREGADO_MANUTENCAO", "MANUTENCAO_SUPERVISOR"].includes(role);
}

function listMinhasSolicitacoes(userId, filters = {}, user = null) {
  const where = [];
  const params = [];
  if (!canListAllSolicitacoes(user)) {
    where.push("s.solicitante_user_id = ?");
    params.push(userId);
  }

  if (Object.values(STATUS).includes(filters.status)) {
    where.push("s.status = ?");
    params.push(filters.status);
  }

  if (filters.vinculadasOs) where.push("s.os_id IS NOT NULL");
  if (filters.urgentes) where.push("UPPER(COALESCE(s.prioridade, '')) IN ('ALTA','URGENTE','CRITICA','CRÍTICA','EMERGENCIAL')");

  if (filters.query) {
    where.push("(LOWER(COALESCE(s.numero,'')) LIKE ? OR LOWER(COALESCE(s.titulo,'')) LIKE ? OR LOWER(COALESCE(s.setor_origem,'')) LIKE ? OR LOWER(COALESCE(u.name,'')) LIKE ?)");
    const q = `%${String(filters.query).trim().toLowerCase()}%`;
    params.push(q, q, q, q);
  }

  if (filters.date) {
    where.push("date(s.created_at) = date(?)");
    params.push(filters.date);
  }

  const hasEquipamentoId = hasColumn("solicitacoes", "equipamento_id");
  const equipJoin = hasEquipamentoId && tableExists("equipamentos") ? "LEFT JOIN equipamentos e ON e.id = s.equipamento_id" : "";
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`
    SELECT s.*, u.name AS solicitante_nome,
      ${equipJoin ? "e.nome" : "NULL"} AS equipamento_nome,
      (SELECT COUNT(*) FROM solicitacao_itens i WHERE i.solicitacao_id = s.id) AS itens_count
    FROM solicitacoes s
    LEFT JOIN users u ON u.id = s.solicitante_user_id
    ${equipJoin}
    ${whereSql}
    ORDER BY s.id DESC
  `).all(...params);
}

function getCountersForUser(userId, user = null) {
  const where = canListAllSolicitacoes(user) ? "" : "WHERE solicitante_user_id = ?";
  const rows = db.prepare(`SELECT status, COUNT(*) AS total FROM solicitacoes ${where} GROUP BY status`).all(...(where ? [userId] : []));
  const counters = LIST_STATUS.reduce((acc, st) => ({ ...acc, [st]: 0 }), {});
  rows.forEach((r) => { if (Object.prototype.hasOwnProperty.call(counters, r.status)) counters[r.status] = r.total; });
  return counters;
}

function getSolicitacaoById(id) {
  if (!Number.isFinite(Number(id)) || Number(id) <= 0) return null;

  const usersTable = tableExists("users") ? "users" : (tableExists("usuarios") ? "usuarios" : null);
  const usersNameCol = usersTable ? selectableColumn(usersTable, "name", selectableColumn(usersTable, "nome", null)) : null;
  const usersRoleCol = usersTable ? selectableColumn(usersTable, "role", selectableColumn(usersTable, "perfil", null)) : null;
  const hasComprasUserId = hasColumn("solicitacoes", "compras_user_id");
  const hasAlmoxUserId = hasColumn("solicitacoes", "almox_user_id");
  const hasEquipamentoId = hasColumn("solicitacoes", "equipamento_id");
  const hasSolicitacaoItens = tableExists("solicitacao_itens");
  const hasItemNome = hasColumn("solicitacao_itens", "item_nome");
  const hasItemDescricao = hasColumn("solicitacao_itens", "item_descricao");
  const hasDescricao = hasColumn("solicitacao_itens", "descricao");
  const hasQtdSolicitada = hasColumn("solicitacao_itens", "qtd_solicitada");
  const hasQuantidade = hasColumn("solicitacao_itens", "quantidade");
  const hasQtdRecebidaTotal = hasColumn("solicitacao_itens", "qtd_recebida_total");
  const hasEstoqueItemId = hasColumn("solicitacao_itens", "estoque_item_id");
  const hasItemId = hasColumn("solicitacao_itens", "item_id");
  const hasEstoqueItens = tableExists("estoque_itens");
  const estoqueCodigoExpr = hasEstoqueItens && hasColumn("estoque_itens", "codigo") ? "ei.codigo" : "NULL";
  const userJoin = usersTable ? `LEFT JOIN ${usersTable} u ON u.id = s.solicitante_user_id` : "";
  const comprasJoin = usersTable && hasComprasUserId ? `LEFT JOIN ${usersTable} cu ON cu.id = s.compras_user_id` : "";
  const almoxJoin = usersTable && hasAlmoxUserId ? `LEFT JOIN ${usersTable} au ON au.id = s.almox_user_id` : "";

  const sol = db.prepare(`
    SELECT s.*, ${usersNameCol ? `u.${usersNameCol}` : "NULL"} AS solicitante_nome, ${usersRoleCol ? `u.${usersRoleCol}` : "NULL"} AS solicitante_role,
           ${usersNameCol && hasComprasUserId ? `cu.${usersNameCol}` : "NULL"} AS compras_nome,
           ${usersNameCol && hasAlmoxUserId ? `au.${usersNameCol}` : "NULL"} AS almox_nome,
           ${hasEquipamentoId && tableExists("equipamentos") ? "e.nome" : "NULL"} AS equipamento_nome
    FROM solicitacoes s
    ${userJoin}
    ${comprasJoin}
    ${almoxJoin}
    ${hasEquipamentoId && tableExists("equipamentos") ? "LEFT JOIN equipamentos e ON e.id = s.equipamento_id" : ""}
    WHERE s.id = ?
  `).get(id);
  if (!sol) return null;
  const estoqueNomeExpr = hasEstoqueItens && hasColumn("estoque_itens", "nome") ? "ei.nome" : "NULL";
  const itemNomeExpr = hasItemNome && hasDescricao
    ? `COALESCE(si.item_nome, si.descricao, ${estoqueNomeExpr})`
    : hasItemNome
      ? `COALESCE(si.item_nome, ${estoqueNomeExpr})`
      : hasDescricao
        ? `COALESCE(si.descricao, ${estoqueNomeExpr})`
        : `COALESCE(${estoqueNomeExpr}, '')`;
  const itemDescricaoExpr = hasItemDescricao && hasDescricao
    ? "COALESCE(si.item_descricao, si.descricao)"
    : hasItemDescricao
      ? "si.item_descricao"
      : hasDescricao
        ? "si.descricao"
        : "''";
  const qtdSolicitadaExpr = hasQtdSolicitada && hasQuantidade
    ? "COALESCE(si.qtd_solicitada, si.quantidade, 0)"
    : hasQtdSolicitada
      ? "COALESCE(si.qtd_solicitada, 0)"
      : hasQuantidade
        ? "COALESCE(si.quantidade, 0)"
        : "0";
  const qtdRecebidaExpr = hasQtdRecebidaTotal ? "COALESCE(si.qtd_recebida_total, 0)" : "0";
  const itemJoinExpr = hasEstoqueItemId && hasItemId
    ? "COALESCE(si.estoque_item_id, si.item_id)"
    : hasEstoqueItemId
      ? "si.estoque_item_id"
      : hasItemId
        ? "si.item_id"
        : "NULL";

  const estoqueJoin = hasEstoqueItens ? `LEFT JOIN estoque_itens ei ON ei.id = ${itemJoinExpr}` : "";
  const itens = hasSolicitacaoItens ? db.prepare(`
    SELECT si.*, ${itemNomeExpr} AS item_nome, ${itemDescricaoExpr} AS item_descricao,
           ${qtdSolicitadaExpr} AS qtd_solicitada, ${qtdRecebidaExpr} AS qtd_recebida_total,
           (${qtdSolicitadaExpr} - ${qtdRecebidaExpr}) AS qtd_pendente, ${estoqueCodigoExpr} AS estoque_codigo
    FROM solicitacao_itens si
    ${estoqueJoin}
    WHERE si.solicitacao_id = ?
    ORDER BY si.id
  `).all(id) : [];
  return { ...sol, itens, anexos: listAnexosSolicitacao(id) };
}

function listAnexosSolicitacao(solicitacaoId) {
  if (!tableExists("compras_anexos")) return [];
  const columns = db.prepare("PRAGMA table_info(compras_anexos)").all().map((c) => c.name);
  const hasReferencia = columns.includes("referencia_tipo") && columns.includes("referencia_id");
  const hasSolicitacaoId = columns.includes("solicitacao_id");

  const clauses = [];
  const params = [];
  if (hasReferencia) {
    clauses.push("(referencia_tipo = 'SOLICITACAO' AND referencia_id = ?)");
    params.push(solicitacaoId);
  }
  if (hasSolicitacaoId) {
    clauses.push("solicitacao_id = ?");
    params.push(solicitacaoId);
  }
  if (!clauses.length) return [];

  return db.prepare(`
    SELECT *
    FROM compras_anexos
    WHERE ${clauses.join(" OR ")}
    ORDER BY id
  `).all(...params);
}

function listEquipamentos() {
  return db.prepare("SELECT id, nome FROM equipamentos ORDER BY nome").all();
}

function listEstoqueItens() {
  return db.prepare("SELECT id, codigo, nome, unidade FROM estoque_itens WHERE ativo = 1 ORDER BY nome").all();
}

module.exports = { STATUS, LIST_STATUS, canManageByRole, canViewSolicitacao, canEditSolicitacao, parseItensFromBody, createSolicitacao, updateSolicitacao, listMinhasSolicitacoes, getCountersForUser, getSolicitacaoById, listEquipamentos, listEstoqueItens };
