const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

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
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT);
    CREATE TABLE equipamentos (
      id INTEGER PRIMARY KEY,
      codigo TEXT, tag TEXT, nome TEXT NOT NULL, setor TEXT, tipo TEXT, ativo INTEGER DEFAULT 1
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
      dias_semana_lubrificacao TEXT,
      observacao TEXT,
      proxima_execucao_em TEXT,
      ultima_execucao_em TEXT,
      metodo_aplicacao TEXT,
      responsavel_user_id INTEGER,
      ativo INTEGER NOT NULL DEFAULT 1,
      familia_lubrificacao TEXT,
      rota_lubrificacao TEXT,
      ordem_rota INTEGER,
      validado_tecnicamente INTEGER DEFAULT 1,
      origem_cadastro TEXT,
      instrucoes_execucao TEXT,
      created_by INTEGER,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(equipamento_id) REFERENCES equipamentos(id)
    );
    CREATE TABLE pcm_lubrificacao_execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plano_id INTEGER NOT NULL,
      equipamento_id INTEGER NOT NULL,
      executor_user_id INTEGER NOT NULL,
      executed_at TEXT,
      created_at TEXT,
      FOREIGN KEY(plano_id) REFERENCES pcm_lubrificacao_planos(id)
    );

    INSERT INTO users(id,name,role) VALUES (1,'Mecânico','MECANICO');
    INSERT INTO equipamentos(id,codigo,nome,setor,tipo) VALUES
      (10,'RS-01','Rosca Alimentação Digestores','Área Suja','Rosca');

    INSERT INTO pcm_lubrificacao_planos (
      id,equipamento_id,ponto_lubrificacao,tipo_lubrificante_texto,quantidade,unidade,
      frequencia_dias,metodo_aplicacao,ativo,familia_lubrificacao,rota_lubrificacao,
      ordem_rota,validado_tecnicamente,origem_cadastro,ultima_execucao_em,proxima_execucao_em
    ) VALUES
      (1,10,'Mancal dianteiro da rosca','Graxa de Lítio EP2',150,'g',7,'Engraxar',1,'ROSCAS','Rota 02 - Roscas, Tolvas e Transporte',3001,1,'ROTEIRO_BASE_V1','2026-09-20 08:00:00','2026-09-27 08:00:00'),
      (2,10,'Mancal lado acionamento','Graxa de Lítio EP2',150,'g',7,'Engraxar',1,'ROSCAS','Rota 02 - Roscas, Tolvas e Transporte',3001,1,'MANUAL_PCM','2026-09-27 09:00:00','2026-10-04 09:00:00'),
      (3,10,'Mancal traseiro da rosca','Graxa de Lítio EP2',150,'g',7,'Engraxar',1,'ROSCAS','Rota 02 - Roscas, Tolvas e Transporte',3002,1,'ROTEIRO_BASE_V1',NULL,'2026-10-04 09:00:00'),
      (4,10,'Redutor / motorredutor da rosca - verificar nível e condição do óleo','Lubrax Gear 680 - Óleo para Engrenagens/Redutores - ISO VG 680',NULL,NULL,7,'Verificar / completar nível',1,'ROSCAS','Rota 02 - Roscas, Tolvas e Transporte',3003,1,'ROTEIRO_BASE_V1',NULL,'2026-10-04 09:00:00'),
      (5,10,'Redutor / motorredutor da rosca - verificar nível e condição do óleo','Lubrax Gear 680 - Óleo para Engrenagens/Redutores - ISO VG 680',NULL,NULL,7,'Verificar / completar nível',1,'ROSCAS','Rota 02 - Roscas, Tolvas e Transporte',3003,1,'MANUAL_PCM',NULL,'2026-10-04 09:00:00');

    INSERT INTO pcm_lubrificacao_execucoes(plano_id,equipamento_id,executor_user_id,executed_at,created_at)
      VALUES (1,10,1,'2026-09-20 08:00:00','2026-09-20 08:00:00'),
             (2,10,1,'2026-09-27 09:00:00','2026-09-27 09:00:00');
  `);
  return db;
}

test('migration 212 deixa um único ponto ativo por posição física equivalente', () => {
  const db = dbBase();
  require('../database/migrations/212_lubrificacao_consolidar_duplicidades_v8')(helpers(db));

  const active = db.prepare(`
    SELECT * FROM pcm_lubrificacao_planos
    WHERE equipamento_id=10 AND ativo=1
    ORDER BY id
  `).all();

  assert.equal(active.length, 3);
  assert.equal(active.filter((r) => /mancal dianteiro|acionamento/i.test(r.ponto_lubrificacao)).length, 1);
  assert.equal(active.filter((r) => /mancal traseiro|oposto/i.test(r.ponto_lubrificacao)).length, 1);
  assert.equal(active.filter((r) => /redutor|motorredutor/i.test(r.ponto_lubrificacao)).length, 1);

  const disabled = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE ativo=0 ORDER BY id").all();
  assert.equal(disabled.length, 2);
  assert.ok(disabled.every((r) => /Consolidação V8/.test(String(r.observacao || ''))));

  const front = active.find((r) => /mancal dianteiro/i.test(r.ponto_lubrificacao));
  const execs = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_execucoes WHERE plano_id=?").get(front.id);
  assert.equal(Number(execs.total), 2);
  assert.equal(front.ultima_execucao_em, '2026-09-27 09:00:00');

  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_pcm_lubrificacao_ponto_ativo_exato'").get();
  assert.ok(idx);

  db.close();
});

test('cadastro manual bloqueia ponto equivalente já ativo', () => {
  const service = read('modules/pcm/pcm.service.js');
  assert.match(service, /findEquivalentActiveLubrificacao/);
  assert.match(service, /Já existe um ponto ativo equivalente neste equipamento/);
  assert.match(service, /lubricationCatalog\.equivalentPoint/);
});

test('tela do PCM exibe uma linha por equipamento e agrupa os pontos internamente', () => {
  const controller = read('modules/pcm/pcm.controller.js');
  const service = read('modules/pcm/pcm.service.js');
  const view = read('views/pcm/lubrificacao.ejs');

  assert.match(controller, /equipamentosLubrificacao:\s*service\.agruparLubrificacaoPorEquipamento/);
  assert.match(service, /function agruparLubrificacaoPorEquipamento/);
  assert.match(view, /Cada equipamento aparece uma única vez/);
  assert.match(view, /equipamentosLubrificacao\.forEach/);
  assert.match(view, /Gerenciar <%= g\.total_pontos %> ponto\(s\)/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('classificador específico continua distinguindo FAST, Juliano e esterilizador', () => {
  const catalogo = require('../modules/lubrificacao/lubrificacao.catalogo.v1');
  assert.equal(catalogo.classificarEquipamento({ nome:'Triturador FAST', tipo:'Triturador' }).familia, 'TRITURADOR_FAST');
  assert.equal(catalogo.classificarEquipamento({ nome:'Triturador Juliano', tipo:'Triturador' }).familia, 'TRITURADOR_JULIANO');
  assert.equal(catalogo.classificarEquipamento({ nome:'ESTERELIZADOR', setor:'Digestores' }).familia, 'ESTERILIZADORES');
  assert.equal(catalogo.classificarEquipamento({ nome:'BOMBA PRENSA P50 JULIAN', setor:'Prensas' }).familia, 'BOMBAS');
});
