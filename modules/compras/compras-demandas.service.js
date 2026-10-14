const db = require('../../database/db');
const { dbAliasesForSetor, SETORES } = require('./compras-setores');

function recyclingSectorFilter() {
  const reciclagem = dbAliasesForSetor('RECICLAGEM');
  const outros = Object.values(SETORES).filter(s => s !== 'RECICLAGEM').flatMap(dbAliasesForSetor);
  const matches = [], exclusions = [], params = [];
  const inList = (expr, values) => {
    params.push(...values);
    return `TRIM(COALESCE(${expr}, '')) COLLATE NOCASE IN (${values.map(() => '?').join(',')})`;
  };
  for (const [alias, table] of [['s','solicitacoes'],['d','demandas']]) {
    if (hasColumn(table,'setor_origem')) matches.push(inList(`${alias}.setor_origem`,reciclagem));
  }
  // Registros antigos podem conservar o local operacional. Só usar fontes
  // corporativas comprovadas pelo equipamento ou pelo autor já vinculado.
  if (hasColumn('equipamentos','setor')) matches.push(inList('e.setor',reciclagem));
  const creatorPaths = [];
  if (hasColumn('demandas','created_by')) creatorPaths.push('d.created_by');
  if (hasColumn('solicitacoes','solicitante_user_id')) creatorPaths.push('s.solicitante_user_id');
  if (hasColumn('users','role') && creatorPaths.length) {
    matches.push(`EXISTS (SELECT 1 FROM users u WHERE u.id IN (${creatorPaths.join(',')})
      AND UPPER(TRIM(u.role)) IN ('ENCARREGADO_MANUTENCAO','MANUTENCAO_SUPERVISOR','SUPERVISOR_MANUTENCAO','COORDENADOR_RECICLAGEM'))`);
  }
  // Um vínculo a Reciclagem não pode sobrepor origem explícita de outro setor.
  for (const [alias, table] of [['s','solicitacoes'],['d','demandas']]) {
    if (hasColumn(table,'setor_origem')) exclusions.push(`NOT (${inList(`${alias}.setor_origem`,outros)})`);
  }
  if (hasColumn('equipamentos','setor')) exclusions.push(`NOT (${inList('e.setor',outros)})`);
  return {sql:`(${matches.join(' OR ') || '1=0'})${exclusions.length ? ' AND '+exclusions.join(' AND ') : ''}`,params};
}

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

function resolvedOrderIdSql(demandIdExpr) {
  const paths = hasColumn('solicitacoes','os_id') ? ['NULLIF(s.os_id,0)'] : [];
  if (tableExists('os_solicitacoes_vinculos') && hasColumn('os','demanda_id')) {
    paths.push(`(SELECT o.id FROM os_solicitacoes_vinculos v JOIN os o ON o.id=v.os_id
      WHERE v.solicitacao_id=s.id AND o.demanda_id=${demandIdExpr} ORDER BY o.id DESC LIMIT 1)`);
  }
  return paths.length>1 ? `COALESCE(${paths.join(',')})` : paths[0] || 'NULL';
}

