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

test('conversão para nova OS exige aprovação prévia da Diretoria ou Gestão', () => {
  const controller = read('modules/demandas/demandas.controller.js');
  assert.match(controller, /assertDemandApprovedForNewOS/);
  assert.match(controller, /approval !== 'APROVADA'/);
  assert.match(controller, /DEMANDA_AGUARDANDO_APROVACAO/);
  assert.match(controller, /aprovada pela Diretoria\/Gestão antes de gerar uma Ordem de Serviço/);
  assert.match(controller, /pré-cotação pode continuar normalmente enquanto aguarda aprovação/);
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

test('detalhe da demanda organiza resumo planejamento materiais subdemandas OS e histórico em abas', () => {
  const detail = read('views/demandas/view.ejs');
  for (const tab of ['resumo', 'planejamento', 'materiais', 'subdemandas', 'os', 'historico']) {
    assert.match(detail, new RegExp(`data-tab="${tab}"`));
    assert.match(detail, new RegExp(`data-panel="${tab}"`));
  }
  assert.match(detail, /Materiais e pré-cotações/);
  assert.match(detail, /Ordens de Serviço vinculadas/);
  assert.match(detail, /Histórico e rastreabilidade/);
  assert.match(detail, /demand-data-table/);
  assert.match(detail, /Aguardando aprovação/);
});

test('cadastro de demanda permanece leve e deixa planejamento avançado opcional', () => {
  const form = read('views/demandas/new.ejs');
  assert.match(form, /Cadastro rápido/);
  assert.match(form, /Cadastro essencial/);
  assert.match(form, /name="titulo"/);
  assert.match(form, /name="prioridade"/);
  assert.match(form, /name="descricao"/);
  assert.match(form, /demand-advanced-fields/);
  assert.match(form, /Adicionar informações de planejamento/);
  assert.match(form, /name="demanda_pai_id"/);
  assert.match(form, /name="equipamento_id"/);
  assert.match(form, /name="nr_referencia"/);
});

test('lista de demandas mostra situação e resumo de planejamento sem sobrecarregar a tabela', () => {
  const index = read('views/demandas/index.ejs');
  assert.match(index, /Planejamento/);
  assert.match(index, /demand-plan-summary/);
  assert.match(index, /subdemandas_count/);
  assert.match(index, /solicitacoes_count/);
  assert.match(index, /os_count/);
  assert.match(index, /demand-row-v2/);
});

test('CSS de demandas contempla abas tabelas responsivas e formulário leve', () => {
  const css = read('public/css/demandas-planejamento.css');
  assert.match(css, /demand-workspace-tabs/);
  assert.match(css, /demand-data-table/);
  assert.match(css, /demand-advanced-fields/);
  assert.match(css, /demand-row-v2/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test('RBAC separa visualização materiais conversão e aprovação de demandas', () => {
  const rbac = read('config/rbac.js');
  assert.match(rbac, /demandas_materials/);
  assert.match(rbac, /demandas_convert/);
  assert.match(rbac, /demandas_approve/);
  assert.match(rbac, /ROLE\.ENCARREGADO_PRODUCAO/);
  assert.match(rbac, /ROLE\.RH/);
});

test('todos os perfis com demandas_view compartilham a mesma lista global de demandas', () => {
  const service = read('modules/demandas/demandas.service.js');
  const rbac = read('config/rbac.js');

  assert.match(service, /canAccessModule\(role, 'demandas_view'\)/);
  assert.match(service, /return \{ sql: '1=1', params: \{\} \}/);
  assert.doesNotMatch(service, /VISIBILIDADE_AMPLA/);
  assert.doesNotMatch(service, /created_by = @uid/);
  assert.match(service, /O RH pode registrar demandas somente de NR, Segurança ou Auditoria/);

  for (const role of [
    'ROLE.ADMIN',
    'ROLE.DIRETORIA',
    'ROLE.GESTAO',
    'ROLE.RH',
    'ROLE.ENCARREGADO_PRODUCAO',
    'ROLE.MANUTENCAO_SUPERVISOR',
    'ROLE.ENCARREGADO_MANUTENCAO',
    'ROLE.COMPRAS',
  ]) {
    assert.match(rbac, new RegExp(role.replace('.', '\\.')));
  }
});