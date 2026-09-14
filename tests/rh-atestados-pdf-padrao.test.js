const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('atestado usa armazenamento privado e integra ausência existente sem debitar banco', () => {
  const migration = read('database/migrations/197_rh_atestados.js');
  const service = read('modules/rh/rh.atestados.js');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS rh_atestados/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM colaboradores|ALTER TABLE colaboradores DROP/i);
  assert.match(service, /path\.join\(storage\.DATA_DIR, 'rh', 'atestados'\)/);
  assert.match(service, /programarFolgaCompensatoria/);
  assert.match(service, /tipo_lancamento:\s*'ATESTADO'/);
  assert.match(service, /minutos_descontados:\s*0/);
  assert.match(service, /anexo_path:\s*null/);
  assert.match(service, /getOwnPrivateFile/);
});

test('Meu RH permite upload controlado e download apenas pelo vínculo do colaborador', () => {
  const routes = read('modules/meu-portal/meu-portal.routes.js');
  const controller = read('modules/rh/rh.portal.controller.js');
  const view = read('views/meu-portal/rh.ejs');

  assert.match(routes, /10 \* 1024 \* 1024/);
  assert.match(routes, /'application\/pdf'/);
  assert.match(routes, /'image\/jpeg'/);
  assert.match(routes, /'image\/png'/);
  assert.match(routes, /'image\/webp'/);
  assert.match(routes, /post\('\/rh\/atestados'/);
  assert.match(controller, /getOwnPrivateFile/);
  assert.match(controller, /Number\(rh\.colaborador\.id\)/);
  assert.match(view, /Enviar atestado ao RH/);
  assert.match(view, /class="rh-form"/);
  assert.match(view, /Não informe CID, diagnóstico ou detalhes clínicos/);
});

test('notificações separam documento sensível da informação operacional', () => {
  const notifications = read('modules/rh/rh.notifications.js');

  assert.match(notifications, /atestadoSensitiveUserIds/);
  assert.match(notifications, /ROLE\.ADMIN, ROLE\.RH/);
  assert.match(notifications, /maintenanceLeaderUserIds/);
  assert.match(notifications, /url: '\/rh\/atestados'/);
  assert.match(notifications, /url: '\/escala\/folgas'/);
  assert.match(notifications, /A ausência já foi lançada na Escala/);
});

test('PDFs de RH usam padrão compartilhado da Solicitação e o símbolo oficial da manutenção', () => {
  const standard = read('utils/pdf-standard.js');
  const rhPdf = read('modules/rh/rh.pdf.js');

  assert.match(standard, /public\/IMG\/logopdf_campo_do_gado\.png\.png/);
  assert.match(standard, /green:\s*'#16A34A'/);
  assert.match(standard, /greenDark:\s*'#166534'/);
  assert.match(standard, /greenHeader:\s*'#159947'/);
  assert.match(rhPdf, /require\('\.\.\/\.\.\/utils\/pdf-standard'\)/);
  assert.match(rhPdf, /Origem não informada/);
  assert.match(rhPdf, /generateConsolidatedLeavePdf/);
});

test('folga aprovada oferece PDF individual e RH possui PDF consolidado', () => {
  const rhRoutes = read('modules/rh/rh.routes.js');
  const rhView = read('views/rh/folgas.ejs');
  const portalView = read('views/meu-portal/rh.ejs');

  assert.match(rhRoutes, /get\('\/folgas\/pdf'/);
  assert.match(rhRoutes, /get\('\/folgas\/:id\/pdf'/);
  assert.match(rhView, /Baixar PDF consolidado/);
  assert.match(rhView, /status === 'APROVADA'/);
  assert.match(portalView, /st === 'APROVADA'/);
  assert.match(portalView, /Baixar PDF/);
});

test('formulários do RH mantêm comportamento mobile já padronizado', () => {
  const css = read('public/css/rh-portal.css');
  const view = read('views/meu-portal/rh.ejs');

  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.rh-form\{grid-template-columns:1fr\}/);
  assert.match(css, /\.my-rh-grid,.my-rh-kpis\{grid-template-columns:1fr\}/);
  assert.match(view, /class="rh-form"/);
  assert.match(view, /class="is-wide"/);
});
