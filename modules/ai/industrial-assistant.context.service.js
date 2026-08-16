const { canAccessModule, normalizeRole } = require('../../config/rbac');
const { canViewOSDetails } = require('../os/os.permissions');
const osService = require('../os/os.service');
const equipamentosService = require('../equipamentos/equipamentos.service');
const preventivasService = require('../preventivas/preventivas.service');
const solicitacoesService = require('../solicitacoes/solicitacoes.service');
const fornecedoresService = require('../fornecedores/fornecedores.service');

const GENERIC_MODULES = [
  { prefix: '/pcm', module: 'pcm', permission: 'pcm', label: 'PCM' },
  { prefix: '/compras', module: 'compras', permission: 'compras_read', label: 'Compras' },
  { prefix: '/solicitacoes', module: 'solicitacoes', permission: 'solicitacoes_read', label: 'Solicitações' },
  { prefix: '/preventivas', module: 'preventivas', permission: 'preventivas_view', label: 'Preventivas' },
  { prefix: '/equipamentos', module: 'equipamentos', permission: 'equipamentos', label: 'Equipamentos' },
  { prefix: '/os', module: 'os', permission: 'os_view', label: 'Ordens de Serviço' },
  { prefix: '/fornecedores', module: 'fornecedores', permission: 'fornecedores', label: 'Fornecedores' },
  { prefix: '/estoque', module: 'estoque', permission: 'estoque_view', label: 'Estoque' },
  { prefix: '/almoxarifado', module: 'almoxarifado', permission: 'almoxarifado_read', label: 'Almoxarifado' },
  { prefix: '/escala', module: 'escala', permission: 'escala', label: 'Escala' },
  { prefix: '/inspecao', module: 'inspecao', permission: 'inspecao_view', label: 'Inspeção' },
  { prefix: '/inspection', module: 'inspecao', permission: 'inspecao_view', label: 'Inspeção' },
  { prefix: '/demandas', module: 'demandas', permission: 'demandas_view', label: 'Demandas' },
  { prefix: '/motores', module: 'motores', permission: 'motores', label: 'Motores' },
  { prefix: '/tracagem', module: 'tracagem', permission: 'tracagem_view', label: 'Traçagem' },
  { prefix: '/tracagens', module: 'tracagem', permission: 'tracagem_view', label: 'Traçagem' },
  { prefix: '/desenho-tecnico', module: 'desenho_tecnico', permission: 'desenho_tecnico_view', label: 'Desenho Técnico' },
  { prefix: '/academia', module: 'academia', permission: 'academia_view', label: 'Academia' },
];

function normalizeRoute(value) {
  const raw = String(value || '').trim().slice(0, 700);
  if (!raw) return '/';
  try {
    const parsed = new URL(raw, 'http://assistente.local');
    const pathname = String(parsed.pathname || '/').replace(/\/{2,}/g, '/');
    const search = String(parsed.search || '').slice(0, 300);
    return `${pathname}${search}`;
  } catch (_e) {
    return '/';
  }
}

function pathnameFromRoute(route) {
  try { return new URL(route, 'http://assistente.local').pathname || '/'; } catch (_e) { return '/'; }
}

function isAllowed(user, permission) {
  if (!user?.id || !permission) return false;
  return canAccessModule(normalizeRole(user.role || ''), permission);
}

function generalContext(route, user) {
  const pathname = pathnameFromRoute(route);
  const matched = GENERIC_MODULES.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  if (!matched || !isAllowed(user, matched.permission)) {
    return { module: 'geral', entity_type: null, entity_id: null, route, label: 'Contexto geral', details: {} };
  }
  return { module: matched.module, entity_type: null, entity_id: null, route, label: matched.label, details: {} };
}

function osContext(route, user, id) {
  if (!canViewOSDetails(user)) return null;
  const row = osService.getOSById(Number(id));
  if (!row) return null;
  const equipamento = row.equipamento || row.equipamento_nome || null;
  return {
    module: 'os', entity_type: 'os', entity_id: Number(row.id), route,
    label: `OS #${row.id}${equipamento ? ` • ${equipamento}` : ''}`,
    details: {
      status: row.status || null,
      prioridade: row.prioridade || row.grau || null,
      equipamento_id: Number(row.equipamento_id || 0) || null,
      equipamento: equipamento,
      setor: row.setor || row.equipamento_setor || null,
    },
  };
}

