const db = require('../../database/db');
const manutencaoExecutivaService = require('../diretoria/diretoria.manutencao.service');
const lubrificacaoSemanaService = require('../lubrificacao/lubrificacao-semana.service');

const MANAGEMENT_CACHE_TTL_MS = 60000;
let managementCache = { at: 0, data: null };

const CLOSED = new Set(['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CANCELADA', 'CANCELADO']);
const DEADLINE_COLUMNS = ['prazo', 'data_prazo', 'data_prevista', 'previsao_conclusao'];
const RESPONSIBLE_COLUMNS = [
  ['executor_colaborador_id', 'colaboradores'], ['auxiliar_colaborador_id', 'colaboradores'],
  ['executor_secundario_colaborador_id', 'colaboradores'], ['auxiliar_secundario_colaborador_id', 'colaboradores'],
  ['mecanico_user_id', 'users'], ['auxiliar_user_id', 'users'], ['responsavel_user_id', 'users'],
];

function semAcentos(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase(); }
function normalizarStatusOS(value) {
  const valueNormalized = semAcentos(value).replace(/[\s-]+/g, '_');
  if (CLOSED.has(valueNormalized)) return valueNormalized.startsWith('CANCEL') ? 'CANCELADA' : 'CONCLUIDA';
  if (['ANDAMENTO', 'EXECUTANDO', 'EM_EXECUCAO'].includes(valueNormalized)) return 'EM_ANDAMENTO';
  if (['AGUARDANDO', 'AGUARDANDO_PECA', 'AGUARDANDO_MATERIAL'].includes(valueNormalized)) return 'PAUSADA';
  if (['ABERTO', 'PENDENTE', 'NOVA', 'AGUARDANDO_EQUIPE'].includes(valueNormalized)) return 'ABERTA';
  return valueNormalized || 'ABERTA';
}
function isOSAtiva(os) { return !CLOSED.has(semAcentos(typeof os === 'object' ? os?.status : os).replace(/[\s-]+/g, '_')); }
function normalizarPrioridade(value) {
  const p = semAcentos(value);
  if (['EMERGENCIAL', 'URGENTE', 'CRITICA', 'CRITICO'].includes(p)) return 'CRITICA';
  if (p === 'ALTA') return 'ALTA';
  if (['MEDIA', 'MEDIO', 'NORMAL'].includes(p)) return 'MEDIA';
  return 'BAIXA';
}
function warn(context, error) { console.warn(`[TV] ${context}: ${error?.message || error}`); }
function safe(context, fn, fallback = []) { try { return fn(); } catch (error) { warn(context, error); return fallback; } }
function tableExists(name) { return Boolean(safe(`falha ao inspecionar tabela ${name}`, () => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name), null)); }
function columns(name) { return tableExists(name) ? new Set(safe(`falha ao inspecionar colunas de ${name}`, () => db.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name), [])) : new Set(); }
function firstValue(row, names) { for (const name of names) if (row[name] !== undefined && row[name] !== null && String(row[name]).trim()) return row[name]; return null; }
function validDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function imagePath(value) { if (!value) return null; const path = String(value).trim(); return /^https?:\/\//.test(path) || path.startsWith('/') ? path : `/${path.replace(/^public\//, '')}`; }
function tempoDesde(value) { const date = validDate(value); if (!date) return 'tempo não informado'; const min = Math.max(0, Math.floor((Date.now() - date) / 60000)); return min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}min` : ''}` : `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`; }
function sqlTextExpr(alias, cols, candidates, fallback = "''") {
  const available = candidates.filter((name) => cols.has(name)).map((name) => `${alias}.${name}`);
  return available.length ? `COALESCE(${available.join(', ')}, ${fallback})` : fallback;
}
function sqlNumberExpr(alias, cols, candidates, fallback = '0') {
  const available = candidates.filter((name) => cols.has(name)).map((name) => `${alias}.${name}`);
  return available.length ? `COALESCE(${available.join(', ')}, ${fallback})` : fallback;
}

