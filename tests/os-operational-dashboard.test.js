const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('modules/os/os.service.js', 'utf8');
const controller = fs.readFileSync('modules/os/os.controller.js', 'utf8');
const view = fs.readFileSync('views/os/index.ejs', 'utf8');
const css = fs.readFileSync('public/css/os-index.css', 'utf8');

test('dashboard operacional centraliza métricas, prazo, atenção, grupos e carga', () => {
  assert.match(service, /function getOperationalDashboard\(filters = \{\}\)/);
  assert.match(service, /function operationalDateInfo\(row, now = new Date\(\)\)/);
  assert.match(service, /dueDays < 0/);
  assert.match(service, /Sem prazo definido/);
  assert.match(service, /const attention =/);
  assert.match(service, /const teamLoad =/);
  assert.match(service, /pagination:\{page,pages,total,perPage\}/);
  assert.match(controller, /service\.getOperationalDashboard/);
});

test('fila mantém prioridade e criticidade distintas e filtros combináveis', () => {
  assert.match(service, /prioridade:/);
  assert.match(service, /equipamento_criticidade/);
  assert.match(service, /filters\.priority/);
  assert.match(service, /filters\.criticality/);
  for (const field of ['status','priority','criticality','sector','responsible']) assert.ok(view.includes(`['${field}'`));
  assert.match(view, /name="period"/);
});

test('interface oferece KPIs, atenção, abas, paginação, WhatsApp e estados vazios', () => {
  for (const label of ['OS abertas','Em andamento','Pausadas / aguardando','Atrasadas','Críticas e altas','Fechadas no período','Atenção imediata','Carga da equipe']) assert.match(view, new RegExp(label, 'i'));
  assert.match(view, /Fechadas e histórico/);
  assert.match(view, /Nenhuma ordem de serviço/);
  assert.match(view, /bulkWhatsappForm/);
  assert.match(view, /pagination/);
});

test('layout possui adaptação dedicada para desktop, tablet, mobile e impressão', () => {
  assert.match(css, /@media\(max-width:1200px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /@media print/);
  assert.match(css, /grid-template-columns:115px 1fr/);
});
