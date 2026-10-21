const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.join(__dirname, '..');
const gestor = { id: 91, role: 'ENCARREGADO_MANUTENCAO' };
const dadosServico = { colaborador_id: 1, descricao_servico: 'Manutenção do transportador' };
const migrateInicioFixo = require('../database/migrations/228_escala_hora_extra_inicio_fixo_17h');

function applyMigration(sqlite) {
  migrateInicioFixo({
    tableExists: name => Boolean(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)),
    addColumnIfMissing(table, column, definition) {
      if (!sqlite.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)) {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
      }
    },
  });
}

function loadModule(relativePath, overrides = {}, globals = {}) {
  const filename = path.join(root, relativePath);
  const realRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    require: request => Object.hasOwn(overrides, request) ? overrides[request] : realRequire(request),
    console,
    __dirname: path.dirname(filename),
    __filename: filename,
    ...globals,
  }, { filename });
  return module.exports;
}

// The application database is replaced with an isolated SQLite instance. Only
// the database clock is substituted, keeping overlap queries and constraints real.
function fixture(t, agora = '2026-10-21T20:31:00.000Z') {
  let clock = new Date(agora);
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.getTime()])); }
    static now() { return clock.getTime(); }
  }
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const db = {
    prepare(sql) {
      const timestamp = clock.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
      const statement = sqlite.prepare(sql.replace(/datetime\(\s*'now'\s*\)/gi, `'${timestamp}'`));
      statement.setAllowUnknownNamedParameters(true);
      return statement;
    },
    exec: sql => sqlite.exec(sql),
    transaction: callback => (...args) => {
      sqlite.exec('BEGIN');
      try { const result = callback(...args); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  sqlite.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE colaboradores (
      id INTEGER PRIMARY KEY, nome TEXT, funcao TEXT, cargo TEXT,
      user_id INTEGER, ativo INTEGER DEFAULT 1, status TEXT DEFAULT 'ATIVO'
    );
    CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, nome TEXT, setor TEXT);
    CREATE TABLE os (id INTEGER PRIMARY KEY, equipamento_id INTEGER, equipamento TEXT, descricao TEXT, status TEXT);
    INSERT INTO users (id, name, role) VALUES (91, 'Responsável', 'ENCARREGADO_MANUTENCAO'), (12, 'Mecânico', 'MECANICO');
    INSERT INTO colaboradores (id, nome, funcao, user_id) VALUES (1, 'Mecânico A', 'MECANICO', 12), (2, 'Mecânico B', 'MECANICO', NULL);
    INSERT INTO equipamentos (id, nome) VALUES (7, 'Transportador');
    INSERT INTO os (id, equipamento_id, equipamento, descricao, status) VALUES (145, 7, 'Transportador', 'Trocar rolamento', 'ABERTA');
  `);
  sqlite.exec(fs.readFileSync(path.join(root, 'database/migrations/163_escala_banco_horas_manutencao.sql'), 'utf8'));
  applyMigration(sqlite);
  const turno = require('../utils/turno-operacional');
  const service = loadModule('modules/escala/escala.service.js', {
    '../../database/db': db,
    '../../utils/turno-operacional': {
      ...turno,
      getAgoraSaoPauloParts: (date = new ClockDate()) => turno.getAgoraSaoPauloParts(date),
      getTurnoOperacionalAgora: (date = new ClockDate()) => turno.getTurnoOperacionalAgora(date),
    },
  }, { Date: ClockDate });
  return {
    db,
    sqlite,
    service,
    setClock: value => { clock = new Date(value); },
    row: id => sqlite.prepare('SELECT * FROM escala_horas_extras WHERE id=?').get(id),
    count: () => sqlite.prepare('SELECT COUNT(*) AS total FROM escala_horas_extras').get().total,
    insert({ colaborador_id = 1, inicio_extra, fim_extra = null, status = 'PENDENTE_APROVACAO' }) {
      return sqlite.prepare(`INSERT INTO escala_horas_extras
        (colaborador_id, data_servico, inicio_extra, fim_extra, status, descricao_servico)
        VALUES (?, ?, ?, ?, ?, 'Registro anterior')`)
        .run(colaborador_id, inicio_extra.slice(0, 10), inicio_extra, fim_extra, status).lastInsertRowid;
    },
  };
}

function instant(value) {
  return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`).toISOString();
}

