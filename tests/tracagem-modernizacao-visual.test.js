const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const calculators = [
  'rosca-helicoidal', 'furacao-flange', 'cilindro', 'curva-gomos',
  'quadrado-redondo', 'reducao-concentrica', 'semi-cilindro',
  'boca-lobo-excentrica', 'boca-lobo-45', 'boca-lobo-90', 'mao-francesa',
];

test('Traçagem usa design system compartilhado nas 11 calculadoras', () => {
  for (const name of calculators) {
    const view = read(`views/tracagem/${name}.ejs`);
    assert.match(view, /\/css\/tracagem\.css/);
    assert.match(view, /\/js\/tracagem\.js/);
    assert.match(view, /tracagem-calculator-form/);
    assert.doesNotMatch(view, /<style[\s>]/i);
  }
});

test('painel, histórico e detalhe usam interface técnica moderna', () => {
  const index = read('views/tracagem/index.ejs');
  const list = read('views/tracagem/lista.ejs');
  const show = read('views/tracagem/show.ejs');
  assert.match(index, /Central de cálculos e planificação/);
  assert.match(index, /tracagem-tool-grid/);
  assert.match(list, /Histórico de Traçagens/);
  assert.match(show, /Resultados principais/);
  assert.match(show, /Dados técnicos completos/);
  assert.doesNotMatch(show, /<h3>Resultados<\/h3>\s*<pre>/);
});

test('integrações de salvar, PDF, equipamento e OS permanecem na interface', () => {
  const relation = read('views/tracagem/partials/relacionar-equipamento.ejs');
  for (const action of ['/tracagem/pdf-calculo', '/tracagem/salvar', '/tracagem/relacionar-equipamento']) {
    assert.match(relation, new RegExp(action.replaceAll('/', '\\/')));
  }
  assert.match(relation, /name="os_id"/);
  assert.match(relation, /name="equipamento_id"/);
});
