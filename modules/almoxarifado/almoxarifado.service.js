const db = require("../../database/db");
const { STATUS } = require("../solicitacoes/solicitacoes.service");

function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
}
function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch { return false; }
}

const HAS_SALDO_ATUAL = hasColumn("estoque_itens", "saldo_atual");
const HAS_LOCAL_ID = hasColumn("estoque_itens", "local_id");
const HAS_SOL_TITULO = hasColumn("solicitacoes", "titulo");
const HAS_SOL_OS_ID = hasColumn("solicitacoes", "os_id");
const HAS_SOL_EQUIPAMENTO_ID = hasColumn("solicitacoes", "equipamento_id");
const HAS_ITEM_NOME = hasColumn("solicitacao_itens", "item_nome");
const HAS_ITEM_DESCRICAO = hasColumn("solicitacao_itens", "item_descricao");
const HAS_ITEM_DESCRICAO_LEGACY = hasColumn("solicitacao_itens", "descricao");

const RECEBIMENTO_STATUS = [
  STATUS.COMPRADA,
  STATUS.EM_RECEBIMENTO,
  STATUS.RECEBIDA_PARCIAL,
  STATUS.RECEBIDA_TOTAL,
  STATUS.FECHADA,
];

function normalizeStatus(status) {
  return RECEBIMENTO_STATUS.includes(status) ? status : STATUS.COMPRADA;
}

function normalizeSearch(value) {
  return String(value || "").trim().slice(0, 120);
}

function itemNameExpr(alias = "si") {
  const options = [];
  if (HAS_ITEM_NOME) options.push(`${alias}.item_nome`);
  if (HAS_ITEM_DESCRICAO) options.push(`${alias}.item_descricao`);
  if (HAS_ITEM_DESCRICAO_LEGACY) options.push(`${alias}.descricao`);
  options.push(`'Item #' || ${alias}.id`);
  return `COALESCE(${options.join(", ")})`;
}

function getSaldoEstoqueItem(itemId) {
  if (HAS_SALDO_ATUAL) {
    return Number(db.prepare("SELECT COALESCE(saldo_atual,0) FROM estoque_itens WHERE id=?").pluck().get(itemId) || 0);
  }
  if (tableExists("vw_estoque_saldo")) {
    return Number(db.prepare("SELECT COALESCE(saldo,0) FROM vw_estoque_saldo WHERE item_id=?").pluck().get(itemId) || 0);
  }
  return 0;
}

function listRecebimentos(options = {}) {
  if (typeof options === "string") options = { status: options };
  const status = normalizeStatus(options.status);
  const query = normalizeSearch(options.query);
  const params = [status];
  let searchSql = "";
  if (query) {
    const titleSearch = HAS_SOL_TITULO ? " OR s.titulo LIKE ?" : "";
    searchSql = ` AND (s.numero LIKE ? OR u.name LIKE ?${titleSearch})`;
    const like = `%${query}%`;
    params.push(like, like);
    if (HAS_SOL_TITULO) params.push(like);
  }

  return db.prepare(`
    SELECT
      s.*,
      u.name AS solicitante_nome,
      COUNT(si.id) AS itens_total,
      COALESCE(SUM(COALESCE(si.qtd_comprada,0)),0) AS qtd_comprada_total,
      COALESCE(SUM(COALESCE(si.qtd_recebida_total,0)),0) AS qtd_recebida_total_agregada,
      COALESCE(SUM(CASE
        WHEN COALESCE(si.qtd_comprada,0) > COALESCE(si.qtd_recebida_total,0)
          THEN COALESCE(si.qtd_comprada,0) - COALESCE(si.qtd_recebida_total,0)
        ELSE 0 END),0) AS qtd_pendente_total,
      COALESCE(SUM(CASE
        WHEN COALESCE(si.qtd_comprada,0) > 0
         AND COALESCE(si.qtd_recebida_total,0) >= COALESCE(si.qtd_comprada,0)
          THEN 1 ELSE 0 END),0) AS itens_concluidos
    FROM solicitacoes s
    JOIN users u ON u.id=s.solicitante_user_id
    LEFT JOIN solicitacao_itens si
      ON si.solicitacao_id=s.id AND si.status_compra='COMPRADO'
    WHERE s.status = ?${searchSql}
    GROUP BY s.id
    ORDER BY s.id DESC
  `).all(...params).map((row) => {
    const comprada = Number(row.qtd_comprada_total || 0);
    const recebida = Number(row.qtd_recebida_total_agregada || 0);
    const progresso = comprada > 0 ? Math.min(100, Math.round((recebida / comprada) * 100)) : 0;
    return { ...row, progresso_pct: progresso };
  });
}

