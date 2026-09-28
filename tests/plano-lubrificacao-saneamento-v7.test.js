const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const ejs = require('ejs');
const catalogo = require('../modules/lubrificacao/lubrificacao.catalogo.v1');

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

    INSERT INTO users(id,name,role) VALUES (1,'Mecânico Teste','MECANICO');
    INSERT INTO equipamentos(id,codigo,nome,setor,tipo) VALUES
      (1,'RS-DG','ROSCA ALIMENTACAO DIGESTORES','Área Suja',''),
      (2,'TL-PR','TOLVA DAS PRENSAS','Área Suja',''),
      (3,'BP-50','BOMBA PRENSA P50 JULIAN','Área Limpa',''),
      (4,'ES-01','ESTERELIZADOR','Área Suja - Digestores',''),
      (5,'TC-01','TACHO DA PRENSA FAST','Área Suja',''),
      (6,'EX-01','EXAUSTOR CALDEIRA 1','Casa da Caldeira','Exaustor'),
      (7,'DC-01','DECANTER FAST','Área Limpa','Decanter');
  `);
  const h = helpers(db);
  require('../database/migrations/205_roteiro_lubrificacao_base')(h);
  require('../database/migrations/206_lubrificacao_regras_reais_v4')(h);
  require('../database/migrations/207_validar_lubrificacao_geral_v5')(h);
  return { db, h };
}

test('classificador V7 não deixa contexto do setor/nome vencer a identidade do equipamento', () => {
  assert.equal(catalogo.classificarEquipamento({ nome:'ROSCA ALIMENTACAO DIGESTORES', setor:'Área Suja' }).familia, 'ROSCAS');
  assert.equal(catalogo.classificarEquipamento({ nome:'TOLVA DAS PRENSAS', setor:'Prensas' }).familia, 'TOLVAS');
  assert.equal(catalogo.classificarEquipamento({ nome:'BOMBA PRENSA P50 JULIAN', setor:'Prensas' }).familia, 'BOMBAS');
  assert.equal(catalogo.classificarEquipamento({ nome:'ESTERELIZADOR', setor:'Digestores' }).familia, 'ESTERILIZADORES');
  assert.equal(catalogo.classificarEquipamento({ nome:'TACHO DA PRENSA FAST', setor:'Prensas' }).familia, 'TACHOS');
});

test('áreas operacionais reutilizam o Setor/Área do cadastro sem nova tabela', () => {
  assert.deepEqual(catalogo.classificarAreaOperacional({ setor:'Área Limpa' }), { codigo:'AREA_LIMPA', label:'Área Limpa' });
  assert.deepEqual(catalogo.classificarAreaOperacional({ setor:'Área Suja - Digestores' }), { codigo:'AREA_SUJA', label:'Área Suja' });
  assert.deepEqual(catalogo.classificarAreaOperacional({ setor:'Casa da Caldeira' }), { codigo:'CASA_CALDEIRA', label:'Casa da Caldeira' });
  assert.equal(catalogo.classificarAreaOperacional({ setor:'Moagem' }).codigo, 'OUTRAS_AREAS');
});

test('migration 211 saneia automáticos errados sem apagar histórico nem pontos manuais', () => {
  const { db, h } = buildDb();

  // Reproduz o erro visto no PDF: bomba herdando ponto/redutor de prensa.
  const wrong = db.prepare(`
    INSERT INTO pcm_lubrificacao_planos (
      equipamento_id,ponto_lubrificacao,tipo_lubrificante_texto,quantidade,unidade,
      frequencia_dias,metodo_aplicacao,ativo,familia_lubrificacao,rota_lubrificacao,
      ordem_rota,validado_tecnicamente,origem_cadastro,created_at,updated_at,dias_semana_lubrificacao
    ) VALUES (3,'Redutor principal da prensa - verificar nível e condição do óleo',
      'Lubrax Gear 680 - Óleo para Engrenagens/Redutores - ISO VG 680',NULL,NULL,7,
      'Verificar / completar nível',1,'PRENSAS','Rota 01 - Digestores e Prensas',
      2003,1,'ROTEIRO_BASE_V1',datetime('now'),datetime('now'),NULL)
  `).run();

  db.prepare(`
    INSERT INTO pcm_lubrificacao_execucoes (
      plano_id,equipamento_id,executor_user_id,executed_at,created_at
    ) VALUES (?,3,1,datetime('now'),datetime('now'))
  `).run(Number(wrong.lastInsertRowid));

  db.prepare(`
    INSERT INTO pcm_lubrificacao_planos (
      equipamento_id,ponto_lubrificacao,tipo_lubrificante_texto,frequencia_dias,
      ativo,validado_tecnicamente,origem_cadastro,created_at,updated_at
    ) VALUES (3,'Ponto manual especial','Produto manual',30,1,1,'MANUAL_PCM',datetime('now'),datetime('now'))
  `).run();

  require('../database/migrations/211_lubrificacao_saneamento_v7')(h);

  const bomba = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE equipamento_id=3 ORDER BY id").all();
  const ativosAuto = bomba.filter((r) => Number(r.ativo) === 1 && /^ROTEIRO_/i.test(String(r.origem_cadastro||'')));
  assert.equal(ativosAuto.filter((r) => /mancal/i.test(r.ponto_lubrificacao)).length, 2);
  assert.equal(ativosAuto.some((r) => /redutor/i.test(r.ponto_lubrificacao)), false);
  assert.ok(ativosAuto.every((r) => r.tipo_lubrificante_texto === 'Graxa de Lítio EP2'));

  const wrongAfter = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE id=?").get(Number(wrong.lastInsertRowid));
  assert.equal(Number(wrongAfter.ativo), 0);
  assert.match(wrongAfter.observacao, /Histórico preservado/);

  const history = db.prepare("SELECT COUNT(*) total FROM pcm_lubrificacao_execucoes WHERE plano_id=?").get(Number(wrong.lastInsertRowid));
  assert.equal(Number(history.total), 1);

  const manual = bomba.find((r) => r.origem_cadastro === 'MANUAL_PCM');
  assert.ok(manual);
  assert.equal(Number(manual.ativo), 1);
  assert.equal(manual.tipo_lubrificante_texto, 'Produto manual');

  const rosca = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE equipamento_id=1 AND COALESCE(ativo,1)=1").all();
  assert.ok(rosca.some((r) => /mancal dianteiro da rosca/i.test(r.ponto_lubrificacao)));
  assert.ok(rosca.some((r) => /mancal traseiro da rosca/i.test(r.ponto_lubrificacao)));

  const decanter = db.prepare("SELECT * FROM pcm_lubrificacao_planos WHERE equipamento_id=7 AND COALESCE(ativo,1)=1").all();
  assert.ok(decanter.filter((r) => /mancal/i.test(r.ponto_lubrificacao)).every((r) => r.tipo_lubrificante_texto === 'SKF LGWA 2'));
  assert.ok(decanter.every((r) => Number(r.validado_tecnicamente) === 0));

  db.close();
});

test('PCM V7 expõe acompanhamento protegido e atualização visual sem criar tabela nova', () => {
  const weekly = read('modules/lubrificacao/lubrificacao-semana.service.js');
  const controller = read('modules/pcm/pcm.controller.js');
  const routes = read('modules/pcm/pcm.routes.js');
  const view = read('views/pcm/lubrificacao.ejs');
  const js = read('public/js/pcm-lubrificacao-v7.js');

  assert.match(weekly, /function getAcompanhamentoPCM/);
  assert.match(weekly, /pcm_lubrificacao_execucoes/);
  assert.match(weekly, /classificarAreaOperacional/);
  assert.match(controller, /acompanhamentoLubrificacao/);
  assert.match(routes, /lubrificacao\/acompanhamento.*PCM_ACCESS/);
  assert.match(view, /Andamento do roteiro de lubrificação/);
  assert.match(view, /Última atividade registrada/);
  assert.match(view, /data-lub-walker/);
  assert.match(js, /45000/);
  assert.doesNotThrow(() => ejs.compile(view));
  assert.doesNotThrow(() => new Function(js));
});

test('PDF e tela usam somente pontos ativos por padrão e agrupam por área', () => {
  const service = read('modules/pcm/pcm.service.js');
  const controller = read('modules/pcm/pcm.controller.js');
  assert.match(service, /COALESCE\(l\.ativo,1\)=1/);
  assert.match(service, /area_operacional_label/);
  assert.match(controller, /Casa da Caldeira/);
  assert.match(controller, /area_operacional_label/);
});