function loadNameMap(table) {
  const cols = columns(table); if (!cols.has('id')) return new Map();
  const name = ['nome', 'name', 'full_name'].find((column) => cols.has(column)); if (!name) return new Map();
  return new Map(safe(`falha ao resolver nomes em ${table}`, () => db.prepare(`SELECT id, ${name} AS nome FROM ${table}`).all(), []).map((row) => [String(row.id), row.nome]));
}
function resolveResponsaveis(row, maps) {
  const names = RESPONSIBLE_COLUMNS.flatMap(([column, table]) => {
    const id = row[column]; const name = id == null ? null : maps[table].get(String(id)); return name ? [String(name).trim()] : [];
  });
  return [...new Map(names.map((name) => [semAcentos(name), name])).values()].join(', ') || 'A definir';
}
function getOS() {
  const osColumns = columns('os');
  if (!osColumns.size) { warn('estrutura indisponível', 'tabela os não existe ou não possui colunas'); return { items: [], deadlineColumn: null }; }
  const rows = safe('falha ao carregar ordens de serviço', () => db.prepare('SELECT * FROM os ORDER BY id DESC LIMIT 500').all(), []);
  const equipmentMap = new Map();
  if (columns('equipamentos').has('id')) safe('falha ao resolver equipamentos', () => db.prepare('SELECT * FROM equipamentos').all(), []).forEach((row) => equipmentMap.set(String(row.id), row));
  const maps = { users: loadNameMap('users'), colaboradores: loadNameMap('colaboradores') };
  const deadlineColumn = DEADLINE_COLUMNS.find((column) => osColumns.has(column)) || null;
  const items = rows.map((row) => {
    const opened = firstValue(row, ['opened_at', 'data_abertura', 'created_at', 'abertura']);
    const equipment = equipmentMap.get(String(row.equipamento_id)) || {};
    const rawEquipment = firstValue(equipment, ['nome', 'name']) || firstValue(row, ['equipamento_manual', 'equipamento', 'nome_equipamento']) || 'Equipamento não informado';
    const local = firstValue(row, ['setor', 'local', 'area', 'localizacao']) || firstValue(equipment, ['setor', 'local', 'area', 'localizacao']) || 'Local não informado';
    return {
      ...row,
      numero: `OS #${row.numero || row.id}`,
      equipamento: String(rawEquipment).toUpperCase(),
      local: String(local),
      setor: String(local),
      descricao: firstValue(row, ['descricao', 'descricao_servico', 'problema', 'observacao']) || '',
      responsavel: resolveResponsaveis(row, maps),
      statusOriginal: row.status,
      status: normalizarStatusOS(row.status),
      prioridade: normalizarPrioridade(firstValue(row, ['grau', 'prioridade'])),
      abertura: opened,
      opened_at: opened,
      prazo: deadlineColumn ? row[deadlineColumn] : null,
      tempo: tempoDesde(opened),
      tipo: semAcentos(firstValue(row, ['tipo', 'tipo_manutencao', 'categoria'])),
    };
  });
  return { items, deadlineColumn };
}