function getResumoRecebimentos(query = "") {
  const result = {
    para_receber: 0,
    em_recebimento: 0,
    parciais: 0,
    recebidas: 0,
    fechadas: 0,
    pendencias_quantidade: 0,
  };
  for (const status of RECEBIMENTO_STATUS) {
    const rows = listRecebimentos({ status, query });
    if (status === STATUS.COMPRADA) result.para_receber = rows.length;
    if (status === STATUS.EM_RECEBIMENTO) result.em_recebimento = rows.length;
    if (status === STATUS.RECEBIDA_PARCIAL) result.parciais = rows.length;
    if (status === STATUS.RECEBIDA_TOTAL) result.recebidas = rows.length;
    if (status === STATUS.FECHADA) result.fechadas = rows.length;
    result.pendencias_quantidade += rows.reduce((sum, row) => sum + Number(row.qtd_pendente_total || 0), 0);
  }
  return result;
}

function getSolicitacao(id) {
  const osJoin = HAS_SOL_OS_ID ? "LEFT JOIN os o ON o.id=s.os_id" : "LEFT JOIN os o ON 1=0";
  const equipamentoJoin = HAS_SOL_EQUIPAMENTO_ID ? "LEFT JOIN equipamentos e ON e.id=s.equipamento_id" : "LEFT JOIN equipamentos e ON 1=0";
  const sol = db.prepare(`
    SELECT s.*, u.name AS solicitante_nome,
      ${HAS_SOL_OS_ID ? "o.id" : "NULL"} AS os_numero,
      ${HAS_SOL_EQUIPAMENTO_ID ? "e.nome" : "NULL"} AS equipamento_nome
    FROM solicitacoes s
    LEFT JOIN users u ON u.id=s.solicitante_user_id
    ${osJoin}
    ${equipamentoJoin}
    WHERE s.id=?
  `).get(id);
  if (!sol) return null;

  const localSelect = HAS_LOCAL_ID
    ? "ei.local_id AS estoque_local_id, el.nome AS estoque_local_nome"
    : "NULL AS estoque_local_id, NULL AS estoque_local_nome";
  const localJoin = HAS_LOCAL_ID ? "LEFT JOIN estoque_locais el ON el.id=ei.local_id" : "LEFT JOIN estoque_locais el ON 1=0";
  const itens = db.prepare(`
    SELECT si.*,
      ${itemNameExpr("si")} AS item_nome_exibicao,
      MAX(COALESCE(si.qtd_comprada,0)-COALESCE(si.qtd_recebida_total,0),0) AS pendente,
      ei.nome AS estoque_item_nome,
      ${localSelect}
    FROM solicitacao_itens si
    LEFT JOIN estoque_itens ei ON ei.id=si.estoque_item_id
    ${localJoin}
    WHERE si.solicitacao_id=? AND si.status_compra='COMPRADO'
    ORDER BY si.id
  `).all(id);
  const qtdComprada = itens.reduce((sum, item) => sum + Number(item.qtd_comprada || 0), 0);
  const qtdRecebida = itens.reduce((sum, item) => sum + Number(item.qtd_recebida_total || 0), 0);
  const pendente = itens.reduce((sum, item) => sum + Math.max(Number(item.pendente || 0), 0), 0);
  return {
    ...sol,
    itens,
    resumo: {
      itens: itens.length,
      qtd_comprada: qtdComprada,
      qtd_recebida: qtdRecebida,
      qtd_pendente: pendente,
      progresso_pct: qtdComprada > 0 ? Math.min(100, Math.round((qtdRecebida / qtdComprada) * 100)) : 0,
    },
  };
}

function getHistoricoRecebimento(solicitacaoId) {
  if (!tableExists("compras_recebimentos")) return [];
  try {
    return db.prepare(`
      SELECT cr.*, u.name AS usuario_nome,
        ${itemNameExpr("si")} AS item_nome,
        si.unidade,
        ei.nome AS estoque_item_nome
      FROM compras_recebimentos cr
      LEFT JOIN users u ON u.id=cr.usuario_id
      LEFT JOIN solicitacao_itens si ON si.id=cr.solicitacao_item_id
      LEFT JOIN estoque_itens ei ON ei.id=cr.estoque_item_id
      WHERE cr.solicitacao_id=?
      ORDER BY cr.id DESC
      LIMIT 100
    `).all(solicitacaoId);
  } catch (_error) {
    return [];
  }
}

