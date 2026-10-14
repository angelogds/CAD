const db = require('../../database/db');
const { dbAliasesForSetor } = require('./compras-setores');

function tableExists(name) {
  try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch { return false; }
}

function hasColumn(table, name) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name); } catch { return false; }
}

/**
 * A solicitação pode estar vinculada à Demanda diretamente (planejamento),
 * pela OS gerada a partir dela ou pela tabela legada de vínculos da OS.
 * Não cria vínculos: consulta somente os relacionamentos existentes.
 */
function resolvedDemandIdSql(alias = 's') {
  const paths = [];
  if (hasColumn('solicitacoes', 'demanda_id')) {
    paths.push(`NULLIF(${alias}.demanda_id, 0)`);
  }
  if (tableExists('os') && hasColumn('os', 'demanda_id')) {
    if (hasColumn('solicitacoes','os_id')) {
      paths.push(`(SELECT o.demanda_id FROM os o WHERE o.id=${alias}.os_id AND o.demanda_id IS NOT NULL LIMIT 1)`);
    }
    if (tableExists('os_solicitacoes_vinculos')
        && hasColumn('os_solicitacoes_vinculos', 'solicitacao_id')
        && hasColumn('os_solicitacoes_vinculos', 'os_id')) {
      paths.push(`(SELECT o.demanda_id
        FROM os_solicitacoes_vinculos v JOIN os o ON o.id=v.os_id
        WHERE v.solicitacao_id=${alias}.id AND o.demanda_id IS NOT NULL
        ORDER BY o.id DESC LIMIT 1)`);
    }
  }
  return paths.length > 1 ? `COALESCE(${paths.join(', ')})` : (paths[0] || 'NULL');
}

function buildPreCotacoesQuery() {
  if (!tableExists('solicitacoes') || !tableExists('demandas') || !tableExists('solicitacao_itens') || !hasColumn('solicitacoes', 'demanda_id')) return null;

  // Pré-cotação é planejamento antecipado e precisa ter uma solicitação
  // de materiais REAL, não só uma Demanda ou OS sem itens.
  const demandIdExpr = resolvedDemandIdSql('s');
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

  const sql = `
    SELECT
      s.id, s.numero, s.titulo, s.status, s.prioridade, s.created_at,
      ${demandIdExpr} AS demanda_id, s.os_id,
      d.titulo AS demanda_titulo, d.status AS demanda_status, d.prioridade AS demanda_prioridade,
      d.aprovacao_status, d.prazo_previsto, d.nr_referencia,
      ${hasColumn('demandas', 'liberacao_compras_status') ? "COALESCE(d.liberacao_compras_status, 'PENDENTE')" : "'PENDENTE'"} AS liberacao_compras_status,
      e.nome AS equipamento_nome,
      COUNT(si.id) AS itens_count,
      ${quoteExpr} AS itens_cotados,
      ${purchaseExpr} AS itens_comprados
    FROM solicitacoes s
    JOIN demandas d ON d.id = ${demandIdExpr}
    LEFT JOIN equipamentos e ON e.id = d.equipamento_id
    JOIN solicitacao_itens si ON si.solicitacao_id = s.id
      ${hasColumn('solicitacao_itens', 'status_compra') ? "AND UPPER(COALESCE(si.status_compra, 'PENDENTE')) <> 'CANCELADO'" : ''}
    WHERE ${demandIdExpr} IS NOT NULL
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
  `;
  return { sql, params: setorParams };
}

// Apenas solicitações reais COM itens, sem compra liberada. Sem Demandas vazias.
function listPreCotacoesDemandas(limit = 12) {
  const query = buildPreCotacoesQuery();
  if (!query) return [];
  if (limit === null) return db.prepare(query.sql).all(...query.params);
  return db.prepare(query.sql + ' LIMIT ?').all(...query.params, Math.min(100, Math.max(1, Number(limit) || 12)));
}

function countPreCotacoesDemandas() {
  const query = buildPreCotacoesQuery();
  if (!query) return 0;
  return Number(db.prepare(`SELECT COUNT(*) AS total FROM (${query.sql})`).get(...query.params)?.total || 0);
}

function getDemandGate(solicitacaoId) {
  if (!tableExists('solicitacoes')) return null;
  const demandIdExpr = resolvedDemandIdSql('s');
  const releaseExpr = tableExists('demandas') && hasColumn('demandas', 'liberacao_compras_status')
    ? "COALESCE(d.liberacao_compras_status, 'PENDENTE')"
    : "'PENDENTE'";
  return db.prepare(`
    SELECT s.id, s.numero, ${demandIdExpr} AS demanda_id, s.os_id,
           ${releaseExpr} AS liberacao_compras_status
    FROM solicitacoes s
    LEFT JOIN demandas d ON d.id=${demandIdExpr}
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

module.exports = { resolvedDemandIdSql, listPreCotacoesDemandas, countPreCotacoesDemandas, getDemandGate, assertCompraLiberada };
