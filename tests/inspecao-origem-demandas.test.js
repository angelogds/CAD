const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

// O serviço usa o banco injetado somente neste arquivo de teste. Nenhum dado real é acessado.
function createFixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, ativo INTEGER);
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE colaboradores (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE os (
      id INTEGER PRIMARY KEY, equipamento_id INTEGER, opened_at TEXT, data_inicio TEXT,
      data_fim TEXT, status TEXT, tipo TEXT, descricao TEXT, demanda_id INTEGER, origem TEXT
    );
    CREATE TABLE inspecoes_pac01 (
      id INTEGER PRIMARY KEY, mes INTEGER, ano INTEGER, frequencia TEXT,
      monitor_nome TEXT, verificador_nome TEXT, created_by INTEGER
    );
    CREATE TABLE inspecao_pac01_grade (
      id INTEGER PRIMARY KEY, inspecao_id INTEGER, equipamento_id INTEGER,
      dia INTEGER, status TEXT, os_id INTEGER, observacao TEXT, updated_at TEXT,
      UNIQUE(inspecao_id, equipamento_id, dia)
    );
    CREATE TABLE inspecao_pac01_nao_conformidades (
      id INTEGER PRIMARY KEY, inspecao_id INTEGER, equipamento_id INTEGER,
      data_ocorrencia TEXT, nao_conformidade TEXT, acao_corretiva TEXT,
      acao_preventiva TEXT, data_correcao TEXT, os_id INTEGER, updated_at TEXT
    );
    INSERT INTO equipamentos VALUES (1, 'Prensa P50', 'P50', 1);
    INSERT INTO os (id, equipamento_id, opened_at, status, tipo, descricao, demanda_id, origem) VALUES
      (1, 1, '2026-10-05 09:00:00', 'ABERTA', 'CORRETIVA', 'Vazamento na prensa', 10, 'DEMANDA'),
      (2, 1, '2026-10-06 09:00:00', 'ABERTA', 'CORRETIVA', 'Rolamento danificado', NULL, NULL),
      (3, 1, '2026-10-07 09:00:00', 'ABERTA', 'CORRETIVA', 'Vazamento histórico', 11, NULL),
      (4, 1, '2026-10-08 09:00:00', 'ABERTA', 'CORRETIVA', 'Correia danificada', NULL, 'DEMANDA'),
      (5, 1, '2026-10-09 09:00:00', 'ABERTA', 'OUTROS', 'Ajuste programado', NULL, 'VOZ');
  `);
  const dbPath = require.resolve('../database/db');
  const servicePath = require.resolve('../modules/inspecao/inspecao.service');
  const originalDb = require.cache[dbPath];
  const originalService = require.cache[servicePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    db, service,
    close() {
      delete require.cache[servicePath];
      if (originalService) require.cache[servicePath] = originalService;
      if (originalDb) require.cache[dbPath] = originalDb;
      else delete require.cache[dbPath];
      db.close();
    },
  };
}

test('PAC 01 considera OS diretas e não inclui reformas planejadas de demandas, inclusive legadas', () => {
  const fixture = createFixture();
  try {
    const { db, service } = fixture;
    const linked = service.syncFromOS(1);
    assert.equal(linked.synced, false);
    assert.equal(linked.reason, 'os_from_demand');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inspecoes_pac01').get().n, 0);

    const created = service.syncFromOS(2);
    assert.equal(created.synced, true);
    const inspectionId = created.inspecaoId;
    const nc = service.listNC(inspectionId);
    assert.deepEqual(nc.map(row => row.os_id), [2]);
    const modalOs = service.listOSDetailsByInspecao(inspectionId, 10, 2026);
    const ids = [...new Set(Object.values(modalOs).flat().map(row => row.id))];
    assert.deepEqual(ids, [2]);

    const current = service.listOSEmAndamentoDetalhadas(inspectionId, 10, 2026);
    assert.deepEqual(current.map(row => row.id), [2, 5]);
    const indicators = service.getIndicadoresOS(10, 2026, current);
    assert.equal(indicators.registradas_no_mes, 2);
    assert.equal(indicators.abertas_ou_em_andamento, 2);
    assert.equal(indicators.com_nao_conformidade_no_mes, 1);

    const grid = service.buildMatrix(inspectionId, 2026, 10, service.listEquipamentosAtivos());
    assert.equal(grid.get(1)[5].status, 'NC'); // 06/10: OS direta corretiva.
    assert.equal(grid.get(1)[4].status, 'C'); // 05/10: demanda não altera inspeção.

    db.prepare("UPDATE os SET status='FECHADA' WHERE id=1").run();
    assert.deepEqual(service.syncFromClosedOS(1), { synced: false, reason: 'os_from_demand' });
  } finally {
    fixture.close();
  }
});

test('conversão de demandas informa vínculo e origem antes da criação da OS', () => {
  const fs = require('node:fs');
  const demandas = fs.readFileSync('modules/demandas/demandas.service.js', 'utf8');
  const os = fs.readFileSync('modules/os/os.service.js', 'utf8');
  assert.match(demandas, /demanda_id: Number\(d\.id\)/);
  assert.match(demandas, /origem: 'DEMANDA'/);
  assert.match(os, /if \(!demandaId && origemOS !== "DEMANDA"\) syncInspecaoFromOS\(osId\)/);
});
