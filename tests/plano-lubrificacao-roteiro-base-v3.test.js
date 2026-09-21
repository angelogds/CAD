const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const catalogo = require('../modules/lubrificacao/lubrificacao.catalogo.v1');

function helpers(db) {
  const tableExists = (name) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const columnExists = (table, column) => tableExists(table)
    && db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  const addColumnIfMissing = (table, column, ddl) => {
    if (tableExists(table) && !columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  return { db, tableExists, columnExists, addColumnIfMissing };
}

function legacyDb() {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, role TEXT);
    CREATE TABLE equipamentos (
      id INTEGER PRIMARY KEY,
      codigo TEXT,
      tag TEXT,
      nome TEXT NOT NULL,
      setor TEXT,
      tipo TEXT,
      ativo INTEGER DEFAULT 1
    );
    CREATE TABLE motores (
      id INTEGER PRIMARY KEY,
      codigo TEXT,
      descricao TEXT NOT NULL,
      potencia_cv REAL,
      rpm INTEGER,
      local_instalacao TEXT,
      status TEXT
    );
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
      updated_at TEXT,
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id)
    );

    INSERT INTO equipamentos(id,codigo,nome,setor,tipo) VALUES
      (1,'DG-03','Digestor 3','Produção','Digestor'),
      (2,'PR-50','Prensa P50','Prensagem','Prensa'),
      (3,'RS-01','Rosca Transporte 1','Produção','Rosca'),
      (4,'DC-01','Decanter FAST Saturn 3','Separação','Decanter'),
      (5,'MN-01','Moinho 1','Moagem','Moinho'),
      (6,'TR-01','Triturador FAST','Moagem','Triturador'),
      (7,'FR-01','Fornalha 1','Caldeira','Fornalha'),
      (8,'BM-01','Bomba de sebo 1','Separação','Bomba'),
      (9,'PN-01','Painel elétrico principal','Elétrica','Painel');

    INSERT INTO motores(id,codigo,descricao,potencia_cv,rpm,local_instalacao,status) VALUES
      (10,'M-030','Motor Digestor 3',30,1750,'Digestor 3','EM_USO'),
      (11,'M-015','Motor pequeno',15,1750,'Moinho 1','EM_USO');

    INSERT INTO pcm_lubrificacao_planos(
      equipamento_id,ponto_lubrificacao,tipo_lubrificante_texto,frequencia_dias,created_at,updated_at
    ) VALUES (3,'Mancal principal','Graxa já validada',30,datetime('now'),datetime('now'));
  `);
  return db;
}

test('catálogo classifica famílias industriais do roteiro', () => {
  assert.equal(catalogo.classificarEquipamento({ nome:'Digestor 4', tipo:'Digestor' }).familia, 'DIGESTORES');
  assert.equal(catalogo.classificarEquipamento({ nome:'Prensa P46', tipo:'Prensa' }).familia, 'PRENSAS');
  assert.equal(catalogo.classificarEquipamento({ nome:'Rosca inferior', tipo:'Rosca' }).familia, 'ROSCAS');
  assert.equal(catalogo.classificarEquipamento({ nome:'Moinho 2', tipo:'Moinho' }).familia, 'MOINHOS');
  assert.equal(catalogo.classificarEquipamento({ nome:'Triturador FAST', tipo:'Triturador' }).familia, 'TRITURADOR_FAST');
  assert.equal(catalogo.classificarEquipamento({ nome:'Bomba de sebo', tipo:'Bomba' }).familia, 'BOMBAS');
  assert.equal(catalogo.classificarEquipamento({ nome:'Painel principal', tipo:'Painel' }), null);
});

test('pontos legados genéricos bloqueiam duplicação automática conservadora', () => {
  const bearing = catalogo.gerarPontosBase({ nome:'Rosca 1', tipo:'Rosca' }).find((p) => p.key === 'BEARING_DE');
  const reducer = catalogo.gerarPontosBase({ nome:'Rosca 1', tipo:'Rosca' }).find((p) => p.key === 'REDUCER_OIL');
  assert.equal(catalogo.equivalentPoint('Mancal principal', bearing), true);
  assert.equal(catalogo.equivalentPoint('Redutor', reducer), true);
});

test('migration 205 gera rascunhos sem inventar produto, quantidade ou frequência', () => {
  const db = legacyDb();
  const migration = require('../database/migrations/205_roteiro_lubrificacao_base');
  migration(helpers(db));

  const drafts = db.prepare(`
    SELECT *
    FROM pcm_lubrificacao_planos
    WHERE origem_cadastro='ROTEIRO_BASE_V1'
  `).all();

  assert.ok(drafts.length > 10);
  assert.ok(drafts.every((row) => Number(row.validado_tecnicamente) === 0));
  assert.ok(drafts.every((row) => row.tipo_lubrificante_texto === 'A DEFINIR PELO PCM'));
  assert.ok(drafts.every((row) => row.quantidade == null));
  assert.ok(drafts.every((row) => row.frequencia_dias == null && row.frequencia_semanas == null && row.frequencia_meses == null));

  const legacy = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE ponto_lubrificacao='Mancal principal'").get();
  assert.equal(Number(legacy.validado_tecnicamente), 1);

  const painel = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos WHERE equipamento_id=9").get().total;
  assert.equal(painel, 0);

  // A migration 205 apenas cria o roteiro-base. A partir da V4,
  // pontos de motor são criados somente pela regra específica >=20 CV da migration 206.
  const linked = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos WHERE motor_id=10").get().total;
  assert.equal(linked, 0);

  const smallMotor = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos WHERE motor_id=11").get().total;
  assert.equal(smallMotor, 0);

  const before = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos").get().total;
  migration(helpers(db));
  const after = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos").get().total;
  assert.equal(after, before);
  db.close();
});

test('roteiro do mecânico exige ponto validado e continua sem edição administrativa', () => {
  const service = read('modules/lubrificacao/lubrificacao.service.js');
  const view = read('views/lubrificacao/index.ejs');
  assert.match(service, /validado_tecnicamente/);
  assert.match(service, /agruparRoteiro/);
  assert.match(service, /ainda não foi validado pelo PCM/);
  assert.match(view, /Como funciona o roteiro/);
  assert.match(view, /grupo\.rota/);
  assert.match(view, /Como executar/);
  assert.doesNotMatch(view, /name=["']tipo_lubrificante_texto["']/);
  assert.doesNotMatch(view, /name=["']frequencia_dias["']/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('PCM possui geração do roteiro, validação técnica, pendências e PDF', () => {
  const service = read('modules/pcm/pcm.service.js');
  const routes = read('modules/pcm/pcm.routes.js');
  const controller = read('modules/pcm/pcm.controller.js');
  const view = read('views/pcm/lubrificacao.ejs');

  assert.match(service, /gerarRoteiroBaseLubrificacao/);
  assert.match(service, /validarPontoLubrificacao/);
  assert.match(service, /listMotoresLubrificacaoPendentes/);
  assert.match(service, /listEquipamentosSemRoteiroLubrificacao/);
  assert.match(routes, /lubrificacao\/gerar-roteiro-base/);
  assert.match(routes, /lubrificacao\/:id\/validar/);
  assert.match(routes, /lubrificacao\/pdf/);
  assert.match(controller, /function lubrificacaoPdf/);
  assert.match(view, /PENDENTE DE VALIDAÇÃO/);
  assert.match(view, /Motores >= 20 CV/);
  assert.match(view, /Equipamentos sem roteiro classificado/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('novos arquivos JavaScript do roteiro V3 têm sintaxe válida', () => {
  for (const file of [
    'modules/lubrificacao/lubrificacao.catalogo.v1.js',
    'modules/lubrificacao/lubrificacao.service.js',
    'modules/pcm/pcm.service.js',
    'modules/pcm/pcm.controller.js',
    'database/migrations/205_roteiro_lubrificacao_base.js',
  ]) assert.doesNotThrow(() => new Function(read(file)), file);
});
