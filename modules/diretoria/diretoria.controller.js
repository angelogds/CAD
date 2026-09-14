const comprasAcompanhamentoService = require('../compras/acompanhamento.service');
const comprasAcompanhamentoController = require('../solicitacoes/solicitacoes.acompanhamento.controller');
const pcmService = require('../pcm/pcm.service');

const DIRETORIA_BASE_PATH = '/dashboard/diretoria';

function safeComprasSummary() {
  try {
    const painel = comprasAcompanhamentoController.enrichDashboardWithApprovals(
      comprasAcompanhamentoService.getDashboard({ visao: 'andamento', periodo: '30' }),
      {}
    );
    return {
      aguardandoAprovacao: Number(painel?.aprovacaoItens?.itensPendentes || 0),
      valorAguardandoAprovacao: Number(painel?.executivo?.valorAguardandoAprovacao || 0),
      atrasadas: Number(painel?.executivo?.atrasadas || 0),
      aguardandoRecebimento: Number(painel?.executivo?.aguardandoRecebimento || 0),
    };
  } catch (error) {
    console.error('[diretoria] Falha ao montar resumo de compras:', error?.message || error);
    return { aguardandoAprovacao: 0, valorAguardandoAprovacao: 0, atrasadas: 0, aguardandoRecebimento: 0 };
  }
}

function safeMaintenanceSummary(userId) {
  try {
    const painel = pcmService.getDashboardGerencial({ periodo: 'mes_atual' }, userId || null);
    return {
      totalOs: Number(painel?.cards?.total_os || 0),
      backlog: Number(painel?.cards?.backlog_manutencao || 0),
      atrasadas: Number(painel?.cards?.os_atrasadas || 0),
      equipamentosCriticos: Number(painel?.cards?.equipamentos_criticos || 0),
    };
  } catch (error) {
    console.error('[diretoria] Falha ao montar resumo da manutenção:', error?.message || error);
    return { totalOs: 0, backlog: 0, atrasadas: 0, equipamentosCriticos: 0 };
  }
}

function index(req, res) {
  res.locals.activeMenu = 'diretoria';
  return res.render('diretoria/index', {
    title: 'Painel da Diretoria',
    activeMenu: 'diretoria',
    compras: safeComprasSummary(),
    manutencao: safeMaintenanceSummary(req.session?.user?.id),
  });
}

function manutencao(req, res) {
  let dashboard;
  try {
    dashboard = pcmService.getDashboardGerencial(req.query, req.session?.user?.id || null);
  } catch (error) {
    console.error('[diretoria] Falha ao abrir desempenho da manutenção:', error);
    dashboard = {
      filtros: {},
      cards: {},
      graficos: {},
      tabelas: { ordens: [] },
      equipamentos_atencao: [],
      erros: ['Não foi possível carregar todos os indicadores da manutenção.'],
    };
  }

  return res.render('pcm/dashboard-gerencial', {
    title: 'Desempenho da Manutenção',
    activeMenu: 'diretoria',
    activePcmSection: '',
    opcoes: pcmService.listFiltros(),
    canManagePcm: false,
    dashboard,
    dashboardBasePath: `${DIRETORIA_BASE_PATH}/manutencao`,
    dashboardTitle: 'Desempenho da Manutenção',
    dashboardSubtitle: 'Indicadores executivos de manutenção para acompanhamento da Diretoria.',
    dashboardEyebrow: 'Painel da Diretoria · Manutenção',
    showPcmNav: false,
  });
}

module.exports = { index, manutencao, DIRETORIA_BASE_PATH };