function getPreventivas() {
  const executionCols = columns('preventiva_execucoes'), planCols = columns('preventiva_planos');
  if (!executionCols.size || !planCols.size) return [];
  const plans = new Map(safe('falha ao carregar planos preventivos', () => db.prepare('SELECT * FROM preventiva_planos').all(), []).map((row) => [String(row.id), row]));
  const equipment = new Map(safe('falha ao carregar equipamentos das preventivas', () => tableExists('equipamentos') ? db.prepare('SELECT * FROM equipamentos').all() : [], []).map((row) => [String(row.id), row]));
  return safe('falha ao carregar preventivas', () => db.prepare('SELECT * FROM preventiva_execucoes ORDER BY id DESC LIMIT 100').all(), [])
    .filter(isOSAtiva).map((row) => {
      const plan = plans.get(String(row.plano_id)) || {};
      const eq = equipment.get(String(plan.equipamento_id)) || {};
      return {
        ...row,
        dataPrevista: firstValue(row, ['data_prevista', 'prazo', 'data_prazo']),
        equipamento: row.equipamento || eq.nome || plan.titulo || 'Equipamento não informado',
        tarefa: row.tarefa || row.descricao || plan.titulo || 'Preventiva',
        responsavel: row.responsavel || 'A definir',
        criticidade: semAcentos(row.criticidade || eq.criticidade || 'NAO INFORMADA'),
      };
    });
}
function getEquipe(osAtivas) {
  let escala = null; let ranking = null;
  try { const dashboard = require('../dashboard/dashboard.service'); escala = dashboard.getEscalaPainelSemana?.() || null; ranking = dashboard.getMecanicosRankingSemana?.() || null; } catch (error) { warn('módulo auxiliar de equipe indisponível', error); }
  const pessoas = new Map(); const rankingItems = ranking?.itemsMecanicos || ranking?.items || [];
  const add = (p, turno, situacao = 'disponivel') => {
    const nome = String(p?.nome || '').trim();
    if (!nome) return;
    const key = semAcentos(nome);
    const occupied = osAtivas.some((os) => semAcentos(os.responsavel).includes(key));
    const rank = rankingItems.find((item) => semAcentos(item.nome) === key);
    pessoas.set(key, {
      id: p.user_id || p.id || null,
      nome,
      funcao: p.funcao || 'Mecânico',
      turno,
      situacao: occupied ? 'ocupado' : situacao,
      foto: imagePath(p.photo_path || rank?.photo_path),
      osAtual: occupied ? osAtivas.find((os) => semAcentos(os.responsavel).includes(key))?.numero : null,
    });
  };
  (escala?.diurno_mecanicos || []).forEach((p) => add(p, 'Dia'));
  (escala?.apoio_operacional || []).forEach((p) => add(p, 'Dia'));
  (escala?.noturno || []).forEach((p) => add(p, 'Noite'));
  (escala?.folgas_afastamentos || []).forEach((p) => add(p, 'Fora da escala', 'indisponivel'));
  const equipe = [...pessoas.values()];
  return {
    equipe,
    escalaVigente: escala ? {
      dia: equipe.filter((p) => p.turno === 'Dia' && p.situacao !== 'indisponivel'),
      noite: equipe.filter((p) => p.turno === 'Noite'),
      finalSemana: (escala.final_semana_responsavel || []).map((p) => p.nome),
      afastados: equipe.filter((p) => p.situacao === 'indisponivel'),
      foraEscala: [],
    } : null,
    rankingEquipe: rankingItems.filter((r) => Number(r.os_total || r.score || 0)).map((item, index) => ({
      posicao: index + 1,
      nome: item.nome,
      foto: imagePath(item.photo_path),
      os_finalizadas: Number(item.os_total || 0),
      pontos: Number(item.score || 0),
      criticas: Number(item.os_criticas || 0),
      altas: Number(item.os_altas || 0),
      cargaAtual: osAtivas.filter((os) => semAcentos(os.responsavel).includes(semAcentos(item.nome))).length,
    })),
  };
}
function calculateMTBF(occurrences) {
  const dates = occurrences.map((os) => validDate(os.abertura || os.opened_at)).filter(Boolean).sort((a, b) => a - b); if (dates.length < 2) return null;
  const intervals = dates.slice(1).map((date, index) => date - dates[index]).filter((ms) => ms > 0); if (!intervals.length) return null;
  const hours = intervals.reduce((sum, ms) => sum + ms, 0) / intervals.length / 3600000; return hours >= 48 ? `${(hours / 24).toFixed(1)} dias` : `${hours.toFixed(1)} h`;
}
function getEquipamentos(allOS) {
  const byEquipment = new Map();
  allOS.filter((os) => os.tipo === 'CORRETIVA' || !os.tipo).forEach((os) => { const key = semAcentos(os.equipamento); if (!byEquipment.has(key)) byEquipment.set(key, []); byEquipment.get(key).push(os); });
  const criticality = new Map(); safe('falha ao carregar criticidade dos equipamentos', () => tableExists('equipamentos') ? db.prepare('SELECT * FROM equipamentos').all() : [], []).forEach((eq) => criticality.set(semAcentos(eq.nome || eq.name), eq.criticidade));
  return [...byEquipment.entries()].map(([key, occurrences]) => ({
    nome: occurrences[0].equipamento,
    falhas: occurrences.length,
    reincidencias: Math.max(0, occurrences.length - 1),
    mtbf: calculateMTBF(occurrences),
    criticidade: semAcentos(criticality.get(key) || 'NAO INFORMADA'),
    situacao: occurrences.some(isOSAtiva) ? occurrences.find(isOSAtiva).status : 'DISPONIVEL',
  })).sort((a, b) => b.falhas - a.falhas).slice(0, 5);
}

