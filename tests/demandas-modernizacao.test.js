const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('painel de demandas possui indicadores, filtros e agrupamento operacional', () => {
  const view = read('views/demandas/index.ejs');
  assert.match(view, /demand-metrics/);
  assert.match(view, /Concluídas e histórico/);
  assert.match(view, /Críticas e altas/);
  assert.match(view, /name="responsavel_user_id"/);
  assert.match(view, /Nenhuma demanda encontrada/);
});

test('controller envia filtros e painel consolidado para a listagem', () => {
  const controller = read('modules/demandas/demandas.controller.js');
  assert.match(controller, /service\.getPainel/);
  assert.match(controller, /responsaveis: service\.listResponsaveis/);
  assert.match(controller, /tab: normalizeChoice/);
});

test('detalhe e cadastro usam o mesmo padrão visual', () => {
  const form = read('views/demandas/new.ejs');
  const detail = read('views/demandas/view.ejs');
  const css = read('public/css/demandas.css');
  assert.match(form, /modern-demand-form/);
  assert.match(detail, /demand-progress/);
  assert.match(detail, /Histórico e rastreabilidade/);
  assert.match(css, /\.demand-btn:hover/);
  assert.match(css, /@media \(max-width:720px\)/);
});
