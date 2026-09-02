const db = require("../../database/db");

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE (type='table' OR type='view') AND name=?").get(name); } catch { return false; }
}
function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name); } catch { return false; }
}

const HAS_SALDO_ATUAL = hasColumn("estoque_itens", "saldo_atual");
const HAS_SALDO_MINIMO = hasColumn("estoque_itens", "saldo_minimo");
const HAS_ESTOQUE_MIN = hasColumn("estoque_itens", "estoque_min");
const HAS_CATEGORIA_ID = hasColumn("estoque_itens", "categoria_id");
const HAS_LOCAL_ID = hasColumn("estoque_itens", "local_id");
const HAS_DATA_MOV = hasColumn("estoque_movimentos", "data_mov");
const HAS_USUARIO_ID = hasColumn("estoque_movimentos", "usuario_id");
const HAS_MOV_OS_ID = hasColumn("estoque_movimentos", "os_id");
const HAS_MOV_EQUIPAMENTO_ID = hasColumn("estoque_movimentos", "equipamento_id");
const HAS_MOV_SOLICITACAO_ID = hasColumn("estoque_movimentos", "solicitacao_id");
const HAS_MOV_SOLICITACAO_ITEM_ID = hasColumn("estoque_movimentos", "solicitacao_item_id");
const HAS_MOV_SALDO_ANTERIOR = hasColumn("estoque_movimentos", "saldo_anterior");
const HAS_MOV_SALDO_POSTERIOR = hasColumn("estoque_movimentos", "saldo_posterior");
const HAS_MOV_RETIRADO_POR = hasColumn("estoque_movimentos", "retirado_por_colaborador_id");
const HAS_MOV_ENTREGUE_POR = hasColumn("estoque_movimentos", "entregue_por_user_id");
const HAS_MOV_IDENTIFICACAO_ORIGEM = hasColumn("estoque_movimentos", "identificacao_origem");
const HAS_MOV_RESERVA_ID = hasColumn("estoque_movimentos", "reserva_id");

function categoriaJoin() { return HAS_CATEGORIA_ID && tableExists("estoque_categorias") ? "LEFT JOIN estoque_categorias c ON c.id=i.categoria_id" : "LEFT JOIN (SELECT NULL id,NULL nome) c ON 1=0"; }
function localJoin() { return HAS_LOCAL_ID && tableExists("estoque_locais") ? "LEFT JOIN estoque_locais l ON l.id=i.local_id" : "LEFT JOIN (SELECT NULL id,NULL nome) l ON 1=0"; }
function saldoJoin() { return !HAS_SALDO_ATUAL && tableExists("vw_estoque_saldo") ? "LEFT JOIN vw_estoque_saldo v ON v.item_id=i.id" : "LEFT JOIN (SELECT NULL item_id,0 saldo) v ON 1=0"; }
function dataMovExpr(alias = "m") { return HAS_DATA_MOV ? `COALESCE(${alias}.data_mov,${alias}.created_at)` : `${alias}.created_at`; }
function usuarioJoin() { return HAS_USUARIO_ID && tableExists("users") ? "LEFT JOIN users u ON u.id=m.usuario_id" : "LEFT JOIN (SELECT NULL id,NULL name) u ON 1=0"; }
function retiradoPorJoin() { return HAS_MOV_RETIRADO_POR && tableExists("colaboradores") ? "LEFT JOIN colaboradores rc ON rc.id=m.retirado_por_colaborador_id" : "LEFT JOIN (SELECT NULL id,NULL nome) rc ON 1=0"; }
function entreguePorJoin() { return HAS_MOV_ENTREGUE_POR && tableExists("users") ? "LEFT JOIN users eu ON eu.id=m.entregue_por_user_id" : "LEFT JOIN (SELECT NULL id,NULL name) eu ON 1=0"; }
function solicitacaoJoin() { return HAS_MOV_SOLICITACAO_ID && tableExists("solicitacoes") ? "LEFT JOIN solicitacoes s ON s.id=m.solicitacao_id" : "LEFT JOIN (SELECT NULL id,NULL numero) s ON 1=0"; }
function equipamentoJoin() { return HAS_MOV_EQUIPAMENTO_ID && tableExists("equipamentos") ? "LEFT JOIN equipamentos eq ON eq.id=m.equipamento_id" : "LEFT JOIN (SELECT NULL id,NULL nome) eq ON 1=0"; }
function saldoExpr() { return HAS_SALDO_ATUAL ? "COALESCE(i.saldo_atual,0)" : "COALESCE(v.saldo,0)"; }
function minExpr() { return HAS_SALDO_MINIMO ? "COALESCE(i.saldo_minimo,0)" : (HAS_ESTOQUE_MIN ? "COALESCE(i.estoque_min,0)" : "0"); }
function normalize(value) { return String(value || "").trim(); }
function isClosedStatus(status) {
  return ['CANCELADA','CANCELADO','CONCLUIDA','CONCLUÍDA','CONCLUIDO','FECHADA','FECHADO'].includes(String(status || '').toUpperCase());
}

