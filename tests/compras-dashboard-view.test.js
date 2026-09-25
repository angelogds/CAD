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

test('painel força a atualização coordenada dos recursos que impedem seleção azul na fila', () => {
  const view = fs.readFileSync(viewPath, 'utf8');
  const version = view.match(/compras-dashboard\.css\?v=([^"\s]+)/)?.[1];
  assert.ok(version, 'a folha principal deve ter uma versão de cache');

  assert.match(view, new RegExp(`compras-dashboard\\.css\\?v=${version}`));
  assert.match(view, new RegExp(`compras-active-priority-fix\\.css\\?v=${version}`));
  assert.match(view, new RegExp(`compras-dashboard\\.js\\?v=${version}`));
});


test('fila sinaliza ABERTA e REABERTA em vermelho até entrar em cotação', () => {
  const view = fs.readFileSync(viewPath, 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'compras-dashboard.css'), 'utf8');
  const releasedScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'compras-itens-liberados-dashboard.js'), 'utf8');

  assert.match(view, /\['ABERTA','REABERTA'\]\.includes\(s\.status\).*is-awaiting-quotation/);
  assert.match(css, /\.request-row\.is-awaiting-quotation\{/);
  assert.match(css, /#fff1f2/);
  assert.match(releasedScript, /\.request-row\.is-director-released/);
  assert.match(releasedScript, /#f0fdf4/);
});
