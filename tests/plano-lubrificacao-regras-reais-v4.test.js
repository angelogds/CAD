const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
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

function dbBase() {
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
      (3,'TJ-01','Triturador Juliano','Moagem','Triturador'),
      (4,'TF-01','Triturador FAST','Moagem','Triturador'),
      (5,'TS-01','Tanque de Serviço Seco','Processo','Tanque'),
      (6,'ES-01','Esterilizador 1','Processo','Esterilizador'),
      (7,'EN-01','Ensacadeira 1','Expedição','Ensacadeira'),
      (8,'TM-01','Tolva de Moega 1','Produção','Tolva'),
      (9,'DC-01','Decanter FAST Saturn 3','Separação','Decanter'),
      (10,'TC-01','Tacho 1','Processo','Tacho');

    INSERT INTO motores(id,codigo,descricao,potencia_cv,rpm,local_instalacao,status) VALUES
      (20,'M-030','Motor Prensa P50',30,1750,'Prensa P50','EM_USO'),
      (21,'M-015','Motor Rosca Transporte 1',15,1750,'Rosca Transporte 1','EM_USO');
  `);
  return db;
}

function names(db, equipamentoId) {
  return db.prepare(`
    SELECT ponto_lubrificacao,ativo,instrucoes_execucao,motor_id
    FROM pcm_lubrificacao_planos
    WHERE equipamento_id=?
    ORDER BY id
  `).all(equipamentoId);
}

test('catálogo V4 representa as exceções reais da planta', () => {
  assert.equal(catalogo.classificarEquipamento({ nome:'Triturador Juliano', tipo:'Triturador' }).familia, 'TRITURADOR_JULIANO');
  assert.equal(catalogo.classificarEquipamento({ nome:'Triturador FAST', tipo:'Triturador' }).familia, 'TRITURADOR_FAST');
  assert.equal(catalogo.classificarEquipamento({ nome:'Tanque de Serviço Seco', tipo:'Tanque' }).familia, 'TANQUE_SERVICO_SECO');
  assert.equal(catalogo.classificarEquipamento({ nome:'Tacho 1', tipo:'Tacho' }).familia, 'TACHOS');
  assert.equal(catalogo.classificarEquipamento({ nome:'Esterilizador 1', tipo:'Esterilizador' }).familia, 'ESTERILIZADORES');

  const prensa = catalogo.gerarPontosBase({ nome:'Prensa P50', tipo:'Prensa' });
  assert.equal(prensa.filter((p) => p.key === 'BEARING_DE' || p.key === 'BEARING_NDE').length, 2);
  assert.equal(prensa.filter((p) => p.key === 'REDUCER_OIL').length, 1);

  const fast = catalogo.gerarPontosBase({ nome:'Triturador FAST', tipo:'Triturador' });
  assert.equal(fast.filter((p) => p.key === 'REDUCER_OIL').length, 0);
  assert.equal(fast.length, 2);

  const juliano = catalogo.gerarPontosBase({ nome:'Triturador Juliano', tipo:'Triturador' });
  assert.equal(juliano.filter((p) => p.key === 'REDUCER_OIL').length, 1);
  assert.equal(juliano.length, 3);

  const tanque = catalogo.gerarPontosBase({ nome:'Tanque de Serviço Seco', tipo:'Tanque' });
  assert.equal(tanque.some((p) => /mancal externo/i.test(p.ponto)), true);
  assert.equal(tanque.some((p) => /mancal interno/i.test(p.ponto)), false);

  const decanter = catalogo.gerarPontosBase({ nome:'Decanter FAST Saturn 3', tipo:'Decanter' });
  assert.equal(decanter.length, 3);
  assert.equal(decanter.filter((p) => /graxa especial/i.test(p.ponto)).length, 2);
  assert.equal(decanter.some((p) => /óleo especial/i.test(p.ponto)), true);
});

test('rosca com texto motorredutor continua classificada como ROSCAS', () => {
  const rule = catalogo.classificarEquipamento({
    nome:'Rosca inferior com motorredutor',
    tipo:'Rosca'
  });
  assert.equal(rule.familia, 'ROSCAS');
  assert.equal(catalogo.gerarPontosBase({ nome:'Rosca inferior com motorredutor', tipo:'Rosca' }).length, 3);
});

test('migration 206 corrige rascunhos sem apagar histórico nem inventar especificação', () => {
  const db = dbBase();
  const h = helpers(db);
  require('../database/migrations/205_roteiro_lubrificacao_base')(h);

  // Simula os dois pontos genéricos de motor que a versão anterior podia criar.
  const cols = db.prepare("PRAGMA table_info(pcm_lubrificacao_planos)").all().map((c) => c.name);
  assert.ok(cols.includes('validado_tecnicamente'));

  db.prepare(`
    INSERT INTO pcm_lubrificacao_planos (
      equipamento_id,ponto_lubrificacao,tipo_lubrificante_texto,
      metodo_aplicacao,ativo,validado_tecnicamente,origem_cadastro,created_at,updated_at
    ) VALUES (2,'Motor - rolamento lado acoplamento (LA)','A DEFINIR PELO PCM','Engraxar',1,0,'ROTEIRO_BASE_V1',datetime('now'),datetime('now'))
  `).run();

  require('../database/migrations/206_lubrificacao_regras_reais_v4')(h);

  const prensa = names(db, 1).filter((r) => Number(r.ativo) === 1);
  assert.equal(prensa.filter((r) => /mancal/i.test(r.ponto_lubrificacao)).length, 2);
  assert.equal(prensa.filter((r) => /redutor/i.test(r.ponto_lubrificacao)).length, 1);

  const rosca = names(db, 2);
  assert.equal(rosca.filter((r) => Number(r.ativo) === 1 && /mancal/i.test(r.ponto_lubrificacao)).length, 2);
  assert.equal(rosca.filter((r) => Number(r.ativo) === 1 && /redutor/i.test(r.ponto_lubrificacao)).length, 1);
  assert.equal(rosca.some((r) => /Motor - rolamento/i.test(r.ponto_lubrificacao) && Number(r.ativo) === 0), true);

  const juliano = names(db, 3).filter((r) => Number(r.ativo) === 1);
  assert.equal(juliano.length, 3);
  assert.equal(juliano.some((r) => /redutor/i.test(r.ponto_lubrificacao)), true);

  const fast = names(db, 4).filter((r) => Number(r.ativo) === 1);
  assert.equal(fast.filter((r) => /mancal/i.test(r.ponto_lubrificacao)).length, 2);
  assert.equal(fast.some((r) => /redutor/i.test(r.ponto_lubrificacao)), false);

  const tanque = names(db, 5).filter((r) => Number(r.ativo) === 1);
  assert.equal(tanque.some((r) => /mancal externo/i.test(r.ponto_lubrificacao)), true);
  assert.equal(tanque.some((r) => /mancal interno/i.test(r.ponto_lubrificacao)), false);
  assert.equal(tanque.some((r) => /redutor/i.test(r.ponto_lubrificacao)), true);

  const ester = names(db, 6).filter((r) => Number(r.ativo) === 1);
  assert.equal(ester.filter((r) => /mancal/i.test(r.ponto_lubrificacao)).length, 2);
  assert.equal(ester.some((r) => /redutor/i.test(r.ponto_lubrificacao)), true);

  const ensac = names(db, 7).filter((r) => Number(r.ativo) === 1);
  assert.equal(ensac.filter((r) => /mancal/i.test(r.ponto_lubrificacao)).length, 2);

  const tolva = names(db, 8).filter((r) => Number(r.ativo) === 1);
  assert.equal(tolva.filter((r) => /mancal/i.test(r.ponto_lubrificacao)).length, 2);
  assert.equal(tolva.some((r) => /redutor|motorredutor/i.test(r.ponto_lubrificacao)), true);

  const decanter = names(db, 9).filter((r) => Number(r.ativo) === 1);
  assert.equal(decanter.filter((r) => /graxa especial/i.test(r.ponto_lubrificacao)).length, 2);
  assert.equal(decanter.some((r) => /óleo especial/i.test(r.ponto_lubrificacao)), true);

  const tacho = names(db, 10).filter((r) => Number(r.ativo) === 1);
  assert.equal(tacho.filter((r) => /mancal/i.test(r.ponto_lubrificacao)).length, 2);
  assert.equal(tacho.some((r) => /redutor/i.test(r.ponto_lubrificacao)), true);

  const motor30 = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE motor_id=20").get();
  assert.ok(motor30);
  assert.match(motor30.ponto_lubrificacao, /relubrificação/i);
  assert.equal(Number(motor30.validado_tecnicamente), 0);
  assert.equal(motor30.tipo_lubrificante_texto, 'A DEFINIR PELO PCM');

  const motor15 = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos WHERE motor_id=21").get().total;
  assert.equal(motor15, 0);

  const before = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos").get().total;
  require('../database/migrations/206_lubrificacao_regras_reais_v4')(h);
  const after = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_planos").get().total;
  assert.equal(after, before);

  db.close();
});