function getMaterialRows() {
  const solCols = columns('solicitacoes');
  const itemCols = columns('solicitacao_itens');
  if (!solCols.has('id') || !solCols.has('os_id') || !itemCols.has('id') || !itemCols.has('solicitacao_id')) return [];

  const estoqueCols = columns('estoque_itens');
  const movimentoCols = columns('estoque_movimentos');
  const localCols = columns('estoque_locais');
  const hasEstoqueItem = itemCols.has('estoque_item_id') && estoqueCols.has('id');
  const hasLocal = hasEstoqueItem && estoqueCols.has('local_id') && localCols.has('id');
  const hasMovementItem = movimentoCols.has('solicitacao_item_id') && movimentoCols.has('quantidade') && movimentoCols.has('tipo');

  const itemName = sqlTextExpr('si', itemCols, ['item_nome', 'item_descricao', 'descricao'], `'Item #' || si.id`);
  const unidade = sqlTextExpr('si', itemCols, ['unidade'], "'UN'");
  const requested = sqlNumberExpr('si', itemCols, ['qtd_solicitada', 'quantidade']);
  let bought = sqlNumberExpr('si', itemCols, ['qtd_comprada']);
  if (!itemCols.has('qtd_comprada') && itemCols.has('status_compra')) bought = `CASE WHEN UPPER(COALESCE(si.status_compra,''))='COMPRADO' THEN ${requested} ELSE 0 END`;
  const received = sqlNumberExpr('si', itemCols, ['qtd_recebida_total']);
  const statusCompra = itemCols.has('status_compra') ? "COALESCE(si.status_compra,'')" : "''";
  const previsaoItem = itemCols.has('previsao_entrega') ? 'si.previsao_entrega' : 'NULL';
  const previsaoSol = solCols.has('previsao_entrega') ? 's.previsao_entrega' : 'NULL';
  const retirada = hasMovementItem
    ? `(SELECT COALESCE(SUM(CASE WHEN UPPER(COALESCE(em.tipo,'')) LIKE 'SAIDA%' THEN ABS(em.quantidade) ELSE 0 END),0) FROM estoque_movimentos em WHERE em.solicitacao_item_id=si.id)`
    : '0';
  const estoqueJoin = hasEstoqueItem ? 'LEFT JOIN estoque_itens ei ON ei.id=si.estoque_item_id' : 'LEFT JOIN estoque_itens ei ON 1=0';
  const localJoin = hasLocal ? 'LEFT JOIN estoque_locais el ON el.id=ei.local_id' : 'LEFT JOIN estoque_locais el ON 1=0';
  const estoqueNome = hasEstoqueItem && estoqueCols.has('nome') ? 'ei.nome' : 'NULL';
  const estoqueLocal = hasLocal && localCols.has('nome') ? 'el.nome' : 'NULL';
  const updatedOrder = solCols.has('updated_at') ? 'datetime(s.updated_at)' : 's.id';

  return safe('falha ao carregar materiais vinculados às OS', () => db.prepare(`
    SELECT
      s.id AS solicitacao_id,
      ${solCols.has('numero') ? 's.numero' : 'NULL'} AS solicitacao_numero,
      s.os_id,
      ${solCols.has('status') ? 's.status' : "''"} AS solicitacao_status,
      si.id AS solicitacao_item_id,
      ${itemName} AS item_nome,
      ${unidade} AS unidade,
      ${statusCompra} AS status_compra,
      ${bought} AS qtd_comprada,
      ${received} AS qtd_recebida,
      ${retirada} AS qtd_retirada,
      ${estoqueNome} AS estoque_item_nome,
      ${estoqueLocal} AS estoque_local_nome,
      COALESCE(${previsaoItem}, ${previsaoSol}) AS previsao_entrega
    FROM solicitacao_itens si
    JOIN solicitacoes s ON s.id=si.solicitacao_id
    ${estoqueJoin}
    ${localJoin}
    WHERE s.os_id IS NOT NULL
    ORDER BY ${updatedOrder} DESC, si.id DESC
    LIMIT 300
  `).all(), []);
}

function classificarMateriaisOS(rows, osAtivas) {
  const osById = new Map((osAtivas || []).map((os) => [String(os.id), os]));
  const disponiveis = [];
  const emFluxo = [];

  (rows || []).forEach((row) => {
    const os = osById.get(String(row.os_id));
    if (!os) return;
    const comprada = Math.max(0, Number(row.qtd_comprada || 0));
    const recebida = Math.max(0, Number(row.qtd_recebida || 0));
    const retirada = Math.max(0, Number(row.qtd_retirada || 0));
    const disponivel = Math.max(recebida - retirada, 0);
    const pendente = Math.max(comprada - recebida, 0);
    const base = {
      osId: os.id,
      os: os.numero,
      equipamento: os.equipamento,
      setor: os.local || os.setor || 'Local não informado',
      solicitacaoId: row.solicitacao_id,
      solicitacaoNumero: row.solicitacao_numero || `#${row.solicitacao_id}`,
      itemId: row.solicitacao_item_id,
      material: row.estoque_item_nome || row.item_nome || `Item #${row.solicitacao_item_id}`,
      unidade: row.unidade || 'UN',
      localEstoque: row.estoque_local_nome || 'Almoxarifado',
      statusSolicitacao: semAcentos(row.solicitacao_status),
      previsaoEntrega: row.previsao_entrega || null,
      quantidadeComprada: comprada,
      quantidadeRecebida: recebida,
      quantidadeRetirada: retirada,
    };

    if (disponivel > 0) disponiveis.push({ ...base, quantidadeDisponivel: disponivel });
    if (pendente > 0 && (!row.status_compra || semAcentos(row.status_compra) === 'COMPRADO')) {
      emFluxo.push({ ...base, quantidadePendente: pendente });
    }
  });

  const sortByPriority = (a, b) => {
    const oa = osById.get(String(a.osId));
    const ob = osById.get(String(b.osId));
    const weight = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
    return (weight[oa?.prioridade] ?? 4) - (weight[ob?.prioridade] ?? 4) || Number(b.itemId || 0) - Number(a.itemId || 0);
  };
  disponiveis.sort(sortByPriority);
  emFluxo.sort(sortByPriority);

  return {
    disponiveis,
    emFluxo,
    resumo: {
      disponiveisRetirada: disponiveis.length,
      osComMaterialDisponivel: new Set(disponiveis.map((item) => item.osId)).size,
      itensEmFluxo: emFluxo.length,
      osAguardandoMaterial: new Set(emFluxo.map((item) => item.osId)).size,
    },
  };
}

