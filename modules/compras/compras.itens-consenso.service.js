const db = require('../../database/db');
const comprasService = require('./compras.service');

const EXCLUSAO = Object.freeze({
  NENHUMA: 'NENHUMA',
  PENDENTE: 'PENDENTE',
  APROVADA: 'APROVADA',
  RECUSADA: 'RECUSADA',
  CANCELADA: 'CANCELADA',
});

const ORIGEM_ITEM = Object.freeze({
  SOLICITANTE: 'SOLICITANTE',
  COMPRAS_EXTRA: 'COMPRAS_EXTRA',
});

const BLOQUEADOS_ADICAO = new Set([
  comprasService.STATUS.RECEBIDA_TOTAL,
  comprasService.STATUS.SEPARADA_PARA_RETIRADA,
  comprasService.STATUS.ENTREGUE_SOLICITANTE,
  comprasService.STATUS.FECHADA,
  comprasService.STATUS.CANCELADA,
]);

function tableExists(name) {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
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

function ensureSchema() {
  if (!tableExists('solicitacao_item_exclusoes') || !hasColumn('solicitacao_itens', 'origem_item') || !hasColumn('solicitacao_itens', 'exclusao_status')) {
    throw new Error('Atualização do fluxo de itens de Compras ainda não foi aplicada. Execute as migrations e tente novamente.');
  }
}

function text(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function number(value) {
  let raw = String(value ?? '').trim();
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyToCents(value) {
  if (value == null || String(value).trim() === '') return 0;
  let raw = String(value).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Valor unitário inválido.');
  return Math.round(parsed * 100);
}

function getSolicitacao(id) {
  return db.prepare('SELECT * FROM solicitacoes WHERE id=?').get(Number(id)) || null;
}

function getItem(solicitacaoId, itemId) {
  return db.prepare('SELECT * FROM solicitacao_itens WHERE id=? AND solicitacao_id=?').get(Number(itemId), Number(solicitacaoId)) || null;
}

function snapshotItem(item) {
  return JSON.stringify({
    id: item.id,
    solicitacao_id: item.solicitacao_id,
    item_nome: item.item_nome,
    item_descricao: item.item_descricao,
    unidade: item.unidade,
    qtd_solicitada: item.qtd_solicitada,
    status_item: item.status_item,
    status_cotacao: item.status_cotacao,
    status_compra: item.status_compra,
    qtd_comprada: item.qtd_comprada,
    qtd_recebida_total: item.qtd_recebida_total,
    fornecedor_id: item.fornecedor_id,
    valor_unitario_centavos: item.valor_unitario_centavos,
    estoque_item_id: item.estoque_item_id,
    origem_item: item.origem_item || ORIGEM_ITEM.SOLICITANTE,
  });
}

function recalcularValorTotal(solicitacaoId) {
  const sol = getSolicitacao(solicitacaoId);
  if (!sol) return 0;
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN UPPER(COALESCE(status_compra,''))='CANCELADO' THEN 0
      ELSE COALESCE(qtd_solicitada,0) * COALESCE(valor_unitario_centavos,0) END
    ),0) subtotal_centavos
    FROM solicitacao_itens
    WHERE solicitacao_id=?
  `).get(Number(solicitacaoId));
  const totalCentavos = Math.max(0,
    Number(row?.subtotal_centavos || 0) + Number(sol.frete_centavos || 0) - Number(sol.desconto_centavos || 0));
  if (hasColumn('solicitacoes', 'valor_total')) {
    db.prepare("UPDATE solicitacoes SET valor_total=?,updated_at=datetime('now') WHERE id=?")
      .run(totalCentavos / 100, Number(solicitacaoId));
  }
  return totalCentavos;
}

function recalcularStatusSolicitacao(solicitacaoId) {
  const sol = getSolicitacao(solicitacaoId);
  if (!sol) throw new Error('Solicitação não encontrada.');
  const itens = db.prepare('SELECT * FROM solicitacao_itens WHERE solicitacao_id=? ORDER BY id').all(Number(solicitacaoId));
  const ativos = itens.filter((item) => String(item.status_compra || '').toUpperCase() !== 'CANCELADO');
  const status = ativos.length
    ? comprasService.recalcularStatus(itens, sol.status)
    : comprasService.STATUS.CANCELADA;
  db.prepare("UPDATE solicitacoes SET status=?,updated_at=datetime('now') WHERE id=?").run(status, Number(solicitacaoId));
  recalcularValorTotal(solicitacaoId);
  return status;
}

function solicitarExclusao({ solicitacaoId, itemId, userId, motivo }) {
  ensureSchema();
  const justificativa = text(motivo, 1000);
  if (justificativa.length < 5) throw new Error('Informe o motivo da solicitação de exclusão do item.');

  return db.transaction(() => {
    const sol = getSolicitacao(solicitacaoId);
    if (!sol) throw new Error('Solicitação não encontrada.');
    if ([comprasService.STATUS.FECHADA, comprasService.STATUS.CANCELADA, comprasService.STATUS.RECEBIDA_TOTAL].includes(sol.status)) {
      throw new Error('Esta solicitação já está encerrada para alterações de itens.');
    }

    const item = getItem(solicitacaoId, itemId);
    if (!item) throw new Error('Item não pertence à solicitação informada.');
    const statusCompra = String(item.status_compra || '').toUpperCase();
    if (statusCompra === 'CANCELADO') throw new Error('Este item já foi removido do fluxo ativo.');
    if (['COMPRADO', 'ATENDIDO_ESTOQUE'].includes(statusCompra)) {
      throw new Error('Este item já foi comprometido por compra ou atendimento de estoque. A exclusão consensual só é permitida antes dessa etapa.');
    }
    if (Number(item.qtd_recebida_total || 0) > 0) {
      throw new Error('Não é possível excluir um item que já possui recebimento físico. Use o fluxo de correção/devolução para preservar o estoque.');
    }
    if (String(item.exclusao_status || '').toUpperCase() === EXCLUSAO.PENDENTE) {
      throw new Error('Já existe uma solicitação de exclusão aguardando resposta do solicitante.');
    }

    const snapshot = snapshotItem(item);
    db.prepare(`
      INSERT INTO solicitacao_item_exclusoes
        (solicitacao_id,solicitacao_item_id,solicitada_por_user_id,motivo,status,snapshot_json)
      VALUES (?,?,?,?,?,?)
    `).run(Number(solicitacaoId), Number(itemId), Number(userId), justificativa, EXCLUSAO.PENDENTE, snapshot);

    db.prepare(`
      UPDATE solicitacao_itens
      SET exclusao_status=?,exclusao_solicitada_por_user_id=?,exclusao_solicitada_em=datetime('now'),
          exclusao_motivo=?,exclusao_respondida_por_user_id=NULL,exclusao_respondida_em=NULL,
          exclusao_resposta_observacao=NULL,updated_at=datetime('now')
      WHERE id=? AND solicitacao_id=?
    `).run(EXCLUSAO.PENDENTE, Number(userId), justificativa, Number(itemId), Number(solicitacaoId));

    return { solicitacaoId: Number(solicitacaoId), itemId: Number(itemId), solicitanteUserId: Number(sol.solicitante_user_id) };
  })();
}

function cancelarPedidoExclusao({ solicitacaoId, itemId, userId }) {
  ensureSchema();
  return db.transaction(() => {
    const item = getItem(solicitacaoId, itemId);
    if (!item) throw new Error('Item não encontrado.');
    if (String(item.exclusao_status || '').toUpperCase() !== EXCLUSAO.PENDENTE) throw new Error('Não há solicitação de exclusão pendente para este item.');

    const pending = db.prepare(`
      SELECT * FROM solicitacao_item_exclusoes
      WHERE solicitacao_item_id=? AND status='PENDENTE'
      ORDER BY id DESC LIMIT 1
    `).get(Number(itemId));
    if (!pending) throw new Error('Pedido de exclusão pendente não encontrado.');

    db.prepare(`UPDATE solicitacao_item_exclusoes SET status='CANCELADA',respondida_por_user_id=?,respondida_em=datetime('now'),resposta_observacao='Pedido cancelado pelo setor de Compras.',updated_at=datetime('now') WHERE id=?`)
      .run(Number(userId), pending.id);
    db.prepare(`
      UPDATE solicitacao_itens
      SET exclusao_status=?,exclusao_respondida_por_user_id=?,exclusao_respondida_em=datetime('now'),
          exclusao_resposta_observacao='Pedido cancelado pelo setor de Compras.',updated_at=datetime('now')
      WHERE id=?
    `).run(EXCLUSAO.CANCELADA, Number(userId), Number(itemId));
    return true;
  })();
}

function responderExclusao({ solicitacaoId, itemId, userId, aprovar, observacao }) {
  ensureSchema();
  const resposta = text(observacao, 1000);
  return db.transaction(() => {
    const sol = getSolicitacao(solicitacaoId);
    if (!sol) throw new Error('Solicitação não encontrada.');
    if (Number(sol.solicitante_user_id) !== Number(userId)) {
      throw new Error('Somente o solicitante original pode responder a exclusão deste item.');
    }

    const item = getItem(solicitacaoId, itemId);
    if (!item) throw new Error('Item não encontrado.');
    if (String(item.exclusao_status || '').toUpperCase() !== EXCLUSAO.PENDENTE) {
      throw new Error('Este pedido de exclusão já foi respondido ou cancelado.');
    }

    const pending = db.prepare(`
      SELECT * FROM solicitacao_item_exclusoes
      WHERE solicitacao_item_id=? AND status='PENDENTE'
      ORDER BY id DESC LIMIT 1
    `).get(Number(itemId));
    if (!pending) throw new Error('Pedido de exclusão pendente não encontrado.');

    const statusResposta = aprovar ? EXCLUSAO.APROVADA : EXCLUSAO.RECUSADA;
    if (aprovar) {
      const statusCompraAtual = String(item.status_compra || '').toUpperCase();
      if (['COMPRADO', 'ATENDIDO_ESTOQUE'].includes(statusCompraAtual)) {
        throw new Error('O item foi comprometido após o pedido de exclusão. A aprovação foi bloqueada para preservar o fluxo de compra/estoque.');
      }
      if (Number(item.qtd_recebida_total || 0) > 0) {
        throw new Error('O item recebeu material após a solicitação de exclusão. A exclusão foi bloqueada para preservar o estoque.');
      }
    }

    db.prepare(`
      UPDATE solicitacao_item_exclusoes
      SET status=?,respondida_por_user_id=?,respondida_em=datetime('now'),resposta_observacao=?,updated_at=datetime('now')
      WHERE id=?
    `).run(statusResposta, Number(userId), resposta || null, pending.id);

    if (aprovar) {
      db.prepare(`
        UPDATE solicitacao_itens
        SET status_compra='CANCELADO',status_cotacao='CANCELADO',status_item='CANCELADO',
            qtd_comprada=0,fornecedor_id=NULL,valor_unitario_centavos=NULL,
            exclusao_status=?,exclusao_respondida_por_user_id=?,exclusao_respondida_em=datetime('now'),
            exclusao_resposta_observacao=?,atualizado_por=?,updated_at=datetime('now')
        WHERE id=? AND solicitacao_id=?
      `).run(EXCLUSAO.APROVADA, Number(userId), resposta || 'Exclusão aprovada pelo solicitante.', Number(userId), Number(itemId), Number(solicitacaoId));
      recalcularStatusSolicitacao(solicitacaoId);
    } else {
      db.prepare(`
        UPDATE solicitacao_itens
        SET exclusao_status=?,exclusao_respondida_por_user_id=?,exclusao_respondida_em=datetime('now'),
            exclusao_resposta_observacao=?,updated_at=datetime('now')
        WHERE id=? AND solicitacao_id=?
      `).run(EXCLUSAO.RECUSADA, Number(userId), resposta || 'Solicitante optou por manter o item.', Number(itemId), Number(solicitacaoId));
    }

    return { aprovado: !!aprovar, status: statusResposta };
  })();
}

function validarFornecedor(id) {
  const fornecedorId = Number(id || 0);
  if (!fornecedorId) return null;
  if (!tableExists('fornecedores')) throw new Error('Cadastro de fornecedores indisponível.');
  const row = db.prepare('SELECT id FROM fornecedores WHERE id=? AND ativo=1').get(fornecedorId);
  if (!row) throw new Error('Fornecedor inválido ou inativo.');
  return fornecedorId;
}

function adicionarItemExcepcional({ solicitacaoId, userId, payload = {} }) {
  ensureSchema();
  const nome = text(payload.item_nome, 180);
  const descricao = text(payload.item_descricao, 1200);
  const justificativa = text(payload.adicao_justificativa, 1200);
  const unidade = text(payload.unidade || 'UN', 20).toUpperCase() || 'UN';
  const quantidade = number(payload.qtd_solicitada);
  const modo = String(payload.modo || 'COTACAO').trim().toUpperCase() === 'COMPRADO' ? 'COMPRADO' : 'COTACAO';
  const fornecedorId = validarFornecedor(payload.fornecedor_id);
  const valorCentavos = moneyToCents(payload.valor_unitario);

  if (!nome) throw new Error('Informe o nome do item adicional.');
  if (!(quantidade > 0)) throw new Error('Quantidade do item adicional deve ser maior que zero.');
  if (justificativa.length < 5) throw new Error('Informe a justificativa para adicionar o item fora da solicitação original.');
  if (modo === 'COMPRADO' && !fornecedorId) throw new Error('Fornecedor é obrigatório para adicionar um item já comprado.');
  if (modo === 'COMPRADO' && !(valorCentavos > 0)) throw new Error('Valor unitário é obrigatório para adicionar um item já comprado.');

  return db.transaction(() => {
    const sol = getSolicitacao(solicitacaoId);
    if (!sol) throw new Error('Solicitação não encontrada.');
    if (BLOQUEADOS_ADICAO.has(sol.status)) throw new Error('Esta solicitação já está em uma etapa que não permite novos itens.');

    const cols = ['solicitacao_id', 'item_nome', 'item_descricao', 'unidade', 'qtd_solicitada', 'status_item'];
    const vals = [Number(solicitacaoId), nome, descricao || null, unidade, quantidade, 'PENDENTE'];
    const add = (column, value) => {
      if (hasColumn('solicitacao_itens', column)) { cols.push(column); vals.push(value); }
    };

    add('origem_item', ORIGEM_ITEM.COMPRAS_EXTRA);
    add('adicionado_por_user_id', Number(userId));
    add('adicionado_em', new Date().toISOString());
    add('adicao_justificativa', justificativa);
    add('status_cotacao', modo === 'COMPRADO' ? 'COTADO' : 'PENDENTE');
    add('status_compra', modo === 'COMPRADO' ? 'COMPRADO' : 'PENDENTE');
    add('qtd_comprada', modo === 'COMPRADO' ? quantidade : null);
    add('fornecedor_id', fornecedorId);
    add('valor_unitario_centavos', modo === 'COMPRADO' ? valorCentavos : (valorCentavos || null));
    add('cotado_em', modo === 'COMPRADO' ? new Date().toISOString() : null);
    add('comprado_em', modo === 'COMPRADO' ? new Date().toISOString() : null);
    add('atualizado_por', Number(userId));

    const info = db.prepare(`INSERT INTO solicitacao_itens (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    const itemId = Number(info.lastInsertRowid);
    const status = recalcularStatusSolicitacao(solicitacaoId);
    return { itemId, status, modo };
  })();
}

