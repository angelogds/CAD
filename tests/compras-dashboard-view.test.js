const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viewPath = path.join(__dirname, '..', 'views', 'compras', 'solicitacoes', 'index.ejs');

test('painel de compras oferece indicadores, filtros gerenciais e ações somente de leitura', () => {
  const view = fs.readFileSync(viewPath, 'utf8');

  assert.match(view, /compras-summary/);
  assert.match(view, /Vinculadas à OS/);
  assert.match(view, /Urgentes/);
  assert.match(view, /Número, título, setor ou solicitante/);
  assert.match(view, />Abrir</);
  assert.match(view, />Gerar PDF</);
  assert.doesNotMatch(view, />Editar</);
});

test('painel de compras acompanha todos os estados gerenciais da solicitação', () => {
  const service = require('../modules/compras/compras.service');

  assert.deepEqual(service.STATUS_COMPRAS, [
    'ABERTA',
    'EM_COTACAO',
    'COMPRADA',
    'EM_RECEBIMENTO',
    'RECEBIDA_PARCIAL',
    'RECEBIDA_TOTAL',
    'FECHADA',
    'REABERTA',
    'CANCELADA',
  ]);
});
