const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const viewPath = path.join(root, 'views', 'compras', 'solicitacoes', 'index.ejs');
const controllerPath = path.join(root, 'modules', 'compras', 'compras.controller.js');
const dashboardServicePath = path.join(root, 'modules', 'compras', 'compras.dashboard.service.js');

test('painel inferior de compras usa componentes reais em vez de placeholders textuais', () => {
  const view = fs.readFileSync(viewPath, 'utf8');

  assert.match(view, /compras-dashboard-lower\.css/);
  assert.match(view, /SOLICITAÇÕES POR STATUS/);
  assert.match(view, /CUSTOS DO PERÍODO/);
  assert.match(view, /OS VINCULADAS ÀS COMPRAS/);
  assert.match(view, /RECEBIMENTOS PREVISTOS/);
  assert.match(view, /lower\.status/);
  assert.match(view, /lower\.requestCosts/);
  assert.match(view, /lower\.linkedOs/);
  assert.match(view, /lower\.receipts/);
  assert.doesNotMatch(view, /Consulte prazos reais na fila operacional\./);
  assert.doesNotMatch(view, /solicitações ativas vinculadas\.<\/p>/);
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