test('abertura às 17h31 registra início às 17h, autor e instante real de criação', t => {
  const f = fixture(t);
  const id = f.service.iniciarHoraExtraDesde17({ ...dadosServico, os_id: 145 }, gestor);
  const row = f.row(id);
  assert.equal(row.inicio_extra, '2026-10-21T20:00:00.000Z');
  assert.equal(row.data_servico, '2026-10-21');
  assert.equal(row.inicio_fixo_17h, 1);
  assert.equal(row.user_id, gestor.id);
  assert.equal(instant(row.criado_em), '2026-10-21T20:31:00.000Z');
  assert.equal(row.os_id, 145);
  assert.equal(row.equipamento_id, 7);
  assert.equal(row.status, 'EM_ANDAMENTO');
});

test('data de serviço segue Brasília quando a data UTC já avançou', t => {
  const f = fixture(t, '2026-10-22T01:31:00.000Z');
  const row = f.row(f.service.iniciarHoraExtraDesde17(dadosServico, gestor));
  assert.equal(row.data_servico, '2026-10-21');
  assert.equal(row.inicio_extra, '2026-10-21T20:00:00.000Z');
});

test('campos forjados no formulário não escolhem início, data, criação ou autor', t => {
  const f = fixture(t);
  const row = f.row(f.service.iniciarHoraExtraDesde17({
    ...dadosServico,
    inicio_extra: '2026-01-01T00:00:00.000Z',
    data_servico: '2026-01-01',
    criado_em: '2026-01-01T00:00:00.000Z',
    user_id: 12,
    inicio_fixo_17h: 0,
  }, gestor));
  assert.equal(row.inicio_extra, '2026-10-21T20:00:00.000Z');
  assert.equal(row.data_servico, '2026-10-21');
  assert.equal(instant(row.criado_em), '2026-10-21T20:31:00.000Z');
  assert.equal(row.user_id, 91);
  assert.equal(row.inicio_fixo_17h, 1);
});

test('abertura antecipada aguarda 17h e fechamento usa o relógio real', t => {
  const f = fixture(t, '2026-10-21T18:00:00.000Z');
  const id = f.service.iniciarHoraExtraDesde17(dadosServico, gestor);
  assert.equal(f.row(id).inicio_extra, '2026-10-21T20:00:00.000Z');
  assert.throws(() => f.service.finalizarHoraExtra(id, {}), /17|maior que zero|início/i);
  assert.equal(f.row(id).status, 'EM_ANDAMENTO');
  assert.equal(f.row(id).fim_extra, null);
  f.setClock('2026-10-21T21:31:00.000Z');
  f.service.finalizarHoraExtra(id, { fim_extra: '2026-10-22T01:00:00.000Z', total_minutos: 999 });
  assert.equal(f.row(id).fim_extra, '2026-10-21T21:31:00.000Z');
  assert.equal(f.row(id).total_minutos, 91);
  assert.equal(f.row(id).status, 'PENDENTE_APROVACAO');
});

test('fechamento depois da meia-noite mantém a data e o início originais', t => {
  const f = fixture(t);
  const id = f.service.iniciarHoraExtraDesde17(dadosServico, gestor);
  f.setClock('2026-10-22T03:30:00.000Z');
  f.service.finalizarHoraExtra(id, {});
  assert.equal(f.row(id).data_servico, '2026-10-21');
  assert.equal(f.row(id).inicio_extra, '2026-10-21T20:00:00.000Z');
  assert.equal(f.row(id).fim_extra, '2026-10-22T03:30:00.000Z');
  assert.equal(f.row(id).total_minutos, 450);
});