function dashboard() {
  const itens = db.prepare("SELECT COUNT(*) total FROM estoque_itens WHERE ativo=1").get().total;
  const join = saldoJoin();
  const baixo = db.prepare(`SELECT COUNT(*) total FROM estoque_itens i ${join} WHERE i.ativo=1 AND ${saldoExpr()} < ${minExpr()}`).get().total;
  const zerados = db.prepare(`SELECT COUNT(*) total FROM estoque_itens i ${join} WHERE i.ativo=1 AND ${saldoExpr()} <= 0`).get().total;
  const saldo = db.prepare(`SELECT COALESCE(SUM(${saldoExpr()}),0) total FROM estoque_itens i ${join} WHERE i.ativo=1`).get().total;
  let movimentosHoje = 0;
  try { movimentosHoje = db.prepare(`SELECT COUNT(*) total FROM estoque_movimentos m WHERE date(${dataMovExpr("m")})=date('now')`).get().total; } catch { movimentosHoje = 0; }
  return { itens, baixo, zerados, saldo, movimentosHoje };
}

function listItens(filters = {}) {
  const where = ["i.ativo=1"];
  const params = [];
  const q = normalize(filters.q || filters.query);
  if (q) {
    where.push("(LOWER(COALESCE(i.codigo,'')) LIKE ? OR LOWER(i.nome) LIKE ?)");
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like);
  }
  if (filters.categoria_id && HAS_CATEGORIA_ID) { where.push("i.categoria_id=?"); params.push(Number(filters.categoria_id)); }
  if (filters.local_id && HAS_LOCAL_ID) { where.push("i.local_id=?"); params.push(Number(filters.local_id)); }
  if (filters.situacao === "zerado") where.push(`${saldoExpr()} <= 0`);
  if (filters.situacao === "baixo") where.push(`${saldoExpr()} > 0 AND ${saldoExpr()} < ${minExpr()}`);
  if (filters.situacao === "ok") where.push(`${saldoExpr()} >= ${minExpr()} AND ${saldoExpr()} > 0`);

  const lastMove = tableExists("estoque_movimentos")
    ? `(SELECT MAX(${dataMovExpr("lm")}) FROM estoque_movimentos lm WHERE lm.item_id=i.id)`
    : "NULL";
  return db.prepare(`SELECT i.*, c.nome categoria_nome, l.nome local_nome,
      ${saldoExpr()} AS saldo_atual, ${minExpr()} AS saldo_minimo, ${lastMove} AS ultima_movimentacao
    FROM estoque_itens i ${categoriaJoin()} ${localJoin()} ${saldoJoin()}
    WHERE ${where.join(" AND ")} ORDER BY i.nome`).all(...params);
}
function listCategorias() { return tableExists("estoque_categorias") ? db.prepare("SELECT * FROM estoque_categorias WHERE ativo=1 ORDER BY nome").all() : []; }
function listLocais() { return tableExists("estoque_locais") ? db.prepare("SELECT * FROM estoque_locais WHERE ativo=1 ORDER BY nome").all() : []; }
function listMovimentos() {
  const identificacaoExpr = HAS_MOV_IDENTIFICACAO_ORIGEM ? "m.identificacao_origem" : "NULL";
  const reservaExpr = HAS_MOV_RESERVA_ID ? "m.reserva_id" : "NULL";
  return db.prepare(`SELECT m.*, ${dataMovExpr()} AS data_mov, i.nome item_nome, i.unidade item_unidade,
      u.name usuario_nome, rc.nome retirado_por_nome, eu.name entregue_por_nome,
      s.numero solicitacao_numero, eq.nome equipamento_nome,
      ${identificacaoExpr} identificacao_origem_exibicao, ${reservaExpr} reserva_id_exibicao
    FROM estoque_movimentos m
    JOIN estoque_itens i ON i.id=m.item_id
    ${usuarioJoin()} ${retiradoPorJoin()} ${entreguePorJoin()} ${solicitacaoJoin()} ${equipamentoJoin()}
    ORDER BY m.id DESC LIMIT 300`).all();
}

