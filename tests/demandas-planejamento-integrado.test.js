const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('migration de demandas é aditiva e preserva dados existentes', () => {
  const migration = read('database/migrations/188_demandas_planejamento_integrado.js');
  assert.match(migration, /demanda_pai_id/);
  assert.match(migration, /equipamento_id/);
  assert.match(migration, /aprovacao_status/);
  assert.match(migration, /addColumnIfMissing\('os', 'demanda_id'/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DELETE\s+FROM\s+demandas/i);
});

test('demanda reutiliza solicitações existentes para planejamento antecipado de materiais', () => {
  const service = read('modules/demandas/demandas.service.js');
  assert.match(service, /solicitacoesService\.createSolicitacao/);
  assert.match(service, /solicitacoesService\.finalizarElaboracao/);
  assert.match(service, /tipo_origem='DEMANDA'/);
  assert.match(service, /status='PLANEJAMENTO'/);
});

test('conversão para OS reaproveita solicitações da demanda sem duplicar material', () => {
  const service = read('modules/demandas/demandas.service.js');
  assert.match(service, /await osService\.createOS/);
  assert.match(service, /UPDATE os SET demanda_id=/);
  assert.match(service, /UPDATE solicitacoes SET os_id=.*WHERE demanda_id=.*AND os_id IS NULL/s);
  assert.match(service, /sem duplicação/i);
});

test('compras permite pré-cotação mas bloqueia compra antes da OS', () => {
  const gate = read('modules/compras/compras-demandas.service.js');
  const controller = read('modules/compras/compras.controller.js');
  assert.match(gate, /s\.demanda_id IS NOT NULL/);
  assert.match(gate, /COALESCE\(s\.os_id, 0\) = 0/);
  assert.match(gate, /assertCompraLiberada/);
  assert.match(controller, /demandasComprasService\.assertCompraLiberada/);
  assert.match(controller, /req\.body\.acao === 'comprar'/);
  assert.match(controller, /atendido_estoque/);
});

test('painel de compras carrega bloco real de pré-cotações de demandas', () => {
  const routes = read('modules/compras/compras.routes.js');
  const layout = read('views/layout.ejs');
  const script = read('public/js/compras-demandas-pre-cotacao.js');
  assert.match(routes, /\/demandas\/pre-cotacoes\.json/);
  assert.match(layout, /compras-demandas-pre-cotacao\.js/);
  assert.match(script, /Pré-cotações de Demandas/);
  assert.match(script, /Compra aguardando OS/);
});

test('detalhe da demanda centraliza subdemandas materiais OS e rastreabilidade', () => {
  const detail = read('views/demandas/view.ejs');
  const form = read('views/demandas/new.ejs');
  assert.match(detail, /Subdemandas \/ serviços do projeto/);
  assert.match(detail, /Materiais e pré-cotações/);
  assert.match(detail, /Ordens de Serviço vinculadas/);
  assert.match(detail, /Histórico e rastreabilidade/);
  assert.match(form, /name="demanda_pai_id"/);
  assert.match(form, /name="categoria"/);
  assert.match(form, /name="equipamento_id"/);
  assert.match(form, /name="nr_referencia"/);
});

test('RBAC separa visualização materiais conversão e aprovação de demandas', () => {
  const rbac = read('config/rbac.js');
  assert.match(rbac, /demandas_materials/);
  assert.match(rbac, /demandas_convert/);
  assert.match(rbac, /demandas_approve/);
  assert.match(rbac, /ROLE\.ENCARREGADO_PRODUCAO/);
  assert.match(rbac, /ROLE\.RH/);
});
