const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('inspecao view has standardized top action buttons', () => {
  const view = fs.readFileSync('views/inspecao/index.ejs', 'utf8');
  assert.ok(view.includes('/css/inspecao.css'));
  assert.ok(view.includes('class="top-actions"'));
  assert.ok(view.includes('← Voltar'));
  assert.ok(view.includes('Atualizar Sistema'));
  assert.ok(view.includes('Exportar PDF'));
  assert.ok(view.includes('Exportar CSV'));
});

test('inspecao stylesheet defines uniform action button layout', () => {
  const css = fs.readFileSync('public/css/inspecao.css', 'utf8');
  assert.ok(css.includes('.top-actions'));
  assert.ok(css.includes('grid-template-columns:repeat(4'));
  assert.ok(css.includes('.action-btn'));
  assert.ok(css.includes('height:40px'));
});


test('inspecao NC section renders OS actions as read-only fields', () => {
  const view = fs.readFileSync('views/inspecao/index.ejs', 'utf8');
  assert.ok(view.includes('<th>Ação preventiva</th><th>Ação corretiva</th>'));
  assert.ok(!view.includes('class="nc-edit-form"'));
  assert.ok(!view.includes('name="acao_corretiva"'));
  assert.ok(!view.includes('name="acao_preventiva"'));
  assert.ok(!view.includes('name="data_correcao"'));
  assert.ok(!view.includes('/nc/salvar'));
  assert.ok(view.includes('<td><%= nc.acao_preventiva || \'-\' %></td>'));
  assert.ok(view.includes('<td><%= nc.acao_corretiva || \'-\' %></td>'));
});