function iniciarRecebimento(id, userId) {
  const s = getSolicitacao(id);
  if (!s || ![STATUS.COMPRADA, STATUS.REABERTA].includes(s.status)) {
    throw new Error("Somente uma compra liberada pode iniciar o recebimento.");
  }
  db.prepare("UPDATE solicitacoes SET status=?, almox_user_id=?, recebimento_inicio_em=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .run(STATUS.EM_RECEBIMENTO, userId, id);
}

function resolveLocal(localId) {
  const id = Number(localId || 0);
  if (!id || !HAS_LOCAL_ID) return null;
  const row = db.prepare("SELECT id FROM estoque_locais WHERE id=? AND ativo=1").get(id);
  if (!row) throw new Error("Local de estoque inválido ou inativo.");
  return Number(row.id);
}

function resolveEstoqueItem(item, solicitacaoId, localId) {
  if (item.estoque_item_id) {
    const linked = db.prepare("SELECT id FROM estoque_itens WHERE id=? AND ativo=1").get(Number(item.estoque_item_id));
    if (linked) return Number(linked.id);
  }

  const nome = String(item.item_nome || item.item_descricao || item.descricao || `Item ${item.id}`).trim();
  const unidade = String(item.unidade || "UN").trim().toUpperCase();
  const matches = db.prepare(`
    SELECT id FROM estoque_itens
    WHERE ativo=1
      AND LOWER(TRIM(nome))=LOWER(TRIM(?))
      AND UPPER(TRIM(COALESCE(unidade,'UN')))=?
    ORDER BY id
    LIMIT 2
  `).all(nome, unidade);
  if (matches.length === 1) return Number(matches[0].id);

  const cols = ["codigo", "nome", "unidade"];
  const vals = [`CMP-${solicitacaoId}-${item.id}`, nome, unidade];
  if (HAS_SALDO_ATUAL) { cols.push("saldo_atual"); vals.push(0); }
  if (HAS_LOCAL_ID && localId) { cols.push("local_id"); vals.push(localId); }
  if (hasColumn("estoque_itens", "ativo")) { cols.push("ativo"); vals.push(1); }
  const info = db.prepare(`INSERT INTO estoque_itens (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);
  const estoqueItemId = Number(info.lastInsertRowid);
  db.prepare("UPDATE solicitacao_itens SET estoque_item_id=? WHERE id=?").run(estoqueItemId, item.id);
  return estoqueItemId;
}

function receberItem({ solicitacaoId, itemId, qtdAgora, observacao, localId, userId }) {
  const quantidade = Number(qtdAgora || 0);
  if (!(quantidade > 0)) throw new Error("Quantidade deve ser maior que zero.");

  return db.transaction(() => {
    const solicitacao = db.prepare("SELECT * FROM solicitacoes WHERE id=?").get(solicitacaoId);
    if (!solicitacao) throw new Error("Solicitação não encontrada.");
    if (![STATUS.EM_RECEBIMENTO, STATUS.RECEBIDA_PARCIAL].includes(solicitacao.status)) {
      throw new Error("Inicie o recebimento antes de dar entrada nos materiais.");
    }

    const item = db.prepare("SELECT * FROM solicitacao_itens WHERE id=? AND solicitacao_id=?").get(itemId, solicitacaoId);
    if (!item) throw new Error("Item não encontrado.");
    if (item.status_compra !== "COMPRADO") throw new Error("Somente itens realmente comprados podem ser recebidos.");

    const qtdComprada = Number(item.qtd_comprada || 0);
    const recebidaAtual = Number(item.qtd_recebida_total || 0);
    const pendente = Math.max(qtdComprada - recebidaAtual, 0);
    if (!(pendente > 0)) throw new Error("Este item já foi recebido integralmente.");
    if (quantidade > pendente) {
      throw new Error(`Quantidade acima do saldo pendente. Máximo para este recebimento: ${pendente}.`);
    }

    const resolvedLocalId = resolveLocal(localId);
    const estoqueItemId = resolveEstoqueItem(item, solicitacaoId, resolvedLocalId);
    if (HAS_LOCAL_ID && resolvedLocalId) {
      db.prepare("UPDATE estoque_itens SET local_id=COALESCE(local_id,?), updated_at=datetime('now') WHERE id=?")
        .run(resolvedLocalId, estoqueItemId);
    }

    const recebida = recebidaAtual + quantidade;
    const statusItem = recebida >= qtdComprada ? "OK" : "PARCIAL";
    db.prepare("UPDATE solicitacao_itens SET qtd_recebida_total=?, status_item=?, observacao_item=?, estoque_item_id=?, updated_at=datetime('now') WHERE id=?")
      .run(recebida, statusItem, observacao || item.observacao_item || null, estoqueItemId, itemId);

    const saldoAnterior = getSaldoEstoqueItem(estoqueItemId);
    const saldoPosterior = saldoAnterior + quantidade;
    if (HAS_SALDO_ATUAL) {
      db.prepare("UPDATE estoque_itens SET saldo_atual=COALESCE(saldo_atual,0)+?, updated_at=datetime('now') WHERE id=?")
        .run(quantidade, estoqueItemId);
    }

    const movimentoId = Number(db.prepare(`INSERT INTO estoque_movimentos
      (tipo,item_id,quantidade,origem,os_id,equipamento_id,solicitacao_id,solicitacao_item_id,usuario_id,saldo_anterior,saldo_posterior,observacao)
      VALUES ('ENTRADA_COMPRA',?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        estoqueItemId,
        quantidade,
        "COMPRA",
        solicitacao.os_id || null,
        solicitacao.equipamento_id || null,
        solicitacaoId,
        itemId,
        userId || null,
        saldoAnterior,
        saldoPosterior,
        observacao || `Recebimento ${solicitacao.numero || `#${solicitacaoId}`}`
      ).lastInsertRowid);

    if (tableExists("compras_recebimentos")) {
      db.prepare(`INSERT INTO compras_recebimentos
        (solicitacao_id,solicitacao_item_id,quantidade,estoque_item_id,estoque_movimento_id,usuario_id)
        VALUES (?,?,?,?,?,?)`)
        .run(solicitacaoId, itemId, quantidade, estoqueItemId, movimentoId, userId || null);
    }

    return { estoqueItemId, saldoAnterior, saldoPosterior, pendenteApos: Math.max(qtdComprada - recebida, 0) };
  })();
}

