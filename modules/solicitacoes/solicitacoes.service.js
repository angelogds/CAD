const db = require("../../database/db");
const { normalizeRole } = require("../../config/rbac");

const STATUS = {
  ABERTA: "ABERTA",
  EM_COTACAO: "EM_COTACAO",
  COMPRADA: "COMPRADA",
  EM_RECEBIMENTO: "EM_RECEBIMENTO",
  RECEBIDA_PARCIAL: "RECEBIDA_PARCIAL",
  RECEBIDA_TOTAL: "RECEBIDA_TOTAL",
  FECHADA: "FECHADA",
  REABERTA: "REABERTA",
};

function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
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
    isSolicitante: ["ENCARREGADO_MANUTENCAO", "MANUTENCAO_SUPERVISOR", "ENCARREGADO_PRODUCAO"].includes(r),
  };
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
  const insertSol = db.prepare(`
    INSERT INTO solicitacoes (
      numero, solicitante_user_id, setor_origem, prioridade, titulo, descricao, equipamento_id, preventiva_id, os_id, demanda_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    const numero = nextNumero();
    const info = insertSol.run(
      numero,
      userId,
      setor_origem || "Manutenção",
      prioridade || "MEDIA",
      titulo,
      descricao || null,
      sanitizePositiveId(equipamento_id),
      sanitizePositiveId(preventiva_id),
      sanitizePositiveId(os_id),
      sanitizePositiveId(demanda_id),
      STATUS.ABERTA
    );

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

function listMinhasSolicitacoes(userId, filters = {}) {
  const where = ["s.solicitante_user_id = ?"];
  const params = [userId];

  if (Object.values(STATUS).includes(filters.status)) {
    where.push("s.status = ?");
    params.push(filters.status);
  }

  if (filters.query) {
    where.push("(LOWER(s.numero) LIKE ? OR LOWER(s.titulo) LIKE ?)");
    const q = `%${String(filters.query).trim().toLowerCase()}%`;
    params.push(q, q);
  }

  if (filters.date) {
    where.push("date(s.created_at) = date(?)");
    params.push(filters.date);
  }

  return db.prepare(`
    SELECT s.*, u.name AS solicitante_nome,
      (SELECT COUNT(*) FROM solicitacao_itens i WHERE i.solicitacao_id = s.id) AS itens_count
    FROM solicitacoes s
    JOIN users u ON u.id = s.solicitante_user_id
    WHERE ${where.join(" AND ")}
    ORDER BY s.id DESC
  `).all(...params);
}

function getCountersForUser(userId) {
  const rows = db.prepare("SELECT status, COUNT(*) AS total FROM solicitacoes WHERE solicitante_user_id = ? GROUP BY status").all(userId);
  const counters = Object.values(STATUS).reduce((acc, st) => ({ ...acc, [st]: 0 }), {});
  rows.forEach((r) => { counters[r.status] = r.total; });
  return counters;
}

function getSolicitacaoById(id) {
  const sol = db.prepare(`
    SELECT s.*, u.name AS solicitante_nome, u.role AS solicitante_role, cu.name AS compras_nome, au.name AS almox_nome,
           e.nome AS equipamento_nome
    FROM solicitacoes s
    JOIN users u ON u.id = s.solicitante_user_id
    LEFT JOIN users cu ON cu.id = s.compras_user_id
    LEFT JOIN users au ON au.id = s.almox_user_id
    LEFT JOIN equipamentos e ON e.id = s.equipamento_id
    WHERE s.id = ?
  `).get(id);
  if (!sol) return null;
  const itens = db.prepare(`SELECT si.*, COALESCE(si.item_nome, si.descricao, ei.nome) AS item_nome, COALESCE(si.item_descricao, si.descricao) AS item_descricao, COALESCE(si.qtd_solicitada, si.quantidade, 0) AS qtd_solicitada, COALESCE(si.qtd_recebida_total, 0) AS qtd_recebida_total, (COALESCE(si.qtd_solicitada, si.quantidade, 0) - COALESCE(si.qtd_recebida_total, 0)) AS qtd_pendente, ei.codigo AS estoque_codigo FROM solicitacao_itens si LEFT JOIN estoque_itens ei ON ei.id = COALESCE(si.estoque_item_id, si.item_id) WHERE si.solicitacao_id = ? ORDER BY si.id`).all(id);
  return { ...sol, itens };
}

function listEquipamentos() {
  return db.prepare("SELECT id, nome FROM equipamentos ORDER BY nome").all();
}

function listEstoqueItens() {
  return db.prepare("SELECT id, codigo, nome, unidade FROM estoque_itens WHERE ativo = 1 ORDER BY nome").all();
}

module.exports = { STATUS, canManageByRole, createSolicitacao, listMinhasSolicitacoes, getCountersForUser, getSolicitacaoById, listEquipamentos, listEstoqueItens };
