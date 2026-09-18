const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const setores = require('../modules/compras/compras-setores');

test('Manutenção e Produção históricas são classificadas como Reciclagem', () => {
  assert.equal(setores.normalizeSetorCorporativo('Manutenção'), 'RECICLAGEM');
  assert.equal(setores.normalizeSetorCorporativo('MANUTENCAO'), 'RECICLAGEM');
  assert.equal(setores.normalizeSetorCorporativo('Produção'), 'RECICLAGEM');
  assert.equal(setores.normalizeSetorCorporativo('RECICLAGEM'), 'RECICLAGEM');
  assert.equal(setores.setorMatches('Manutenção', 'RECICLAGEM'), true);
  assert.equal(setores.setorMatches('Produção', 'RECICLAGEM'), true);
  assert.equal(setores.setorMatches('LOGÍSTICA', 'RECICLAGEM'), false);

  const aliases = setores.dbAliasesForSetor('RECICLAGEM');
  assert.ok(aliases.includes('Manutenção'));
  assert.ok(aliases.includes('Produção'));
  assert.ok(aliases.includes('RECICLAGEM'));
});

test('fila e indicadores de Compras usam equivalência corporativa de setor', () => {
  const service = read('modules/compras/compras.service.js');
  const dashboard = read('modules/compras/compras.dashboard.service.js');
  const controller = read('modules/compras/compras.controller.js');
  const view = read('views/compras/solicitacoes/index.ejs');

  assert.match(service, /setorMatches\(row\.setor_origem, filters\.setor\)/);
  assert.match(service, /dbAliasesForSetor\(filters\.setor\)/);
  assert.match(dashboard, /dbAliasesForSetor\(filters\.setor\)/);
  assert.match(controller, /setor_origem_exibicao:\s*normalizeSetorCorporativo\(row\.setor_origem\)/);
  assert.match(view, /s\.setor_origem_exibicao\|\|s\.setor_origem/);
});

test('pré-cotações de Demandas aparecem somente na aba Reciclagem', () => {
  const script = read('public/js/compras-demandas-pre-cotacao.js');
  const demandService = read('modules/compras/compras-demandas.service.js');

  assert.match(script, /function isReciclagemSelecionada/);
  assert.match(script, /if \(!isReciclagemSelecionada\(\)\) return/);
  assert.match(demandService, /dbAliasesForSetor\('RECICLAGEM'\)/);
});

test('card de liberação da Diretoria continua disponível no painel de Compras', () => {
  const layout = read('views/layout.ejs');
  const directorScript = read('public/js/compras-itens-liberados-dashboard.js');

  assert.match(layout, /compras-itens-liberados-dashboard\.js/);
  assert.match(directorScript, /Itens aprovados pela Diretoria aguardando compra/);
  assert.doesNotMatch(directorScript, /isReciclagemSelecionada/);
});
