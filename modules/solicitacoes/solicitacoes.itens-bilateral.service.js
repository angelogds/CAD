const db = require('../../database/db');
const { ROLE, normalizeRole } = require('../../config/rbac');

const FINAL_STATUS = new Set(['RECEBIDA_TOTAL', 'SEPARADA_PARA_RETIRADA', 'ENTREGUE_SOLICITANTE', 'FECHADA', 'CANCELADA']);
const PENDENTE = 'PENDENTE';

function text(value, max = 1200) {
  return String(value || '').trim().slice(0, max);
}

function number(value) {
  let raw = String(value ?? '').trim();
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function hasColumn(table, name) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
}

function ensureSchema() {
  if (!tableExists('solicitacao_item_alteracoes') || !tableExists('solicitacao_item_exclusoes')) {
    throw new Error('Atualização de consenso bilateral ainda não foi aplicada. Execute as migrations.');
  }
}

function getSolicitacao(id) {
  return db.prepare('SELECT * FROM solicitacoes WHERE id=?').get(Number(id)) || null;
}

function getItem(solicitacaoId, itemId) {
  return db.prepare('SELECT * FROM solicitacao_itens WHERE id=? AND solicitacao_id=?').get(Number(itemId), Number(solicitacaoId)) || null;
}

function isRequester(sol, user) {
  return Number(sol?.solicitante_user_id) === Number(user?.id);
}

function isPurchasing(user) {
  const role = normalizeRole(user?.role || user?.perfil);
  return role === ROLE.COMPRAS || role === ROLE.ADMIN;
}

function actorSide(sol, user) {
  if (isRequester(sol, user)) return 'SOLICITANTE';
  if (isPurchasing(user)) return 'COMPRAS';
  return null;
}

function assertActor(sol, user) {
  const side = actorSide(sol, user);
  if (!side) throw new Error('Somente o solicitante original ou o setor de Compras pode alterar os itens desta solicitação.');
  return side;
}

function assertOppositeSide(sol, requestedByUserId, user) {
  if (Number(requestedByUserId) === Number(user?.id)) throw new Error('Quem solicitou a alteração não pode aprovar a própria solicitação.');
  const requestedByRequester = Number(requestedByUserId) === Number(sol.solicitante_user_id);
  if (requestedByRequester && !isPurchasing(user)) throw new Error('Esta decisão precisa ser confirmada pelo setor de Compras.');
  if (!requestedByRequester && !isRequester(sol, user)) throw new Error('Esta decisão precisa ser confirmada pelo solicitante original.');
}

function assertOpen(sol) {
  if (!sol) throw new Error('Solicitação não encontrada.');
  if (FINAL_STATUS.has(String(sol.status || '').toUpperCase())) throw new Error('Esta solicitação já está encerrada para alterações de itens.');
}

function snapshot(item) {
  return JSON.stringify({
    id: item.id,
    item_nome: item.item_nome,
    item_descricao: item.item_descricao,
    unidade: item.unidade,
    qtd_solicitada: Number(item.qtd_solicitada || 0),
    qtd_comprada: Number(item.qtd_comprada || 0),
    qtd_recebida_total: Number(item.qtd_recebida_total || 0),
    status_compra: item.status_compra,
    status_cotacao: item.status_cotacao,
    fornecedor_id: item.fornecedor_id,
    valor_unitario_centavos: item.valor_unitario_centavos,
  });
}

