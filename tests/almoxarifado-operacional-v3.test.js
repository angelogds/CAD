const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('V3 abre o Almoxarifado em uma central operacional e preserva as rotas oficiais', () => {
  const routes = read('modules', 'almoxarifado', 'almoxarifado.routes.js');
  const controller = read('modules', 'almoxarifado', 'almoxarifado.controller.js');
  const tabs = read('views', 'almoxarifado', '_tabs.ejs');

  assert.match(routes, /router\.get\("\/",[\s\S]*ctrl\.index/);
  assert.match(routes, /router\.get\("\/estoque",[\s\S]*ctrl\.estoqueOperacional/);
  assert.match(controller, /function index\(/);
  assert.match(controller, /function estoqueOperacional\(/);
  assert.match(tabs, /Compras a caminho/);
  assert.match(tabs, /Para entregar/);
  assert.match(tabs, /\/almoxarifado\/retiradas\/qr/);
  assert.doesNotMatch(tabs, /\/estoque\/saidas\/nova\?contexto=almoxarifado/);
});

test('migration V3 adiciona vínculo opcional ao equipamento e categorias sem saldo paralelo', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE equipamentos(id INTEGER PRIMARY KEY,nome TEXT,ativo INTEGER DEFAULT 1);
    CREATE TABLE estoque_itens(id INTEGER PRIMARY KEY,nome TEXT,ativo INTEGER DEFAULT 1);
    CREATE TABLE estoque_categorias(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,parent_id INTEGER,ativo INTEGER DEFAULT 1);
  `);
  const tableExists = (name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const addColumnIfMissing = (table, name, ddl) => {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  require('../database/migrations/220_almoxarifado_operacional_v3')({ db, tableExists, addColumnIfMissing });

  const cols = new Set(db.prepare('PRAGMA table_info(estoque_itens)').all().map((column) => column.name));
  assert.ok(cols.has('equipamento_id'));
  assert.ok(db.prepare("SELECT 1 FROM estoque_categorias WHERE nome='ROLAMENTOS'").get());
  assert.ok(db.prepare("SELECT 1 FROM estoque_categorias WHERE nome='CORREIAS'").get());
  assert.ok(db.prepare("SELECT 1 FROM estoque_categorias WHERE nome='SOLDAGEM'").get());
  const migration = read('database', 'migrations', '220_almoxarifado_operacional_v3.js');
  assert.doesNotMatch(migration, /CREATE TABLE[^\n]*estoque_saldo/i);
  db.close();
});

test('recebimento permite classificar categoria, local e estoque dedicado ao equipamento', () => {
  const view = read('views', 'almoxarifado', 'conferir.ejs');
  const service = read('modules', 'almoxarifado', 'almoxarifado.service.js');
  const controller = read('modules', 'almoxarifado', 'almoxarifado.controller.js');

  assert.match(view, /name="categoria_id"/);
  assert.match(view, /name="destino_estoque"/);
  assert.match(view, /Dedicado ao equipamento/);
  assert.match(service, /resolveCategoria/);
  assert.match(service, /solicitação precisa estar vinculada a um equipamento/i);
  assert.match(service, /equipamento_id/);
  assert.match(controller, /destinoEstoque: req\.body\.destino_estoque/);
});

test('retirada aceita QR ou cadastro e sempre revalida a identidade no servidor', () => {
  const service = read('modules', 'estoque', 'estoque.reservas.service.js');
  const controller = read('modules', 'almoxarifado', 'retiradas-qr.controller.js');
  const view = read('views', 'almoxarifado', 'retirada_qr.ejs');

  assert.match(service, /function getPessoaByCadastro/);
  assert.match(service, /function listPessoasAtivas/);
  assert.match(service, /qrCode \? getPessoaByQr\(qrCode\) : getPessoaByCadastro/);
  assert.match(service, /CADASTRO_COLABORADOR/);
  assert.match(service, /CADASTRO_USUARIO/);
  assert.match(controller, /q_pessoa/);
  assert.match(view, /Buscar funcionário pelo nome/);
  assert.match(view, /name="pessoa_tipo"/);
  assert.match(view, /name="pessoa_id"/);
});

test('telas operacionais compilam e têm tratamento responsivo para celular', () => {
  for (const file of ['index.ejs', 'estoque.ejs', 'retirada_qr.ejs', 'conferir.ejs', 'recebimentos.ejs']) {
    const source = read('views', 'almoxarifado', file);
    assert.doesNotThrow(() => ejs.compile(source, { filename: path.join(root, 'views', 'almoxarifado', file) }), file);
  }
  const css = read('public', 'css', 'almoxarifado-operacional-v3.css');
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /min-height:46px/);
  assert.match(css, /almox-shelf/);
  assert.match(css, /almox-tabs--operacional/);
});
