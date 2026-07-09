const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-equipamentos-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.DATA_DIR = tempDir;
process.env.SQLITE_DIR = tempDir;

const db = require('../database/db');

db.exec(`
  CREATE TABLE equipamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    status_operacional TEXT DEFAULT 'ATIVO',
    updated_at TEXT
  );

  CREATE TABLE equipamento_pecas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipamento_id INTEGER NOT NULL
  );

  CREATE TABLE documentos_equipamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipamento_id INTEGER NOT NULL
  );

  CREATE TABLE equipamento_qrcode (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipamento_id INTEGER NOT NULL
  );

  CREATE TABLE os (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipamento_id INTEGER,
    FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id)
  );
`);

const service = require('../modules/equipamentos/equipamentos.service');

test.after(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_error) {}
});

test('remove fisicamente equipamento sem vínculos de histórico', () => {
  const id = Number(db.prepare("INSERT INTO equipamentos (nome, ativo, status_operacional) VALUES ('Bomba teste', 1, 'ATIVO')").run().lastInsertRowid);
  db.prepare('INSERT INTO equipamento_pecas (equipamento_id) VALUES (?)').run(id);

  const resultado = service.remove(id);

  assert.equal(resultado.removed, true);
  assert.equal(resultado.deactivated, false);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM equipamentos WHERE id=?').get(id).total, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM equipamento_pecas WHERE equipamento_id=?').get(id).total, 0);
});

test('inativa equipamento quando existe OS vinculada para preservar rastreabilidade', () => {
  const id = Number(db.prepare("INSERT INTO equipamentos (nome, ativo, status_operacional) VALUES ('Motor vinculado', 1, 'ATIVO')").run().lastInsertRowid);
  db.prepare('INSERT INTO os (equipamento_id) VALUES (?)').run(id);

  const resultado = service.remove(id);

  assert.equal(resultado.removed, false);
  assert.equal(resultado.deactivated, true);
  assert.deepEqual(resultado.vinculos.map((v) => v.table), ['os']);

  const row = db.prepare('SELECT ativo, status_operacional FROM equipamentos WHERE id=?').get(id);
  assert.equal(row.ativo, 0);
  assert.equal(row.status_operacional, 'INATIVO');
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM os WHERE equipamento_id=?').get(id).total, 1);
});
