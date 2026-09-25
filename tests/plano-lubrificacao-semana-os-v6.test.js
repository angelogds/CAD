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
  const columnExists = (table, column) =>
    tableExists(table) && db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  const addColumnIfMissing = (table, column, ddl) => {
    if (tableExists(table) && !columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  return { db, tableExists, columnExists, addColumnIfMissing };
}

test('migration 208 cria semana, vínculo com OS e impede OS duplicada no mesmo equipamento/dia', () => {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT);
    CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE os (id INTEGER PRIMARY KEY, status TEXT);
    CREATE TABLE pcm_lubrificacao_execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plano_id INTEGER,
      equipamento_id INTEGER,
      executor_user_id INTEGER,
      executed_at TEXT,
      created_at TEXT
    );
    INSERT INTO users(id,name,role) VALUES (1,'Júnior','MECANICO');
    INSERT INTO equipamentos(id,nome) VALUES (10,'Moinho 1');
    INSERT INTO os(id,status) VALUES (100,'ABERTA');
  `);

  const h = helpers(db);
  require('../database/migrations/208_lubrificacao_semana_os')(h);

  assert.ok(h.tableExists('pcm_lubrificacao_semanas'));
  assert.ok(h.tableExists('pcm_lubrificacao_os_programadas'));
  assert.ok(h.columnExists('pcm_lubrificacao_execucoes','semana_id'));
  assert.ok(h.columnExists('pcm_lubrificacao_execucoes','os_id'));

  const week = db.prepare(`
    INSERT INTO pcm_lubrificacao_semanas (
      semana_inicio,semana_fim,responsavel_user_id,created_by,updated_by
    ) VALUES ('2026-09-21','2026-09-27',1,1,1)
  `).run();

  db.prepare(`
    INSERT INTO pcm_lubrificacao_os_programadas (
      semana_id,data_programada,equipamento_id,os_id,responsavel_user_id,status
    ) VALUES (?,?,?,?,?,'GERADA')
  `).run(Number(week.lastInsertRowid),'2026-09-21',10,100,1);

  assert.throws(() => {
    db.prepare(`
      INSERT INTO pcm_lubrificacao_os_programadas (
        semana_id,data_programada,equipamento_id,os_id,responsavel_user_id,status
      ) VALUES (?,?,?,?,?,'GERADA')
    `).run(Number(week.lastInsertRowid),'2026-09-21',10,100,1);
  }, /UNIQUE/);

  db.close();
});

test('serviço semanal limita OS a moinhos e exaustores de caldeira e usa origem LUBRIFICACAO', () => {
  const service = read('modules/lubrificacao/lubrificacao-semana.service.js');
  assert.match(service, /MOINHOS/);
  assert.match(service, /EXAUSTORES/);
  assert.match(service, /CALDEIRA/);
  assert.match(service, /origem:\s*'LUBRIFICACAO'/);
  assert.match(service, /createOSAutomatica/);
  assert.match(service, /UNIQUE|PROCESSANDO/);
  assert.match(service, /data_programada/);
  assert.match(service, /equipamento_id/);
});

test('responsável semanal exige mecânico ativo e reatribui apenas OS abertas da semana', () => {
  const service = read('modules/lubrificacao/lubrificacao-semana.service.js');
  assert.match(service, /UPPER\(COALESCE\(role,''\)\)='MECANICO'/);
  assert.match(service, /colaboradores/);
  assert.match(service, /responsável.*semana|responsavel.*semana/i);
  assert.match(service, /NOT IN \('FECHADA','FINALIZADA','CONCLUIDA','CONCLUÍDA','CANCELADA'\)/);
  assert.match(service, /assignResponsavelOS/);
});

test('execução pelo roteiro sincroniza andamento e fechamento da OS automática', () => {
  const weekly = read('modules/lubrificacao/lubrificacao-semana.service.js');
  const route = read('modules/lubrificacao/lubrificacao.service.js');
  const controller = read('modules/lubrificacao/lubrificacao.controller.js');

  assert.match(weekly, /sincronizarStatusOSProgramada/);
  assert.match(weekly, /updateStatus\(Number\(programada\.os_id\), 'ANDAMENTO'/);
  assert.match(weekly, /updateStatus\(Number\(programada\.os_id\), 'FECHADA'/);
  assert.match(weekly, /Lubrificação concluída pelo Roteiro de Lubrificação/);
  assert.match(route, /os_concluida/);
  assert.match(route, /sincronizarStatusOSProgramada/);
  assert.match(controller, /concluída automaticamente/);
});

test('PCM possui seleção semanal e geração manual de conferência protegidas por PCM_MANAGE', () => {
  const routes = read('modules/pcm/pcm.routes.js');
  const controller = read('modules/pcm/pcm.controller.js');
  const view = read('views/pcm/lubrificacao.ejs');

  assert.match(routes, /lubrificacao\/semana\/responsavel.*PCM_MANAGE/);
  assert.match(routes, /lubrificacao\/semana\/gerar-os-hoje.*PCM_MANAGE/);
  assert.match(controller, /salvarResponsavelSemanaLubrificacao/);
  assert.match(controller, /gerarOSLubrificacaoHoje/);
  assert.match(view, /Responsável semanal/);
  assert.match(view, /Definir responsável da semana/);
  assert.match(view, /Gerar \/ conferir OS de hoje/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('mecânico vê responsável da semana e consegue emitir relatório semanal PDF', () => {
  const routes = read('modules/lubrificacao/lubrificacao.routes.js');
  const controller = read('modules/lubrificacao/lubrificacao.controller.js');
  const view = read('views/lubrificacao/index.ejs');

  assert.match(routes, /relatorio-semanal\.pdf/);
  assert.match(controller, /Relatório Semanal de Lubrificação/);
  assert.match(controller, /OS AUTOMÁTICAS DA SEMANA/);
  assert.match(view, /Responsabilidade da semana/);
  assert.match(view, /Relatório semanal PDF/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('dashboard exibe e publica alertas da lubrificação semanal', () => {
  const controller = read('modules/dashboard/dashboard.controller.js');
  const view = read('views/dashboard/index.ejs');

  assert.match(controller, /lubrificacaoSemanaService/);
  assert.match(controller, /LUBRIFICACAO_SEM_RESPONSAVEL/);
  assert.match(controller, /LUBRIFICACAO_ATRASADA/);
  assert.match(controller, /lubrificacao:\s*lubrificacaoSemana/);
  assert.match(view, /LUBRIFICAÇÃO DA SEMANA/);
  assert.match(view, /Responsável/);
  assert.match(view, /OS hoje/);
  assert.doesNotThrow(() => ejs.compile(view));
});

test('server executa automação de lubrificação em ciclo idempotente de 15 minutos', () => {
  const server = read('server.js');
  assert.match(server, /runLubrificacaoProgramada/);
  assert.match(server, /processarOSAutomaticas/);
  assert.match(server, /15 \* 60 \* 1000/);
});

test('arquivos JavaScript da V6 têm sintaxe válida', () => {
  for (const file of [
    'database/migrations/208_lubrificacao_semana_os.js',
    'modules/lubrificacao/lubrificacao-semana.service.js',
    'modules/lubrificacao/lubrificacao.service.js',
    'modules/lubrificacao/lubrificacao.controller.js',
    'modules/pcm/pcm.controller.js',
    'modules/dashboard/dashboard.controller.js',
  ]) {
    assert.doesNotThrow(() => new Function(read(file)), file);
  }
});