function getHistoricoExclusoes(solicitacaoId) {
  ensureSchema();
  return db.prepare(`
    SELECT x.*,si.item_nome,
      us.name solicitada_por_nome,ur.name respondida_por_nome
    FROM solicitacao_item_exclusoes x
    JOIN solicitacao_itens si ON si.id=x.solicitacao_item_id
    LEFT JOIN users us ON us.id=x.solicitada_por_user_id
    LEFT JOIN users ur ON ur.id=x.respondida_por_user_id
    WHERE x.solicitacao_id=?
    ORDER BY x.id DESC
    LIMIT 50
  `).all(Number(solicitacaoId));
}

function enrichSolicitacaoDetalhe(sol) {
  if (!sol) return sol;
  const itens = Array.isArray(sol.itens) ? sol.itens : [];
  const ativos = itens.filter((item) => String(item.status_compra || '').toUpperCase() !== 'CANCELADO');
  const cancelados = itens.filter((item) => String(item.status_compra || '').toUpperCase() === 'CANCELADO');
  const cotados = ativos.filter((item) => String(item.status_cotacao || '').toUpperCase() === 'COTADO').length;
  const comprados = ativos.filter((item) => String(item.status_compra || '').toUpperCase() === 'COMPRADO').length;
  const recebidos = ativos.filter((item) => String(item.situacao_recebimento || '').toUpperCase() === 'RECEBIDO').length;
  const subtotalCentavos = ativos.reduce((sum, item) => sum + Number(item.subtotal_centavos || 0), 0);
  const freteCentavos = Number(sol.frete_centavos || 0);
  const descontoCentavos = Number(sol.desconto_centavos || 0);
  const total = ativos.length;
  const progresso = total ? Math.round((cotados / total) * 100) : 0;
  return {
    ...sol,
    itens,
    itensAtivos: ativos,
    itensCancelados: cancelados,
    resumoItens: {
      ...(sol.resumoItens || {}),
      total,
      cotados,
      comprados,
      recebidos,
      progresso,
      subtotalCentavos,
      freteCentavos,
      descontoCentavos,
      totalCentavos: Math.max(0, subtotalCentavos + freteCentavos - descontoCentavos),
    },
  };
}

module.exports = {
  EXCLUSAO,
  ORIGEM_ITEM,
  solicitarExclusao,
  cancelarPedidoExclusao,
  responderExclusao,
  adicionarItemExcepcional,
  getHistoricoExclusoes,
  enrichSolicitacaoDetalhe,
};
