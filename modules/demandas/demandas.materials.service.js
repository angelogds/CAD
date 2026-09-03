const db = require('../../database/db');
const solicitacoesService = require('../solicitacoes/solicitacoes.service');

const BLOCKED_REQUEST_STATUS = new Set([
  'COMPRADA',
  'EM_RECEBIMENTO',
  'RECEBIDA_PARCIAL',
  'RECEBIDA_TOTAL',
  'SEPARADA_PARA_RETIRADA',
  'ENTREGUE_SOLICITANTE',
  'FECHADA',
  'CANCELADA',
]);

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function tableInfo(name) {
  if (!tableExists(name)) return [];
  return db.prepare(`PRAGMA table_info(${name})`).all();
}

function tableColumns(name) {
  return tableInfo(name).map((column) => column.name);
}

function hasColumn(table, column) {
  return tableColumns(table).includes(column);
}

function positiveId(value) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function validateEstoqueItemId(value) {
  const id = positiveId(value);
  if (!id || !tableExists('estoque_itens')) return null;
  return db.prepare('SELECT id FROM estoque_itens WHERE id=? AND COALESCE(ativo,1)=1').get(id)?.id || null;
}

function getDemand(demandId) {
  return db.prepare('SELECT * FROM demandas WHERE id=?').get(Number(demandId));
}

function hasLinkedOrder(demandId) {
  if (!tableExists('os') || !hasColumn('os', 'demanda_id')) return false;
  const statusFilter = hasColumn('os', 'status') ? " AND UPPER(COALESCE(status,'')) <> 'CANCELADA'" : '';
  return Boolean(db.prepare(`SELECT id FROM os WHERE demanda_id=?${statusFilter} LIMIT 1`).get(Number(demandId)));
}

function assertEditable(demandId, solicitationId) {
  const demanda = getDemand(demandId);
  if (!demanda) throw new Error('Demanda não encontrada.');
  if (['CONCLUIDA', 'CANCELADA'].includes(String(demanda.status || '').toUpperCase())) {
    throw new Error('Não é possível alterar materiais de uma demanda concluída ou cancelada.');
  }

  const solicitacao = solicitacoesService.getSolicitacaoById(Number(solicitationId));
  if (!solicitacao) throw new Error('Solicitação de material não encontrada.');
  if (Number(solicitacao.demanda_id || 0) !== Number(demandId)) {
    throw new Error('Esta solicitação não pertence à demanda informada.');
  }
  if (positiveId(solicitacao.os_id) || hasLinkedOrder(demandId)) {
    const error = new Error('A edição de materiais foi encerrada porque a demanda já está vinculada a uma Ordem de Serviço. Para necessidade urgente após a OS, utilize o fluxo de inclusão de material da própria OS.');
    error.code = 'DEMANDA_MATERIAIS_BLOQUEADOS_POR_OS';
    throw error;
  }
  if (BLOCKED_REQUEST_STATUS.has(String(solicitacao.status || '').toUpperCase())) {
    throw new Error('Esta solicitação já avançou para compra/recebimento e não aceita novos itens pela Demanda.');
  }

  return { demanda, solicitacao };
}

function insertItems(solicitationId, itens) {
  const schema = tableInfo('solicitacao_itens');
  if (!schema.length) throw new Error('Estrutura de itens da solicitação indisponível.');
  const columns = new Set(schema.map((column) => column.name));

  for (const item of itens) {
    const estoqueItemId = validateEstoqueItemId(item.estoque_item_id);
    const payload = {
      solicitacao_id: Number(solicitationId),
      item_nome: String(item.item_nome || '').trim(),
      item_descricao: String(item.item_descricao || '').trim() || null,
      unidade: String(item.unidade || 'UN').trim().toUpperCase() || 'UN',
      estoque_item_id: estoqueItemId,
      qtd_solicitada: Number(item.qtd_solicitada || 0),
      item_id: estoqueItemId,
      descricao: String(item.item_descricao || item.item_nome || '').trim(),
      quantidade: Number(item.qtd_solicitada || 0),
      status_cotacao: 'PENDENTE',
      status_compra: 'PENDENTE',
      qtd_comprada: 0,
      qtd_recebida_total: 0,
    };

    const insertColumns = Object.keys(payload).filter((column) => columns.has(column));
    if (!insertColumns.includes('solicitacao_id')) throw new Error('A estrutura de itens não possui vínculo com a solicitação.');
    const values = insertColumns.map((column) => payload[column]);
    db.prepare(`INSERT INTO solicitacao_itens (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`).run(...values);
  }
}

function appendItems(demandId, solicitationId, itens) {
  const normalized = Array.isArray(itens) ? itens.filter((item) => item && item.item_nome && Number(item.qtd_solicitada) > 0) : [];
  if (!normalized.length) throw new Error('Informe ao menos um novo material válido.');

  const context = assertEditable(demandId, solicitationId);
  return db.transaction(() => {
    insertItems(solicitationId, normalized);
    if (hasColumn('solicitacoes', 'updated_at')) {
      db.prepare("UPDATE solicitacoes SET updated_at=datetime('now') WHERE id=?").run(Number(solicitationId));
    }
    if (hasColumn('demandas', 'updated_at')) {
      db.prepare("UPDATE demandas SET updated_at=datetime('now') WHERE id=?").run(Number(demandId));
    }
    return {
      demanda: context.demanda,
      solicitacao: context.solicitacao,
      totalAdicionado: normalized.length,
    };
  })();
}

function canAppendToRequest(demand, solicitation, linkedOrders = []) {
  if (!demand || !solicitation) return false;
  if (['CONCLUIDA', 'CANCELADA'].includes(String(demand.status || '').toUpperCase())) return false;
  if (positiveId(solicitation.os_id)) return false;
  if (Array.isArray(linkedOrders) && linkedOrders.length > 0) return false;
  return !BLOCKED_REQUEST_STATUS.has(String(solicitation.status || '').toUpperCase());
}

module.exports = {
  BLOCKED_REQUEST_STATUS,
  assertEditable,
  appendItems,
  canAppendToRequest,
};
