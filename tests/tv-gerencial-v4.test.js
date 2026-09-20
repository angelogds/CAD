const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(file, 'utf8');

test('Modo TV gerencial reaproveita a camada executiva com cache de 60 segundos', () => {
  const service = read('modules/tv/tv.service.js');
  assert.match(service, /diretoria\.manutencao\.service/);
  assert.match(service, /MANAGEMENT_CACHE_TTL_MS = 60000/);
  assert.match(service, /function getManagementSnapshot/);
  assert.match(service, /periodo: 'ultimos_6_meses'/);
  assert.match(service, /managementCache\.data/);
  assert.match(service, /gerencial: getManagementSnapshot\(\)/);
  assert.doesNotMatch(service, /INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE/i);
});

test('snapshot gerencial publica apenas os indicadores necessários para a televisão', () => {
  const service = read('modules/tv/tv.service.js');
  for (const token of [
    'backlog_os_atual',
    'backlog_acima_30_dias',
    'percentual_corretiva',
    'percentual_preventiva',
    'custo_consumido_centavos',
    'qualidade_dados_pct',
    'mtbf_dias',
    'mttr_horas',
    'disponibilidade_pct',
    'horas_parada',
    'custos_equipamento',
    'falhas_equipamento',
  ]) {
    assert.ok(service.includes(token), `indicador ausente no snapshot: ${token}`);
  }
});

test('rotação oficial inclui a sétima tela gerencial sem remover telas existentes', () => {
  const view = read('views/tv/modo-tv.ejs');
  const js = read('public/js/tv-mode.js');

  assert.equal((view.match(/data-tv-screen=/g) || []).length, 7);
  assert.match(view, /data-tv-screen="gerencial"/);
  assert.match(view, /Tela 1 de 7/);
  for (const token of [
    "['os', 'Ordens de Serviço ativas']",
    "['preventivas', 'Preventivas e corretivas']",
    "['escala', 'Escala da semana']",
    "['desempenho', 'Desempenho da equipe']",
    "['criticidade', 'Criticidade dos equipamentos']",
    "['materiais', 'Materiais e próximas demandas']",
    "['gerencial', 'Indicadores gerenciais']",
  ]) assert.ok(js.includes(token), `tela ausente: ${token}`);

  assert.match(js, /renderMateriais, renderGerencial/);
  assert.doesNotThrow(() => new vm.Script(js));
});

test('tela gerencial deixa explícita a governança de confiabilidade e custo real', () => {
  const js = read('public/js/tv-mode.js');
  assert.match(js, /Custo consumido/);
  assert.match(js, /Baixas reais do estoque/);
  assert.match(js, /Confiabilidade da manutenção/);
  assert.match(js, /Os indicadores só aparecem quando a cobertura mínima de dados é atendida/);
  assert.match(js, /Somente paradas rastreadas/);
  assert.match(js, /Maior custo real/);
  assert.match(js, /Maior incidência de falhas/);
});

test('layout gerencial permanece legível e responsivo para TV', () => {
  const css = read('public/css/tv-screens-2026.css');
  assert.match(css, /\.management-layout\{display:grid;grid-template-columns:1\.15fr \.85fr/);
  assert.match(css, /\.management-reliability-grid\{display:grid;grid-template-columns:repeat\(2/);
  assert.match(css, /\.tv-management-row\{/);
  assert.match(css, /@media\(max-width:1180px\)[\s\S]*\.management-layout\{grid-template-columns:1fr\}/);
});

test('assets alterados recebem versão para evitar cache antigo na TV', () => {
  const view = read('views/tv/modo-tv.ejs');
  assert.match(view, /tv-mode\.js\?v=20260920-gerencial-v4/);
  assert.match(view, /tv-screens-2026\.css\?v=20260920-gerencial-v4/);
  assert.match(view, /tv-screens-2026\.js\?v=20260920-gerencial-v4/);
});