function getProximasDemandas() {
  const dCols = columns('demandas');
  if (!dCols.has('id') || !dCols.has('titulo')) return [];
  const eCols = columns('equipamentos');
  const uCols = columns('users');
  const hasEquip = dCols.has('equipamento_id') && eCols.has('id');
  const hasResp = dCols.has('responsavel_user_id') && uCols.has('id');
  const userName = ['name', 'nome', 'full_name'].find((column) => uCols.has(column));

  const rootFilter = dCols.has('demanda_pai_id') ? 'AND d.demanda_pai_id IS NULL' : '';
  const statusExpr = dCols.has('status') ? "UPPER(COALESCE(d.status,'NOVA'))" : "'NOVA'";
  const prioridadeExpr = dCols.has('prioridade') ? "UPPER(COALESCE(d.prioridade,'NORMAL'))" : "'NORMAL'";
  const equipamentoJoin = hasEquip ? 'LEFT JOIN equipamentos e ON e.id=d.equipamento_id' : 'LEFT JOIN equipamentos e ON 1=0';
  const responsavelJoin = hasResp ? 'LEFT JOIN users u ON u.id=d.responsavel_user_id' : 'LEFT JOIN users u ON 1=0';
  const equipamentoNome = hasEquip && eCols.has('nome') ? 'e.nome' : 'NULL';
  const equipamentoSetor = hasEquip && eCols.has('setor') ? 'e.setor' : 'NULL';
  const responsavelNome = hasResp && userName ? `u.${userName}` : 'NULL';
  const orderUpdated = dCols.has('updated_at') ? 'datetime(d.updated_at) DESC' : 'd.id DESC';

  return safe('falha ao carregar próximas demandas', () => db.prepare(`
    SELECT
      d.id,
      d.titulo,
      ${dCols.has('descricao') ? 'd.descricao' : 'NULL'} AS descricao,
      ${dCols.has('prioridade') ? 'd.prioridade' : "'NORMAL'"} AS prioridade,
      ${dCols.has('status') ? 'd.status' : "'NOVA'"} AS status,
      ${dCols.has('setor_origem') ? 'd.setor_origem' : 'NULL'} AS setor_origem,
      ${dCols.has('prazo_previsto') ? 'd.prazo_previsto' : 'NULL'} AS prazo_previsto,
      ${equipamentoNome} AS equipamento_nome,
      ${equipamentoSetor} AS equipamento_setor,
      ${responsavelNome} AS responsavel_nome
    FROM demandas d
    ${equipamentoJoin}
    ${responsavelJoin}
    WHERE ${statusExpr} NOT IN ('CONCLUIDA','CONCLUÍDA','CANCELADA','CANCELADO')
      ${rootFilter}
    ORDER BY
      CASE ${prioridadeExpr}
        WHEN 'URGENTE' THEN 0 WHEN 'CRITICA' THEN 0 WHEN 'CRÍTICA' THEN 0
        WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 WHEN 'MÉDIA' THEN 2 WHEN 'NORMAL' THEN 2
        WHEN 'BAIXA' THEN 3 ELSE 4 END,
      CASE ${statusExpr}
        WHEN 'PARADA' THEN 0 WHEN 'EM_ANDAMENTO' THEN 1 WHEN 'PLANEJAMENTO' THEN 2
        WHEN 'AGUARDANDO_APROVACAO' THEN 3 WHEN 'EM_ANALISE' THEN 4 ELSE 5 END,
      ${orderUpdated}
    LIMIT 8
  `).all().map((row) => ({
    ...row,
    prioridade: normalizarPrioridade(row.prioridade),
    status: semAcentos(row.status).replace(/[\s-]+/g, '_') || 'NOVA',
    equipamento: row.equipamento_nome || 'Sem equipamento definido',
    setor: row.setor_origem || row.equipamento_setor || 'Setor não informado',
    responsavel: row.responsavel_nome || 'A definir',
    prazo: row.prazo_previsto || null,
  })), []);
}

