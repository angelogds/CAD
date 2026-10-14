const db = require('../../database/db');
const { dbAliasesForSetor } = require('./compras-setores');

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch { return false; }
}

function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name); } catch { return false; }
}

function listPreCotacoesDemandas(limit = 12) {
  if (!tableExists('solicitacoes') || !tableExists('demandas') || !hasColumn('solicitacoes', 'demanda_id')) return [];

  // Pré-cotação é planejamento antecipado: não depende de uma solicitação
  // já finalizada para a fila normal de Compras.
  const releaseWhere = hasColumn('demandas', 'liberacao_compras_status')
    ? "AND UPPER(TRIM(COALESCE(d.liberacao_compras_status, 'PENDENTE'))) <> 'LIBERADA'"
    : '';
  // A origem da demanda ou da solicitação pode ter variações de escrita/capitalização.
  // O filtro da fila normal já normaliza esses nomes; o card deve fazer o mesmo.
  const setorAliases = dbAliasesForSetor('RECICLAGEM');
  const setorClauses = [];
  const setorParams = [];
  for (const table of ['s', 'd']) {
    const column = table === 's' ? 'solicitacoes' : 'demandas';
    if (hasColumn(column, 'setor_origem')) {
      setorClauses.push(`TRIM(COALESCE(${table}.setor_origem, '')) COLLATE NOCASE IN (${setorAliases.map(() => '?').join(',')})`);
      setorParams.push(...setorAliases);
    }
  }
  const setorWhere = setorClauses.length ? `AND (${setorClauses.join(' OR ')})` : 'AND 1=0';
  const quoteExpr = tableExists('solicitacao_itens') && hasColumn('solicitacao_itens', 'status_cotacao')
    ? "SUM(CASE WHEN COALESCE(si.status_cotacao, 'PENDENTE') <> 'PENDENTE' THEN 1 ELSE 0 END)"
    : '0';
  const purchaseExpr = tableExists('solicitacao_itens') && hasColumn('solicitacao_itens', 'status_compra')
    ? "SUM(CASE WHEN COALESCE(si.status_compra, 'PENDENTE') IN ('COMPRADO','ATENDIDO_ESTOQUE') THEN 1 ELSE 0 END)"
    : '0';

  return db.prepare(`
    SELECT
      s.id, s.numero, s.titulo, s.status, s.prioridade, s.created_at,
      s.demanda_id, s.os_id,
      d.titulo AS demanda_titulo, d.status AS demanda_status, d.prioridade AS demanda_prioridade,
      d.aprovacao_status, d.prazo_previsto, d.nr_referencia,
      ${hasColumn('demandas', 'liberacao_compras_status') ? "COALESCE(d.liberacao_compras_status, 'PENDENTE')" : "'PENDENTE'"} AS liberacao_compras_status,
      e.nome AS equipamento_nome,
      COUNT(si.id) AS itens_count,
      ${quoteExpr} AS itens_cotados,
      ${purchaseExpr} AS itens_comprados
    FROM solicitacoes s
    JOIN demandas d ON d.id = s.demanda_id
    LEFT JOIN equipamentos e ON e.id = d.equipamento_id
    LEFT JOIN solicitacao_itens si ON si.solicitacao_id = s.id
    WHERE s.demanda_id IS NOT NULL
      ${releaseWhere}
      ${setorWhere}
      AND UPPER(COALESCE(s.status, 'ABERTA')) NOT IN ('CANCELADA','FECHADA','RECEBIDA_TOTAL','ENTREGUE_SOLICITANTE')
    GROUP BY s.id
    ORDER BY
      CASE UPPER(COALESCE(s.prioridade, d.prioridade, 'MEDIA'))
        WHEN 'CRITICA' THEN 0 WHEN 'CRÍTICA' THEN 0 WHEN 'URGENTE' THEN 0
        WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 WHEN 'MÉDIA' THEN 2 WHEN 'NORMAL' THEN 2
        WHEN 'BAIXA' THEN 3 ELSE 4
      END,
      datetime(COALESCE(s.updated_at, s.created_at)) DESC,
      s.id DESC
    LIMIT ?
  `).all(...setorParams, Math.min(100, Math.max(1, Number(limit) || 12)));
}

function getDemandGate(solicitacaoId) {
  if (!tableExists('solicitacoes') || !hasColumn('solicitacoes', 'demanda_id')) return null;
  const releaseExpr = tableExists('demandas') && hasColumn('demandas', 'liberacao_compras_status')
    ? "COALESCE(d.liberacao_compras_status, 'PENDENTE')"
    : "'PENDENTE'";
  return db.prepare(`
    SELECT s.id, s.numero, s.demanda_id, s.os_id,
           ${releaseExpr} AS liberacao_compras_status
    FROM solicitacoes s
    LEFT JOIN demandas d ON d.id=s.demanda_id
    WHERE s.id=?
  `).get(Number(solicitacaoId));
}

function assertCompraLiberada(solicitacaoId) {
  const row = getDemandGate(solicitacaoId);
  if (!row) return;
  const isDemandRequest = Number(row.demanda_id || 0) > 0;
  const released = String(row.liberacao_compras_status || 'PENDENTE').toUpperCase() === 'LIBERADA';
  if (isDemandRequest && !released) {
    const error = new Error('Esta solicitação ainda está em pré-cotação da Demanda. Libere a compra na aba Planejamento da Demanda para que ela siga o fluxo normal de Compras. A geração de OS não é necessária para comprar o material.');
    error.code = 'DEMANDA_COMPRA_AGUARDANDO_LIBERACAO';
    throw error;
  }
}

module.exports = { listPreCotacoesDemandas, getDemandGate, assertCompraLiberada };
