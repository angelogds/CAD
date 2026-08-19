const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viewPath = path.join(__dirname, '..', 'views', 'solicitacoes', 'show.ejs');
const cssPath = path.join(__dirname, '..', 'public', 'css', 'solicitacao-detail-modern.css');

test('detalhe da solicitacao mantem somente as acoes essenciais no cabecalho', () => {
  const view = fs.readFileSync(viewPath, 'utf8');

  assert.match(view, />Editar</);
  assert.match(view, />Gerar PDF</);
  assert.match(view, />Voltar</);
  assert.doesNotMatch(view, /Finalizar elaboração/);
  assert.doesNotMatch(view, /Abrir em compras/);
  assert.doesNotMatch(view, /Abrir no almoxarifado/);
});

test('detalhe apresenta regua de progresso e layout responsivo dedicado', () => {
  const view = fs.readFileSync(viewPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(view, /Andamento da solicitação/);
  assert.match(view, /EM COTAÇÃO/);
  assert.match(view, /RECEBIMENTO/);
  assert.match(view, /solicitacao-detail-modern\.css/);
  assert.match(css, /\.sol-progress/);
  assert.match(css, /@media\(max-width:700px\)/);
});