function finalizarRecebimento(id) {
  const itens = db.prepare("SELECT qtd_comprada,qtd_recebida_total FROM solicitacao_itens WHERE solicitacao_id=? AND status_compra='COMPRADO'").all(id);
  if (!itens.length) throw new Error("A solicitação não possui itens comprados para recebimento.");
  const temRecebimento = itens.some((item) => Number(item.qtd_recebida_total || 0) > 0);
  if (!temRecebimento) throw new Error("Registre ao menos um item recebido antes de finalizar a etapa.");
  const incompletos = itens.some((item) => Number(item.qtd_recebida_total || 0) < Number(item.qtd_comprada || 0));
  const status = incompletos ? STATUS.RECEBIDA_PARCIAL : STATUS.RECEBIDA_TOTAL;
  db.prepare("UPDATE solicitacoes SET status=?, recebida_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(status, id);
  return status;
}

function fechar(id) {
  const s = getSolicitacao(id);
  if (!s || s.status !== STATUS.RECEBIDA_TOTAL) throw new Error("Somente uma solicitação recebida integralmente pode ser fechada.");
  if (s.resumo.qtd_pendente > 0) throw new Error("Ainda existem quantidades pendentes de recebimento.");
  db.prepare("UPDATE solicitacoes SET status=?, fechada_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(STATUS.FECHADA, id);
}

function reabrir(id) {
  const s = getSolicitacao(id);
  if (!s || ![STATUS.FECHADA, STATUS.RECEBIDA_PARCIAL].includes(s.status)) {
    throw new Error("Somente recebimentos fechados ou parciais podem ser reabertos.");
  }
  const novoStatus = s.status === STATUS.FECHADA ? STATUS.RECEBIDA_TOTAL : STATUS.EM_RECEBIMENTO;
  db.prepare("UPDATE solicitacoes SET status=?, reaberta_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(novoStatus, id);
  return novoStatus;
}

module.exports = {
  RECEBIMENTO_STATUS,
  listRecebimentos,
  getResumoRecebimentos,
  getSolicitacao,
  getHistoricoRecebimento,
  iniciarRecebimento,
  receberItem,
  finalizarRecebimento,
  fechar,
  reabrir,
};
