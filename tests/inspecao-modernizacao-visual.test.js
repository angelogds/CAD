const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (path) => fs.readFileSync(path, 'utf8');

test('as duas views de Inspeção compartilham CSS e JavaScript do módulo', () => {
  for (const path of ['views/inspecao/index.ejs', 'views/inspecao/os-em-andamento.ejs']) {
    const view = read(path);
    assert.match(view, /\/css\/inspecao\.css/);
    assert.match(view, /\/js\/inspecao\.js/);
    assert.doesNotMatch(view, /<style[\s>]/i);
  }
});

test('PAC 01 preserva matriz, filtros, exportações e integração operacional', () => {
  const view = read('views/inspecao/index.ejs');
  for (const field of ['data_inicio', 'data_fim', 'equipamento_id', 'setor', 'responsavel', 'status', 'nao_conformidade', 'gerou_os', 'tipo_atividade']) {
    assert.match(view, new RegExp(`name="${field}"`));
  }
  for (const attr of ['data-eq', 'data-item', 'data-day', 'data-key']) assert.match(view, new RegExp(attr));
  assert.match(view, /export\/csv/);
  assert.match(view, /export\/xls/);
  assert.match(view, /os-em-andamento/);
  assert.match(view, /preventivas\//);
});

test('rastreabilidade das OS mantém filtros, chat, material e histórico sem emojis principais', () => {
  const view = read('views/inspecao/os-em-andamento.ejs');
  for (const filter of ['todos','abertas','em_andamento','pausadas','aguardando_material','dias_7','dias_15','dias_30','dias_45']) {
    assert.match(view, new RegExp(`data-filter="${filter}"`));
  }
  assert.match(view, /\/chat-os\//);
  assert.match(view, /material_chegou_em/);
  assert.match(view, /historico_resumido/);
  assert.doesNotMatch(view, /[📋👨📅⚠🔧💬📦📝]/u);
});
