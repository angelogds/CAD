const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

function helpers(db) {
  const tableExists = (name) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  const columnExists = (table, column) => tableExists(table)
    && db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  const addColumnIfMissing = (table, column, ddl) => {
    if (tableExists(table) && !columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  return { db, tableExists, columnExists, addColumnIfMissing };
}

function buildDb() {
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
      (1,'PR-50','Prensa P50','Prensagem','Prensa'),
      (2,'RS-01','Rosca Transporte 1','Produção','Rosca'),
      (3,'DC-01','Decanter FAST Saturn 3','Separação','Decanter'),
      (4,'DG-03','Digestor 3','Produção','Digestor');

    INSERT INTO motores(id,codigo,descricao,potencia_cv,rpm,local_instalacao,status)
      VALUES (20,'M-030','Motor Digestor 3',30,1750,'Digestor 3','EM_USO');
  `);
  return db;
}

test('V5 valida mancais e redutores gerais e prepara produtos específicos do Decanter', () => {
  const db = buildDb();
  const h = helpers(db);
  require('../database/migrations/205_roteiro_lubrificacao_base')(h);
  require('../database/migrations/206_lubrificacao_regras_reais_v4')(h);
  require('../database/migrations/207_validar_lubrificacao_geral_v5')(h);

  const geral = db.prepare(`
    SELECT l.*,e.nome AS equipamento_nome
    FROM pcm_lubrificacao_planos l
    JOIN equipamentos e ON e.id=l.equipamento_id
    WHERE COALESCE(l.ativo,1)=1 AND UPPER(e.nome) NOT LIKE '%DECANTER%'
  `).all();

  const bearings = geral.filter((r) =>
    /MANCAL|ROLAMENTO|RELUBRIFICA/i.test(String(r.ponto_lubrificacao || '')) &&
    !/REDUTOR/i.test(String(r.ponto_lubrificacao || ''))
  );
  assert.ok(bearings.length >= 1);
  for (const row of bearings) {
    assert.equal(Number(row.validado_tecnicamente), 1);
    assert.equal(row.tipo_lubrificante_texto, 'Graxa de Lítio EP2');
    assert.equal(Number(row.quantidade), 150);
    assert.equal(row.unidade, 'g');
    assert.equal(Number(row.frequencia_dias), 7);
    assert.equal(row.metodo_aplicacao, 'Engraxar');
  }

  const reducers = geral.filter((r) => /REDUTOR|MOTORREDUTOR|CAIXA REDUTORA/i.test(String(r.ponto_lubrificacao || '')));
  assert.ok(reducers.length >= 1);
  for (const row of reducers) {
    assert.equal(Number(row.validado_tecnicamente), 1);
    assert.equal(row.tipo_lubrificante_texto, 'Lubrax Gear 680 - Óleo para Engrenagens/Redutores - ISO VG 680');
    assert.equal(row.quantidade, null);
    assert.equal(row.unidade, null);
    assert.equal(Number(row.frequencia_dias), 7);
    assert.equal(row.metodo_aplicacao, 'Verificar / completar nível');
  }

  const decanter = db.prepare(`
    SELECT l.*
    FROM pcm_lubrificacao_planos l
    JOIN equipamentos e ON e.id=l.equipamento_id
    WHERE UPPER(e.nome) LIKE '%DECANTER%' AND COALESCE(l.ativo,1)=1
  `).all();
  assert.ok(decanter.length >= 1);
  assert.ok(decanter.every((r) => Number(r.validado_tecnicamente) === 0));
  assert.ok(decanter.every((r) => !String(r.tipo_lubrificante_texto || '').includes('padrão Manutenção')));
  assert.ok(decanter.every((r) => !String(r.tipo_lubrificante_texto || '').includes('ISO VG 680')));

  const motor30 = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE motor_id=20").get();
  assert.ok(motor30);
  assert.equal(Number(motor30.validado_tecnicamente), 1);
  assert.equal(motor30.tipo_lubrificante_texto, 'Graxa de Lítio EP2');
  assert.equal(Number(motor30.quantidade), 150);
  assert.equal(Number(motor30.frequencia_dias), 7);

  const before = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos").get().total;
  require('../database/migrations/207_validar_lubrificacao_geral_v5')(h);
  const after = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos").get().total;
  assert.equal(after, before);

  db.close();
});

test('V5 não sobrescreve ponto já validado manualmente', () => {
  const db = buildDb();
  const h = helpers(db);
  require('../database/migrations/205_roteiro_lubrificacao_base')(h);
  require('../database/migrations/206_lubrificacao_regras_reais_v4')(h);

  const row = db.prepare(`
    SELECT id FROM pcm_lubrificacao_planos
    WHERE equipamento_id=1 AND UPPER(ponto_lubrificacao) LIKE '%MANCAL%'
    LIMIT 1
  `).get();
  assert.ok(row);

  db.prepare(`
    UPDATE pcm_lubrificacao_planos
    SET tipo_lubrificante_texto='Produto manual',
        quantidade=123,
        unidade='g',
        frequencia_dias=30,
        validado_tecnicamente=1
    WHERE id=?
  `).run(row.id);

  require('../database/migrations/207_validar_lubrificacao_geral_v5')(h);

  const kept = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE id=?").get(row.id);
  assert.equal(kept.tipo_lubrificante_texto, 'Produto manual');
  assert.equal(Number(kept.quantidade), 123);
  assert.equal(Number(kept.frequencia_dias), 30);

  db.close();
});