test('somente administrador e lideranças de manutenção autorizam início fixo', t => {
  const f = fixture(t);
  for (const role of [
    'ADMIN', 'ENCARREGADO_MANUTENCAO', 'SUPERVISOR_MANUTENCAO', 'MANUTENCAO_SUPERVISOR',
    'Administrador', 'Encarregado de Manutenção', 'ENCARREGADO',
  ]) assert.equal(f.service.canIniciarHoraExtraDesde17({ role }), true, role);
  for (const role of ['MECANICO', 'RH', 'DIRETORIA', 'PRODUCAO', 'MANUTENCAO', 'COLABORADOR', '']) {
    assert.equal(f.service.canIniciarHoraExtraDesde17({ role }), false, role);
    assert.throws(() => f.service.iniciarHoraExtraDesde17(dadosServico, { id: 12, role }), /permiss|autoriz|apenas/i, role);
  }
  assert.equal(f.service.canIniciarHoraExtraDesde17({ role: 'MECANICO', cargo: 'Supervisor de Manutenção' }), false);
  assert.equal(f.count(), 0);
});

test('registro ativo bloqueia apenas o colaborador, preservando vários mecânicos na mesma OS', t => {
  const f = fixture(t);
  f.service.iniciarHoraExtraDesde17({ ...dadosServico, os_id: 145 }, gestor);
  assert.throws(() => f.service.iniciarHoraExtraDesde17(dadosServico, gestor), /em andamento/i);
  f.service.iniciarHoraExtraDesde17({ ...dadosServico, colaborador_id: 2, os_id: 145 }, gestor);
  assert.equal(f.count(), 2);
});

for (const status of ['PENDENTE_APROVACAO', 'APROVADO', 'COMPENSADO']) {
  test(`intervalo ${status} que invade o período desde 17h impede contagem duplicada`, t => {
    const f = fixture(t);
    f.insert({ inicio_extra: '2026-10-21T19:30:00.000Z', fim_extra: '2026-10-21T20:15:00.000Z', status });
    assert.throws(() => f.service.iniciarHoraExtraDesde17(dadosServico, gestor), /sobrepo|conflit|registr|duplic|17/i);
    assert.equal(f.count(), 1);
  });
}

test('registro finalizado posterior ao lançamento antecipado também bloqueia sobreposição', t => {
  const f = fixture(t, '2026-10-21T18:00:00.000Z');
  f.insert({ inicio_extra: '2026-10-21T21:00:00.000Z', fim_extra: '2026-10-21T21:30:00.000Z' });
  assert.throws(() => f.service.iniciarHoraExtraDesde17(dadosServico, gestor), /sobrepo|conflit|registr|duplic|17/i);
  assert.equal(f.count(), 1);
});

test('cancelamentos, reprovações e intervalos encerrados às 17h não bloqueiam', t => {
  const f = fixture(t);
  f.insert({ inicio_extra: '2026-10-21T19:00:00.000Z', fim_extra: '2026-10-21T20:00:00.000Z' });
  f.insert({ inicio_extra: '2026-10-21T20:00:00.000Z', fim_extra: '2026-10-21T20:15:00.000Z', status: 'CANCELADO' });
  f.insert({ inicio_extra: '2026-10-21T20:00:00.000Z', fim_extra: '2026-10-21T20:15:00.000Z', status: 'REPROVADO' });
  const id = f.service.iniciarHoraExtraDesde17(dadosServico, gestor);
  assert.equal(f.row(id).status, 'EM_ANDAMENTO');
  assert.equal(f.count(), 4);
});

test('validações de colaborador e serviço continuam obrigatórias', t => {
  const f = fixture(t);
  assert.throws(() => f.service.iniciarHoraExtraDesde17({ descricao_servico: 'Serviço' }, gestor), /Colaborador|mecânico/i);
  assert.throws(() => f.service.iniciarHoraExtraDesde17({ colaborador_id: 1 }, gestor), /OS|descreva/i);
  assert.throws(() => f.service.iniciarHoraExtraDesde17({ colaborador_id: 1, os_id: 999 }, gestor), /OS/i);
  assert.equal(f.count(), 0);
});

test('lançamento comum conserva início no instante real mesmo com flag forjada', t => {
  const f = fixture(t);
  const id = f.service.iniciarHoraExtra({ ...dadosServico, user_id: 12, inicio_fixo_17h: 1, inicio_extra: '2026-10-21T20:00:00.000Z' });
  assert.equal(f.row(id).inicio_extra, '2026-10-21T20:31:00.000Z');
  assert.equal(f.row(id).inicio_fixo_17h, 0);
});

