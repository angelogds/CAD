const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function accessBody(source, key) {
  return source.match(new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`, 's'))?.[1] || '';
}

test('RBAC cria Painel da Diretoria sem devolver acesso ao PCM operacional', () => {
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

test('Painel da Diretoria é montado dentro do dashboard e protegido por perfil', () => {
  const dashboardRoutes = read('modules/dashboard/dashboard.routes.js');
  const routes = read('modules/diretoria/diretoria.routes.js');

  assert.match(dashboardRoutes, /router\.use\('\/diretoria', require\('\.\.\/diretoria\/diretoria\.routes'\)\)/);
  assert.match(routes, /ACCESS\.diretoria_dashboard/);
  assert.match(routes, /ACCESS\.diretoria_compras/);
  assert.match(routes, /ACCESS\.diretoria_manutencao/);
  assert.match(routes, /router\.get\('\/', requireLogin, requireRole\(DIRETORIA_ACCESS\)/);
  assert.match(routes, /router\.get\('\/compras'/);
  assert.match(routes, /router\.get\('\/manutencao'/);
});

test('home executiva oferece os três painéis solicitados', () => {
  const view = read('views/diretoria/index.ejs');
  assert.match(view, /Painel da Diretoria/);
  assert.match(view, /Painel Gerencial Geral/);
  assert.match(view, /Acompanhamento de Compras/);
  assert.match(view, /Desempenho da Manutenção/);
  assert.match(view, /href="\/dashboard"/);
  assert.match(view, /diretoriaBase%>\/compras/);
  assert.match(view, /diretoriaBase%>\/manutencao/);
});

test('Solicitações fica focado no solicitante e não exibe mais o acompanhamento executivo', () => {
  const view = read('views/solicitacoes/minhas.ejs');
  assert.match(view, /Solicitações de Material/);
  assert.match(view, /\+ Nova Solicitação/);
  assert.doesNotMatch(view, /Acompanhar compras/);
  assert.doesNotMatch(view, /acompanhamento-compras/);
});

test('Acompanhamento de Compras reutiliza os serviços existentes e aprovação por item', () => {
  const controller = read('modules/diretoria/diretoria.controller.js');
  const routes = read('modules/diretoria/diretoria.routes.js');
  const tracking = read('modules/solicitacoes/solicitacoes.acompanhamento.controller.js');

  assert.match(controller, /require\('\.\.\/compras\/acompanhamento\.service'\)/);
  assert.match(controller, /enrichDashboardWithApprovals/);
  assert.match(routes, /comprasCtrl\.lista/);
  assert.match(routes, /comprasCtrl\.detalhe/);
  assert.match(routes, /comprasCtrl\.aprovarItensCotados/);
  assert.match(tracking, /itemApprovalService\.approveQuotedItems/);
  assert.doesNotMatch(controller, /INSERT\s|UPDATE\s|DELETE\s|CREATE TABLE/i);
});

test('Desempenho da Manutenção reutiliza o dashboard gerencial do PCM em modo somente leitura', () => {
  const controller = read('modules/diretoria/diretoria.controller.js');
  const view = read('views/pcm/dashboard-gerencial.ejs');
  const script = read('public/js/pcm-dashboard.js');

  assert.match(controller, /pcmService\.getDashboardGerencial/);
  assert.match(controller, /pcmService\.listFiltros\(\)/);
  assert.match(controller, /canManagePcm:\s*false/);
  assert.match(controller, /showPcmNav:\s*false/);
  assert.match(controller, /dashboardBasePath:\s*`\$\{DIRETORIA_BASE_PATH\}\/manutencao`/);
  assert.match(view, /PCM_DASHBOARD_ENDPOINTS/);
  assert.match(script, /window\.PCM_DASHBOARD_ENDPOINTS/);
});

test('URLs antigas continuam funcionando por redirecionamento para o Painel da Diretoria', () => {
  const solicitacoesRoutes = read('modules/solicitacoes/solicitacoes.routes.js');
  const pcmRoutes = read('modules/pcm/pcm.routes.js');

  assert.match(solicitacoesRoutes, /DIRETORIA_COMPRAS_PATH = "\/dashboard\/diretoria\/compras"/);
  assert.match(solicitacoesRoutes, /res\.redirect\(\["GET", "HEAD"\]\.includes\(req\.method\) \? 301 : 307/);
  assert.match(solicitacoesRoutes, /redirectAprovacaoCompras/);
  assert.match(pcmRoutes, /DIRETORIA_MANUTENCAO_PATH = "\/dashboard\/diretoria\/manutencao"/);
  assert.match(pcmRoutes, /\/dashboard-gerencial/);
  assert.match(pcmRoutes, /redirectWithQuery\(DIRETORIA_MANUTENCAO_PATH\)/);
});

test('menus separam visão executiva da operação do PCM e desenho técnico', () => {
  const sidebar = read('views/partials/sidebar.ejs');
  const pcmNav = read('views/pcm/partials/internal-nav.ejs');

  assert.match(sidebar, /canDiretoria = can\('diretoria_dashboard'\)/);
  assert.match(sidebar, /navItem\('\/dashboard\/diretoria', 'Painel da Diretoria'/);
  assert.doesNotMatch(pcmNav, /Painel da Diretoria/);
});

test('novo painel executivo possui layout responsivo próprio', () => {
  const css = read('public/css/diretoria.css');
  assert.match(css, /\.director-panels/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
});
