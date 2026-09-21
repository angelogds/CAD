const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('migration 204 preserva plano e cria estrutura de execução', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE equipamentos (id INTEGER PRIMARY KEY);
    CREATE TABLE pcm_lubrificacao_planos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipamento_id INTEGER NOT NULL,
      ponto_lubrificacao TEXT NOT NULL,
      tipo_lubrificante_texto TEXT,
      quantidade REAL,
      unidade TEXT,
      frequencia_dias INTEGER,
      frequencia_semanas INTEGER,
      frequencia_meses INTEGER,
      frequencia_horas_operacao INTEGER,
      observacao TEXT,
      proxima_execucao_em TEXT,
      created_by INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO equipamentos(id) VALUES (1);
    INSERT INTO pcm_lubrificacao_planos(equipamento_id,ponto_lubrificacao,frequencia_dias)
      VALUES (1,'Mancal dianteiro',7);
  `);
  const tableExists = (name) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const columnExists = (table, column) => tableExists(table) && db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  const addColumnIfMissing = (table, column, ddl) => { if (tableExists(table) && !columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); };
  require('../database/migrations/204_plano_lubrificacao_v2')({ db, tableExists, columnExists, addColumnIfMissing });

  assert.equal(db.prepare('SELECT COUNT(*) total FROM pcm_lubrificacao_planos').get().total, 1);
  assert.ok(columnExists('pcm_lubrificacao_planos', 'responsavel_user_id'));
  assert.ok(columnExists('pcm_lubrificacao_planos', 'metodo_aplicacao'));
  assert.ok(columnExists('pcm_lubrificacao_planos', 'ativo'));
  assert.ok(tableExists('pcm_lubrificacao_execucoes'));
  db.close();
});

test('módulo operacional é separado do PCM e protegido por RBAC próprio', () => {
  const routes = read('modules/lubrificacao/lubrificacao.routes.js');
  const rbac = read('config/rbac.js');
  const server = read('server.js');
  assert.match(routes, /ACCESS\.lubrificacao_execucao/);
  assert.match(routes, /router\.post\('\/:id\/executar'/);
  assert.match(rbac, /lubrificacao_execucao/);
  assert.match(server, /mount\("\/lubrificacao", "\.\/modules\/lubrificacao\/lubrificacao\.routes"\)/);
});

test('tela do mecânico não oferece edição administrativa do plano', () => {
  const view = read('views/lubrificacao/index.ejs');
  assert.match(view, /Meu roteiro de lubrificação/);
  assert.match(view, /Executar lubrificação/);
  assert.match(view, /Quantidade utilizada/);
  assert.match(view, /Encontrei uma anomalia/);
  assert.match(view, /p\.frequencia_dias/);
  assert.doesNotMatch(view, /name=["']frequencia_dias["']/);
  assert.doesNotMatch(view, /tipo_lubrificante_texto"[^>]*name=/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('serviço operacional exige responsabilidade do mecânico antes de executar', () => {
  const service = read('modules/lubrificacao/lubrificacao.service.js');
  assert.match(service, /responsavel_user_id = \?/);
  assert.match(service, /pcm_lubrificacao_execucoes/);
  assert.match(service, /ultima_execucao_em = datetime\('now'\)/);
  assert.match(service, /proxima_execucao_em = \?/);
});

test('javascript dos novos arquivos continua válido', () => {
  for (const file of [
    'modules/lubrificacao/lubrificacao.service.js',
    'modules/lubrificacao/lubrificacao.controller.js',
    'modules/lubrificacao/lubrificacao.routes.js',
    'database/migrations/204_plano_lubrificacao_v2.js',
  ]) assert.doesNotThrow(() => new Function(read(file)));
});
