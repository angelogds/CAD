const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const service = readFileSync('modules/escala/escala.service.js', 'utf8');
const controller = readFileSync('modules/escala/escala.controller.js', 'utf8');
const routes = readFileSync('modules/escala/escala.routes.js', 'utf8');
const rbac = readFileSync('config/rbac.js', 'utf8');
const migration = readFileSync('database/migrations/164_horas_extras_multi_colaborador_por_os.js', 'utf8');
const horaExtraView = readFileSync('views/escala/hora-extra-nova.ejs', 'utf8');
const osView = readFileSync('views/os/show.ejs', 'utf8');
const routes = readFileSync('modules/escala/escala.routes.js', 'utf8');

test('bloqueio de hora extra ativa é por colaborador, não por OS', () => {
  assert.match(service, /SELECT \* FROM escala_horas_extras WHERE colaborador_id=\? AND status='EM_ANDAMENTO' LIMIT 1/);
  assert.doesNotMatch(service, /WHERE\s+os_id=\?\s+AND\s+status='EM_ANDAMENTO'[^;]*throw/s);
  assert.match(service, /Você já possui uma hora extra em andamento/);
});

test('lançamento aceita OS opcional desde que exista descrição', () => {
  assert.match(service, /const osId = Number\(dados\.os_id \|\| 0\) \|\| null/);
  assert.match(service, /if \(!osId && !descricao\) throw new Error\('Informe uma OS ou descreva o serviço realizado\.'\)/);
  assert.doesNotMatch(service, /Sem OS vinculada, informe uma descrição do serviço com pelo menos 10 caracteres/);
});

test('permissão e rotas deixam MECANICO acessar o painel de hora extra', () => {
  assert.match(rbac, /escala:\s*\[[^\]]*ROLE\.MECANICO[^\]]*\]/s);
  assert.match(routes, /router\.get\("\/hora-extra\/nova", requireLogin, requireRole\(escalaRead\)/);
  assert.match(routes, /router\.post\("\/hora-extra\/iniciar", requireLogin, requireRole\(escalaRead\)/);
  assert.match(controller, /if \(!service\.isMecanicoUser\(user\)\) return \[\]/);
});

test('migration remove índice único exclusivo por OS e mantém unicidade por colaborador ativo', () => {
  assert.match(migration, /DROP INDEX IF EXISTS/);
  assert.match(migration, /os_id', 'ordem_servico_id'/);
  assert.match(migration, /ON escala_horas_extras\(colaborador_id\)\s+WHERE status = 'EM_ANDAMENTO'/);
});

test('banco permite vários mecânicos ativos na mesma OS e bloqueia só duplicidade do colaborador', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'hora-extra-os-'));
  const dbFile = path.join(tmp, 'test.db');
  try {
    execFileSync('sqlite3', [dbFile], { input: `
      CREATE TABLE escala_horas_extras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        colaborador_id INTEGER NOT NULL,
        os_id INTEGER,
        status TEXT NOT NULL
      );
      CREATE INDEX idx_escala_horas_extras_os_colaborador_status
        ON escala_horas_extras(os_id, colaborador_id, status);
      CREATE UNIQUE INDEX uidx_escala_horas_extras_aberta_colaborador
        ON escala_horas_extras(colaborador_id)
        WHERE status = 'EM_ANDAMENTO';
      INSERT INTO escala_horas_extras (colaborador_id, os_id, status) VALUES (1, 145, 'EM_ANDAMENTO');
      INSERT INTO escala_horas_extras (colaborador_id, os_id, status) VALUES (2, 145, 'EM_ANDAMENTO');
      INSERT INTO escala_horas_extras (colaborador_id, os_id, status) VALUES (3, 145, 'EM_ANDAMENTO');
      INSERT INTO escala_horas_extras (colaborador_id, os_id, status) VALUES (4, 145, 'EM_ANDAMENTO');
    ` });
    const total = execFileSync('sqlite3', [dbFile, "SELECT COUNT(*) FROM escala_horas_extras WHERE os_id=145 AND status='EM_ANDAMENTO';"], { encoding: 'utf8' }).trim();
    assert.equal(total, '4');
    assert.throws(() => execFileSync('sqlite3', [dbFile], { input: "INSERT INTO escala_horas_extras (colaborador_id, os_id, status) VALUES (1, 146, 'EM_ANDAMENTO');", stdio: ['pipe', 'pipe', 'pipe'] }), /UNIQUE/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('telas exibem contador individual e totais separados por colaborador na OS', () => {
  assert.match(controller, /listarHorasExtrasEmAndamentoPorOs\(osSelecionadaId\)/);
  assert.match(horaExtraView, /js-extra-clock/);
  assert.match(horaExtraView, /não bloqueia outros mecânicos/);
  assert.match(osView, /Total geral da OS/);
  assert.match(osView, /Total por colaborador/);
});


test('rotas do painel de hora extra aceitam perfil/cargo/função de mecânico', () => {
  assert.match(routes, /function requireHoraExtraAccess/);
  assert.match(routes, /user\.funcao, user\.cargo, user\.perfil/);
  assert.match(routes, /role === ROLE\.ADMIN \|\| isMecanicoProfile\(user\)/);
  assert.doesNotMatch(routes, /hora-extra\/nova", requireLogin, requireRole\(escalaRead\)/);
});
