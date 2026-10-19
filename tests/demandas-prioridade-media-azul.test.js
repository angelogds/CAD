const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('demandas médias usam azul no cabeçalho, etiqueta e borda lateral', () => {
  const css = read('public/css/demandas.css');
  assert.match(css, /\.priority-normal,\.priority-media\{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8\}/);
  assert.match(css, /\.priority-media \.priority-heading\{border-left-color:#2563eb;background:#eff6ff\}/);
  assert.match(css, /\.demand-row-v2\.demand-priority-normal:before,\.demand-row-v2\.demand-priority-media:before\{background:#2563eb\}/);
  assert.match(css, /\.metric-orange\.metric-priority-normal,\.metric-orange\.metric-priority-media\{--metric:#2563eb\}/);
  assert.match(css, /\.priority-alta\{border-color:#f7c891/);
  assert.match(css, /\.priority-urgente\{border-color:#f4b7ba/);
  assert.match(css, /\.priority-baixa\{border-color:#aee0bf/);
});

test('resumo da demanda respeita a cor da prioridade média', () => {
  const view = read('views/demandas/view.ejs');
  assert.match(view, /metric-orange metric-priority-<%= slug\(demanda\.prioridade \|\| 'NORMAL'\) %>/);
  assert.match(view, /<%= priorityLabel\(demanda\.prioridade\) %>/);
});
