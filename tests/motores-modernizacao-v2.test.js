const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('migration de motores adiciona prazo sem perder registros existentes', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE motores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'EM_USO'
    );
    CREATE TABLE motores_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      motor_id INTEGER NOT NULL,
      tipo TEXT NOT NULL
    );
    INSERT INTO motores (descricao, status) VALUES ('Motor teste', 'EM_USO');
  `);

  const tableExists = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  const columnExists = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  const addColumnIfMissing = (table, column, ddl) => {
    if (tableExists(table) && !columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };

  require('../database/migrations/203_motores_prazo_rebobinamento')({ db, tableExists, columnExists, addColumnIfMissing });

  assert.equal(columnExists('motores', 'previsao_retorno'), true);
  assert.equal(columnExists('motores_eventos', 'previsao_retorno'), true);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM motores').get().total, 1);
  db.close();
});

test('listagem de motores usa indicadores reais, filtros persistentes e design compartilhado', () => {
  const controller = read('modules/motores/motores.controller.js');
  const view = read('views/motores/index.ejs');

  assert.match(controller, /service\.getSummary\(\)/);
  assert.match(view, /mot-kpis/);
  assert.match(view, /Prazo atrasado/);
  assert.match(view, /Histórico/);
  assert.match(view, /filtros\.status===status \? 'selected'/);
  assert.match(view, /ui-btn--primary/);
  assert.match(view, /ui-btn--outline/);
  assert.match(view, /motores\.css/);
});

test('ficha do motor usa timeline estruturada em vez de JSON bruto', () => {
  const view = read('views/motores/show.ejs');

  assert.match(view, /Histórico técnico/);
  assert.match(view, /mot-timeline/);
  assert.match(view, /empresa_rebob/);
  assert.match(view, /previsao_retorno/);
  assert.match(view, /dateBr\.formatDateTimeBR/);
  assert.doesNotMatch(view, /payloadObj|JSON\.stringify/);
});

test('envio e retorno preservam estado e registram previsão no histórico', () => {
  const service = read('modules/motores/motores.service.js');
  const controller = read('modules/motores/motores.controller.js');

  assert.match(service, /motor\.status === "ENVIADO_REBOB"/);
  assert.match(service, /motor\.status !== "ENVIADO_REBOB"/);
  assert.match(service, /previsao_retorno=@previsao/);
  assert.match(service, /motores_eventos[\s\S]*previsao_retorno/);
  assert.match(controller, /previsao_retorno/);
  assert.match(controller, /actionError/);
});

test('rotas e RBAC de motores permanecem os mesmos', () => {
  const routes = read('modules/motores/motores.routes.js');
  const rbac = read('config/rbac.js');

  assert.match(routes, /const MOTORES_ACCESS = ACCESS\.motores/);
  assert.match(routes, /router\.get\("\/", requireLogin, requireRole\(MOTORES_ACCESS\)/);
  assert.match(routes, /router\.post\("\/:id\/enviar", requireLogin, requireRole\(MOTORES_ACCESS\)/);
  assert.match(routes, /router\.post\("\/:id\/retorno", requireLogin, requireRole\(MOTORES_ACCESS\)/);
  assert.match(rbac, /motores:\s*\[ROLE\.ADMIN, ROLE\.ALMOXARIFADO, ROLE\.MANUTENCAO_SUPERVISOR\]/);
});

test('layout de motores é responsivo e tabela vira leitura móvel', () => {
  const css = read('public/css/motores.css');

  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /\.mot-table td::before/);
  assert.match(css, /\.mot-grid-2/);
  assert.match(css, /\.mot-timeline/);
});