function createCategoria({ nome, parent_id }) { db.prepare("INSERT INTO estoque_categorias (nome,parent_id) VALUES (?,?)").run(nome, parent_id || null); }
function createLocal({ nome, descricao }) { db.prepare("INSERT INTO estoque_locais (nome,descricao) VALUES (?,?)").run(nome, descricao || null); }
function createItem(data) {
  const minColumn = HAS_SALDO_MINIMO ? "saldo_minimo" : HAS_ESTOQUE_MIN ? "estoque_min" : "categoria";
  const cols = ["codigo", "nome", "unidade"];
  const values = [data.codigo || null, data.nome, data.unidade || "UN"];
  if (HAS_CATEGORIA_ID) { cols.push("categoria_id"); values.push(data.categoria_id || null); }
  if (HAS_LOCAL_ID) { cols.push("local_id"); values.push(data.local_id || null); }
  cols.push(minColumn);
  values.push(Number(data.saldo_minimo || 0));
  const placeholders = cols.map(() => "?").join(",");
  return Number(db.prepare(`INSERT INTO estoque_itens (${cols.join(",")}) VALUES (${placeholders})`).run(...values).lastInsertRowid);
}
function getItem(id) {
  return db.prepare(`SELECT i.*, ${saldoExpr()} AS saldo_atual, ${minExpr()} AS saldo_minimo
    FROM estoque_itens i ${saldoJoin()} WHERE i.id=?`).get(id);
}

function listOrdensAtivas() {
  return db.prepare(`SELECT o.id,o.status,o.equipamento_id,COALESCE(e.nome,o.equipamento,o.equipamento_manual) equipamento_nome
    FROM os o LEFT JOIN equipamentos e ON e.id=o.equipamento_id
    WHERE UPPER(COALESCE(o.status,'')) NOT IN ('CANCELADA','CANCELADO','CONCLUIDA','CONCLUÍDA','CONCLUIDO','FECHADA','FECHADO') ORDER BY o.id DESC`).all();
}

function validarOsAtiva(osId) {
  if (!osId) return null;
  const os = db.prepare('SELECT id,status,equipamento_id FROM os WHERE id=?').get(Number(osId));
  if (!os || isClosedStatus(os.status)) throw new Error('A OS informada não está ativa.');
  return os;
}

function qtdRetiradaSolicitacaoItem(itemId) {
  if (!HAS_MOV_SOLICITACAO_ITEM_ID) return 0;
  return Number(db.prepare(`SELECT COALESCE(SUM(CASE WHEN UPPER(COALESCE(tipo,'')) LIKE 'SAIDA%' THEN ABS(quantidade) ELSE 0 END),0) total
    FROM estoque_movimentos WHERE solicitacao_item_id=?`).get(Number(itemId))?.total || 0);
}

function getContextoSolicitacao(solicitacaoId, solicitacaoItemId) {
  if (!solicitacaoId) return null;
  if (!solicitacaoItemId) throw new Error('Selecione o item da solicitação para registrar a retirada.');
  const row = db.prepare(`SELECT s.id solicitacao_id,s.numero,s.os_id,s.equipamento_id,s.status,
      si.id solicitacao_item_id,si.estoque_item_id,COALESCE(si.qtd_recebida_total,0) qtd_recebida_total
    FROM solicitacoes s JOIN solicitacao_itens si ON si.solicitacao_id=s.id
    WHERE s.id=? AND si.id=?`).get(Number(solicitacaoId), Number(solicitacaoItemId));
  if (!row) throw new Error('Item não pertence à solicitação informada.');
  if (!row.estoque_item_id) throw new Error('Este item ainda não está vinculado ao estoque. Faça o recebimento antes da retirada.');
  const retirada = qtdRetiradaSolicitacaoItem(row.solicitacao_item_id);
  return { ...row, qtd_retirada: retirada, disponivel_retirada: Math.max(Number(row.qtd_recebida_total || 0) - retirada, 0) };
}

