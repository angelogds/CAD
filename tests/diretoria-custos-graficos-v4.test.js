const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('custos de equipamento separam compras de consumo real do estoque', () => {
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
  assert.match(source, /estoque_movimentos m/);
  assert.match(source, /UPPER\(COALESCE\(m\.tipo,''\)\) LIKE 'SAIDA%'/);
  assert.match(source, /consumido_centavos/);
  assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE/i);
});

test('painel executivo reaproveita filtros e publica custos para cards e gráficos', () => {
  const source = read('modules/diretoria/diretoria.manutencao.service.js');
  assert.match(source, /require\('\.\.\/compras\/custos-equipamentos\.service'\)/);
  assert.match(source, /data_inicial:\s*filtros\.data_inicial/);
  assert.match(source, /data_final:\s*filtros\.data_final/);
  assert.match(source, /equipamento_id:\s*filtros\.equipamento_id/);
  assert.match(source, /setor:\s*filtros\.setor/);
  for (const key of ['custo_consumido_centavos','custo_comprado_centavos','custo_recebido_centavos','custo_pendente_recebimento_centavos','equipamentos_com_custo','custos_equipamento','custos_mes']) {
    assert.ok(source.includes(key), `indicador de custo ausente: ${key}`);
  }
});

test('interface da Diretoria exibe custos e novos gráficos mantendo filtro por equipamento', () => {
  const view = read('views/pcm/dashboard-gerencial.ejs');
  assert.match(view, /name="equipamento_id"/);
  assert.match(view, /Consumido no período/);
  assert.match(view, /Comprado/);
  assert.match(view, /Já recebido/);
  assert.match(view, /A receber/);
  assert.match(view, /chartCustosEquipamentos/);
  assert.match(view, /chartCustosMes/);
  assert.match(view, /Custo real consumido por equipamento/);
  assert.match(view, /Evolução mensal/);
  assert.match(view, /Abrir acompanhamento de compras/);
});

test('gráficos usam apresentação moderna e drill-down gerencial por equipamento', () => {
  const js = read('public/js/pcm-dashboard.js');
  new Function(js);
  assert.match(js, /borderRadius:9/);
  assert.match(js, /createLinearGradient/);
  assert.match(js, /easeOutQuart/);
  assert.match(js, /cutout:'68%'/);
  assert.match(js, /compactMoney/);
  assert.match(js, /chartCustosEquipamentos/);
  assert.match(js, /chartCustosMes/);
  assert.match(js, /dashboardHref\(\{equipamento_id:x\.equipamento_id\}\)/);
});

test('ficha técnica carrega custos de compra e custo real consumido sem consulta duplicada', () => {
  const routes = read('modules/equipamentos/equipamentos.routes.js');
  const controller = read('modules/equipamentos/equipamentos.controller.js');
  const view = read('views/equipamentos/show.ejs');
  assert.match(routes, /custos-equipamentos\.service/);
  assert.match(routes, /getEquipmentLifetime\(equipamentoId\)/);
  assert.match(routes, /router\.get\("\/:id", requireLogin, requireRole\(ACCESS\.equipamentos\), loadEquipmentCosts, safe\(ctrl\.equipShow\)\)/);
  assert.match(controller, /res\.locals\.custosEquipamento/);
  assert.doesNotMatch(controller, /getEquipmentDetail\(id/);
  assert.match(view, /Custo real consumido/);
  assert.match(view, /Math\.max\(custos\.consumos\?\.length \|\| 0,custos\.items\.length\)/);
  assert.match(view, /Custos reais do equipamento/);
  assert.match(view, /Consumido na manutenção/);
  assert.match(view, /Comprado acumulado/);
  assert.match(view, /Consumo real por baixa de estoque/);
  assert.match(view, /\/solicitacoes\/<%= item\.solicitacao_id %>/);
  assert.match(view, /\/os\/<%= item\.os_id %>/);
  assert.match(view, /\/dashboard\/diretoria\/manutencao\?equipamento_id=<%= equip\.id %>/);
});

test('layout de custos permanece responsivo no painel e na ficha', () => {
  const pcmCss = read('public/css/pcm-dashboard.css');
  const equipCss = read('public/css/equipamentos-show.css');
  assert.match(pcmCss, /\.pcm-cost-kpis\{display:grid;grid-template-columns:repeat\(5/);
  assert.match(pcmCss, /@media\(max-width:560px\)[\s\S]*\.pcm-quality-grid,\.pcm-cost-kpis,\.pcm-reliability-kpis\{grid-template-columns:1fr\}/);
  assert.match(equipCss, /\.equipment-cost-grid\{display:grid;grid-template-columns:repeat\(5/);
  assert.match(equipCss, /@media\(max-width:420px\)[\s\S]*\.equipment-cost-grid/);
});

test('PDF executivo prioriza consumo real e mantém compras separadas', () => {
  const source = read('modules/diretoria/diretoria.controller.js');
  assert.match(source, /moneyCents/);
  assert.match(source, /CONSUMIDO NO PERÍODO/);
  assert.match(source, /COMPRADO/);
  assert.match(source, /MATERIAIS RECEBIDOS/);
  assert.match(source, /A RECEBER/);
  assert.match(source, /title: 'Custos por equipamento'/);
  assert.match(source, /title: 'Evolução mensal dos custos'/);
  assert.match(source, /Custo real consumido considera apenas baixas físicas do estoque/);
  assert.match(source, /dashboard\.custos/);
});
