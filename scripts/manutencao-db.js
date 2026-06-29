#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const storage = require('../config/storage');

try {
  storage.ensurePersistentDirs();
  const dbPath = storage.DB_PATH;
  if (!fs.existsSync(dbPath)) throw new Error(`Banco não encontrado: ${dbPath}`);
  const backupDir = path.join(storage.DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `app-${stamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = DELETE');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  const integrity = db.pragma('integrity_check');
  const ok = Array.isArray(integrity) ? integrity.some((r) => String(r.integrity_check || Object.values(r)[0]).toLowerCase() === 'ok') : String(integrity).toLowerCase().includes('ok');
  if (!ok) throw new Error(`integrity_check falhou: ${JSON.stringify(integrity)}`);
  db.exec('VACUUM;');
  db.close();
  console.log(`Backup criado: ${backupPath}`);
  console.log('PRAGMA integrity_check: ok');
  console.log('VACUUM executado com sucesso. Nenhum dado foi apagado.');
} catch (err) {
  console.error(`Erro na manutenção do SQLite: ${err.message || err}`);
  process.exit(1);
}
