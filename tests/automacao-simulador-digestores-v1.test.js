const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('simulador usa a mesma autorização da IHM e não altera comandos industriais', () => {
  const routes = read('modules/automacao/automacao.routes.js');
  assert.match(routes, /router\.get\('\/digestores\/simulador', requireLogin, requireRole\(ACCESS\.automacao_view\)/);
  const view = read('views/automacao/simulador-digestores.ejs');
  assert.match(view, /for\(let id=1;id<=4;id\+\+\)/);
  assert.match(view, /id="sim-hardware-indicator"/);
  assert.match(view, /Simulador dos Digestores/);
});
test('simulador não inclui chamadas de rede, nem comandos reais', () => {
  const js = read('public/js/automacao-simulador.js');
  assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b\s*\(/);
  assert.match(js, /setInterval\(tick, 1000\)/);
  assert.match(js, /clearInterval\(handle\)/);
  assert.match(js, /const ready = faixa\.ready/);
  assert.match(js, /dataset\.blink = String\(faixa\.blink\)/);
});
test('as três telas operacionais incluem botões Voltar, e digestores abre simulador', () => {
  for (const page of ['digestores','decanters','prensas']) {
    const html = read('views/automacao/' + page + '.ejs');
    assert.match(html, /class="auto-back-link" href="\/automacao"/);
  }
  assert.match(read('views/automacao/digestores.ejs'), /href="\/automacao\/digestores\/simulador"/);
});
