const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function accessBody(source, key) {
  return source.match(new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`, 's'))?.[1] || '';
}

test('RBAC mantém módulos executivos da Diretoria sem devolver acesso ao PCM operacional', () => {
  const rbac = read('config/rbac.js');

  assert.match(accessBody(rbac, 'diretoria_dashboard'), /ROLE\.DIRETORIA/);
  assert.match(accessBody(rbac, 'diretoria_compras'), /ROLE\.DIRETORIA/);
  assert.match(accessBody(rbac, 'diretoria_manutencao'), /ROLE\.DIRETORIA/);
  assert.doesNotMatch(accessBody(rbac, 'pcm'), /ROLE\.DIRETORIA/);
  assert.doesNotMatch(accessBody(rbac, 'pcm_manage'), /ROLE\.DIRETORIA/);
  assert.doesNotMatch(accessBody(rbac, 'desenho_tecnico_view'), /ROLE\.DIRETORIA/);
});

test('Diretoria continua podendo consultar e criar Solicitações', () => {
  const rbac = read('config/rbac.js');
  assert.match(accessBody(rbac, 'solicitacoes_read'), /ROLE\.DIRETORIA/);
  assert.match(accessBody(rbac, 'solicitacoes_create'), /ROLE\.DIRETORIA/);
});

test('rotas executivas permanecem protegidas e montadas no dashboard', () => {
  const dashboardRoutes = read('modules/dashboard/dashboard.routes.js');
  const routes = read('modules/diretoria/diretoria.routes.js');

  assert.match(dashboardRoutes, /router\.use\('\/diretoria', require\('\.\.\/diretoria\/diretoria\.routes'\)\)/);
  assert.match(routes, /ACCESS\.diretoria_dashboard/);
  assert.match(routes, /ACCESS\.diretoria_compras/);
  assert.match(routes, /ACCESS\.diretoria_manutencao/);
  assert.match(routes, /router\.get\('\/compras'/);
  assert.match(routes, /router\.get\('\/manutencao'/);
});

test('entrada antiga do Painel da Diretoria não renderiza mais hub e redireciona ao Painel Principal', () => {
  const controller = read('modules/diretoria/diretoria.controller.js');
  assert.match(controller, /function index\(_req, res\) \{\s*return res\.redirect\(301, '\/dashboard'\);\s*\}/s);
  assert.doesNotMatch(controller, /res\.render\('diretoria\/index'/);
});

test('menu coloca Desempenho da Manutenção e Acompanhamento de Compras logo após Painel Principal', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  assert.match(sidebar, /canDiretoriaManutencao = can\('diretoria_manutencao'\)/);
  assert.match(sidebar, /canDiretoriaCompras = can\('diretoria_compras'\)/);
  const painel = sidebar.indexOf("navItem('/dashboard', 'Painel Principal'");
  const manutencao = sidebar.indexOf("navItem('/dashboard/diretoria/manutencao', 'Desempenho da Manutenção'");
  const compras = sidebar.indexOf("navItem('/dashboard/diretoria/compras', 'Acompanhamento de Compras'");
  const equipamentos = sidebar.indexOf("navItem('/equipamentos', 'Equipamentos'");
  assert.ok(painel >= 0 && manutencao > painel && compras > manutencao && equipamentos > compras);
  assert.doesNotMatch(sidebar, /navItem\('\/dashboard\/diretoria', 'Painel da Diretoria'/);
});

test('Solicitações fica focado no solicitante e não exibe acompanhamento executivo', () => {
  const view = read('views/solicitacoes/minhas.ejs');
  assert.match(view, /Acompanhamento das Solicitações/);
  assert.match(view, /\+ Nova Solicitação/);
  assert.doesNotMatch(view, /Acompanhar compras/);
  assert.doesNotMatch(view, /acompanhamento-compras/);
});

test('Acompanhamento de Compras reutiliza controller e aprovação por item existentes', () => {
  const routes = read('modules/diretoria/diretoria.routes.js');
  const tracking = read('modules/solicitacoes/solicitacoes.acompanhamento.controller.js');

  assert.match(routes, /comprasCtrl\.lista/);
  assert.match(routes, /comprasCtrl\.detalhe/);
  assert.match(routes, /comprasCtrl\.aprovarItensCotados/);
  assert.match(routes, /executivePurchasesActiveMenu = 'diretoria-compras'/);
  assert.match(tracking, /itemApprovalService\.approveQuotedItems/);
});

test('Desempenho da Manutenção reutiliza o dashboard gerencial do PCM em modo somente leitura', () => {
  const controller = read('modules/diretoria/diretoria.controller.js');
  const executiveService = read('modules/diretoria/diretoria.manutencao.service.js');
  const view = read('views/pcm/dashboard-gerencial.ejs');
  const script = read('public/js/pcm-dashboard.js');

  assert.match(controller, /manutencaoExecutivaService\.getDashboard/);
  assert.match(executiveService, /pcmService\.getDashboardGerencial\(query, userId\)/);
  assert.match(controller, /pcmService\.listFiltros\(\)/);
  assert.match(controller, /canManagePcm:\s*false/);
  assert.match(controller, /showPcmNav:\s*false/);
  assert.match(controller, /activeMenu:\s*'diretoria-manutencao'/);
  assert.match(controller, /dashboardBasePath:\s*`\$\{DIRETORIA_BASE_PATH\}\/manutencao`/);
  assert.match(view, /PCM_DASHBOARD_ENDPOINTS/);
  assert.match(script, /window\.PCM_DASHBOARD_ENDPOINTS/);
});

test('URLs antigas continuam funcionando por redirecionamento para os módulos executivos', () => {
  const solicitacoesRoutes = read('modules/solicitacoes/solicitacoes.routes.js');
  const pcmRoutes = read('modules/pcm/pcm.routes.js');

  assert.match(solicitacoesRoutes, /DIRETORIA_COMPRAS_PATH = "\/dashboard\/diretoria\/compras"/);
  assert.match(solicitacoesRoutes, /res\.redirect\(\["GET", "HEAD"\]\.includes\(req\.method\) \? 301 : 307/);
  assert.match(solicitacoesRoutes, /redirectAprovacaoCompras/);
  assert.match(pcmRoutes, /DIRETORIA_MANUTENCAO_PATH = "\/dashboard\/diretoria\/manutencao"/);
  assert.match(pcmRoutes, /\/dashboard-gerencial/);
  assert.match(pcmRoutes, /redirectWithQuery\(DIRETORIA_MANUTENCAO_PATH\)/);
});

test('menus continuam separando visão executiva do PCM operacional e desenho técnico', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const pcmNav = read('views/pcm/partials/internal-nav.ejs');

  assert.match(sidebar, /activeMenu === 'diretoria-manutencao'/);
  assert.match(sidebar, /activeMenu === 'diretoria-compras'/);
  assert.doesNotMatch(pcmNav, /Painel da Diretoria/);
});
