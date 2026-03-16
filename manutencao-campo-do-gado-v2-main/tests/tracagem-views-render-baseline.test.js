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