test('liderança autenticada e mecânico ativo são conferidos também no serviço', t => {
  const f = fixture(t);
  assert.throws(() => f.service.iniciarHoraExtraDesde17(dadosServico, { role: 'ADMIN' }), /autenticado|responsável/i);
  assert.throws(() => f.service.iniciarHoraExtraDesde17({ ...dadosServico, colaborador_id: 999 }, gestor), /mecânico/i);
  f.sqlite.exec("UPDATE colaboradores SET ativo=0 WHERE id=1; UPDATE colaboradores SET funcao='PRODUCAO' WHERE id=2");
  for (const colaborador_id of [1, 2]) {
    assert.throws(() => f.service.iniciarHoraExtraDesde17({ ...dadosServico, colaborador_id }, gestor), /mecânico/i);
  }
  assert.equal(f.count(), 0);
});

test('migration é idempotente e preserva os lançamentos legados', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    // An empty database must not get a partial, parallel overtime table.
    applyMigration(sqlite);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table'").get().total, 0);
    sqlite.exec(`CREATE TABLE escala_horas_extras (id INTEGER PRIMARY KEY, user_id INTEGER, inicio_extra TEXT);
      INSERT INTO escala_horas_extras VALUES (37, 12, '2026-10-20T21:03:00.000Z')`);
    applyMigration(sqlite);
    applyMigration(sqlite);
    const row = sqlite.prepare('SELECT * FROM escala_horas_extras WHERE id=37').get();
    assert.equal(row.user_id, 12);
    assert.equal(row.inicio_extra, '2026-10-20T21:03:00.000Z');
    assert.equal(row.inicio_fixo_17h, 0);
    assert.throws(() => sqlite.exec('UPDATE escala_horas_extras SET inicio_fixo_17h=2'), /CHECK/);
    assert.throws(() => sqlite.exec('UPDATE escala_horas_extras SET inicio_fixo_17h=NULL'), /NOT NULL/);
  } finally { sqlite.close(); }
});

function loadController(service) {
  return loadModule('modules/escala/escala.controller.js', {
    './escala.service': service,
    './escala.pdf': {},
    '../preventivas/preventivas.service': {},
  });
}

function response() {
  return {
    locals: {},
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
    render(view, data) { this.view = view; this.data = data; return this; },
    redirect(url) { this.redirected = url; return this; },
  };
}

function request(user = gestor, body = {}) {
  const messages = [];
  return { session: { user }, body, query: {}, accepts: () => false, flash: (type, message) => messages.push({ type, message }), messages };
}

test('controller abre tela da gestão e formulário distinto sem alterar a tela comum', t => {
  const f = fixture(t);
  const controller = loadController(f.service);
  const req = request();
  req.query.colaborador_id = '2';
  const res = response();
  controller.horaExtraDesde17(req, res, assert.ifError);
  assert.equal(res.view, 'escala/hora-extra-nova');
  assert.equal(res.data.modoInicioFixo17, true);
  assert.equal(res.data.podeInicioFixo17, true);
  assert.equal(res.data.colaborador.id, 2);
  assert.equal(res.data.colaboradores.length, 2);
  const normal = response();
  controller.horaExtraNova(request(), normal, assert.ifError);
  assert.equal(normal.data.modoInicioFixo17, false);
});

test('controller usa o funcionário selecionado e conserva autoria da sessão', t => {
  const f = fixture(t);
  const controller = loadController(f.service);
  const req = request(gestor, { ...dadosServico, colaborador_id: '2', user_id: 12 });
  const res = response();
  controller.iniciarHoraExtraDesde17(req, res);
  assert.equal(f.count(), 1);
  assert.equal(f.row(1).colaborador_id, 2);
  assert.equal(f.row(1).user_id, gestor.id);
  assert.equal(res.redirected, '/escala/hora-extra/desde-17?colaborador_id=2');
  assert.equal(req.messages[0].type, 'success');
});