function buildPreCotacoesQuery() {
  if (!tableExists('solicitacoes') || !tableExists('demandas') || !tableExists('solicitacao_itens')) return null;

  // Pré-cotação é planejamento antecipado e precisa ter uma solicitação
  // de materiais REAL, não só uma Demanda ou OS sem itens.
  const demandIdExpr = resolvedDemandIdSql('s');
  const releaseWhere = hasColumn('demandas', 'liberacao_compras_status')
    ? "AND UPPER(TRIM(COALESCE(d.liberacao_compras_status, 'PENDENTE'))) <> 'LIBERADA'"
    : '';
  // A origem da demanda ou da solicitação pode ter variações de escrita/capitalização.
  // O filtro da fila normal já normaliza esses nomes; o card deve fazer o mesmo.
  const sectorFilter = recyclingSectorFilter();
  const setorWhere = `AND ${sectorFilter.sql}`;
  const quoteExpr = tableExists('solicitacao_itens') && hasColumn('solicitacao_itens', 'status_cotacao')
    ? "SUM(CASE WHEN UPPER(TRIM(COALESCE(si.status_cotacao, 'PENDENTE'))) = 'COTADO' THEN 1 ELSE 0 END)"
    : '0';
  const purchaseExpr = tableExists('solicitacao_itens') && hasColumn('solicitacao_itens', 'status_compra')
    ? "SUM(CASE WHEN COALESCE(si.status_compra, 'PENDENTE') IN ('COMPRADO','ATENDIDO_ESTOQUE') THEN 1 ELSE 0 END)"
    : '0';

  const sql = `
    SELECT
      s.id, s.numero, s.titulo, s.status, s.prioridade, s.created_at,
      ${demandIdExpr} AS demanda_id, ${resolvedOrderIdSql(demandIdExpr)} AS os_id,
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
      ${hasColumn('solicitacao_itens', 'status_compra') ? "AND UPPER(TRIM(COALESCE(si.status_compra, 'PENDENTE'))) <> 'CANCELADO'" : ''}
    WHERE ${demandIdExpr} IS NOT NULL
      ${releaseWhere}
      ${setorWhere}
      AND UPPER(TRIM(COALESCE(s.status, 'ABERTA'))) NOT IN ('CANCELADA','FECHADA','RECEBIDA_TOTAL','ENTREGUE_SOLICITANTE')
      AND UPPER(TRIM(COALESCE(d.status, 'NOVA'))) NOT IN ('CANCELADA','CONCLUIDA')
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
  return { sql, params: sectorFilter.params };
}

// Solicitações explicitamente criadas para Demandas, mas com FK/OS ausente,
// ficam em revisão de vínculo. Não inventamos a Demanda a partir de títulos.
function listSolicitacoesDemandaSemVinculo() {
  if (!tableExists('solicitacoes') || !tableExists('solicitacao_itens')
      || !hasColumn('solicitacoes', 'tipo_origem') || !tableExists('demandas')
      || !tableExists('equipamentos')) return [];
  const demandIdExpr = resolvedDemandIdSql('s');
  const setor = recyclingSectorFilter();
  return db.prepare(`
    SELECT s.id, s.numero, s.titulo, s.prioridade, COUNT(si.id) AS itens_count
    FROM solicitacoes s
    LEFT JOIN demandas d ON d.id=${demandIdExpr}
    LEFT JOIN equipamentos e ON e.id=s.equipamento_id
    JOIN solicitacao_itens si ON si.solicitacao_id=s.id
      ${hasColumn('solicitacao_itens','status_compra') ? "AND UPPER(TRIM(COALESCE(si.status_compra,'PENDENTE'))) <> 'CANCELADO'" : ''}
    WHERE UPPER(TRIM(COALESCE(s.tipo_origem,'')))='DEMANDA'
      AND (${demandIdExpr} IS NULL OR d.id IS NULL)
      AND ${setor.sql}
      AND UPPER(TRIM(COALESCE(s.status,'ABERTA'))) NOT IN
        ('CANCELADA','FECHADA','RECEBIDA_TOTAL','ENTREGUE_SOLICITANTE')
    GROUP BY s.id
    ORDER BY s.id DESC
  `).all(...setor.params);
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


/**
 * Diagnóstico somente de leitura. Não cria vínculos e não muda o fluxo de
 * compra: mostra POR QUE o card ficou vazio na base real da fábrica.
 * A saída contém contagens e IDs de solicitações/OS, nunca dados pessoais.
 */
function diagnosticarPreCotacoesDemandas() {
  if (!['solicitacoes','solicitacao_itens','demandas'].every(tableExists)) {
    return { disponivel: false, motivo: 'Tabelas de solicitações, itens ou demandas indisponíveis.' };
  }
  const demandIdExpr = resolvedDemandIdSql('s');
  const sectorFilter = recyclingSectorFilter();
  const validItemFilter = hasColumn('solicitacao_itens','status_compra')
    ? "AND UPPER(TRIM(COALESCE(si.status_compra,'PENDENTE'))) <> 'CANCELADO'" : '';
  const sql = `
    SELECT s.id, ${resolvedOrderIdSql(demandIdExpr)} AS os_id,
      s.status, ${hasColumn('solicitacoes','setor_origem') ? 's.setor_origem' : 'NULL'} AS setor_solicitacao,
      ${demandIdExpr} AS demanda_id,
      ${hasColumn('demandas','setor_origem') ? 'd.setor_origem' : 'NULL'} AS setor_demanda,
      ${hasColumn('demandas','liberacao_compras_status') ? 'd.liberacao_compras_status' : "'PENDENTE'"} AS liberacao,
      COUNT(si.id) AS itens_validos,
      (${sectorFilter.sql}) AS reciclagem_elegivel,
      d.status AS demanda_status
    FROM solicitacoes s
    LEFT JOIN demandas d ON d.id=${demandIdExpr}
    LEFT JOIN equipamentos e ON e.id=d.equipamento_id
    LEFT JOIN solicitacao_itens si ON si.solicitacao_id=s.id ${validItemFilter}
    GROUP BY s.id
  `;
  const conta = {
    solicitacoes_com_materiais: 0,
    solicitacoes_com_os_e_materiais: 0,
    solicitacoes_com_os_sem_vinculo_demanda: 0,
    solicitacoes_vinculadas_demanda_com_materiais: 0,
    vinculadas_demanda_reciclagem: 0,
    vinculadas_demanda_reciclagem_pendentes: 0,
    vinculadas_demanda_reciclagem_liberadas: 0,
    candidatas_excluidas_pelo_status: 0,
    pre_cotacoes_visiveis_no_card: countPreCotacoesDemandas(),
  };
  const exemplosSemVinculo = [];
  for (const s of db.prepare(sql).all(...sectorFilter.params)) {
    if (!Number(s.itens_validos)) continue;
    conta.solicitacoes_com_materiais++;
    const osId=Number(s.os_id)||null;
    if(osId) conta.solicitacoes_com_os_e_materiais++;
    const demandaId=Number(s.demanda_id)||null;
    if(!demandaId) {
      if (osId) {
        conta.solicitacoes_com_os_sem_vinculo_demanda++;
        if(exemplosSemVinculo.length<8) exemplosSemVinculo.push({solicitacao_id:Number(s.id),os_id:osId});
      }
      continue;
    }
    conta.solicitacoes_vinculadas_demanda_com_materiais++;
    const reciclagem = Boolean(s.reciclagem_elegivel);
    if(!reciclagem) continue;
    conta.vinculadas_demanda_reciclagem++;
    if(String(s.liberacao||'PENDENTE').trim().toUpperCase()==='LIBERADA') {
      conta.vinculadas_demanda_reciclagem_liberadas++;
    } else {
      conta.vinculadas_demanda_reciclagem_pendentes++;
      if(['CANCELADA','FECHADA','RECEBIDA_TOTAL','ENTREGUE_SOLICITANTE']
          .includes(String(s.status||'ABERTA').trim().toUpperCase())
          || ['CANCELADA','CONCLUIDA'].includes(String(s.demanda_status||'').trim().toUpperCase())) {
        conta.candidatas_excluidas_pelo_status++;
      }
    }
  }
  return {disponivel:true,contagens:conta,exemplos_os_sem_demanda:exemplosSemVinculo};
}

function getDemandGate(solicitacaoId) {
  if (!tableExists('solicitacoes')) return null;
  const demandIdExpr = resolvedDemandIdSql('s');
  const releaseExpr = tableExists('demandas') && hasColumn('demandas', 'liberacao_compras_status')
    ? "COALESCE(d.liberacao_compras_status, 'PENDENTE')"
    : "'PENDENTE'";
  return db.prepare(`
    SELECT s.id, s.numero, ${hasColumn('solicitacoes','tipo_origem') ? 's.tipo_origem' : "''"} AS tipo_origem,
           ${demandIdExpr} AS demanda_id, ${resolvedOrderIdSql(demandIdExpr)} AS os_id,
           ${tableExists('demandas') ? 'd.id' : 'NULL'} AS demanda_validada_id,
           ${releaseExpr} AS liberacao_compras_status
    FROM solicitacoes s
    ${tableExists('demandas') ? `LEFT JOIN demandas d ON d.id=${demandIdExpr}` : ''}
    WHERE s.id=?
  `).get(Number(solicitacaoId));
}

function assertCompraLiberada(solicitacaoId) {
  const row = getDemandGate(solicitacaoId);
  if (!row) return;
  const isDemandRequest = Number(row.demanda_id || 0) > 0;
  if ((isDemandRequest && !Number(row.demanda_validada_id || 0))
      || (!isDemandRequest && String(row.tipo_origem || '').trim().toUpperCase() === 'DEMANDA')) {
    const error = new Error('Solicitação criada para Demanda sem vínculo válido. Corrija o vínculo com a Demanda antes de liberar a compra.');
    error.code = 'DEMANDA_VINCULO_PENDENTE';
    throw error;
  }
  const released = String(row.liberacao_compras_status || 'PENDENTE').trim().toUpperCase() === 'LIBERADA';
  if (isDemandRequest && !released) {
    const error = new Error('Esta solicitação ainda está em pré-cotação da Demanda. Libere a compra na aba Planejamento da Demanda para que ela siga o fluxo normal de Compras. A geração de OS não é necessária para comprar o material.');
    error.code = 'DEMANDA_COMPRA_AGUARDANDO_LIBERACAO';
    throw error;
  }
}

module.exports = { resolvedDemandIdSql, listPreCotacoesDemandas, countPreCotacoesDemandas, listSolicitacoesDemandaSemVinculo, diagnosticarPreCotacoesDemandas, getDemandGate, assertCompraLiberada };
