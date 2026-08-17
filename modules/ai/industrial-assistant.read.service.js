const { canAccessModule, normalizeRole } = require('../../config/rbac');
const demandasService = require('../demandas/demandas.service');
const almoxarifadoService = require('../almoxarifado/almoxarifado.service');

const TOOL_ACCESS = Object.freeze({
  consultar_demandas: 'demandas_view',
  consultar_recebimentos_almoxarifado: 'almoxarifado_read',
});

const RECEBIMENTO_STATUS = new Set([
  'COMPRADA',
  'EM_RECEBIMENTO',
  'RECEBIDA_PARCIAL',
  'RECEBIDA_TOTAL',
  'FECHADA',
]);

function normalizeLimit(value, fallback = 10, max = 20) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.trunc(parsed), max));
}

function normalizeToken(value, maxLength = 80) {
  return String(value || '').trim().slice(0, maxLength);
}

function requireAccess(user, moduleKey) {
  const role = normalizeRole(user?.role || '');
  if (!role || !canAccessModule(role, moduleKey)) {
    const err = new Error('Você não tem permissão para executar esta consulta.');
    err.code = 'AI_RBAC_DENIED';
    err.status = 403;
    throw err;
  }
}

function compactDemanda(row = {}) {
  return {
    id: Number(row.id || 0) || null,
    titulo: row.titulo || null,
    descricao: row.descricao ? String(row.descricao).slice(0, 1200) : null,
    status: row.status || null,
    prioridade: row.prioridade || null,
    responsavel_nome: row.responsavel_nome || null,
    created_by_nome: row.created_by_nome || null,
    ultima_atualizacao: row.ultima_atualizacao ? String(row.ultima_atualizacao).slice(0, 1000) : null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function consultarDemandas(args = {}, user = {}) {
  const limit = normalizeLimit(args.limit, 10, 20);
  const tabRaw = normalizeToken(args.tab, 20).toUpperCase();
  const tab = ['ATIVAS', 'HISTORICO', 'TODAS'].includes(tabRaw) ? tabRaw : 'ATIVAS';
  const filters = {
    status: normalizeToken(args.status, 40).toUpperCase(),
    prioridade: normalizeToken(args.prioridade, 40).toUpperCase(),
    tab,
    q: normalizeToken(args.termo, 160),
    limit: 20,
  };
  return {
    painel: demandasService.getPainel(user),
    items: (demandasService.list(filters, user) || []).slice(0, limit).map(compactDemanda),
    filtros: {
      status: filters.status || null,
      prioridade: filters.prioridade || null,
      tab,
      termo: filters.q || null,
    },
  };
}

function compactRecebimentoItem(item = {}) {
  const comprada = Number(item.qtd_comprada || 0);
  const recebida = Number(item.qtd_recebida_total || 0);
  return {
    id: Number(item.id || 0) || null,
    nome: item.item_nome || item.item_descricao || item.descricao || null,
    unidade: String(item.unidade || 'UN').trim().toUpperCase().slice(0, 20) || 'UN',
    quantidade_comprada: comprada,
    quantidade_recebida: recebida,
    quantidade_pendente: Math.max(comprada - recebida, 0),
    status_item: item.status_item || null,
  };
}

function resumoItens(itens = []) {
  const compactos = itens.map(compactRecebimentoItem);
  const quantidadesPorUnidade = {};
  for (const item of compactos) {
    const unidade = item.unidade || 'UN';
    if (!quantidadesPorUnidade[unidade]) {
      quantidadesPorUnidade[unidade] = { comprada: 0, recebida: 0, pendente: 0 };
    }
    quantidadesPorUnidade[unidade].comprada += item.quantidade_comprada;
    quantidadesPorUnidade[unidade].recebida += item.quantidade_recebida;
    quantidadesPorUnidade[unidade].pendente += item.quantidade_pendente;
  }
  return {
    itens_comprados: compactos.length,
    itens_com_pendencia: compactos.filter((item) => item.quantidade_pendente > 0).length,
    quantidades_por_unidade: quantidadesPorUnidade,
  };
}

function compactRecebimento(row = {}, detalhe = null, incluirItens = false) {
  const itens = Array.isArray(detalhe?.itens) ? detalhe.itens : [];
  return {
    id: Number(row.id || 0) || null,
    numero: row.numero || null,
    titulo: row.titulo || row.motivo || row.descricao || null,
    status: row.status || null,
    prioridade: row.prioridade || null,
    setor_origem: row.setor_origem || null,
    os_id: Number(row.os_id || 0) || null,
    equipamento_id: Number(row.equipamento_id || 0) || null,
    solicitante_nome: row.solicitante_nome || null,
    comprada_em: row.comprada_em || null,
    recebimento_inicio_em: row.recebimento_inicio_em || null,
    recebida_em: row.recebida_em || null,
    created_at: row.created_at || null,
    resumo_itens: resumoItens(itens),
    itens: incluirItens ? itens.slice(0, 15).map(compactRecebimentoItem) : undefined,
  };
}

function matchesTerm(row = {}, termo = '') {
  if (!termo) return true;
  const haystack = [
    row.id,
    row.numero,
    row.titulo,
    row.motivo,
    row.descricao,
    row.setor_origem,
    row.solicitante_nome,
  ].filter((value) => value !== null && value !== undefined).join(' ').toLocaleLowerCase('pt-BR');
  return haystack.includes(termo.toLocaleLowerCase('pt-BR'));
}

function consultarRecebimentos(args = {}) {
  const status = normalizeToken(args.status, 40).toUpperCase();
  if (status && !RECEBIMENTO_STATUS.has(status)) {
    const err = new Error('Status de recebimento inválido.');
    err.code = 'AI_RECEBIMENTO_STATUS_INVALID';
    err.status = 400;
    throw err;
  }
  const termo = normalizeToken(args.termo, 160);
  const limit = normalizeLimit(args.limit, 10, 20);
  const incluirItens = args.incluir_itens === true;
  const rows = (almoxarifadoService.listRecebimentos(status) || [])
    .filter((row) => matchesTerm(row, termo))
    .slice(0, limit);
  const items = rows.map((row) => {
    const detalhe = almoxarifadoService.getSolicitacao(Number(row.id));
    return compactRecebimento(row, detalhe, incluirItens);
  });
  return {
    items,
    total_retornado: items.length,
    status: status || 'TODOS_RECEBIMENTOS',
    termo: termo || null,
    valores_financeiros_expostos: false,
    somente_leitura: true,
  };
}

function getTools() {
  return [
    {
      type: 'function',
      name: 'consultar_demandas',
      description: 'Consulta as demandas reais visíveis ao usuário, com painel, status, prioridade e responsáveis. Somente leitura.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          termo: { type: 'string' },
          status: { type: 'string' },
          prioridade: { type: 'string' },
          tab: { type: 'string', enum: ['ATIVAS', 'HISTORICO', 'TODAS'] },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
    {
      type: 'function',
      name: 'consultar_recebimentos_almoxarifado',
      description: 'Consulta recebimentos do Almoxarifado e quantidades compradas, recebidas e pendentes, sem valores financeiros e sem alterar estoque.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          termo: { type: 'string' },
          status: { type: 'string', enum: ['COMPRADA', 'EM_RECEBIMENTO', 'RECEBIDA_PARCIAL', 'RECEBIDA_TOTAL', 'FECHADA'] },
          incluir_itens: { type: 'boolean' },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
  ];
}

function hasTool(name) {
  return Object.prototype.hasOwnProperty.call(TOOL_ACCESS, String(name || ''));
}

function allowedTools(user = {}) {
  const role = normalizeRole(user?.role || '');
  return getTools().filter((tool) => canAccessModule(role, TOOL_ACCESS[tool.name]));
}

async function executeTool({ name, args = {}, user } = {}) {
  const toolName = String(name || '');
  const moduleKey = TOOL_ACCESS[toolName];
  if (!moduleKey) {
    const err = new Error('Ferramenta de leitura operacional não reconhecida.');
    err.code = 'AI_TOOL_UNKNOWN';
    err.status = 400;
    throw err;
  }
  requireAccess(user, moduleKey);
  if (toolName === 'consultar_demandas') {
    return { ...consultarDemandas(args, user), fonte: 'demandas/demanda_logs' };
  }
  return { ...consultarRecebimentos(args), fonte: 'solicitacoes/solicitacao_itens/almoxarifado' };
}

module.exports = {
  TOOL_ACCESS,
  getTools,
  hasTool,
  allowedTools,
  executeTool,
  consultarDemandas,
  consultarRecebimentos,
};