function atualizarReservaDaRetirada(contexto, quantidade) {
  if (!contexto || !tableExists('estoque_reservas')) return null;
  const reserva = db.prepare(`
    SELECT id,quantidade_reservada,quantidade_retirada,status
    FROM estoque_reservas
    WHERE solicitacao_item_id=? AND status<>'CANCELADA'
  `).get(Number(contexto.solicitacao_item_id));
  if (!reserva) return null;

  const qtd = Number(quantidade || 0);
  const disponivel = Math.max(Number(reserva.quantidade_reservada || 0) - Number(reserva.quantidade_retirada || 0), 0);
  if (qtd > disponivel) throw new Error(`Quantidade acima da reserva disponível. Máximo: ${disponivel}.`);

  const retiradaNova = Number(reserva.quantidade_retirada || 0) + qtd;
  const status = retiradaNova >= Number(reserva.quantidade_reservada || 0) ? 'RETIRADA' : 'PARCIAL';
  const update = db.prepare(`
    UPDATE estoque_reservas
    SET quantidade_retirada=?,status=?,updated_at=datetime('now')
    WHERE id=? AND quantidade_retirada=?
  `).run(retiradaNova, status, reserva.id, Number(reserva.quantidade_retirada || 0));
  if (!update.changes) throw new Error('Reserva alterada por outro usuário. Atualize a página e tente novamente.');
  return { id: Number(reserva.id), quantidadeRetirada: retiradaNova, status };
}