test('controller rejeita perfil sem acesso e seleção inválida sem lançar para outro funcionário', t => {
  const f = fixture(t);
  const controller = loadController(f.service);
  for (const role of ['MECANICO', 'RH', 'DIRETORIA', 'MANUTENCAO']) {
    for (const handler of ['horaExtraDesde17', 'iniciarHoraExtraDesde17']) {
      const res = response();
      controller[handler](request({ id: 12, role }, dadosServico), res, assert.ifError);
      assert.equal(res.statusCode, 403, `${handler}: ${role}`);
    }
  }
  const req = request(gestor, { ...dadosServico, colaborador_id: '999' });
  const res = response();
  controller.iniciarHoraExtraDesde17(req, res);
  assert.equal(req.messages[0].type, 'error');
  assert.equal(f.count(), 0);
});

for (const role of ['ADMINISTRADOR', 'ENCARREGADO', 'ENCARREGADO_DE_MANUTENCAO']) {
  test(`alias ${role} abre e finaliza início fixo para o funcionário selecionado`, t => {
    const f = fixture(t);
    const controller = loadController(f.service);
    const user = { id: 91, role };
    const abertura = response();
    controller.iniciarHoraExtraDesde17(request(user, { ...dadosServico, colaborador_id: 2 }), abertura);
    assert.equal(f.count(), 1);
    assert.equal(f.row(1).colaborador_id, 2);
    f.setClock('2026-10-21T22:00:00.000Z');
    const req = request(user);
    req.params = { id: '1' };
    const fechamento = response();
    controller.finalizarHoraExtra(req, fechamento, assert.ifError);
    assert.equal(f.row(1).status, 'PENDENTE_APROVACAO');
    assert.equal(f.row(1).total_minutos, 120);
    assert.equal(fechamento.redirected, '/escala/hora-extra/desde-17?colaborador_id=2');
    assert.equal(req.messages[0].type, 'success');
  });
}

test('mecânico não finaliza início fixo de outro funcionário', t => {
  const f = fixture(t);
  const id = f.service.iniciarHoraExtraDesde17({ ...dadosServico, colaborador_id: 2 }, gestor);
  const controller = loadController(f.service);
  const req = request({ id: 12, role: 'MECANICO' });
  req.params = { id: String(id) };
  controller.finalizarHoraExtra(req, response(), assert.ifError);
  assert.equal(f.row(id).status, 'EM_ANDAMENTO');
  assert.equal(f.row(id).fim_extra, null);
  assert.equal(req.messages[0].type, 'error');
  assert.match(req.messages[0].message, /permissão/i);
});

test('aprovação credita no banco do colaborador o período inteiro desde 17h', t => {
  const f = fixture(t);
  const id = f.service.iniciarHoraExtraDesde17(dadosServico, gestor);
  f.setClock('2026-10-21T21:31:00.000Z');
  f.service.finalizarHoraExtra(id, {});
  f.service.aprovarHoraExtra(id, gestor, 'Serviço concluído');
  const movement = f.sqlite.prepare('SELECT * FROM escala_banco_horas_movimentos WHERE hora_extra_id=?').get(id);
  assert.equal(movement.colaborador_id, 1);
  assert.equal(movement.minutos, 91);
  assert.equal(movement.tipo, 'CREDITO_HORA_EXTRA');
  assert.equal(f.row(id).status, 'APROVADO');
});

function loadRoutes(service) {
  const routes = [];
  const router = {
    get: (url, ...handlers) => routes.push({ method: 'GET', url, handlers }),
    post: (url, ...handlers) => routes.push({ method: 'POST', url, handlers }),
  };
  const requireLogin = (req, res, next) => req.session?.user?.id ? next() : res.status(401).send('Login');
  const multer = () => ({ single: () => (req, _res, next) => { req.uploadProcessed = true; next(); } });
  multer.diskStorage = value => value;
  loadModule('modules/escala/escala.routes.js', {
    express: { Router: () => router },
    multer,
    'node:fs': { ...fs, mkdirSync() {} },
    '../auth/auth.middleware': { requireLogin, requireRole: () => (_req, _res, next) => next(), requireAdmin: (_req, _res, next) => next() },
    '../../config/storage': { UPLOAD_DIR: path.join(root, 'work', 'unused-test-upload') },
    './escala.service': service,
    './escala.controller': new Proxy({}, { get: (_target, name) => req => { req.handledBy = name; } }),
    './escala.weekly-pdf.controller': {},
    './escala.self.controller': {},
    './escala.folga.controller': {},
  });
  return { routes, requireLogin };
}

