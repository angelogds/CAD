const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE solicitacoes (id INTEGER PRIMARY KEY, setor_origem TEXT);
    CREATE TABLE solicitacao_itens (id INTEGER PRIMARY KEY, solicitacao_id INTEGER);
    CREATE TABLE compras_cotacoes (id INTEGER PRIMARY KEY, solicitacao_id INTEGER);
    CREATE TABLE compras_anexos (
      id INTEGER PRIMARY KEY,
      referencia_tipo TEXT,
      referencia_id INTEGER
    );

    INSERT INTO solicitacoes VALUES (1, 'RECICLAGEM');
    INSERT INTO solicitacoes VALUES (2, 'LOGÍSTICA');
    INSERT INTO solicitacoes VALUES (3, NULL);

    INSERT INTO solicitacao_itens VALUES (11, 1);
    INSERT INTO solicitacao_itens VALUES (12, 2);

    INSERT INTO compras_cotacoes VALUES (21, 1);
    INSERT INTO compras_cotacoes VALUES (22, 2);

    INSERT INTO compras_anexos VALUES (31, 'SOLICITACAO', 1);
    INSERT INTO compras_anexos VALUES (32, 'SOLICITACAO', 2);
    INSERT INTO compras_anexos VALUES (33, 'OUTRO', 1);
  `);
  return db;
}

function loadMiddleware(db) {
  const dbPath = require.resolve('../database/db');
  const middlewarePath = require.resolve('../modules/compras/compras.reciclagem-scope.middleware');
  const previousDb = require.cache[dbPath];
  const previousMiddleware = require.cache[middlewarePath];

  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  delete require.cache[middlewarePath];
  const middleware = require(middlewarePath);

  return {
    middleware,
    restore() {
      delete require.cache[middlewarePath];
      if (previousMiddleware) require.cache[middlewarePath] = previousMiddleware;
      if (previousDb) require.cache[dbPath] = previousDb;
      else delete require.cache[dbPath];
    },
  };
}

function invoke(fn, { params = {}, body = {}, role = 'COORDENADOR_RECICLAGEM' } = {}) {
  const req = { session: { user: { id: 10, role } }, params, body };
  const state = { next: false, status: null, message: null, req };
  const res = {
    status(code) { state.status = code; return this; },
    send(message) { state.message = message; return this; },
  };
  fn(req, res, () => { state.next = true; });
  return state;
}

test('guard de solicitação permite Reciclagem e legado sem setor, mas bloqueia outros setores', () => {
  const db = fixture();
  const loaded = loadMiddleware(db);
  try {
    assert.equal(invoke(loaded.middleware.requireSolicitacaoScope, { params: { id: '1' } }).next, true);
    assert.equal(invoke(loaded.middleware.requireSolicitacaoScope, { params: { id: '3' } }).next, true);

    const blocked = invoke(loaded.middleware.requireSolicitacaoScope, { params: { id: '2' } });
    assert.equal(blocked.next, false);
    assert.equal(blocked.status, 403);

    const missing = invoke(loaded.middleware.requireSolicitacaoScope, { params: { id: '999' } });
    assert.equal(missing.status, 404);
  } finally {
    loaded.restore();
    db.close();
  }
});

test('IDs de item e cotação precisam pertencer à própria solicitação e à Reciclagem', () => {
  const db = fixture();
  const loaded = loadMiddleware(db);
  try {
    assert.equal(invoke(loaded.middleware.requireItemScope, { params: { id: '1', itemId: '11' } }).next, true);
    assert.equal(invoke(loaded.middleware.requireCotacaoScope, { params: { id: '1', cotacaoId: '21' } }).next, true);

    assert.equal(invoke(loaded.middleware.requireItemScope, { params: { id: '1', itemId: '12' } }).status, 403);
    assert.equal(invoke(loaded.middleware.requireCotacaoScope, { params: { id: '1', cotacaoId: '22' } }).status, 403);

    assert.equal(invoke(loaded.middleware.requireItemScope, { params: { id: '2', itemId: '12' } }).status, 403);
    assert.equal(invoke(loaded.middleware.requireCotacaoScope, { params: { id: '2', cotacaoId: '22' } }).status, 403);
  } finally {
    loaded.restore();
    db.close();
  }
});

test('anexo precisa apontar para uma solicitação permitida da Reciclagem', () => {
  const db = fixture();
  const loaded = loadMiddleware(db);
  try {
    assert.equal(invoke(loaded.middleware.requireAnexoScope, { params: { anexoId: '31' } }).next, true);
    assert.equal(invoke(loaded.middleware.requireAnexoScope, { params: { anexoId: '32' } }).status, 403);
    assert.equal(invoke(loaded.middleware.requireAnexoScope, { params: { anexoId: '33' } }).status, 403);
  } finally {
    loaded.restore();
    db.close();
  }
});

test('IDs enviados no painel de itens são cruzados com a solicitação do formulário', () => {
  const db = fixture();
  const loaded = loadMiddleware(db);
  try {
    const ok = invoke(loaded.middleware.requireBodyItemsScope, {
      params: { id: '1' },
      body: { item_id: ['11'], cotado: ['11'], comprar: ['11'] },
    });
    assert.equal(ok.next, true);

    const injected = invoke(loaded.middleware.requireBodyItemsScope, {
      params: { id: '1' },
      body: { item_id: ['11', '12'], cotado: ['11'] },
    });
    assert.equal(injected.status, 403);
    assert.equal(injected.next, false);
  } finally {
    loaded.restore();
    db.close();
  }
});

test('guard não altera o comportamento dos perfis globais já autorizados', () => {
  const db = fixture();
  const loaded = loadMiddleware(db);
  try {
    const compras = invoke(loaded.middleware.requireSolicitacaoScope, {
      params: { id: '2' },
      role: 'COMPRAS',
    });
    assert.equal(compras.next, true);
    assert.equal(compras.status, null);
  } finally {
    loaded.restore();
    db.close();
  }
});
