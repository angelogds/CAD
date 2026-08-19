const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('solicitações padrão ocultam estados operacionalmente concluídos e separam críticas', () => {
  const controller = read('modules/solicitacoes/solicitacoes.controller.js');
  const view = read('views/solicitacoes/minhas.ejs');

  for (const status of ['RECEBIDA_TOTAL', 'ENTREGUE_SOLICITANTE', 'FECHADA', 'CANCELADA']) {
    assert.match(controller, new RegExp(status));
  }
  assert.match(controller, /criticalPriorities/);
  assert.match(view, /key:'critical',title:'CRÍTICAS'/);
  assert.match(view, /key:'high',title:'ALTA PRIORIDADE'/);
  assert.match(view, /key:'medium',title:'PRIORIDADE MÉDIA'/);
  assert.match(view, /key:'low',title:'PRIORIDADE BAIXA'/);
  assert.match(view, />Todas ativas</);
});

test('compras usa fila operacional própria, histórico concluído e quatro prioridades', () => {
  const controller = read('modules/compras/compras.controller.js');
  const view = read('views/compras/solicitacoes/index.ejs');

  assert.match(controller, /OPERATIONALLY_CLOSED/);
  assert.match(controller, /RECEBIDA_TOTAL/);
  assert.match(controller, /ENTREGUE_SOLICITANTE/);
  assert.match(controller, /return 'critical'/);
  assert.match(controller, /return 'high'/);
  assert.match(view, /\['critical','Críticas'\]/);
  assert.match(view, /\['high','Alta prioridade'\]/);
  assert.match(view, /\['medium','Prioridade média'\]/);
  assert.match(view, /\['low','Prioridade baixa'\]/);
  assert.match(view, /option value="critical"/);
});

test('fila de compras reforça proteção contra seleção azul sem remover ações', () => {
  const css = read('public/css/compras-active-priority-fix.css');
  const js = read('public/js/compras-dashboard.js');
  const view = read('views/compras/solicitacoes/index.ejs');

  assert.match(css, /user-select:none!important/);
  assert.match(css, /-webkit-tap-highlight-color:transparent!important/);
  assert.match(css, /caret-color:transparent!important/);
  assert.match(js, /pointerdown/);
  assert.match(js, /touchend/);
  assert.match(view, />Abrir</);
  assert.match(view, /Mais ações/);
});