function adicionarItem({ solicitacaoId, user, payload = {} }) {
  ensureSchema();
  const nome = text(payload.item_nome, 180);
  const descricao = text(payload.item_descricao, 1200);
  const unidade = text(payload.unidade || 'UN', 20).toUpperCase() || 'UN';
  const quantidade = number(payload.qtd_solicitada);
  const justificativa = text(payload.adicao_justificativa, 1200);
  if (!nome) throw new Error('Informe o material que será adicionado.');
  if (!(quantidade > 0)) throw new Error('A quantidade deve ser maior que zero.');
  if (justificativa.length < 5) throw new Error('Informe o motivo da inclusão do material.');

  return db.transaction(() => {
    const sol = getSolicitacao(solicitacaoId);
    assertOpen(sol);
    const side = assertActor(sol, user);
    const cols = ['solicitacao_id', 'item_nome', 'item_descricao', 'unidade', 'qtd_solicitada', 'status_item'];
    const vals = [Number(solicitacaoId), nome, descricao || null, unidade, quantidade, 'PENDENTE'];
    const add = (column, value) => {
      if (hasColumn('solicitacao_itens', column)) { cols.push(column); vals.push(value); }
    };
    add('origem_item', side === 'COMPRAS' ? 'COMPRAS_EXTRA' : 'SOLICITANTE_EXTRA');
    add('adicionado_por_user_id', Number(user.id));
    add('adicionado_em', new Date().toISOString());
    add('adicao_justificativa', justificativa);
    add('status_cotacao', 'PENDENTE');
    add('status_compra', 'PENDENTE');
    add('atualizado_por', Number(user.id));
    const info = db.prepare(`INSERT INTO solicitacao_itens (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    // Regra importante: complemento não regride o status global da solicitação.
    // O novo item segue seu próprio status e entra no fluxo de cotação individualmente.
    db.prepare("UPDATE solicitacoes SET updated_at=datetime('now') WHERE id=?").run(Number(solicitacaoId));
    return { itemId: Number(info.lastInsertRowid), side };
  })();
}

function solicitarAlteracao({ solicitacaoId, itemId, user, payload = {} }) {
  ensureSchema();
  const motivo = text(payload.motivo, 1200);
  if (motivo.length < 5) throw new Error('Informe o motivo da alteração proposta.');

  return db.transaction(() => {
    const sol = getSolicitacao(solicitacaoId);
    assertOpen(sol);
    assertActor(sol, user);
    const item = getItem(solicitacaoId, itemId);
    if (!item) throw new Error('Item não pertence à solicitação informada.');
    if (String(item.status_compra || '').toUpperCase() === 'CANCELADO') throw new Error('Item cancelado não pode ser alterado.');
    if (Number(item.qtd_recebida_total || 0) > 0) throw new Error('Item com recebimento físico não pode ser alterado retroativamente.');

    const proposta = {
      item_nome: text(payload.item_nome || item.item_nome, 180),
      item_descricao: text(payload.item_descricao ?? item.item_descricao, 1200),
      unidade: text(payload.unidade || item.unidade || 'UN', 20).toUpperCase() || 'UN',
      qtd_solicitada: number(payload.qtd_solicitada),
    };
    if (!proposta.item_nome) throw new Error('Informe o nome do material.');
    if (!(proposta.qtd_solicitada > 0)) throw new Error('A quantidade proposta deve ser maior que zero.');
    if (Number(item.qtd_comprada || 0) > proposta.qtd_solicitada) {
      throw new Error('A quantidade solicitada não pode ficar abaixo da quantidade já comprada.');
    }
    const purchased = String(item.status_compra || '').toUpperCase() === 'COMPRADO';
    if (purchased && (proposta.item_nome !== String(item.item_nome || '') || proposta.unidade !== String(item.unidade || 'UN').toUpperCase() || proposta.item_descricao !== String(item.item_descricao || ''))) {
      throw new Error('Após a compra, somente a quantidade solicitada pode ser ajustada por consenso.');
    }

    const pending = db.prepare("SELECT id FROM solicitacao_item_alteracoes WHERE solicitacao_item_id=? AND status='PENDENTE'").get(Number(itemId));
    if (pending) throw new Error('Já existe uma alteração deste item aguardando confirmação.');

    const info = db.prepare(`
      INSERT INTO solicitacao_item_alteracoes
        (solicitacao_id,solicitacao_item_id,solicitada_por_user_id,motivo,proposta_json,snapshot_json,status)
      VALUES (?,?,?,?,?,?,?)
    `).run(Number(solicitacaoId), Number(itemId), Number(user.id), motivo, JSON.stringify(proposta), snapshot(item), PENDENTE);
    return { id: Number(info.lastInsertRowid), proposta };
  })();
}

function responderAlteracao({ solicitacaoId, itemId, user, aprovar, observacao }) {
  ensureSchema();
  const resposta = text(observacao, 1200);
  return db.transaction(() => {
    const sol = getSolicitacao(solicitacaoId);
    assertOpen(sol);
    const item = getItem(solicitacaoId, itemId);
    if (!item) throw new Error('Item não encontrado.');
    const pending = db.prepare(`SELECT * FROM solicitacao_item_alteracoes WHERE solicitacao_item_id=? AND solicitacao_id=? AND status='PENDENTE' ORDER BY id DESC LIMIT 1`).get(Number(itemId), Number(solicitacaoId));
    if (!pending) throw new Error('Não existe alteração pendente para este item.');
    assertOppositeSide(sol, pending.solicitada_por_user_id, user);
    if (Number(item.qtd_recebida_total || 0) > 0) throw new Error('O item recebeu material enquanto aguardava aprovação. A alteração foi bloqueada.');

    if (aprovar) {
      const proposta = JSON.parse(pending.proposta_json || '{}');
      if (Number(item.qtd_comprada || 0) > Number(proposta.qtd_solicitada || 0)) throw new Error('A proposta ficou abaixo da quantidade já comprada e não pode ser aplicada.');
      db.prepare(`UPDATE solicitacao_itens SET item_nome=?,item_descricao=?,unidade=?,qtd_solicitada=?,atualizado_por=?,updated_at=datetime('now') WHERE id=? AND solicitacao_id=?`)
        .run(proposta.item_nome, proposta.item_descricao || null, proposta.unidade, Number(proposta.qtd_solicitada), Number(user.id), Number(itemId), Number(solicitacaoId));
    }
    const status = aprovar ? 'APROVADA' : 'RECUSADA';
    db.prepare(`UPDATE solicitacao_item_alteracoes SET status=?,respondida_por_user_id=?,respondida_em=datetime('now'),resposta_observacao=?,updated_at=datetime('now') WHERE id=?`)
      .run(status, Number(user.id), resposta || null, pending.id);
    db.prepare("UPDATE solicitacoes SET updated_at=datetime('now') WHERE id=?").run(Number(solicitacaoId));
    return { aprovado: !!aprovar, status };
  })();
}

function solicitarExclusao({ solicitacaoId, itemId, user, motivo }) {
  ensureSchema();
  const justificativa = text(motivo, 1200);
  if (justificativa.length < 5) throw new Error('Informe o motivo da solicitação de exclusão.');
  return db.transaction(() => {
    const sol = getSolicitacao(solicitacaoId);
    assertOpen(sol);
    assertActor(sol, user);
    const item = getItem(solicitacaoId, itemId);
    if (!item) throw new Error('Item não encontrado.');
    const statusCompra = String(item.status_compra || '').toUpperCase();
    if (statusCompra === 'CANCELADO') throw new Error('Este item já foi cancelado.');
    if (['COMPRADO', 'ATENDIDO_ESTOQUE'].includes(statusCompra) || Number(item.qtd_recebida_total || 0) > 0) {
      throw new Error('Item já comprometido por compra/estoque não pode ser excluído. Use o fluxo de correção para preservar o histórico.');
    }
    if (String(item.exclusao_status || '').toUpperCase() === PENDENTE) throw new Error('Já existe pedido de exclusão aguardando resposta.');
    db.prepare(`INSERT INTO solicitacao_item_exclusoes (solicitacao_id,solicitacao_item_id,solicitada_por_user_id,motivo,status,snapshot_json) VALUES (?,?,?,?,?,?)`)
      .run(Number(solicitacaoId), Number(itemId), Number(user.id), justificativa, PENDENTE, snapshot(item));
    db.prepare(`UPDATE solicitacao_itens SET exclusao_status='PENDENTE',exclusao_solicitada_por_user_id=?,exclusao_solicitada_em=datetime('now'),exclusao_motivo=?,exclusao_respondida_por_user_id=NULL,exclusao_respondida_em=NULL,exclusao_resposta_observacao=NULL,updated_at=datetime('now') WHERE id=? AND solicitacao_id=?`)
      .run(Number(user.id), justificativa, Number(itemId), Number(solicitacaoId));
    return true;
  })();
}

function responderExclusao({ solicitacaoId, itemId, user, aprovar, observacao }) {
  ensureSchema();
  const resposta = text(observacao, 1200);
  return db.transaction(() => {
    const sol = getSolicitacao(solicitacaoId);
    assertOpen(sol);
    const item = getItem(solicitacaoId, itemId);
    if (!item) throw new Error('Item não encontrado.');
    const pending = db.prepare(`SELECT * FROM solicitacao_item_exclusoes WHERE solicitacao_item_id=? AND solicitacao_id=? AND status='PENDENTE' ORDER BY id DESC LIMIT 1`).get(Number(itemId), Number(solicitacaoId));
    if (!pending) throw new Error('Pedido de exclusão pendente não encontrado.');
    assertOppositeSide(sol, pending.solicitada_por_user_id, user);
    if (aprovar) {
      if (['COMPRADO', 'ATENDIDO_ESTOQUE'].includes(String(item.status_compra || '').toUpperCase()) || Number(item.qtd_recebida_total || 0) > 0) {
        throw new Error('O item foi comprometido enquanto aguardava aprovação. A exclusão foi bloqueada.');
      }
      db.prepare(`UPDATE solicitacao_itens SET status_compra='CANCELADO',status_cotacao='CANCELADO',status_item='CANCELADO',exclusao_status='APROVADA',exclusao_respondida_por_user_id=?,exclusao_respondida_em=datetime('now'),exclusao_resposta_observacao=?,atualizado_por=?,updated_at=datetime('now') WHERE id=? AND solicitacao_id=?`)
        .run(Number(user.id), resposta || 'Exclusão aprovada por consenso.', Number(user.id), Number(itemId), Number(solicitacaoId));
    } else {
      db.prepare(`UPDATE solicitacao_itens SET exclusao_status='RECUSADA',exclusao_respondida_por_user_id=?,exclusao_respondida_em=datetime('now'),exclusao_resposta_observacao=?,updated_at=datetime('now') WHERE id=? AND solicitacao_id=?`)
        .run(Number(user.id), resposta || 'Exclusão recusada pela contraparte.', Number(itemId), Number(solicitacaoId));
    }
    const status = aprovar ? 'APROVADA' : 'RECUSADA';
    db.prepare(`UPDATE solicitacao_item_exclusoes SET status=?,respondida_por_user_id=?,respondida_em=datetime('now'),resposta_observacao=?,updated_at=datetime('now') WHERE id=?`)
      .run(status, Number(user.id), resposta || null, pending.id);
    return { aprovado: !!aprovar, status };
  })();
}

function getAlteracoes(solicitacaoId) {
  ensureSchema();
  return db.prepare(`
    SELECT a.*,si.item_nome,us.name solicitada_por_nome,ur.name respondida_por_nome
    FROM solicitacao_item_alteracoes a
    JOIN solicitacao_itens si ON si.id=a.solicitacao_item_id
    LEFT JOIN users us ON us.id=a.solicitada_por_user_id
    LEFT JOIN users ur ON ur.id=a.respondida_por_user_id
    WHERE a.solicitacao_id=? ORDER BY a.id DESC LIMIT 100
  `).all(Number(solicitacaoId)).map((row) => {
    try { return { ...row, proposta: JSON.parse(row.proposta_json || '{}'), snapshot: JSON.parse(row.snapshot_json || '{}') }; }
    catch (_error) { return { ...row, proposta: {}, snapshot: {} }; }
  });
}

function canAnswer(sol, requestedByUserId, user) {
  if (!user || Number(requestedByUserId) === Number(user.id)) return false;
  const fromRequester = Number(requestedByUserId) === Number(sol.solicitante_user_id);
  return fromRequester ? isPurchasing(user) : isRequester(sol, user);
}

module.exports = {
  adicionarItem,
  solicitarAlteracao,
  responderAlteracao,
  solicitarExclusao,
  responderExclusao,
  getAlteracoes,
  canAnswer,
  actorSide,
};
