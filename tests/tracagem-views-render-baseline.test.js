const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const views = [
  'rosca-helicoidal.ejs',
  'furacao-flange.ejs',
  'cilindro.ejs',
  'curva-gomos.ejs',
  'quadrado-redondo.ejs',
  'reducao-concentrica.ejs',
  'semi-cilindro.ejs',
  'boca-lobo-excentrica.ejs',
  'boca-lobo-45.ejs',
  'boca-lobo-90.ejs',
  'mao-francesa.ejs',
];

test('views principais possuem formulário POST e seletor de unidade', () => {
  const root = path.join(__dirname, '..', 'views', 'tracagem');
  for (const file of views) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(content, /method="POST"/);
    assert.match(content, /name="unidade"/);
    assert.match(content, /option value="mm"/);
    assert.match(content, /option value="cm"/);
    assert.match(content, /CALCULAR/);
  }
});

test('curva de gomos e quadrado-redondo possuem campos de divisões', () => {
  const root = path.join(__dirname, '..', 'views', 'tracagem');
  assert.match(fs.readFileSync(path.join(root, 'curva-gomos.ejs'), 'utf8'), /name="N"/);
  assert.match(fs.readFileSync(path.join(root, 'quadrado-redondo.ejs'), 'utf8'), /name="N"/);
});

test('rotor radial possui somente os três dados de entrada de fabricação', () => {
  const file = path.join(__dirname, '..', 'views', 'tracagem', 'exaustor-radial.ejs');
  const content = fs.readFileSync(file, 'utf8');

  ['name="D"', 'name="dInterno"', 'name="N"']
    .forEach((field) => assert.match(content, new RegExp(field)));

  ['name="largura"', 'name="dEixo"', 'name="E"', 'name="pct10"', 'name="pct90"', 'name="pct6"', 'name="aberturaVoluta"', 'name="divisoesVoluta"']
    .forEach((field) => assert.doesNotMatch(content, new RegExp(field)));

  assert.match(content, /MEDIDA PRINCIPAL PARA MARCAÇÃO/);
  assert.match(content, /Distância externa/);
  assert.match(content, /Distância interna/);
  assert.doesNotMatch(content, /Pontos da voluta/);
});

test('rotor radial possui rota nova e mantém compatibilidade com a antiga', () => {
  const file = path.join(__dirname, '..', 'modules', 'tracagem', 'tracagem.routes.js');
  const content = fs.readFileSync(file, 'utf8');
  assert.match(content, /\/rotor-radial/);
  assert.match(content, /\/exaustor-radial/);
});
