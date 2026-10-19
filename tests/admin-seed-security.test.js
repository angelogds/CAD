const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = new (require('better-sqlite3'))(':memory:');
require.cache[require.resolve('../database/db')] = { exports: db };
db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT,password_hash TEXT,role TEXT,created_at TEXT)');
const { ensureAdmin } = require('../database/seed');
after(() => db.close());

test('seed de produção exige senha explícita, preserva conta existente e não registra credenciais', () => {
  const keys = ['NODE_ENV','ADMIN_PASSWORD','ADMIN_RESET'];
  const previous = Object.fromEntries(keys.map(key => [key,process.env[key]]));
  const log = console.log;
  const messages = [];
  console.log = (...args) => messages.push(args.join(' '));
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_RESET;
    assert.throws(ensureAdmin, /ADMIN_PASSWORD/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,0);
    const password = crypto.randomBytes(32).toString('hex');
    process.env.ADMIN_PASSWORD = password;
    ensureAdmin();
    const original = db.prepare('SELECT * FROM users').get();
    assert.ok(bcrypt.compareSync(password,original.password_hash));
    delete process.env.ADMIN_PASSWORD;
    ensureAdmin();
    assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash,original.password_hash);
    process.env.ADMIN_RESET = '1';
    assert.throws(ensureAdmin, /ADMIN_PASSWORD/);
    const newPassword = crypto.randomBytes(32).toString('hex');
    process.env.ADMIN_PASSWORD = newPassword;
    ensureAdmin();
    const updated = db.prepare('SELECT password_hash FROM users').get().password_hash;
    assert.ok(bcrypt.compareSync(newPassword,updated));
    for (const secret of [password,newPassword,original.password_hash,updated]) {
      assert.ok(!messages.join('\n').includes(secret),'logs não contêm credenciais');
    }
  } finally {
    console.log = log;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
