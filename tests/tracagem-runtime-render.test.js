const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const calculators = [
  'rosca-helicoidal',
  'furacao-flange',
  'cilindro',
  'curva-gomos',
  'quadrado-redondo',
  'reducao-concentrica',
  'semi-cilindro',
  'boca-lobo-excentrica',
  'boca-lobo-45',
  'boca-lobo-90',
  'mao-francesa',
];

function renderView(name, locals = {}) {
  return ejs.renderFile(path.join(process.cwd(), 'views', 'tracagem', `${name}.ejs`), {
    layout: () => '',
    title: 'Traçagem',
    tipo: name,
    calculo: null,
    equipamentos: [],
    ordensServico: [],
    labels: {},
    ...locals,
  });
}

test('cabeçalho compartilhado renderiza sem subtítulo explícito', async () => {
  const html = await ejs.renderFile(
    path.join(process.cwd(), 'views', 'tracagem', 'partials', 'calculadora-header.ejs'),
    { titulo: 'Rosca helicoidal', tipo: 'rosca-helicoidal', calculo: null }
  );

  assert.match(html, /Rosca helicoidal/);
  assert.match(html, /Planificação e medidas para fabricação industrial/);
});

test('as 11 calculadoras renderizam em runtime com o payload real do GET', async () => {
  for (const calculator of calculators) {
    await assert.doesNotReject(
      () => renderView(calculator),
      `A calculadora ${calculator} não deve lançar ReferenceError/erro EJS ao abrir.`
    );
  }
});
