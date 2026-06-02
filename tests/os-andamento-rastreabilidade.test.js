const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function read(file) { return fs.readFileSync(file, 'utf8'); }

function sqlite(dbFile, sql) {
  return execFileSync('sqlite3', [dbFile], { input: sql, encoding: 'utf8' });
}

test('SQL migration creates history schema, indexes and all quick reasons', () => {
  const migration = read('database/migrations/155_os_andamento_justificativas.sql');
  const dbFile = path.join(os.tmpdir(), `os-andamento-${process.pid}-${Date.now()}.db`);
  try {
    sqlite(dbFile, `CREATE TABLE users(id INTEGER PRIMARY KEY); CREATE TABLE os(id INTEGER PRIMARY KEY); ${migration}`);
    const motivos = Number(sqlite(dbFile, 'SELECT COUNT(*) FROM os_andamento_motivos;').trim());
    const indexes = Number(sqlite(dbFile, "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_os_andamento_historico_%';").trim());
    const outroExigeObservacao = Number(sqlite(dbFile, "SELECT exige_observacao FROM os_andamento_motivos WHERE codigo='OUTRO';").trim());
    assert.equal(motivos, 12);
    assert.equal(indexes, 3);
    assert.equal(outroExigeObservacao, 1);
    assert.match(sqlite(dbFile, '.schema os_andamento_historico'), /ON DELETE CASCADE/);
  } finally {
    fs.rmSync(dbFile, { force: true });
  }
});

test('migrator adds OS summary columns idempotently before SQL migration', () => {
  const migrator = read('database/migrate.js');
  const migration = read('database/migrations/155_os_andamento_justificativas.sql');
  assert.match(migrator, /function ensureOSAndamentoColumns\(\)/);
  assert.match(migrator, /addColumnIfMissing\("os", "ultimo_motivo_andamento"/);
  assert.match(migrator, /addColumnIfMissing\("os", "ultima_justificativa_andamento"/);
  assert.match(migrator, /addColumnIfMissing\("os", "ultimo_registro_andamento_em"/);
  assert.match(migrator, /filename === "155_os_andamento_justificativas\.sql"/);
  assert.doesNotMatch(migration, /ALTER TABLE os ADD COLUMN/);
});

test('accent normalization migration preserves institutional Portuguese text', () => {
  const migration = read('database/migrations/156_os_andamento_motivos_acentuacao.sql');
  assert.match(migration, /Falta de mão de obra capacitada/);
  assert.match(migration, /Equipamento em produção \/ sem parada liberada/);
  assert.match(migration, /Risco de segurança \/ aguardando bloqueio/);
  assert.match(migration, /Aguardando aprovação do encarregado/);
});

test('OS IA adapter owns technical fallback and forbids invented information', () => {
  const adapter = read('modules/os/os-ia.service.js');
  const globalIA = read('modules/ia/ia.service.js');
  assert.match(adapter, /function montarFallbackJustificativaAndamento/);
  assert.match(adapter, /Não invente datas, causas, peças, testes, responsáveis ou providências/);
  assert.match(adapter, /return fallback/);
  assert.doesNotMatch(globalIA, /gerarJustificativaTecnicaAndamentoOS/);
});

test('OS andamento routes precede generic OS detail and use dedicated permission', () => {
  const routes = read('modules/os/os.routes.js');
  const andamento = routes.indexOf('router.get("/:id/andamento"');
  const generic = routes.indexOf('router.get("/:id",');
  assert.ok(andamento >= 0 && andamento < generic);
  assert.match(routes, /\/:id\/andamento\/registrar/);
  assert.match(routes, /\/:id\/material-chegou/);
  assert.match(routes, /requireRole\(OS_ANDAMENTO_ACCESS\)/);
});

test('OS detail keeps ongoing justification card organized inside Menu OS', () => {
  const detail = read('views/os/show.ejs');
  assert.match(detail, /data-os-module="justificativa-andamento">Justificativa de OS em andamento/);
  assert.match(detail, /class="card os-module" id="justificativa-andamento"/);
  assert.match(detail, /function activateHashModule\(\)/);
  assert.match(detail, /window\.addEventListener\('hashchange', activateHashModule\)/);
});

test('OS service stores separate history, local-day alert state and inspection sync', () => {
  const service = read('modules/os/os.service.js');
  const registrar = service.match(/async function registrarJustificativaAndamento[\s\S]*?return getHistoricoAndamentoOS\(id\)\[0\];/)?.[0] || '';
  assert.match(service, /function temJustificativaAndamentoHoje/);
  assert.match(service, /date\('now','localtime'\)/);
  assert.match(registrar, /INSERT INTO os_andamento_historico/);
  assert.match(registrar, /ultimo_motivo_andamento/);
  assert.match(registrar, /syncInspecaoFromOS\(id\)/);
  assert.doesNotMatch(registrar, /SET status\s*=/);
});

test('PAC 01 page, detailed report and PDF expose ongoing OS traceability', () => {
  const service = read('modules/inspecao/inspecao.service.js');
  const routes = read('modules/inspecao/inspecao.routes.js');
  const report = read('views/inspecao/os-em-andamento.ejs');
  const exporter = read('utils/exporters/inspecao.exporter.js');
  assert.match(service, /function listOSEmAndamentoDetalhadas/);
  assert.match(service, /material_chegou_em/);
  assert.match(service, /historico_resumido_texto/);
  assert.match(routes, /\/:ano\/:mes\/os-em-andamento/);
  assert.match(report, /Ação necessária/);
  assert.match(report, /Histórico resumido/);
  assert.match(exporter, /Ordens de Serviço em Andamento — Justificativas e Rastreabilidade/);
  assert.match(exporter, /drawOSEmAndamentoBlock/);
});
