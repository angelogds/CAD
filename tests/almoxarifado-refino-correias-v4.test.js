const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('V4 reduz a central do Almoxarifado aos dois blocos de pesquisa operacionais', () => {
  const view = read('views','almoxarifado','index.ejs');
  const controller = read('modules','almoxarifado','almoxarifado.controller.js');
  assert.match(view, /Compras e cotação/);
  assert.match(view, /Chegada e recebimento/);
  assert.match(view, /name="q_compra"/);
  assert.match(view, /name="q_recebimento"/);
  assert.match(view, /Cotado/);
  assert.match(view, /Não cotado/);
  assert.match(view, /Já chegou/);
  assert.match(view, /Não chegou/);
  assert.match(controller, /compra_estado/);
  assert.match(controller, /recebimento_estado/);
  assert.doesNotMatch(view, /Últimas movimentações/);
  assert.doesNotMatch(view, /Prateleiras por categoria/);
});

test('migration V4 adiciona subcategoria, endereço e integração preventiva sem saldo paralelo', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE equipamentos(id INTEGER PRIMARY KEY,nome TEXT,codigo TEXT,setor TEXT,ativo INTEGER DEFAULT 1);
    CREATE TABLE estoque_categorias(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,ativo INTEGER DEFAULT 1);
    CREATE TABLE estoque_itens(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT,ativo INTEGER DEFAULT 1);
    CREATE TABLE estoque_movimentos(id INTEGER PRIMARY KEY AUTOINCREMENT,item_id INTEGER,tipo TEXT,quantidade REAL);
    CREATE TABLE preventiva_planos(id INTEGER PRIMARY KEY AUTOINCREMENT,equipamento_id INTEGER,titulo TEXT,frequencia_tipo TEXT,frequencia_valor INTEGER,ativo INTEGER DEFAULT 1,observacao TEXT);
    CREATE TABLE preventiva_execucoes(id INTEGER PRIMARY KEY AUTOINCREMENT,plano_id INTEGER,data_prevista TEXT,status TEXT,responsavel TEXT,observacao TEXT);
  `);
  const tableExists = (name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const addColumnIfMissing = (table, name, ddl) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c)=>c.name===name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  require('../database/migrations/222_almox_refino_plano_correias_v4')({ db, tableExists, addColumnIfMissing });

  const stockCols = new Set(db.prepare('PRAGMA table_info(estoque_itens)').all().map((c)=>c.name));
  ['subcategoria_id','endereco_zona','endereco_estante','endereco_prateleira','endereco_posicao'].forEach((name)=>assert.ok(stockCols.has(name),name));
  const planCols = new Set(db.prepare('PRAGMA table_info(preventiva_planos)').all().map((c)=>c.name));
  ['tipo_plano','estoque_item_id','quantidade_material','estoque_minimo_conjuntos','baixa_estoque_automatica'].forEach((name)=>assert.ok(planCols.has(name),name));
  const execCols = new Set(db.prepare('PRAGMA table_info(preventiva_execucoes)').all().map((c)=>c.name));
  assert.ok(execCols.has('estoque_movimento_id'));
  assert.ok(execCols.has('estoque_quantidade_utilizada'));

  const correias = db.prepare("SELECT id FROM estoque_categorias WHERE nome='CORREIAS' AND parent_id IS NULL").get();
  assert.ok(correias?.id);
  assert.ok(db.prepare("SELECT 1 FROM estoque_categorias WHERE nome='3VX' AND parent_id=?").get(correias.id));
  assert.ok(db.prepare("SELECT 1 FROM estoque_categorias WHERE nome='DENTADAS' AND parent_id=?").get(correias.id));
  const migration = read('database','migrations','222_almox_refino_plano_correias_v4.js');
  assert.doesNotMatch(migration, /CREATE TABLE[^\n]*(estoque_saldo|saldo_estoque)/i);
  db.close();
});

test('recebimento e prateleira usam subcategoria e endereço físico', () => {
  const conferir = read('views','almoxarifado','conferir.ejs');
  const estoque = read('views','almoxarifado','estoque.ejs');
  const service = read('modules','almoxarifado','almoxarifado.service.js');
  assert.match(conferir, /name="subcategoria_id"/);
  assert.match(conferir, /name="endereco_zona"/);
  assert.match(conferir, /name="endereco_estante"/);
  assert.match(conferir, /name="endereco_prateleira"/);
  assert.match(conferir, /name="endereco_posicao"/);
  assert.match(estoque, /subcategoria_nome/);
  assert.match(estoque, /endereco_completo/);
  assert.match(service, /resolveSubcategoria/);
  assert.match(service, /A subcategoria selecionada não pertence à categoria informada/);
});

test('estoque existente pode ser reclassificado e endereçado pelo Almoxarifado', () => {
  const routes = read('modules','almoxarifado','almoxarifado.routes.js');
  const controller = read('modules','almoxarifado','almoxarifado.controller.js');
  const stockService = read('modules','estoque','estoque.service.js');
  const view = read('views','almoxarifado','estoque.ejs');
  assert.match(routes, /estoque\/:itemId\/classificar/);
  assert.match(routes, /ACCESS\.estoque_manage/);
  assert.match(controller, /updateItemClassification/);
  assert.match(stockService, /function updateItemClassification/);
  assert.match(view, /Organizar prateleira/);
  assert.match(view, /Salvar organização/);
});

test('Plano de Correias fica no PCM e continua sendo uma preventiva', () => {
  const service = read('modules','correias','correias.service.js');
  const routes = read('modules','pcm','pcm.routes.js');
  const nav = read('views','pcm','partials','internal-nav.ejs');
  const preventive = read('modules','preventivas','preventivas.service.js');
  const preventiveView = read('views','preventivas','index.ejs');

  assert.match(routes, /\/correias/);
  assert.match(nav, /Plano de Correias/);
  assert.match(service, /tipo_plano:'TROCA_CORREIA'/);
  assert.match(service, /INSERT INTO preventiva_planos/);
  assert.match(service, /INSERT INTO preventiva_execucoes/);
  assert.match(preventive, /correiasService\.baixarEstoquePreventiva/);
  assert.match(preventive, /correiasService\.agendarProximaExecucao/);
  assert.match(preventiveView, /TROCA DE CORREIA/);
});

test('conclusão da troca baixa estoque, é idempotente e bloqueia saldo insuficiente', () => {
  const service = read('modules','correias','correias.service.js');
  const preventive = read('modules','preventivas','preventivas.service.js');
  assert.match(service, /SAIDA_PREVENTIVA_CORREIA/);
  assert.match(service, /Estoque livre insuficiente para concluir a troca/);
  assert.match(service, /saldo_reservado/);
  assert.match(service, /saldo_livre/);
  assert.match(service, /estoque_movimento_id/);
  assert.match(service, /if \(exec\.estoque_movimento_id\)/);
  assert.match(service, /saldo_anterior/);
  assert.match(service, /saldo_posterior/);
  const debitPos = preventive.indexOf('correiasService.baixarEstoquePreventiva');
  const updatePos = preventive.indexOf('UPDATE preventiva_execucoes', debitPos);
  assert.ok(debitPos > 0 && updatePos > debitPos, 'baixa deve ocorrer antes da conclusão da preventiva');
});

test('estoque mínimo do plano soma pelo menos um conjunto por equipamento', () => {
  const service = read('modules','correias','correias.service.js');
  assert.match(service, /quantidade_material,1\) \* MAX\(COALESCE\(estoque_minimo_conjuntos,1\),1\)/);
  assert.match(service, /recalcularMinimoEstoque/);
  assert.match(service, /conjuntos_disponiveis/);
  assert.match(read('views','pcm','correias.ejs'), /Conjuntos mínimos em reserva/);
});

test('telas V4 compilam e permanecem responsivas', () => {
  for (const file of [
    ['views','almoxarifado','index.ejs'],
    ['views','almoxarifado','estoque.ejs'],
    ['views','almoxarifado','conferir.ejs'],
    ['views','pcm','correias.ejs'],
    ['views','preventivas','show.ejs'],
    ['views','preventivas','index.ejs'],
  ]) {
    const source = read(...file);
    assert.doesNotThrow(() => ejs.compile(source,{filename:path.join(root,...file)}), file.join('/'));
  }
  const css = read('public','css','almoxarifado-refino-v4.css');
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /min-height:46px/);
});