function buildOperationalSnapshot(os, preventivas, options = {}) {
  const today = (options.now ? new Date(options.now) : new Date()).toISOString().slice(0, 10);
  const weekEnd = new Date(`${today}T12:00:00`); weekEnd.setDate(weekEnd.getDate() + 7);
  const active = os.filter(isOSAtiva);
  const overdue = options.deadlineAvailable ? active.filter((item) => { const deadline = validDate(item.prazo); return deadline && deadline < new Date(`${today}T00:00:00`); }).length : null;
  const overduePreventivas = preventivas.filter((p) => p.dataPrevista && p.dataPrevista < today);
  const total = active.length + preventivas.length;
  return {
    os: {
      abertas: active.filter((o) => o.status === 'ABERTA').length,
      andamento: active.filter((o) => o.status === 'EM_ANDAMENTO').length,
      pausadas: active.filter((o) => o.status === 'PAUSADA').length,
      atrasadas: overdue,
      atrasadasDisponivel: Boolean(options.deadlineAvailable),
      criticas: active.filter((o) => o.prioridade === 'CRITICA').length,
      concluidasHoje: os.filter((o) => !isOSAtiva(o) && String(o.closed_at || o.data_conclusao || '').slice(0, 10) === today).length,
    },
    preventivas: {
      pendentes: preventivas.length,
      vencidas: overduePreventivas.length,
      hoje: preventivas.filter((p) => p.dataPrevista === today).length,
      semana: preventivas.filter((p) => p.dataPrevista >= today && new Date(`${p.dataPrevista}T12:00:00`) <= weekEnd).length,
      corretivas: active.filter((o) => o.tipo === 'CORRETIVA' || !o.tipo).length,
      percentualPreventivas: total ? Math.round(preventivas.length / total * 100) : 0,
      percentualCorretivas: total ? Math.round(active.length / total * 100) : 0,
    },
    aguardandoMaterial: active.filter((item) => item.status === 'PAUSADA' && /MATERIAL|PECA|COMPRA|ROLAMENTO/.test(semAcentos(item.descricao))).map((o) => ({
      os: o.numero, equipamento: o.equipamento, material: o.descricao || null, espera: o.tempo,
    })),
    programacao: preventivas,
  };
}
function getTicker(active) {
  const weight = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
  return active.slice().sort((a, b) => weight[a.prioridade] - weight[b.prioridade] || new Date(a.abertura) - new Date(b.abertura)).map((o) => ({
    id: `os-${o.id}`,
    texto: `${o.numero} • ${o.equipamento} • ${o.responsavel} • ${o.prioridade} • ${o.status} HÁ ${o.tempo}`,
    criticidade: o.prioridade,
  }));
}
async function getWeather() {
  try { return await require('./weather.service').getWeather(); }
  catch (error) { warn('clima indisponível', error); return { available: false, city: 'Feira de Santana - Campo do Gado', week: [] }; }
}
function addDaysIso(dateIso, days) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function normalizeLubricationStatus(value, data, hoje) {
  const raw = semAcentos(value).replace(/[\s-]+/g, '_');
  if (['FECHADA', 'FINALIZADA', 'CONCLUIDA', 'CONCLUÍDA'].includes(raw)) return 'CONCLUIDA';
  if (['ANDAMENTO', 'EM_ANDAMENTO', 'EM_EXECUCAO', 'EXECUTANDO'].includes(raw)) return 'EM_ANDAMENTO';
  if (['ERRO', 'ERRO_ATRIBUICAO'].includes(raw)) return 'ATENCAO';
  if (raw && !['PROCESSANDO', 'GERADA'].includes(raw)) return raw;
  if (data < hoje) return 'ATRASADA';
  if (data === hoje) return 'PENDENTE';
  return 'PROGRAMADA';
}

