const db = require("../../database/db");
const { STATUS } = require("../solicitacoes/solicitacoes.service");
function hasColumn(table, name) { try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; } }
const HAS_SALDO_ATUAL = hasColumn('estoque_itens','saldo_atual');

function listRecebimentos() {
  return db.prepare(`SELECT s.*, u.name AS solicitante_nome FROM solicitacoes s JOIN users u ON u.id=s.solicitante_user_id WHERE s.status IN (?, ?, ?, ?) ORDER BY s.id DESC`).all(
    STATUS.COMPRADA,
    STATUS.EM_RECEBIMENTO,
    STATUS.RECEBIDA_PARCIAL,
    STATUS.FECHADA
  );
}

function getSolicitacao(id) {
  const sol = db.prepare("SELECT * FROM solicitacoes WHERE id=?").get(id);
  if (!sol) return null;
  const itens = db.prepare("SELECT *, (qtd_solicitada-qtd_recebida_total) AS pendente FROM solicitacao_itens WHERE solicitacao_id=? ORDER BY id").all(id);
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

    const recebida = Number(item.qtd_recebida_total || 0) + Number(qtdAgora);
    let statusItem = "PENDENTE";
    if (recebida >= Number(item.qtd_solicitada)) statusItem = "OK";
    else if (recebida > 0) statusItem = "PARCIAL";

    db.prepare("UPDATE solicitacao_itens SET qtd_recebida_total=?, status_item=?, observacao_item=?, updated_at=datetime('now') WHERE id=?").run(recebida, statusItem, observacao || item.observacao_item || null, itemId);

    if (item.estoque_item_id) {
      if (HAS_SALDO_ATUAL) {
        db.prepare("UPDATE estoque_itens SET saldo_atual = COALESCE(saldo_atual,0) + ?, updated_at=datetime('now') WHERE id=?").run(Number(qtdAgora), item.estoque_item_id);
      }
      db.prepare(`INSERT INTO estoque_movimentos (tipo, item_id, quantidade, usuario_id, referencia_tipo, referencia_id, observacao) VALUES ('ENTRADA_COMPRA', ?, ?, ?, 'SOLICITACAO', ?, ?)`)
        .run(item.estoque_item_id, Number(qtdAgora), userId || null, solicitacaoId, observacao || `Recebimento solicitação #${solicitacaoId}`);
    }
  })();
}

function finalizarRecebimento(id) {
  const itens = db.prepare("SELECT status_item FROM solicitacao_itens WHERE solicitacao_id=?").all(id);
  const parcial = itens.some((i) => i.status_item === "PENDENTE" || i.status_item === "PARCIAL");
  const status = parcial ? STATUS.RECEBIDA_PARCIAL : STATUS.RECEBIDA_TOTAL;
  db.prepare("UPDATE solicitacoes SET status=?, recebida_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(status, id);
}

function fechar(id) {
  const s = getSolicitacao(id);
  if (!s || ![STATUS.RECEBIDA_PARCIAL, STATUS.RECEBIDA_TOTAL].includes(s.status)) throw new Error("Somente recebidas podem ser fechadas.");
  db.prepare("UPDATE solicitacoes SET status=?, fechada_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(STATUS.FECHADA, id);
}

function reabrir(id) {
  const s = getSolicitacao(id);
  if (!s || ![STATUS.FECHADA, STATUS.RECEBIDA_PARCIAL].includes(s.status)) throw new Error("Somente FECHADA ou RECEBIDA_PARCIAL podem ser reabertas.");
  db.prepare("UPDATE solicitacoes SET status=?, reaberta_em=datetime('now'), updated_at=datetime('now') WHERE id=?").run(STATUS.REABERTA, id);
}

module.exports = { listRecebimentos, getSolicitacao, iniciarRecebimento, receberItem, finalizarRecebimento, fechar, reabrir };