function equipamentoContext(route, user, id) {
  if (!isAllowed(user, 'equipamentos')) return null;
  const row = equipamentosService.getById(Number(id));
  if (!row) return null;
  return {
    module: 'equipamentos', entity_type: 'equipamento', entity_id: Number(row.id), route,
    label: row.nome ? `Equipamento • ${row.nome}` : `Equipamento #${row.id}`,
    details: { codigo: row.codigo || null, setor: row.setor || null, tipo: row.tipo || null, criticidade: row.criticidade || null },
  };
}

function preventivaContext(route, user, id) {
  if (!isAllowed(user, 'preventivas_view')) return null;
  const row = preventivasService.getPlanoById(Number(id));
  if (!row) return null;
  const equipamento = row.equipamento_nome || row.equipamento || null;
  return {
    module: 'preventivas', entity_type: 'preventiva_plano', entity_id: Number(row.id), route,
    label: `Preventiva #${row.id}${equipamento ? ` • ${equipamento}` : ''}`,
    details: {
      titulo: row.titulo || null,
      equipamento_id: Number(row.equipamento_id || 0) || null,
      equipamento,
      frequencia_tipo: row.frequencia_tipo || null,
      frequencia_valor: row.frequencia_valor || null,
    },
  };
}

function solicitacaoContext(route, user, id, moduleName = 'solicitacoes') {
  const permission = moduleName === 'compras' ? 'compras_read' : 'solicitacoes_read';
  if (!isAllowed(user, permission)) return null;
  const row = solicitacoesService.getSolicitacaoById(Number(id));
  if (!row) return null;
  if (moduleName !== 'compras' && typeof solicitacoesService.canViewSolicitacao === 'function' && !solicitacoesService.canViewSolicitacao(row, user)) return null;
  return {
    module: moduleName, entity_type: 'solicitacao', entity_id: Number(row.id), route,
    label: `${moduleName === 'compras' ? 'Compra/Solicitação' : 'Solicitação'} ${row.numero || `#${row.id}`}`,
    details: {
      numero: row.numero || null,
      status: row.status || null,
      prioridade: row.prioridade || null,
      os_id: Number(row.os_id || 0) || null,
      equipamento_id: Number(row.equipamento_id || 0) || null,
      equipamento: row.equipamento_nome || null,
      setor_origem: row.setor_origem || null,
      itens_count: Array.isArray(row.itens) ? row.itens.length : null,
    },
  };
}

function fornecedorContext(route, user, id) {
  if (!isAllowed(user, 'fornecedores')) return null;
  const row = fornecedoresService.getById(Number(id));
  if (!row) return null;
  return {
    module: 'fornecedores', entity_type: 'fornecedor', entity_id: Number(row.id), route,
    label: `Fornecedor • ${row.nome_fantasia || row.nome || `#${row.id}`}`,
    details: { cidade: row.cidade || null, uf: row.uf || null, situacao: row.situacao || null, categorias: row.categorias || [] },
  };
}

function resolvePageContext({ route, user } = {}) {
  const normalizedRoute = normalizeRoute(route);
  const pathname = pathnameFromRoute(normalizedRoute);
  let match;

  match = pathname.match(/^\/os\/(\d+)(?:\/|$)/);
  if (match) return osContext(normalizedRoute, user, match[1]) || generalContext(normalizedRoute, user);

  match = pathname.match(/^\/equipamentos\/(\d+)(?:\/|$)/);
  if (match) return equipamentoContext(normalizedRoute, user, match[1]) || generalContext(normalizedRoute, user);

  match = pathname.match(/^\/preventivas\/(\d+)(?:\/|$)/);
  if (match) return preventivaContext(normalizedRoute, user, match[1]) || generalContext(normalizedRoute, user);

  match = pathname.match(/^\/solicitacoes\/(\d+)(?:\/|$)/);
  if (match) return solicitacaoContext(normalizedRoute, user, match[1], 'solicitacoes') || generalContext(normalizedRoute, user);

  match = pathname.match(/^\/compras\/solicitacoes\/(\d+)(?:\/|$)/);
  if (match) return solicitacaoContext(normalizedRoute, user, match[1], 'compras') || generalContext(normalizedRoute, user);

  match = pathname.match(/^\/fornecedores\/(\d+)(?:\/|$)/);
  if (match) return fornecedorContext(normalizedRoute, user, match[1]) || generalContext(normalizedRoute, user);

  return generalContext(normalizedRoute, user);
}

module.exports = { resolvePageContext, normalizeRoute };
