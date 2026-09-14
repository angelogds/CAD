const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

function loadServiceWithDb(db) {
  const dbPath = require.resolve('../database/db');
  const servicePath = require.resolve('../modules/compras/custos-equipamentos.service');
  const previousDb = require.cache[dbPath];
  const previousService = require.cache[servicePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return () => {
    delete require.cache[servicePath];
    if (previousService) require.cache[servicePath] = previousService;
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
  };
}

function seed() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, nome TEXT, setor TEXT);
    CREATE TABLE fornecedores (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE solicitacoes (
      id INTEGER PRIMARY KEY, numero TEXT, os_id INTEGER, equipamento_id INTEGER,
      comprada_em TEXT, fornecedor TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE solicitacao_itens (
      id INTEGER PRIMARY KEY, solicitacao_id INTEGER, item_nome TEXT, unidade TEXT,
      qtd_solicitada REAL, qtd_comprada REAL, qtd_recebida_total REAL,
      valor_unitario_centavos INTEGER, status_compra TEXT, comprado_em TEXT,
      fornecedor_id INTEGER
    );
    INSERT INTO equipamentos VALUES (1,'Prensa P46','Prensas'),(2,'Digestor 3','Digestores');
    INSERT INTO fornecedores VALUES (1,'Fornecedor A'),(2,'Fornecedor B');
    INSERT INTO solicitacoes VALUES
      (10,'SOL-010',101,1,'2026-09-05',NULL,'2026-09-01','2026-09-05'),
      (11,'SOL-011',102,1,'2026-09-18',NULL,'2026-09-15','2026-09-18'),
      (12,'SOL-012',103,2,'2026-08-20',NULL,'2026-08-18','2026-08-20'),
      (13,'SOL-013',104,2,'2026-09-20',NULL,'2026-09-19','2026-09-20');
    INSERT INTO solicitacao_itens VALUES
      (100,10,'Rolamento','UN',2,2,1,10000,'COMPRADO','2026-09-05',1),
      (101,11,'Correia','UN',3,3,3,5000,'COMPRADO','2026-09-18',2),
      (102,12,'Válvula','UN',1,1,1,30000,'COMPRADO','2026-08-20',1),
      (103,13,'Óleo','L',10,NULL,0,1000,'PENDENTE',NULL,2);
  `);
  return db;
}

test('getAnalytics calcula comprado, recebido e pendente sem dupla contagem', () => {
  const db = seed();
  const restore = loadServiceWithDb(db);
  try {
    const service = require('../modules/compras/custos-equipamentos.service');
    const data = service.getAnalytics({ data_inicial: '2026-09-01', data_final: '2026-09-30' });
    assert.equal(data.totals.comprado_centavos, 35000);
    assert.equal(data.totals.recebido_centavos, 25000);
    assert.equal(data.totals.pendente_centavos, 10000);
    assert.equal(data.totals.equipamentos, 1);
    assert.equal(data.totals.solicitacoes, 2);
    assert.equal(data.byEquipment[0].equipamento_nome, 'Prensa P46');
    assert.equal(data.byEquipment[0].comprado_centavos, 35000);
    assert.equal(data.byMonth[0].mes, '2026-09');
  } finally {
    restore();
    db.close();
  }
});

test('getAnalytics respeita equipamento e período', () => {
  const db = seed();
  const restore = loadServiceWithDb(db);
  try {
    const service = require('../modules/compras/custos-equipamentos.service');
    const septemberDigestor = service.getAnalytics({
      data_inicial: '2026-09-01', data_final: '2026-09-30', equipamento_id: 2,
    });
    assert.equal(septemberDigestor.totals.comprado_centavos, 0);

    const augustDigestor = service.getAnalytics({
      data_inicial: '2026-08-01', data_final: '2026-08-31', equipamento_id: 2,
    });
    assert.equal(augustDigestor.totals.comprado_centavos, 30000);
    assert.equal(augustDigestor.totals.recebido_centavos, 30000);
    assert.equal(augustDigestor.byEquipment[0].equipamento_nome, 'Digestor 3');
  } finally {
    restore();
    db.close();
  }
});

test('getEquipmentLifetime retorna itens com Solicitação, OS e fornecedor', () => {
  const db = seed();
  const restore = loadServiceWithDb(db);
  try {
    const service = require('../modules/compras/custos-equipamentos.service');
    const data = service.getEquipmentLifetime(1);
    assert.equal(data.totals.comprado_centavos, 35000);
    assert.equal(data.items.length, 2);
    assert.equal(data.items[0].solicitacao_id, 11);
    assert.equal(data.items[0].os_id, 102);
    assert.equal(data.items[0].fornecedor_nome, 'Fornecedor B');
    assert.equal(data.items[0].total_centavos, 15000);
  } finally {
    restore();
    db.close();
  }
});
