'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('dashboard de demandas expõe apenas resumo autorizado e limita a cinco itens', () => {
  const routes = read('modules/demandas/demandas.routes.js');

  assert.match(routes, /router\.get\('\/dashboard-resumo\.json',\s*requireLogin,\s*requireRole\(ACCESS\.demandas_view\)/);
  assert.ok(routes.indexOf("/dashboard-resumo.json") < routes.indexOf("router.get('/:id'"), 'rota JSON deve vir antes da rota dinâmica /:id');
  assert.match(routes, /service\.list\(\{\s*tab:\s*'ATIVAS',\s*limit:\s*20\s*\}/);
  assert.match(routes, /solicitacoesAtivas\.length\s*>\s*0/);
  assert.match(routes, /status\s*===\s*'EM_ANDAMENTO'/);
  assert.match(routes, /\.slice\(0,\s*5\)/);
});

test('painel operacional carrega as principais demandas sem expor dados por HTML inseguro', () => {
  const view = read('views/dashboard/index.ejs');
  const script = read('public/js/operational-dashboard.js');

  assert.match(view, /id="demandas"/);
  assert.match(view, /\/js\/operational-dashboard\.js/);
  assert.match(script, /fetch\('\/demandas\/dashboard-resumo\.json'/);
  assert.match(script, /payload\.items\.slice\(0,\s*5\)/);
  assert.match(script, /textContent\s*=/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.match(script, /response\.status\s*===\s*401\s*\|\|\s*response\.status\s*===\s*403/);
});

test('lista de demandas possui padrão visual responsivo próprio', () => {
  const script = read('public/js/operational-dashboard.js');
  const css = read('public/css/dashboard-demandas.css');

  assert.match(script, /dashboard-demandas\.css/);
  assert.match(css, /\.dashboard-demand-row/);
  assert.match(css, /\.dashboard-demand-tag\.priority/);
  assert.match(css, /\.dashboard-demand-tag\.stopped/);
  assert.match(css, /@media\(max-width:560px\)/);
});
