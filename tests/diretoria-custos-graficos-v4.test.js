const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('custos de equipamento usam apenas compras reais vinculadas às Solicitações', () => {
  const source = read('modules/compras/custos-equipamentos.service.js');
  assert.match(source, /solicitacoes s/);
  assert.match(source, /solicitacao_itens si/);
  assert.match(source, /s\.equipamento_id/);
  assert.match(source, /status_compra,''\)\)='COMPRADO'/);
  assert.match(source, /qtd_comprada/);
  assert.match(source, /valor_unitario_centavos/);
  assert.match(source, /qtd_recebida_total/);
  assert.match(source, /comprado_em/);
  assert.match(source, /data_inicial/);
  assert.match(source, /data_final/);
  assert.match(source, /equipamento_id/);
  assert.match(source, /getEquipmentLifetime/);
  assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE/i);
});

test('painel executivo reaproveita filtros e publica custos para cards e gráficos', () => {
  const source = read('modules/diretoria/diretoria.manutencao.service.js');
  assert.match(source, /require\('\.\.\/compras\/custos-equipamentos\.service'\)/);
  assert.match(source, /data_inicial:\s*filtros\.data_inicial/);
  assert.match(source, /data_final:\s*filtros\.data_final/);
  assert.match(source, /equipamento_id:\s*filtros\.equipamento_id/);
  assert.match(source, /setor:\s*filtros\.setor/);
  for (const key of ['custo_comprado_centavos','custo_recebido_centavos','custo_pendente_recebimento_centavos','equipamentos_com_custo','custos_equipamento','custos_mes']) {
    assert.ok(source.includes(key), `indicador de custo ausente: ${key}`);
  }
});

test('interface da Diretoria exibe custos e novos gráficos mantendo filtro por equipamento', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(view, /name="equipamento_id"/);
  assert.match(view, /Comprado no período/);
  assert.match(view, /Já recebido/);
  assert.match(view, /A receber/);
  assert.match(view, /chartCustosEquipamentos/);
  assert.match(view, /chartCustosMes/);
  assert.match(view, /Custo comprado por equipamento/);
  assert.match(view, /Evolução mensal/);
  assert.match(view, /Abrir acompanhamento de compras/);
});

test('gráficos usam apresentação moderna e links para a ficha do equipamento', () => {
  const js = read('public/js/pcm-dashboard.js');
  new Function(js);
  assert.match(js, /borderRadius:9/);
  assert.match(js, /createLinearGradient/);
  assert.match(js, /easeOutQuart/);
  assert.match(js, /cutout:'68%'/);
  assert.match(js, /compactMoney/);
  assert.match(js, /chartCustosEquipamentos/);
  assert.match(js, /chartCustosMes/);
  assert.match(js, /\/equipamentos\/\$\{x\.equipamento_id\}/);
});

test('ficha técnica carrega custo consolidado e permite aprofundar a origem', () => {
  const routes = read('modules/equipamentos/equipamentos.routes.js');
  const view = read('views/equipamentos/show.ejs');
  assert.match(routes, /custos-equipamentos\.service/);
  assert.match(routes, /getEquipmentLifetime\(equipamentoId\)/);
  assert.match(routes, /router\.get\("\/:id", requireLogin, requireRole\(ACCESS\.equipamentos\), loadEquipmentCosts, safe\(ctrl\.equipShow\)\)/);
  assert.match(view, /Custo comprado acumulado/);
  assert.match(view, /\['custos','Custos',custos\.items\.length\]/);
  assert.match(view, /Custos vinculados ao equipamento/);
  assert.match(view, /Comprado acumulado/);
  assert.match(view, /Solicitações com compra/);
  assert.match(view, /\/solicitacoes\/<%= item\.solicitacao_id %>/);
  assert.match(view, /\/os\/<%= item\.os_id %>/);
  assert.match(view, /\/dashboard\/diretoria\/manutencao\?equipamento_id=<%= equip\.id %>/);
});

test('layout de custos permanece responsivo no painel e na ficha', () => {
  const pcmCss = read('public/css/pcm-dashboard.css');
  const equipCss = read('public/css/equipamentos-show.css');
  assert.match(pcmCss, /\.pcm-cost-kpis\{display:grid;grid-template-columns:repeat\(4/);
  assert.match(pcmCss, /@media\(max-width:560px\)[\s\S]*\.pcm-quality-grid,\.pcm-cost-kpis\{grid-template-columns:1fr\}/);
  assert.match(equipCss, /\.equipment-cost-grid\{display:grid;grid-template-columns:repeat\(4/);
  assert.match(equipCss, /@media\(max-width:420px\)[\s\S]*\.equipment-cost-grid/);
});

test('PDF executivo inclui custos reais e deixa claro o critério de cálculo', () => {
  const source = read('modules/diretoria/diretoria.controller.js');
  assert.match(source, /moneyCents/);
  assert.match(source, /COMPRADO NO PERÍODO/);
  assert.match(source, /MATERIAIS RECEBIDOS/);
  assert.match(source, /A RECEBER/);
  assert.match(source, /title: 'Custos por equipamento'/);
  assert.match(source, /title: 'Evolução mensal dos custos'/);
  assert.match(source, /quantidade comprada × valor unitário/);
  assert.match(source, /dashboard\.custos/);
});
