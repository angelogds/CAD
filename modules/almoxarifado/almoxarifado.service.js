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
const HAS_SOL_FORNECEDOR = hasColumn("solicitacoes", "fornecedor");
const HAS_SOL_PREVISAO = hasColumn("solicitacoes", "previsao_entrega");
const HAS_ITEM_NOME = hasColumn("solicitacao_itens", "item_nome");
const HAS_ITEM_DESCRICAO = hasColumn("solicitacao_itens", "item_descricao");
const HAS_ITEM_DESCRICAO_LEGACY = hasColumn("solicitacao_itens", "descricao");
const HAS_ITEM_QTD_SOLICITADA = hasColumn("solicitacao_itens", "qtd_solicitada");
const HAS_ITEM_QUANTIDADE = hasColumn("solicitacao_itens", "quantidade");
const HAS_ITEM_QTD_COMPRADA = hasColumn("solicitacao_itens", "qtd_comprada");
const HAS_ITEM_QTD_RECEBIDA = hasColumn("solicitacao_itens", "qtd_recebida_total");
const HAS_ITEM_STATUS_COTACAO = hasColumn("solicitacao_itens", "status_cotacao");
const HAS_ITEM_STATUS_COMPRA = hasColumn("solicitacao_itens", "status_compra");
const HAS_ITEM_FORNECEDOR_ID = hasColumn("solicitacao_itens", "fornecedor_id");
const HAS_ITEM_PREVISAO = hasColumn("solicitacao_itens", "previsao_entrega");
const HAS_MOV_SOLICITACAO_ITEM = hasColumn("estoque_movimentos", "solicitacao_item_id");

// O Almoxarifado acompanha a solicitação inteira, mas a autorização física de
// recebimento é por ITEM. Assim, um item COMPRADO já pode ser conferido mesmo
// que outros itens da mesma solicitação ainda estejam EM_COTACAO.
const ALMOX_STATUS = [
  STATUS.EM_COTACAO,
  STATUS.COMPRADA,
  STATUS.EM_RECEBIMENTO,
  STATUS.RECEBIDA_PARCIAL,
  STATUS.RECEBIDA_TOTAL,
  STATUS.FECHADA,
];
const RECEBIMENTO_STATUS = [
  STATUS.COMPRADA,
  STATUS.EM_RECEBIMENTO,
  STATUS.RECEBIDA_PARCIAL,
  STATUS.RECEBIDA_TOTAL,
  STATUS.FECHADA,
];
const STATUS_PERMITIDOS_RECEBIMENTO_ITEM = new Set([
  STATUS.EM_COTACAO,
  STATUS.COMPRADA,
  STATUS.EM_RECEBIMENTO,
  STATUS.RECEBIDA_PARCIAL,
  STATUS.REABERTA,
]);