function getLubrificacaoSemanaTV() {
  const fallback = {
    inicio: null,
    fim: null,
    responsavel_nome: null,
    resumo: { programadas: 0, concluidas: 0, andamento: 0, atrasadas: 0, executadas_semana: 0 },
    dias: [],
  };

  try {
    const relatorio = lubrificacaoSemanaService.getRelatorioSemana();
    const inicio = relatorio?.inicio || relatorio?.resumo?.semana_inicio || null;
    const fim = relatorio?.fim || relatorio?.resumo?.semana_fim || null;
    const hoje = relatorio?.resumo?.semana_inicio
      ? lubrificacaoSemanaService.getWeekBounds().referencia
      : new Date().toISOString().slice(0, 10);
    if (!inicio) return fallback;

    const programadas = new Map(
      (relatorio.osProgramadas || []).map((item) => [
        `${item.data_programada}:${Number(item.equipamento_id || 0)}`,
        item,
      ])
    );

    const dias = [];
    const atividades = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const data = addDaysIso(inicio, offset);
      const grupos = lubrificacaoSemanaService.groupedOSDoDia(data);
      if (!grupos.length) continue;

      const itensDia = grupos.map((grupo) => {
        const programada = programadas.get(`${data}:${Number(grupo.equipamento_id || 0)}`) || null;
        const status = normalizeLubricationStatus(
          programada?.os_status || programada?.status || '',
          data,
          hoje
        );
        const pontos = (grupo.pontos || []).map((ponto) => ponto.ponto_lubrificacao).filter(Boolean);
        const item = {
          data,
          equipamento_id: Number(grupo.equipamento_id || 0),
          equipamento_nome: grupo.equipamento_nome || 'Equipamento não informado',
          setor: grupo.setor || '',
          total_pontos: pontos.length,
          pontos: pontos.slice(0, 4),
          os_id: programada?.os_id ? Number(programada.os_id) : null,
          status,
        };
        atividades.push(item);
        return item;
      });

      const statuses = itensDia.map((item) => item.status);
      const statusDia = statuses.length && statuses.every((value) => value === 'CONCLUIDA')
        ? 'CONCLUIDA'
        : statuses.includes('ATENCAO')
          ? 'ATENCAO'
          : statuses.includes('ATRASADA')
            ? 'ATRASADA'
            : statuses.includes('EM_ANDAMENTO')
              ? 'EM_ANDAMENTO'
              : statuses.includes('PENDENTE')
                ? 'PENDENTE'
                : 'PROGRAMADA';

      dias.push({
        data,
        total_equipamentos: itensDia.length,
        total_pontos: itensDia.reduce((sum, item) => sum + Number(item.total_pontos || 0), 0),
        equipamentos: itensDia.map((item) => item.equipamento_nome),
        atividades: itensDia,
        status: statusDia,
      });
    }

    return {
      inicio,
      fim,
      responsavel_nome: relatorio?.semana?.responsavel_nome || null,
      resumo: {
        programadas: atividades.length,
        concluidas: atividades.filter((item) => item.status === 'CONCLUIDA').length,
        andamento: atividades.filter((item) => item.status === 'EM_ANDAMENTO').length,
        atrasadas: atividades.filter((item) => item.status === 'ATRASADA').length,
        executadas_semana: Number(relatorio?.resumo?.executados_semana || 0),
      },
      dias,
    };
  } catch (error) {
    warn('programação semanal de lubrificação indisponível', error);
    return fallback;
  }
}

