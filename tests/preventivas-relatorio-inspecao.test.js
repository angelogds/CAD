const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');

test('migration adds technical preventive report traceability fields', () => {
  const migration = read('database/migrations/157_preventivas_relatorio_inspecao.js');
  for (const field of ['descricao_preventiva', 'itens_verificados', 'nao_conformidade', 'acao_corretiva', 'acao_preventiva', 'situacao_final', 'evidencias', 'os_corretiva_id', 'registrado_relatorio_em']) {
    assert.match(migration, new RegExp(field));
  }
});

test('inspection report renders preventive section and OS and preventive indicators without filter card', () => {
  const view = read('views/inspecao/index.ejs');
  assert.match(view, /Preventivas Executadas no Período/);
  assert.match(view, /Indicadores de OS e preventivas/);
  assert.match(view, /Ordens de serviço/);
  assert.match(view, /Abertas ou em andamento/);
  assert.match(view, /Sem justificativa/);
  assert.match(view, /Aguardando material/);
  assert.match(view, /Equipamentos impactados/);
  assert.match(view, /Preventivas/);
  assert.doesNotMatch(view, /Filtros do relatório de preventivas/);
  assert.doesNotMatch(view, /Aplicar filtros/);
});

test('inspection report loads OS operational indicators from inspection service', () => {
  const controller = read('modules/inspecao/inspecao.controller.js');
  const service = read('modules/inspecao/inspecao.service.js');
  assert.match(controller, /service\.getIndicadoresOS\(mes, ano, osEmAndamento\)/);
  assert.match(controller, /indicadoresOS,/);
  assert.match(service, /function getIndicadoresOS\(mes, ano, osEmAndamento = null\)/);
  for (const indicador of ['registradas_no_mes', 'concluidas_no_mes', 'com_nao_conformidade_no_mes', 'abertas_ou_em_andamento', 'sem_justificativa', 'aguardando_material', 'equipamentos_impactados']) {
    assert.match(service, new RegExp(indicador));
  }
});

test('preventive completion supports technical fields and corrective OS link', () => {
  const view = read('views/preventivas/show.ejs');
  const service = read('modules/preventivas/preventivas.service.js');
  assert.match(view, /gerar_os_corretiva/);
  assert.match(view, /situacao_final/);
  assert.match(service, /abrirOSCorretivaVinculada/);
  assert.match(service, /preventiva_execucao_id: row\.id/);
});

test('inspection PDF and CSV exporters include preventive execution details', () => {
  const exporter = read('utils/exporters/inspecao.exporter.js');
  assert.match(exporter, /PREVENTIVAS_EXECUTADAS_NO_PERIODO/);
  assert.match(exporter, /drawPreventivasBlock/);
  assert.match(exporter, /Não conformidades:/);
});