function insertMovimento(data) {
  const cols = ["tipo", "item_id", "quantidade"];
  const vals = [data.tipo, data.item_id, data.quantidade];
  const optional = [
    ["origem", data.origem], ["os_id", data.os_id], ["equipamento_id", data.equipamento_id],
    ["solicitacao_id", data.solicitacao_id], ["solicitacao_item_id", data.solicitacao_item_id],
    ["usuario_id", data.usuario_id], ["saldo_anterior", data.saldo_anterior], ["saldo_posterior", data.saldo_posterior],
    ["observacao", data.observacao], ["reserva_id", data.reserva_id],
    ["retirado_por_colaborador_id", data.retirado_por_colaborador_id], ["entregue_por_user_id", data.entregue_por_user_id],
    ["identificacao_origem", data.identificacao_origem],
  ];
  optional.forEach(([col, value]) => { if (hasColumn("estoque_movimentos", col)) { cols.push(col); vals.push(value ?? null); } });
  const info = db.prepare(`INSERT INTO estoque_movimentos (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);
  return Number(info.lastInsertRowid);
}

function registrarSaidaCore({ item_id, quantidade, usuario_id, observacao, os_id, origem = 'MANUAL', solicitacao_id, solicitacao_item_id }) {
  const contexto = solicitacao_id ? getContextoSolicitacao(solicitacao_id, solicitacao_item_id) : null;
  const resolvedItemId = contexto ? Number(contexto.estoque_item_id) : Number(item_id);
  if (contexto && item_id && Number(item_id) !== resolvedItemId) throw new Error('O material selecionado não corresponde ao item da solicitação.');

  const item = getItem(resolvedItemId);
  if (!item) throw new Error("Item não encontrado");
  const qtd = Number(quantidade);
  if (!(qtd > 0)) throw new Error("Quantidade inválida");
  if (qtd > Number(item.saldo_atual || 0)) throw new Error("Saldo insuficiente");

  let resolvedOsId = contexto?.os_id ? Number(contexto.os_id) : (os_id ? Number(os_id) : null);
  if (contexto?.os_id && os_id && Number(os_id) !== Number(contexto.os_id)) throw new Error('A OS informada não corresponde à solicitação.');
  const os = resolvedOsId ? validarOsAtiva(resolvedOsId) : null;

  // Retiradas manuais continuam exigindo OS ativa. Quando a retirada nasce de uma
  // solicitação, a própria solicitação mantém a rastreabilidade mesmo sem OS.
  if (!contexto && !os) throw new Error('Uma OS ativa é obrigatória para registrar uma retirada manual.');
  if (contexto && qtd > Number(contexto.disponivel_retirada || 0)) {
    throw new Error(`Quantidade acima do disponível nesta solicitação. Máximo: ${contexto.disponivel_retirada}.`);
  }

  // Mantém compatibilidade com as rotas contextuais antigas. Se existir reserva,
  // ela precisa ser reduzida ANTES do saldo físico para não disparar a proteção
  // contra consumo de material reservado. Tudo ocorre dentro da mesma transação.
  const reserva = contexto ? atualizarReservaDaRetirada(contexto, qtd) : null;

  const equipamentoId = contexto?.equipamento_id || os?.equipamento_id || null;
  const anterior = Number(item.saldo_atual || 0);
  const posterior = anterior - qtd;
  if (HAS_SALDO_ATUAL) {
    const result = db.prepare("UPDATE estoque_itens SET saldo_atual=?,updated_at=datetime('now') WHERE id=? AND saldo_atual>=?").run(posterior, resolvedItemId, qtd);
    if (!result.changes) throw new Error('Saldo alterado por outro usuário. Atualize a página e tente novamente.');
  }
  const movimentoId = insertMovimento({
    tipo: 'SAIDA_REQUISICAO_INTERNA', item_id: resolvedItemId, quantidade: qtd,
    origem: contexto ? 'SOLICITACAO' : (String(origem).toUpperCase() === 'QR_CODE' ? 'QR_CODE' : 'MANUAL'),
    os_id: resolvedOsId, equipamento_id: equipamentoId, solicitacao_id: contexto?.solicitacao_id || null,
    solicitacao_item_id: contexto?.solicitacao_item_id || null, usuario_id: usuario_id || null,
    saldo_anterior: anterior, saldo_posterior: posterior,
    observacao: observacao || (contexto ? `Retirada da solicitação ${contexto.numero || `#${contexto.solicitacao_id}`}` : null),
    reserva_id: reserva?.id || null,
    entregue_por_user_id: contexto ? (usuario_id || null) : null,
    identificacao_origem: contexto ? 'CONTEXTO_SEM_QR' : (String(origem).toUpperCase() === 'QR_CODE' ? 'QR_ITEM' : 'MANUAL'),
  });
  return { movimentoId, itemId: resolvedItemId, saldoAnterior: anterior, saldoPosterior: posterior, osId: resolvedOsId, equipamentoId, reservaId: reserva?.id || null };
}

function registrarSaida(data) {
  return db.transaction(() => registrarSaidaCore(data))();
}

function registrarSaidasSolicitacao({ solicitacao_id, usuario_id, observacao }) {
  const itens = db.prepare(`SELECT id,estoque_item_id,COALESCE(qtd_recebida_total,0) qtd_recebida_total
    FROM solicitacao_itens WHERE solicitacao_id=? AND COALESCE(qtd_recebida_total,0)>0 ORDER BY id`).all(Number(solicitacao_id));
  if (!itens.length) throw new Error('Esta solicitação ainda não possui material recebido para retirada.');

  return db.transaction(() => {
    const resultados = [];
    for (const item of itens) {
      if (!item.estoque_item_id) continue;
      const contexto = getContextoSolicitacao(solicitacao_id, item.id);
      const estoqueItem = getItem(item.estoque_item_id);
      const quantidade = Math.min(Number(contexto.disponivel_retirada || 0), Number(estoqueItem?.saldo_atual || 0));
      if (!(quantidade > 0)) continue;
      resultados.push(registrarSaidaCore({
        item_id: item.estoque_item_id,
        quantidade,
        usuario_id,
        observacao,
        solicitacao_id,
        solicitacao_item_id: item.id,
        origem: 'SOLICITACAO',
      }));
    }
    if (!resultados.length) throw new Error('Não há saldo recebido e disponível para retirada nesta solicitação.');
    return resultados;
  })();
}

module.exports = {
  dashboard, listItens, listCategorias, listLocais, listMovimentos, createCategoria, createLocal, createItem, getItem,
  listOrdensAtivas, registrarSaida, registrarSaidasSolicitacao, getContextoSolicitacao,
};