function getManagementSnapshot({ force = false } = {}) {
  const now = Date.now();
  if (!force && managementCache.data && (now - managementCache.at) < MANAGEMENT_CACHE_TTL_MS) {
    return managementCache.data;
  }

  const fallback = {
    periodo: { label: 'Últimos 6 meses', data_inicial: null, data_final: null },
    cards: {
      total_os: 0,
      backlog_os_atual: 0,
      backlog_acima_30_dias: 0,
      equipamentos_criticos: 0,
      percentual_corretiva: 0,
      percentual_preventiva: 0,
      cumprimento_programacao: 0,
      qualidade_dados_pct: null,
    },
    confiabilidade: {
      mtbf_horas: null,
      mtbf_dias: null,
      mtbf_amostras: 0,
      mttr_horas: null,
      mttr_amostras: 0,
      disponibilidade_pct: null,
      horas_parada: null,
      equipamentos_base: 0,
      status: 'DADOS_INSUFICIENTES',
      status_label: 'Dados insuficientes',
    },
    falhas_equipamento: [],
    lubrificacao_semana: getLubrificacaoSemanaTV(),
    atualizado_em: new Date().toISOString(),
  };

  try {
    const dashboard = manutencaoExecutivaService.getDashboard({ periodo: 'ultimos_6_meses' }, null);
    const cards = dashboard?.cards || {};
    const confiabilidade = dashboard?.confiabilidade || {};
    const data = {
      periodo: {
        label: 'Últimos 6 meses',
        data_inicial: dashboard?.filtros?.data_inicial || null,
        data_final: dashboard?.filtros?.data_final || null,
      },
      cards: {
        total_os: Number(cards.total_os || 0),
        backlog_os_atual: Number(cards.backlog_os_atual || 0),
        backlog_acima_30_dias: Number(cards.backlog_acima_30_dias || 0),
        equipamentos_criticos: Number(cards.equipamentos_criticos || 0),
        percentual_corretiva: Number(cards.percentual_corretiva || 0),
        percentual_preventiva: Number(cards.percentual_preventiva || 0),
        cumprimento_programacao: Number(cards.cumprimento_programacao || 0),
        qualidade_dados_pct: cards.qualidade_dados_pct == null ? null : Number(cards.qualidade_dados_pct),
      },
      confiabilidade: {
        mtbf_horas: confiabilidade.mtbf_horas == null ? null : Number(confiabilidade.mtbf_horas),
        mtbf_dias: confiabilidade.mtbf_dias == null ? null : Number(confiabilidade.mtbf_dias),
        mtbf_amostras: Number(confiabilidade.mtbf_amostras || 0),
        mttr_horas: confiabilidade.mttr_horas == null ? null : Number(confiabilidade.mttr_horas),
        mttr_amostras: Number(confiabilidade.mttr_amostras || 0),
        disponibilidade_pct: confiabilidade.disponibilidade_pct == null ? null : Number(confiabilidade.disponibilidade_pct),
        horas_parada: confiabilidade.horas_parada == null ? null : Number(confiabilidade.horas_parada),
        equipamentos_base: Number(confiabilidade.equipamentos_base || 0),
        status: confiabilidade.status || 'DADOS_INSUFICIENTES',
        status_label: confiabilidade.status_label || 'Dados insuficientes',
      },
      lubrificacao_semana: getLubrificacaoSemanaTV(),
      falhas_equipamento: (dashboard?.graficos?.falhas_equipamento || []).slice(0, 5).map((item) => ({
        equipamento_id: item.equipamento_id || null,
        nome: item.nome || 'Equipamento não informado',
        falhas: Number(item.falhas || 0),
        reincidencias: Number(item.reincidencias || 0),
        criticidade: item.criticidade || 'NÃO INFORMADA',
      })),
      atualizado_em: new Date().toISOString(),
    };
    managementCache = { at: now, data };
    return data;
  } catch (error) {
    warn('indicadores gerenciais indisponíveis', error);
    if (managementCache.data) return managementCache.data;
    managementCache = { at: now, data: fallback };
    return fallback;
  }
}

async function getSnapshot(user) {
  const result = getOS();
  const os = result.items;
  const active = os.filter(isOSAtiva);
  const preventivas = getPreventivas();
  const team = getEquipe(active);
  const operation = buildOperationalSnapshot(os, preventivas, { deadlineAvailable: Boolean(result.deadlineColumn) });
  const materiais = classificarMateriaisOS(getMaterialRows(), active);
  const proximasDemandas = getProximasDemandas();
  return {
    os: active,
    mecanicos: team.equipe,
    equipeManutencao: team.equipe,
    escalaVigente: team.escalaVigente,
    rankingEquipe: team.rankingEquipe,
    preventivas,
    gerencial: getManagementSnapshot(),
    weather: await getWeather(),
    alertas: active.filter((o) => o.prioridade === 'CRITICA'),
    performance: {
      mecanicosDisponiveis: team.equipe.filter((p) => p.situacao === 'disponivel').length,
      mecanicosOcupados: team.equipe.filter((p) => p.situacao === 'ocupado').length,
      rankingEquipe: team.rankingEquipe,
    },
    operacao: {
      ...operation,
      equipamentos: getEquipamentos(os),
      materiaisDisponiveis: materiais.disponiveis,
      materiaisEmFluxo: materiais.emFluxo,
      materiaisResumo: materiais.resumo,
      proximasDemandas,
    },
    ticker: getTicker(active),
    system: {
      online: true,
      deadlineColumn: result.deadlineColumn,
      user: user ? { id: user.id, nome: user.nome || user.name } : null,
    },
  };
}
module.exports = {
  getSnapshot,
  getWeather,
  normalizarStatusOS,
  normalizarPrioridade,
  isOSAtiva,
  buildOperationalSnapshot,
  calculateMTBF,
  resolveResponsaveis,
  classificarMateriaisOS,
  getProximasDemandas,
  getManagementSnapshot,
  getLubrificacaoSemanaTV,
  MANAGEMENT_CACHE_TTL_MS,
};