function normalizeStatus(status) {
  const value = String(status || "").trim().toUpperCase();
  if (value === "TODAS") return "TODAS";
  return ALMOX_STATUS.includes(value) ? value : "TODAS";
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
function qtdSolicitadaExpr(alias = "si") {
  if (HAS_ITEM_QTD_SOLICITADA && HAS_ITEM_QUANTIDADE) return `COALESCE(${alias}.qtd_solicitada,${alias}.quantidade,0)`;
  if (HAS_ITEM_QTD_SOLICITADA) return `COALESCE(${alias}.qtd_solicitada,0)`;
  if (HAS_ITEM_QUANTIDADE) return `COALESCE(${alias}.quantidade,0)`;
  return "0";
}
function qtdCompradaExpr(alias = "si") {
  if (HAS_ITEM_QTD_COMPRADA) return `COALESCE(${alias}.qtd_comprada,0)`;
  if (HAS_ITEM_STATUS_COMPRA) return `CASE WHEN UPPER(COALESCE(${alias}.status_compra,''))='COMPRADO' THEN ${qtdSolicitadaExpr(alias)} ELSE 0 END`;
  return "0";
}
function qtdRecebidaExpr(alias = "si") {
  return HAS_ITEM_QTD_RECEBIDA ? `COALESCE(${alias}.qtd_recebida_total,0)` : "0";
}
function cotadoExpr(alias = "si") {
  return HAS_ITEM_STATUS_COTACAO ? `CASE WHEN UPPER(COALESCE(${alias}.status_cotacao,''))='COTADO' THEN 1 ELSE 0 END` : "0";
}
function compradoExpr(alias = "si") {
  return HAS_ITEM_STATUS_COMPRA ? `CASE WHEN UPPER(COALESCE(${alias}.status_compra,''))='COMPRADO' THEN 1 ELSE 0 END` : "0";
}
function fornecedorNomeColumn(alias = "f") {
  if (!tableExists("fornecedores")) return "NULL";
  if (hasColumn("fornecedores", "nome_fantasia") && hasColumn("fornecedores", "nome")) return `COALESCE(${alias}.nome_fantasia,${alias}.nome)`;
  if (hasColumn("fornecedores", "nome_fantasia")) return `${alias}.nome_fantasia`;
  if (hasColumn("fornecedores", "nome")) return `${alias}.nome`;
  return "NULL";
}

function getSaldoEstoqueItem(itemId) {
  if (!itemId) return 0;
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
  const statuses = status === "TODAS" ? ALMOX_STATUS : [status];
  const params = [...statuses];
  let searchSql = "";
  if (query) {
    const terms = ["s.numero LIKE ?", "u.name LIKE ?"];
    const like = `%${query}%`;
    params.push(like, like);
    if (HAS_SOL_TITULO) { terms.push("s.titulo LIKE ?"); params.push(like); }
    if (HAS_SOL_OS_ID) { terms.push("CAST(s.os_id AS TEXT) LIKE ?"); params.push(like); }
    if (HAS_SOL_FORNECEDOR) { terms.push("s.fornecedor LIKE ?"); params.push(like); }
    searchSql = ` AND (${terms.join(" OR ")})`;
  }

  const requested = qtdSolicitadaExpr("si");
  const boughtQty = qtdCompradaExpr("si");
  const receivedQty = qtdRecebidaExpr("si");
  const placeholders = statuses.map(() => "?").join(",");
  const equipamentoJoin = HAS_SOL_EQUIPAMENTO_ID && tableExists("equipamentos")
    ? "LEFT JOIN equipamentos e ON e.id=s.equipamento_id" : "LEFT JOIN equipamentos e ON 1=0";

  return db.prepare(`
    SELECT
      s.*,
      u.name AS solicitante_nome,
      e.nome AS equipamento_nome,
      COUNT(si.id) AS itens_total,
      COALESCE(SUM(${requested}),0) AS qtd_solicitada_total,
      COALESCE(SUM(${cotadoExpr("si")}),0) AS itens_cotados,
      COALESCE(SUM(${compradoExpr("si")}),0) AS itens_comprados,
      COALESCE(SUM(${boughtQty}),0) AS qtd_comprada_total,
      COALESCE(SUM(${receivedQty}),0) AS qtd_recebida_total_agregada,
      COALESCE(SUM(CASE
        WHEN ${boughtQty} > ${receivedQty} THEN ${boughtQty} - ${receivedQty}
        ELSE 0 END),0) AS qtd_pendente_total,
      COALESCE(SUM(CASE WHEN ${boughtQty} > 0 AND ${receivedQty} >= ${boughtQty} THEN 1 ELSE 0 END),0) AS itens_concluidos
    FROM solicitacoes s
    JOIN users u ON u.id=s.solicitante_user_id
    ${equipamentoJoin}
    LEFT JOIN solicitacao_itens si ON si.solicitacao_id=s.id
    WHERE s.status IN (${placeholders})${searchSql}
    GROUP BY s.id
    ORDER BY CASE s.status
      WHEN 'EM_COTACAO' THEN 1 WHEN 'COMPRADA' THEN 2 WHEN 'EM_RECEBIMENTO' THEN 3
      WHEN 'RECEBIDA_PARCIAL' THEN 4 WHEN 'RECEBIDA_TOTAL' THEN 5 ELSE 6 END, s.id DESC
  `).all(...params).map((row) => {
    const total = Number(row.itens_total || 0);
    const cotados = Number(row.itens_cotados || 0);
    const comprados = Number(row.itens_comprados || 0);
    const comprada = Number(row.qtd_comprada_total || 0);
    const recebida = Number(row.qtd_recebida_total_agregada || 0);
    return {
      ...row,
      cotacao_pct: total > 0 ? Math.min(100, Math.round((cotados / total) * 100)) : 0,
      compra_pct: total > 0 ? Math.min(100, Math.round((comprados / total) * 100)) : 0,
      progresso_pct: comprada > 0 ? Math.min(100, Math.round((recebida / comprada) * 100)) : 0,
    };
  });
}

function getResumoRecebimentos(query = "") {
  const result = {
    em_cotacao: 0,
    para_receber: 0,
    em_recebimento: 0,
    parciais: 0,
    recebidas: 0,
    fechadas: 0,
    total_fluxo: 0,
    pendencias_quantidade: 0,
  };
  for (const status of ALMOX_STATUS) {
    const rows = listRecebimentos({ status, query });
    if (status === STATUS.EM_COTACAO) result.em_cotacao = rows.length;
    if (status === STATUS.COMPRADA) result.para_receber = rows.length;
    if (status === STATUS.EM_RECEBIMENTO) result.em_recebimento = rows.length;
    if (status === STATUS.RECEBIDA_PARCIAL) result.parciais = rows.length;
    if (status === STATUS.RECEBIDA_TOTAL) result.recebidas = rows.length;
    if (status === STATUS.FECHADA) result.fechadas = rows.length;
    result.total_fluxo += rows.length;
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
  const supplierJoin = HAS_ITEM_FORNECEDOR_ID && tableExists("fornecedores")
    ? "LEFT JOIN fornecedores fi ON fi.id=si.fornecedor_id" : "LEFT JOIN fornecedores fi ON 1=0";
  const retiradaExpr = HAS_MOV_SOLICITACAO_ITEM
    ? `(SELECT COALESCE(SUM(CASE WHEN UPPER(COALESCE(em.tipo,'')) LIKE 'SAIDA%' THEN ABS(em.quantidade) ELSE 0 END),0)
        FROM estoque_movimentos em WHERE em.solicitacao_item_id=si.id)`
    : "0";

  const requested = qtdSolicitadaExpr("si");
  const bought = qtdCompradaExpr("si");
  const received = qtdRecebidaExpr("si");
  const itens = db.prepare(`
    SELECT si.*,
      ${itemNameExpr("si")} AS item_nome_exibicao,
      ${requested} AS qtd_solicitada_calc,
      ${bought} AS qtd_comprada_calc,
      ${received} AS qtd_recebida_calc,
      MAX(${bought}-${received},0) AS pendente,
      ${retiradaExpr} AS qtd_retirada_solicitacao,
      ei.nome AS estoque_item_nome,
      ${HAS_SALDO_ATUAL ? "COALESCE(ei.saldo_atual,0)" : "0"} AS estoque_saldo_atual,
      ${localSelect},
      ${fornecedorNomeColumn("fi")} AS fornecedor_nome_item
    FROM solicitacao_itens si
    LEFT JOIN estoque_itens ei ON ei.id=si.estoque_item_id
    ${localJoin}
    ${supplierJoin}
    WHERE si.solicitacao_id=?
    ORDER BY si.id
  `).all(id).map((item) => {
    const retirada = Number(item.qtd_retirada_solicitacao || 0);
    const recebida = Number(item.qtd_recebida_calc || 0);
    const comprada = Number(item.qtd_comprada_calc || 0);
    const aReceber = Math.max(comprada - recebida, 0);
    const comprado = String(item.status_compra || '').toUpperCase() === 'COMPRADO';
    return {
      ...item,
      qtd_a_receber: aReceber,
      divergencia_recebimento: comprado && recebida > 0 && aReceber > 0,
      fornecedor_exibicao: item.fornecedor_nome_item || sol.fornecedor || null,
      previsao_exibicao: (HAS_ITEM_PREVISAO ? item.previsao_entrega : null) || (HAS_SOL_PREVISAO ? sol.previsao_entrega : null) || null,
      disponivel_retirada: Math.max(recebida - retirada, 0),
    };
  });

  const qtdSolicitada = itens.reduce((sum, item) => sum + Number(item.qtd_solicitada_calc || 0), 0);
  const qtdComprada = itens.reduce((sum, item) => sum + Number(item.qtd_comprada_calc || 0), 0);
  const qtdRecebida = itens.reduce((sum, item) => sum + Number(item.qtd_recebida_calc || 0), 0);
  const pendente = itens.reduce((sum, item) => sum + Math.max(Number(item.qtd_a_receber || item.pendente || 0), 0), 0);
  const itensCotados = itens.filter((item) => String(item.status_cotacao || '').toUpperCase() === 'COTADO').length;
  const itensComprados = itens.filter((item) => String(item.status_compra || '').toUpperCase() === 'COMPRADO').length;
  const itensComRetirada = itens.filter((item) => Number(item.disponivel_retirada || 0) > 0 && item.estoque_item_id).length;
  const itensDivergentes = itens.filter((item) => item.divergencia_recebimento).length;
  return {
    ...sol,
    itens,
    resumo: {
      itens: itens.length,
      itens_cotados: itensCotados,
      itens_comprados: itensComprados,
      itens_disponiveis_retirada: itensComRetirada,
      itens_divergentes_recebimento: itensDivergentes,
      qtd_solicitada: qtdSolicitada,
      qtd_comprada: qtdComprada,
      qtd_recebida: qtdRecebida,
      qtd_pendente: pendente,
      qtd_a_receber: pendente,
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
  if (!s.resumo.itens_comprados) throw new Error("A solicitação ainda não possui item marcado como comprado.");
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

function insertEstoqueMovimento(data) {
  const cols = ["tipo", "item_id", "quantidade"];
  const vals = [data.tipo, data.item_id, data.quantidade];
  const optional = [
    ["origem", data.origem], ["os_id", data.os_id], ["equipamento_id", data.equipamento_id],
    ["solicitacao_id", data.solicitacao_id], ["solicitacao_item_id", data.solicitacao_item_id],
    ["usuario_id", data.usuario_id], ["saldo_anterior", data.saldo_anterior], ["saldo_posterior", data.saldo_posterior],
    ["observacao", data.observacao],
  ];
  optional.forEach(([col, value]) => { if (hasColumn("estoque_movimentos", col)) { cols.push(col); vals.push(value ?? null); } });
  const info = db.prepare(`INSERT INTO estoque_movimentos (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);
  return Number(info.lastInsertRowid);
}

function receberItem({ solicitacaoId, itemId, qtdAgora, observacao, localId, userId }) {
  const quantidade = Number(qtdAgora || 0);
  if (!(quantidade > 0)) throw new Error("Quantidade deve ser maior que zero.");

  return db.transaction(() => {
    const solicitacao = db.prepare("SELECT * FROM solicitacoes WHERE id=?").get(solicitacaoId);
    if (!solicitacao) throw new Error("Solicitação não encontrada.");
    const statusSolicitacao = String(solicitacao.status || '').toUpperCase();
    if (!STATUS_PERMITIDOS_RECEBIMENTO_ITEM.has(statusSolicitacao)) {
      throw new Error("Esta solicitação não está em uma etapa que permita recebimento de materiais.");
    }

    const item = db.prepare("SELECT * FROM solicitacao_itens WHERE id=? AND solicitacao_id=?").get(itemId, solicitacaoId);
    if (!item) throw new Error("Item não encontrado.");
    if (String(item.status_compra || '').toUpperCase() !== "COMPRADO") {
      throw new Error("Somente itens marcados como COMPRADO pelo setor de Compras podem ser recebidos.");
    }

    const qtdComprada = Number(HAS_ITEM_QTD_COMPRADA ? item.qtd_comprada : (item.qtd_solicitada ?? item.quantidade) || 0);
    const recebidaAtual = Number(item.qtd_recebida_total || 0);
    const aReceber = Math.max(qtdComprada - recebidaAtual, 0);
    if (!(aReceber > 0)) throw new Error("Este item já foi recebido integralmente.");
    if (quantidade > aReceber) {
      throw new Error(`Quantidade acima do que ainda falta receber. Máximo para este recebimento: ${aReceber}.`);
    }

    const resolvedLocalId = resolveLocal(localId);
    const estoqueItemId = resolveEstoqueItem(item, solicitacaoId, resolvedLocalId);
    if (HAS_LOCAL_ID && resolvedLocalId) {
      db.prepare("UPDATE estoque_itens SET local_id=COALESCE(local_id,?), updated_at=datetime('now') WHERE id=?")
        .run(resolvedLocalId, estoqueItemId);
    }

    // Para solicitações totalmente liberadas para compra, o primeiro recebimento
    // inicia a etapa automaticamente. Em solicitações mistas EM_COTACAO, o status
    // geral é preservado para não retirar da fila os itens que ainda estão cotando.
    if ([STATUS.COMPRADA, STATUS.REABERTA].includes(statusSolicitacao)) {
      const updates = ["status=?", "updated_at=datetime('now')"];
      const values = [STATUS.EM_RECEBIMENTO];
      if (hasColumn("solicitacoes", "almox_user_id")) { updates.push("almox_user_id=COALESCE(almox_user_id,?)"); values.push(userId || null); }
      if (hasColumn("solicitacoes", "recebimento_inicio_em")) updates.push("recebimento_inicio_em=COALESCE(recebimento_inicio_em,datetime('now'))");
      values.push(solicitacaoId);
      db.prepare(`UPDATE solicitacoes SET ${updates.join(",")} WHERE id=?`).run(...values);
    }

    const recebida = recebidaAtual + quantidade;
    const statusItem = recebida >= qtdComprada ? "OK" : "PARCIAL";
    const itemUpdates = ["qtd_recebida_total=?", "status_item=?", "estoque_item_id=?"];
    const itemValues = [recebida, statusItem, estoqueItemId];
    if (hasColumn("solicitacao_itens", "observacao_item")) { itemUpdates.push("observacao_item=?"); itemValues.push(observacao || item.observacao_item || null); }
    if (hasColumn("solicitacao_itens", "updated_at")) itemUpdates.push("updated_at=datetime('now')");
    itemValues.push(itemId);
    db.prepare(`UPDATE solicitacao_itens SET ${itemUpdates.join(",")} WHERE id=?`).run(...itemValues);

    const saldoAnterior = getSaldoEstoqueItem(estoqueItemId);
    const saldoPosterior = saldoAnterior + quantidade;
    if (HAS_SALDO_ATUAL) {
      db.prepare("UPDATE estoque_itens SET saldo_atual=COALESCE(saldo_atual,0)+?, updated_at=datetime('now') WHERE id=?")
        .run(quantidade, estoqueItemId);
    }

    const movimentoId = insertEstoqueMovimento({
      tipo: "ENTRADA_COMPRA", item_id: estoqueItemId, quantidade, origem: "COMPRA",
      os_id: solicitacao.os_id || null, equipamento_id: solicitacao.equipamento_id || null,
      solicitacao_id: solicitacaoId, solicitacao_item_id: itemId, usuario_id: userId || null,
      saldo_anterior: saldoAnterior, saldo_posterior: saldoPosterior,
      observacao: observacao || `Recebimento ${solicitacao.numero || `#${solicitacaoId}`}`,
    });

    if (tableExists("compras_recebimentos")) {
      const cols = ["solicitacao_id", "solicitacao_item_id", "quantidade", "estoque_item_id", "estoque_movimento_id", "usuario_id"];
      if (cols.every((col) => hasColumn("compras_recebimentos", col))) {
        db.prepare(`INSERT INTO compras_recebimentos (${cols.join(",")}) VALUES (?,?,?,?,?,?)`)
          .run(solicitacaoId, itemId, quantidade, estoqueItemId, movimentoId, userId || null);
      }
    }

    const faltanteApos = Math.max(qtdComprada - recebida, 0);
    return {
      estoqueItemId,
      saldoAnterior,
      saldoPosterior,
      pendenteApos: faltanteApos,
      faltanteApos,
      recebimentoParcial: recebida > 0 && faltanteApos > 0,
    };
  })();
}

function finalizarRecebimento(id) {
  const qtdComprada = HAS_ITEM_QTD_COMPRADA ? "COALESCE(qtd_comprada,0)" : qtdSolicitadaExpr("solicitacao_itens");
  const qtdRecebida = HAS_ITEM_QTD_RECEBIDA ? "COALESCE(qtd_recebida_total,0)" : "0";
  const statusCompraFilter = HAS_ITEM_STATUS_COMPRA ? " AND status_compra='COMPRADO'" : "";
  const itens = db.prepare(`SELECT ${qtdComprada} qtd_comprada_calc, ${qtdRecebida} qtd_recebida_calc FROM solicitacao_itens WHERE solicitacao_id=?${statusCompraFilter}`).all(id);
  if (!itens.length) throw new Error("A solicitação não possui itens comprados para recebimento.");
  const temRecebimento = itens.some((item) => Number(item.qtd_recebida_calc || 0) > 0);
  if (!temRecebimento) throw new Error("Registre ao menos um item recebido antes de finalizar a etapa.");
  const incompletos = itens.some((item) => Number(item.qtd_recebida_calc || 0) < Number(item.qtd_comprada_calc || 0));
  const status = incompletos ? STATUS.RECEBIDA_PARCIAL : STATUS.RECEBIDA_TOTAL;
  db.prepare("UPDATE solicitacoes SET status=?, recebida_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(status, id);
  return status;
}

function fechar(id) {
  const s = getSolicitacao(id);
  if (!s || s.status !== STATUS.RECEBIDA_TOTAL) throw new Error("Somente uma solicitação recebida integralmente pode ser fechada.");
  if (s.resumo.qtd_pendente > 0) throw new Error("Ainda existem quantidades a receber.");
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
  ALMOX_STATUS,
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