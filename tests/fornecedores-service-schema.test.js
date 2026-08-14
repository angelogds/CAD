const test = require('node:test');
const assert = require('node:assert/strict');

test('consultas de fornecedores não dependem de coluna legada em solicitacao_itens', () => {
  const dbPath = require.resolve('../database/db');
  const servicePath = require.resolve('../modules/fornecedores/fornecedores.service');
  const originalDb = require.cache[dbPath];
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      return {
        all: () => [],
        get: () => ({}),
      };
    },
  };

  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  delete require.cache[servicePath];

  try {
    const service = require(servicePath);
    service.dashboard();
    service.history(1);

    assert.equal(statements.some((sql) => sql.includes('si.fornecedor_nome')), false);
    assert.equal(statements.filter((sql) => sql.includes('COALESCE(f.nome_fantasia,f.nome) fornecedor_nome')).length, 2);
  } finally {
    delete require.cache[servicePath];
    if (originalDb) require.cache[dbPath] = originalDb;
    else delete require.cache[dbPath];
  }
});
