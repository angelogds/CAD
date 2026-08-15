const db = require("../../database/db");
const { STATUS } = require("../solicitacoes/solicitacoes.service");
function hasColumn(table, name) { try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; } }
const HAS_SALDO_ATUAL = hasColumn('estoque_itens','saldo_atual');

function listRecebimentos(status = "") {
  const statusPermitidos = [STATUS.COMPRADA, STATUS.EM_RECEBIMENTO, STATUS.RECEBIDA_PARCIAL, STATUS.RECEBIDA_TOTAL, STATUS.FECHADA];
  const filtroStatus = statusPermitidos.includes(status) ? status : "";
  const where = filtroStatus ? "s.status = ?" : `s.status IN (${statusPermitidos.map(() => "?").join(",")})`;
  const params = filtroStatus ? [filtroStatus] : statusPermitidos;
  return db.prepare(`
    SELECT s.*, u.name AS solicitante_nome
    FROM solicitacoes s
    JOIN users u ON u.id=s.solicitante_user_id
    WHERE ${where}
    ORDER BY s.id DESC
  `).all(...params);
}

function getSolicitacao(id) {
  const sol = db.prepare("SELECT * FROM solicitacoes WHERE id=?").get(id);
  if (!sol) return null;
  const itens = db.prepare("SELECT *, (COALESCE(qtd_comprada,0)-qtd_recebida_total) AS pendente FROM solicitacao_itens WHERE solicitacao_id=? AND status_compra='COMPRADO' ORDER BY id").all(id);
  return { ...sol, itens };
}

function iniciarRecebimento(id, userId) {
  const s = getSolicitacao(id);
  if (!s || s.status !== STATUS.COMPRADA) throw new Error("Somente COMPRADA pode iniciar recebimento.");
  db.prepare("UPDATE solicitacoes SET status=?, almox_user_id=?, recebimento_inicio_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(STATUS.EM_RECEBIMENTO, userId, id);
}

function receberItem({ solicitacaoId, itemId, qtdAgora, observacao, userId }) {
  if (qtdAgora <= 0) throw new Error("Quantidade deve ser maior que zero.");
  return db.transaction(() => {
    const item = db.prepare("SELECT * FROM solicitacao_itens WHERE id=? AND solicitacao_id=?").get(itemId, solicitacaoId);
    if (!item) throw new Error("Item não encontrado.");
    if (item.status_compra !== 'COMPRADO') throw new Error('Somente itens realmente comprados podem ser recebidos.');

    const qtdSolicitada = Number(item.qtd_comprada || 0);
    const recebidaAtual = Number(item.qtd_recebida_total || 0);
    const recebida = recebidaAtual + Number(qtdAgora);
    if (recebida > qtdSolicitada) {
      throw new Error(`Quantidade recebida excede a solicitada. Pendente atual: ${Math.max(qtdSolicitada - recebidaAtual, 0)}.`);
    }
    let statusItem = "PENDENTE";
    if (recebida >= qtdSolicitada) statusItem = "OK";
    else if (recebida > 0) statusItem = "PARCIAL";

    db.prepare("UPDATE solicitacao_itens SET qtd_recebida_total=?, status_item=?, observacao_item=?, updated_at=datetime('now') WHERE id=?").run(recebida, statusItem, observacao || item.observacao_item || null, itemId);

    let estoqueItemId = item.estoque_item_id;
    if (!estoqueItemId) {
      estoqueItemId = Number(db.prepare(`INSERT INTO estoque_itens (codigo,nome,unidade,saldo_atual,updated_at)
        VALUES (?,?,?,?,datetime('now'))`).run(`CMP-${solicitacaoId}-${itemId}`, item.item_nome || item.item_descricao || `Item ${itemId}`, item.unidade || 'UN', 0).lastInsertRowid);
      db.prepare('UPDATE solicitacao_itens SET estoque_item_id=? WHERE id=?').run(estoqueItemId, itemId);
    }
    const saldoAnterior = Number(db.prepare('SELECT saldo_atual FROM estoque_itens WHERE id=?').pluck().get(estoqueItemId) || 0);
    const saldoPosterior = saldoAnterior + Number(qtdAgora);
    db.prepare("UPDATE estoque_itens SET saldo_atual=?, updated_at=datetime('now') WHERE id=?").run(saldoPosterior, estoqueItemId);
    const sol = db.prepare('SELECT os_id,equipamento_id FROM solicitacoes WHERE id=?').get(solicitacaoId);
    const movimentoId = Number(db.prepare(`INSERT INTO estoque_movimentos
      (tipo,item_id,quantidade,origem,os_id,equipamento_id,solicitacao_id,solicitacao_item_id,usuario_id,saldo_anterior,saldo_posterior,observacao)
      VALUES ('ENTRADA_COMPRA',?,?,?,?,?,?,?,?,?,?,?)`).run(estoqueItemId, Number(qtdAgora), 'COMPRA', sol?.os_id || null,
      sol?.equipamento_id || null, solicitacaoId, itemId, userId || null, saldoAnterior, saldoPosterior,
      observacao || `Recebimento solicitação #${solicitacaoId}`).lastInsertRowid);
    db.prepare(`INSERT INTO compras_recebimentos
      (solicitacao_id,solicitacao_item_id,quantidade,estoque_item_id,estoque_movimento_id,usuario_id)
      VALUES (?,?,?,?,?,?)`).run(solicitacaoId, itemId, Number(qtdAgora), estoqueItemId, movimentoId, userId || null);
  })();
}

function finalizarRecebimento(id) {
  const itens = db.prepare("SELECT status_item FROM solicitacao_itens WHERE solicitacao_id=? AND status_compra='COMPRADO'").all(id);
  if (!itens.length) throw new Error('A solicitação não possui itens comprados para recebimento.');
  const parcial = itens.some((i) => i.status_item === "PENDENTE" || i.status_item === "PARCIAL");
  const status = parcial ? STATUS.RECEBIDA_PARCIAL : STATUS.RECEBIDA_TOTAL;
  db.prepare("UPDATE solicitacoes SET status=?, recebida_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(status, id);
}

function fechar(id) {
  const s = getSolicitacao(id);
  if (!s || s.status !== STATUS.RECEBIDA_TOTAL) throw new Error("Somente uma solicitação RECEBIDA_TOTAL pode ser fechada.");
  db.prepare("UPDATE solicitacoes SET status=?, fechada_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(STATUS.FECHADA, id);
}

function reabrir(id) {
  const s = getSolicitacao(id);
  if (!s || ![STATUS.FECHADA, STATUS.RECEBIDA_PARCIAL].includes(s.status)) throw new Error("Somente FECHADA ou RECEBIDA_PARCIAL podem ser reabertas.");
  db.prepare("UPDATE solicitacoes SET status=?, reaberta_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(STATUS.COMPRADA, id);
}

module.exports = { listRecebimentos, getSolicitacao, iniciarRecebimento, receberItem, finalizarRecebimento, fechar, reabrir };
