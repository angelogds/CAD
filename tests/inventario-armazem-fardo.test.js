const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('migration prepara Armazém Fardo e categorias úteis sem duplicar registros', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE estoque_locais(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      ativo INTEGER DEFAULT 1
    );
    CREATE TABLE estoque_categorias(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      parent_id INTEGER,
      ativo INTEGER DEFAULT 1
    );
  `);

  const tableExists = (name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const addColumnIfMissing = (table, name, ddl) => {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };

  const up = require('../database/migrations/225_inventario_armazem_fardo');
  up({ db, tableExists, addColumnIfMissing });
  up({ db, tableExists, addColumnIfMissing });

  assert.equal(db.prepare("SELECT COUNT(*) n FROM estoque_locais WHERE nome='ARMAZÉM FARDO'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM estoque_categorias WHERE nome='TINTAS E QUÍMICOS'").get().n, 1);
  assert.ok(db.prepare("SELECT 1 FROM estoque_categorias WHERE nome='DISCOS DE CORTE'").get());
  assert.ok(db.prepare("SELECT 1 FROM estoque_categorias WHERE nome='PARAFUSOS'").get());
  assert.ok(db.prepare("SELECT 1 FROM estoque_categorias WHERE nome='ELETRODOS'").get());

  db.close();
});

test('inventário usa saldo canônico e movimento auditável sem criar compra paralela', () => {
  const service = read('modules/estoque/estoque.service.js');

  assert.match(service, /function registrarInventarioFisico/);
  assert.match(service, /saldo_atual=\?/);
  assert.match(service, /AJUSTE_ENTRADA/);
  assert.match(service, /AJUSTE_SAIDA/);
  assert.match(service, /INVENTARIO_FISICO_ARMAZEM_FARDO/);
  assert.match(service, /saldo_anterior:/);
  assert.match(service, /saldo_posterior:/);
  assert.match(service, /Este material já existe no estoque/);
  assert.doesNotMatch(service, /INSERT INTO compras[\s\S]{0,500}registrarInventarioFisico/);
});

test('inventário do Almoxarifado é restrito a estoque_manage e integrado às prateleiras', () => {
  const routes = read('modules/almoxarifado/almoxarifado.routes.js');
  const controller = read('modules/almoxarifado/almoxarifado.controller.js');
  const shelf = read('views/almoxarifado/estoque.ejs');

  assert.match(routes, /router\.get\("\/estoque\/inventario", requireLogin, requireRole\(ACCESS\.estoque_manage\), ctrl\.inventarioArmazemFardo\)/);
  assert.match(routes, /router\.post\("\/estoque\/inventario", requireLogin, requireRole\(ACCESS\.estoque_manage\), ctrl\.salvarInventarioArmazemFardo\)/);
  assert.match(controller, /registrarInventarioFisico\(req\.body \|\| \{\}, req\.session\.user \|\| \{\}\)/);
  assert.match(shelf, /Cadastrar material existente/);
  assert.match(shelf, /\/almoxarifado\/estoque\/inventario/);
});

test('tela cadastra item novo ou ajusta item existente e endereça a prateleira', () => {
  const view = read('views/almoxarifado/inventario_armazem_fardo.ejs');

  assert.doesNotThrow(() => ejs.compile(view, {
    filename: path.join(root, 'views/almoxarifado/inventario_armazem_fardo.ejs')
  }));
  assert.match(view, /name="estoque_item_id"/);
  assert.match(view, /name="quantidade_contada"/);
  assert.match(view, /name="categoria_id"/);
  assert.match(view, /name="subcategoria_id"/);
  assert.match(view, /name="local_id"/);
  assert.match(view, /name="endereco_zona"/);
  assert.match(view, /name="endereco_estante"/);
  assert.match(view, /name="endereco_prateleira"/);
  assert.match(view, /name="endereco_posicao"/);
  assert.match(view, /Armazém Fardo/);
  assert.match(view, /não cria compra, solicitação ou recebimento fictício/i);
});

test('inventário físico mantém layout responsivo para tablet e celular', () => {
  const css = read('public/css/almoxarifado-refino-v4.css');
  assert.match(css, /\.almox-inventory-guide/);
  assert.match(css, /\.almox-inventory-new-grid/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /min-height:46px/);
});
