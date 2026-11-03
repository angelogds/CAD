const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Database = require('better-sqlite3');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const admin = { id: 1, role: 'ADMIN' };
const employee = { id: 2, role: 'MECANICO' };
const dateBr = { ...require('../utils/data-hora-br'), todayISO: () => '2026-11-03' };

function load(relative, overrides) {
  const filename = path.join(root, relative), realRequire = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : realRequire(name),
  }, { filename });
  return module.exports;
}

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,role TEXT);
    CREATE TABLE colaboradores(id INTEGER PRIMARY KEY,nome TEXT,funcao TEXT,user_id INTEGER,ativo INTEGER DEFAULT 1,fora_escala INTEGER DEFAULT 0);
    CREATE TABLE equipamentos(id INTEGER PRIMARY KEY);
    CREATE TABLE os(id INTEGER PRIMARY KEY);
    CREATE TABLE escala_ausencias(id INTEGER PRIMARY KEY,colaborador_id INTEGER,tipo TEXT,data_inicio TEXT,data_fim TEXT,motivo TEXT,created_at TEXT);
    INSERT INTO users VALUES(1,'Gestão','ADMIN'),(2,'Colaborador A','MECANICO'),(3,'Colaborador B','MECANICO');
    INSERT INTO colaboradores(id,nome,funcao,user_id) VALUES(1,'Colaborador A','MECANICO',2),(2,'Colaborador B','MECANICO',3);
  `);
  const migration = name => fs.readFileSync(path.join(root, 'database/migrations', name), 'utf8');
  db.exec(migration('163_escala_banco_horas_manutencao.sql'));
  const tableExists = table => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
  const columnExists = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  require('../database/migrations/168_escala_folgas_tipos_integracao')({
    db, tableExists, columnExists,
    addColumnIfMissing(table, column, ddl) { if (!columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); },
  });
  db.exec(migration('190_escala_folga_autoatendimento_timezone.sql'));
  db.exec(migration('237_escala_folga_uma_hora_excecoes.sql'));
  db.prepare("INSERT INTO escala_banco_horas_movimentos(user_id,colaborador_id,tipo,minutos,data_movimento) VALUES(2,1,'AJUSTE_CREDITO',1132,'2026-10-20'),(3,2,'AJUSTE_CREDITO',480,'2026-10-20')").run();
  const overrides = { '../../database/db': db, '../../utils/data-hora-br': dateBr };
  const escala = load('modules/escala/escala.service.js', overrides);
  const service = load('modules/escala/escala.folga-solicitacao.service.js', {
    ...overrides, './escala.service': escala,
  });
  function request({ date = '2026-10-27', minutes = 240, collaborator = 1, status = 'PENDENTE_APROVACAO' } = {}) {
    return Number(db.prepare(`INSERT INTO escala_folga_solicitacoes(user_id,colaborador_id,data_folga,minutos_solicitados,motivo,status,solicitado_em)
      VALUES(?,?,?,?,?,?, '2026-10-26 12:00:00')`).run(collaborator + 1, collaborator, date, minutes, 'Período: manhã', status).lastInsertRowid);
  }
  return { db, escala, service, request };
}

test('gestão aprova folga passada, preserva a data original e debita 4h uma única vez', t => {
  const { db, escala, service, request } = fixture(t);
  const id = request(), before = db.prepare("SELECT datetime('now') AS now").get().now;
  const folgaId = service.aprovarSolicitacao(id, admin, 'Ausência confirmada pela gestão.');
  const row = service.getSolicitacao(id), folga = db.prepare('SELECT * FROM escala_folgas_programadas WHERE id=?').get(folgaId);
  assert.equal(row.status, 'APROVADA');
  assert.equal(row.data_folga, '2026-10-27');
  assert.equal(row.solicitado_em, '2026-10-26 12:00:00');
  assert.equal(row.decidido_por, admin.id);
  assert.ok(row.decidido_em >= before);
  assert.match(row.observacao_decisao, /Aprovação posterior: folga de 27\/10\/2026 confirmada como realizada/);
  assert.match(row.observacao_decisao, /Ausência confirmada pela gestão/);
  assert.equal(folga.status, 'REALIZADA');
  assert.equal(folga.data_folga, '2026-10-27');
  assert.equal(folga.data_fim, '2026-10-27');
  assert.equal(folga.aprovado_por, admin.id);
  assert.ok(folga.realizado_em >= before);
  assert.equal(folga.saldo_antes_minutos, 1132);
  assert.equal(folga.saldo_depois_minutos, 892);
  assert.equal(escala.calcularSaldoBancoHoras(1).horas, '14h52');
  const debit = db.prepare("SELECT * FROM escala_banco_horas_movimentos WHERE tipo='DEBITO_FOLGA'").get();
  assert.equal(debit.minutos, 240);
  assert.equal(debit.folga_id, folgaId);
  assert.equal(debit.criado_por, admin.id);
  assert.equal(debit.data_movimento, db.prepare("SELECT date('now') today").get().today);
  assert.match(debit.descricao, /2026-10-27/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_ausencias').get().n, 0);
  assert.throws(() => service.aprovarSolicitacao(id, admin), /já foi analisada/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_folgas_programadas').get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM escala_banco_horas_movimentos WHERE tipo='DEBITO_FOLGA'").get().n, 1);
  assert.equal(escala.calcularSaldoBancoHoras(1).minutos, 892);
});

test('aprovação de hoje ou futura continua programada, sem anotação de aprovação posterior', t => {
  for (const date of ['2026-11-03', '2026-11-04']) {
    const { db, service, request } = fixture(t), id = request({ date, minutes: 60 });
    const folgaId = service.aprovarSolicitacao(id, admin, 'Observação original.');
    const folga = db.prepare('SELECT * FROM escala_folgas_programadas WHERE id=?').get(folgaId);
    assert.equal(folga.status, 'PROGRAMADA');
    assert.equal(folga.realizado_em, null);
    assert.equal(service.getSolicitacao(id).observacao_decisao, 'Observação original.');
  }
});

test('aprovação posterior respeita os minutos de 1h e dia inteiro e espelha apenas ausência integral', t => {
  for (const minutes of [60, 480]) {
    const { db, escala, service, request } = fixture(t), id = request({ minutes });
    service.aprovarSolicitacao(id, admin);
    assert.equal(escala.calcularSaldoBancoHoras(1).minutos, 1132 - minutes);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_ausencias').get().n, minutes === 480 ? 1 : 0);
    if (minutes === 480) assert.equal(db.prepare('SELECT data_inicio FROM escala_ausencias').get().data_inicio, '2026-10-27');
  }
});

test('aprovação posterior preserva RBAC e não libera novos pedidos retroativos do colaborador', t => {
  for (const role of ['MECANICO', 'DIRETORIA', 'RH']) {
    const { service, request, escala } = fixture(t), id = request();
    assert.throws(() => service.aprovarSolicitacao(id, { ...employee, role }), /sem permissão/);
    assert.equal(service.getSolicitacao(id).status, 'PENDENTE_APROVACAO');
    assert.equal(escala.calcularSaldoBancoHoras(1).minutos, 1132);
  }
  const { service } = fixture(t);
  assert.throws(() => service.solicitarFolga({ user: employee, data_folga: '2026-10-27', permitirDataPassada: true }), /data passada/);
  assert.throws(() => service.validarProgramacaoManual({ colaborador_id: 1, tipo_lancamento: 'FOLGA_COMPENSATORIA', data_folga: '2026-10-27' }, admin), /data passada/);
  for (const role of ['ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR']) {
    const { service, request } = fixture(t), id = request();
    service.aprovarSolicitacao(id, { id: 1, role });
    assert.equal(service.getSolicitacao(id).status, 'APROVADA');
  }
});

test('saldo atual insuficiente e segunda-feira continuam impedindo aprovação posterior', t => {
  const { db, service, request, escala } = fixture(t);
  db.prepare("UPDATE escala_banco_horas_movimentos SET minutos=180 WHERE colaborador_id=1").run();
  const id = request();
  assert.throws(() => service.aprovarSolicitacao(id, admin), /Saldo insuficiente/);
  assert.equal(service.getSolicitacao(id).status, 'PENDENTE_APROVACAO');
  assert.equal(escala.calcularSaldoBancoHoras(1).minutos, 180);
  const monday = request({ date: '2026-11-02', minutes: 60 });
  assert.throws(() => service.aprovarSolicitacao(monday, admin, '', { autorizar_excecao: true, justificativa_excecao: 'Cobertura da equipe confirmada.' }), /Segunda-feira/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_folgas_programadas').get().n, 0);
});

test('folga passada com conflito mantém autorização excepcional e impede sobreposição própria', t => {
  const { db, service, request } = fixture(t);
  const first = request({ collaborator: 2, minutes: 60 });
  service.aprovarSolicitacao(first, admin);
  const second = request();
  assert.throws(() => service.aprovarSolicitacao(second, admin), /liberação excepcional/);
  service.aprovarSolicitacao(second, admin, '', { autorizar_excecao: true, justificativa_excecao: 'Cobertura da equipe confirmada.' });
  assert.equal(service.getSolicitacao(second).excecao_autorizada_por, admin.id);
  const duplicate = request({ minutes: 60 });
  assert.throws(() => service.aprovarSolicitacao(duplicate, admin, '', { autorizar_excecao: true, justificativa_excecao: 'Cobertura da equipe confirmada.' }), /já possui folga/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM escala_banco_horas_movimentos WHERE tipo='DEBITO_FOLGA'").get().n, 2);
});

test('falha ao marcar realizada ou atualizar a decisão desfaz integralmente folga e débito', t => {
  for (const trigger of [
    "CREATE TRIGGER falha_realizacao BEFORE UPDATE OF status ON escala_folgas_programadas WHEN NEW.status='REALIZADA' BEGIN SELECT RAISE(ABORT,'Falha simulada ao registrar realização'); END",
    "CREATE TRIGGER falha_decisao BEFORE UPDATE OF status ON escala_folga_solicitacoes WHEN NEW.status='APROVADA' BEGIN SELECT RAISE(IGNORE); END",
  ]) {
    const { db, service, request, escala } = fixture(t), id = request({ minutes: 480 });
    db.exec(trigger);
    assert.throws(() => service.aprovarSolicitacao(id, admin), /Falha simulada|já foi analisada/);
    assert.equal(service.getSolicitacao(id).status, 'PENDENTE_APROVACAO');
    assert.equal(service.getSolicitacao(id).folga_id, null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_folgas_programadas').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_ausencias').get().n, 0);
    assert.equal(escala.calcularSaldoBancoHoras(1).minutos, 1132);
  }
});

test('cartão compartilhado identifica a aprovação posterior com confirmação e ação direta', () => {
  const filename = path.join(root, 'views/escala/_aprovacoes-folgas.ejs');
  const render = date => ejs.render(fs.readFileSync(filename, 'utf8'), {
    pendentesFolga: [{ id: 5, colaborador_nome: '<Pessoa>', data_folga: date, minutos_solicitados: 240, saldo_atual_minutos: 1132, saldo_previsto_minutos: 892 }],
    dateBr, canManageEscala: true,
  });
  const past = render('2026-10-27'), future = render('2026-11-04');
  assert.match(past, /Aprovação posterior/);
  assert.match(past, /Aprovar e debitar/);
  assert.match(past, /Confirmar que esta folga já foi realizada e debitar as horas/);
  assert.match(past, /27\/10\/2026/);
  assert.match(past, /14h52/);
  assert.match(past, /&lt;Pessoa&gt;/);
  assert.doesNotMatch(future, /Aprovação posterior|Aprovar e debitar/);
  assert.match(future, /Aprovar folga/);
});
