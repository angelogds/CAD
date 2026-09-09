const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const viewPath = path.join(root, 'views', 'compras', 'solicitacoes', 'index.ejs');
const controllerPath = path.join(root, 'modules', 'compras', 'compras.controller.js');
const dashboardServicePath = path.join(root, 'modules', 'compras', 'compras.dashboard.service.js');
const lowerCssPath = path.join(root, 'public', 'css', 'compras-dashboard-lower.css');

test('painel inferior mantém custos e OS como blocos principais e oculta redundâncias visuais', () => {
  const view = fs.readFileSync(viewPath, 'utf8');
  const css = fs.readFileSync(lowerCssPath, 'utf8');

  assert.match(view, /compras-dashboard-lower\.css/);
  assert.match(view, /CUSTOS DO PERÍODO/);
  assert.match(view, /OS VINCULADAS ÀS COMPRAS/);
  assert.match(view, /lower\.requestCosts/);
  assert.match(view, /lower\.linkedOs/);
  assert.match(css, /dashboard-lower-grid:not\(\.bottom-panels\)>\.dashboard-lower-card:first-child\{display:none!important\}/);
  assert.match(css, /bottom-panels>\.dashboard-lower-card:last-child\{display:none!important\}/);
  assert.match(css, /dashboard-lower-grid:not\(\.bottom-panels\)\{grid-template-columns:1fr\}/);
  assert.match(css, /bottom-panels\{grid-template-columns:1fr\}/);
});

test('custos e OS recebem organização visual mais clara sem alterar dados de origem', () => {
  const css = fs.readFileSync(lowerCssPath, 'utf8');

  assert.match(css, /finance-kpis\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /request-cost-row\{grid-template-columns:minmax\(0,1\.5fr\) minmax\(120px,\.5fr\) minmax\(180px,\.8fr\)/);
  assert.match(css, /lower-table\{border:1px solid #e0e8e3/);
  assert.match(css, /lower-table tbody tr:hover\{background:#f8fcf9\}/);
});

test('mobile compacta filtros e cards e mantém Abrir e Mais ações lado a lado', () => {
  const css = fs.readFileSync(lowerCssPath, 'utf8');

  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /dashboard-filters\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /metric-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css, /metric-card small\{display:none\}/);
  assert.match(css, /row-actions\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /row-actions details,\.purchase-dashboard \.row-actions \.ui-btn--table,\.purchase-dashboard \.row-actions summary\{width:100%!important/);
});

test('controller entrega os analytics inferiores sem substituir a fila operacional existente', () => {
  const controller = fs.readFileSync(controllerPath, 'utf8');

  assert.match(controller, /require\('\.\/compras\.dashboard\.service'\)/);
  assert.match(controller, /dashboardService\.getLowerDashboard\(filters\)/);
  assert.match(controller, /lowerDashboard,/);
  assert.match(controller, /const queue = getOperationalQueue\(filters\)/);
});

test('service do painel inferior preserva valores reais e não depende de estimativa financeira por percentual físico', () => {
  const source = fs.readFileSync(dashboardServicePath, 'utf8');

  assert.match(source, /getLowerDashboard/);
  assert.match(source, /valor_recebido_rastreado/);
  assert.match(source, /hasTrackedReceivedValue/);
  assert.match(source, /previsao_entrega_real/);
  assert.match(source, /fornecedor_real/);
  assert.match(source, /qtd_recebida_total/);
  assert.doesNotMatch(source, /custo_total\s*\*\s*recebimento_pct/);
});