test('GET e POST novos exigem autenticação e gestão antes de processar upload', t => {
  const f = fixture(t);
  const { routes, requireLogin } = loadRoutes(f.service);
  for (const [method, url, handler] of [
    ['GET', '/hora-extra/desde-17', 'horaExtraDesde17'],
    ['POST', '/hora-extra/desde-17/iniciar', 'iniciarHoraExtraDesde17'],
  ]) {
    const route = routes.find(item => item.method === method && item.url === url);
    assert.ok(route, `${method} ${url}`);
    assert.equal(route.handlers[0], requireLogin);
    for (const role of ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'SUPERVISOR_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'MECANICO', 'RH', 'DIRETORIA', 'MANUTENCAO', null]) {
      const req = request(role ? { id: 12, role } : null);
      const res = response();
      let cursor = 0;
      const next = error => { assert.ifError(error); route.handlers[cursor++]?.(req, res, next); };
      next();
      const permitted = role && f.service.canIniciarHoraExtraDesde17({ role });
      if (permitted) assert.equal(req.handledBy, handler, `${method}: ${role}`);
      else {
        assert.equal(res.statusCode, role ? 403 : 401, `${method}: ${role}`);
        assert.equal(req.handledBy, undefined);
        assert.equal(req.uploadProcessed, undefined);
      }
    }
  }
});

test('rota de finalização aceita os aliases autorizados a abrir o lançamento', t => {
  const f = fixture(t);
  const { routes } = loadRoutes(f.service);
  const route = routes.find(item => item.method === 'POST' && item.url === '/hora-extra/:id/finalizar');
  assert.ok(route);
  for (const role of ['ADMINISTRADOR', 'ENCARREGADO', 'ENCARREGADO_DE_MANUTENCAO']) {
    const req = request({ id: 91, role });
    const res = response();
    let cursor = 0;
    const next = error => { assert.ifError(error); route.handlers[cursor++]?.(req, res, next); };
    next();
    assert.equal(req.handledBy, 'finalizarHoraExtra', role);
  }
});

test('EJS renderiza início fixo, formulário correto e histórico do lançamento real', t => {
  const f = fixture(t);
  const controller = loadController(f.service);
  const res = response();
  controller.horaExtraDesde17(request(), res, assert.ifError);
  const ejs = require('ejs');
  const view = fs.readFileSync(path.join(root, 'views/escala/hora-extra-nova.ejs'), 'utf8');
  const render = data => ejs.render(view, { layout: () => '', dateBr: require('../utils/data-hora-br'), ...data });
  const html = render(res.data);
  assert.match(html, /action="\/escala\/hora-extra\/desde-17\/iniciar"/);
  assert.match(html, /Início fixo às 17h de hoje/);
  assert.doesNotMatch(html, /name="(?:inicio_extra|data_servico|criado_em|user_id)"/);
  f.service.iniciarHoraExtraDesde17(dadosServico, gestor);
  const andamento = response();
  controller.horaExtraDesde17(request(), andamento, assert.ifError);
  const activeHtml = render(andamento.data);
  assert.match(activeHtml, /data-start="2026-10-21T20:00:00.000Z"/);
  assert.match(activeHtml, /21\/10\/2026 17:31/);
  assert.match(activeHtml, /Responsável/);
  assert.match(activeHtml, /action="\/escala\/hora-extra\/1\/finalizar"/);
  assert.match(activeHtml, /Antes das 17h, o contador fica em zero/);
  const comum = response();
  controller.horaExtraNova(request({ id: 12, role: 'MECANICO' }), comum, assert.ifError);
  assert.doesNotMatch(render(comum.data), /href="\/escala\/hora-extra\/desde-17"/);
});
