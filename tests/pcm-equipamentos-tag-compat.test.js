const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const migration = require('../database/migrations/199_equipamentos_tag_compat');

function helpers(db) {
  const tableExists = (name) => Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
  );
  const columnExists = (table, column) => db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((entry) => entry.name === column);
  const addColumnIfMissing = (table, column, ddl) => {
    if (!columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  return { tableExists, columnExists, addColumnIfMissing };
}

test('migração adiciona tag sem alterar código nem dados existentes', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE equipamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT NOT NULL
      );
      INSERT INTO equipamentos (codigo, nome) VALUES ('DIG-03', 'Digestor 3');
    `);

    const h = helpers(db);
    migration.up({ db, ...h });

    assert.equal(h.columnExists('equipamentos', 'tag'), true);
    const row = db.prepare('SELECT codigo, tag, nome FROM equipamentos WHERE id=1').get();
    assert.deepEqual(row, { codigo: 'DIG-03', tag: null, nome: 'Digestor 3' });
  } finally {
    db.close();
  }
});

test('migração é idempotente quando tag já existe', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, codigo TEXT, tag TEXT, nome TEXT);`);
    const h = helpers(db);

    migration.up({ db, ...h });
    migration.up({ db, ...h });

    const cols = db.prepare('PRAGMA table_info(equipamentos)').all().filter((c) => c.name === 'tag');
    assert.equal(cols.length, 1);
  } finally {
    db.close();
  }
});
