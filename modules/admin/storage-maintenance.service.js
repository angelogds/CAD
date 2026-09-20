const fs = require('fs');
const path = require('path');
const db = require('../../database/db');
const storage = require('../../config/storage');

const MB = 1024 * 1024;
const GB = 1024 * MB;
const DATA_DIR = storage.DATA_DIR;
const DIRS = {
  uploads: storage.UPLOAD_DIR,
  pdfs: storage.PDF_DIR,
  tmp: storage.TEMP_DIR,
  logs: path.join(DATA_DIR, 'logs'),
  sessions: path.join(DATA_DIR, 'sessions'),
  sqlite: storage.SQLITE_DIR,
  backups: path.join(DATA_DIR, 'backups'),
};

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fileSize(p) {
  try { return fs.statSync(p).size || 0; } catch { return 0; }
}

function statfs(dir = DATA_DIR) {
  try {
    const s = fs.statfsSync(dir);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return { total: 0, free: 0 };
  }
}

function capacity(dir = DATA_DIR) {
  const v = statfs(dir);
  const total = Number(v.total || 0);
  const free = Number(v.free || 0);
  const used = total > 0 ? Math.max(0, total - free) : 0;
  const usedPct = total > 0 ? (used / total) * 100 : null;
  const freePct = total > 0 ? (free / total) * 100 : null;
  return { total, free, used, usedPct, freePct };
}

function capacityStatus(snapshot = capacity()) {
  if (!snapshot.total) return { level: 'unknown', label: 'Indisponível' };

  const freePct = Number(snapshot.freePct || 0);
  const free = Number(snapshot.free || 0);

  if (freePct <= 10 || free <= 100 * MB) return { level: 'critical', label: 'Crítico' };
  if (freePct <= 20 || free <= 500 * MB) return { level: 'warn', label: 'Atenção' };
  return { level: 'good', label: 'Saudável' };
}

function walk(dir, cb) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    try {
      if (ent.isDirectory()) walk(p, cb);
      else if (ent.isFile()) cb(p, fs.statSync(p));
    } catch {}
  }
}

function dirSize(dir, pred = () => true) {
  let total = 0;
  walk(dir, (p, st) => {
    if (pred(p, st)) total += st.size || 0;
  });
  return total;
}

function topFiles(dir = DATA_DIR, limit = 10) {
  const files = [];
  walk(dir, (p, st) => files.push({ path: p, size: st.size || 0 }));
  return files.sort((a, b) => b.size - a.size).slice(0, limit);
}

function tableInfo(name) {
  try { return db.prepare(`PRAGMA table_info(${name})`).all(); } catch { return []; }
}

function sessionTable() {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND lower(name) IN ('sessions','session') ORDER BY name").get();
  return row?.name || null;
}

function expirationColumn(table) {
  const cols = tableInfo(table).map((c) => String(c.name || '').toLowerCase());
  if (cols.includes('expired')) return 'expired';
  if (cols.includes('expires')) return 'expires';
  return null;
}

function sessionStats() {
  const table = sessionTable();
  if (!table) return { table: null, total: 0, expired: 0 };

  const col = expirationColumn(table);
  const total = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()?.total || 0;
  let expired = 0;

  if (col === 'expired') {
    expired = db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE expired < ?`).get(Date.now())?.total || 0;
  } else if (col === 'expires') {
    expired = db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE expires IS NOT NULL AND ((expires GLOB '[0-9]*' AND CAST(expires AS INTEGER) < ?) OR (NOT (expires GLOB '[0-9]*') AND datetime(expires) < datetime('now')))`).get(Date.now())?.total || 0;
  }

  return { table, total, expired, expirationColumn: col };
}

function ensureSessionMaintenance() {
  const table = sessionTable();
  if (!table) return { table: null, deleted: 0 };

  const col = expirationColumn(table);
  if (!col) return { table, deleted: 0 };

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_${table}_${col} ON ${table}(${col})`).run();

  let info;
  if (col === 'expired') {
    info = db.prepare(`DELETE FROM ${table} WHERE expired < ?`).run(Date.now());
  } else {
    info = db.prepare(`DELETE FROM ${table} WHERE expires IS NOT NULL AND ((expires GLOB '[0-9]*' AND CAST(expires AS INTEGER) < ?) OR (NOT (expires GLOB '[0-9]*') AND datetime(expires) < datetime('now')))`).run(Date.now());
  }

  return { table, deleted: info.changes || 0 };
}

function olderThan(days) {
  const cut = Date.now() - Number(days) * 86400000;
  return (_p, st) => Number(st.mtimeMs || 0) < cut;
}

function removeOldFiles(dir, days, pred = () => true) {
  let removed = 0;
  let bytes = 0;

  walk(dir, (p, st) => {
    if (!olderThan(days)(p, st) || !pred(p, st)) return;
    try {
      fs.unlinkSync(p);
      removed += 1;
      bytes += st.size || 0;
    } catch {}
  });

  return { removed, bytes };
}

function cleanup({ dryRun = false } = {}) {
  const before = diagnostic();
  const sessions = dryRun ? { deleted: before.sessions.expired, table: before.sessions.table } : ensureSessionMaintenance();
  const tmp = dryRun ? { removed: 0, bytes: 0 } : removeOldFiles(DIRS.tmp, 2);
  const logs = dryRun ? { removed: 0, bytes: 0 } : removeOldFiles(DIRS.logs, 30, (p) => /\.log(\.\d+)?$|\.txt$|\.json$/i.test(p));
  const pdfs = dryRun ? { removed: 0, bytes: 0 } : removeOldFiles(DIRS.pdfs, 15, (p) => /temp|tmp|escala|relatorio/i.test(path.basename(p)) && /\.pdf$/i.test(p));
  return { before, after: diagnostic(), sessions, tmp, logs, pdfs, dryRun };
}

function diagnostic() {
  const v = capacity(DATA_DIR);
  const mediaPred = (p) => /\.(jpe?g|png|gif|webp|mp4|mov|avi)$/i.test(p);
  const pdfPred = (p) => /\.pdf$/i.test(p);

  return {
    dataDir: DATA_DIR,
    total: v.total,
    free: v.free,
    used: v.used,
    usedPct: v.usedPct,
    freePct: v.freePct,
    db: fileSize(storage.DB_PATH),
    wal: fileSize(`${storage.DB_PATH}-wal`),
    shm: fileSize(`${storage.DB_PATH}-shm`),
    uploads: dirSize(DIRS.uploads),
    tmp: dirSize(DIRS.tmp),
    logs: dirSize(DIRS.logs),
    media: dirSize(DATA_DIR, mediaPred),
    pdfs: dirSize(DATA_DIR, pdfPred),
    sessions: sessionStats(),
    topFiles: topFiles(DATA_DIR, 10),
  };
}

function pragmaValue(statement, preferredKey) {
  try {
    const row = db.prepare(`PRAGMA ${statement}`).get();
    if (!row) return null;
    if (preferredKey && Object.prototype.hasOwnProperty.call(row, preferredKey)) return row[preferredKey];
    const values = Object.values(row);
    return values.length ? values[0] : null;
  } catch {
    return null;
  }
}

function sqliteHealth() {
  try {
    const rows = db.prepare('PRAGMA quick_check').all();
    const normalized = rows.map((row) => String(row.quick_check ?? Object.values(row)[0] ?? '').trim());
    const ok = normalized.length > 0 && normalized.every((value) => value.toLowerCase() === 'ok');

    return {
      ok,
      status: ok ? 'good' : 'critical',
      label: ok ? 'Íntegro' : 'Falha de integridade',
      quickCheck: normalized,
      journalMode: String(pragmaValue('journal_mode', 'journal_mode') || 'desconhecido').toUpperCase(),
      foreignKeys: Number(pragmaValue('foreign_keys', 'foreign_keys') || 0) === 1,
      busyTimeout: Number(pragmaValue('busy_timeout', 'timeout') || 0),
    };
  } catch (error) {
    return {
      ok: false,
      status: 'critical',
      label: 'Verificação indisponível',
      error: error.message || String(error),
      quickCheck: [],
      journalMode: null,
      foreignKeys: null,
      busyTimeout: null,
    };
  }
}

function backupSummary() {
  fs.mkdirSync(DIRS.backups, { recursive: true });
  const files = [];

  try {
    for (const name of fs.readdirSync(DIRS.backups)) {
      if (!/\.db$/i.test(name)) continue;
      const filePath = path.join(DIRS.backups, name);
      try {
        const st = fs.statSync(filePath);
        if (!st.isFile()) continue;
        files.push({
          name,
          path: filePath,
          size: st.size || 0,
          mtime: st.mtime,
          mtimeMs: st.mtimeMs || 0,
        });
      } catch {}
    }
  } catch {}

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = files[0] || null;
  const totalBytes = files.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const ageHours = latest ? Math.max(0, (Date.now() - latest.mtimeMs) / 3600000) : null;

  let status = 'good';
  let label = 'Backup recente';
  if (!latest) {
    status = 'warn';
    label = 'Sem backup local';
  } else if (ageHours > 168) {
    status = 'critical';
    label = 'Backup desatualizado';
  } else if (ageHours > 48) {
    status = 'warn';
    label = 'Backup precisa ser atualizado';
  }

  return {
    dir: DIRS.backups,
    count: files.length,
    totalBytes,
    latest,
    ageHours,
    status,
    label,
    recent: files.slice(0, 10),
  };
}

function runtimeHealth() {
  const memory = process.memoryUsage();
  return {
    node: process.version,
    pid: process.pid,
    platform: process.platform,
    uptimeSeconds: Math.floor(process.uptime()),
    rss: Number(memory.rss || 0),
    heapUsed: Number(memory.heapUsed || 0),
    heapTotal: Number(memory.heapTotal || 0),
  };
}

function healthSnapshot() {
  const storageDiag = diagnostic();
  const volume = capacityStatus(storageDiag);
  const sqlite = sqliteHealth();
  const backups = backupSummary();
  const runtime = runtimeHealth();

  const statuses = [volume.level, sqlite.status, backups.status];
  const overall = statuses.includes('critical') ? 'critical' : statuses.includes('warn') ? 'warn' : 'good';

  return {
    overall,
    generatedAt: new Date().toISOString(),
    storage: storageDiag,
    volume,
    sqlite,
    backups,
    runtime,
  };
}

function createBackup() {
  fs.mkdirSync(DIRS.backups, { recursive: true });

  const dbBytes = fileSize(storage.DB_PATH);
  const free = capacity(DATA_DIR).free;
  const minimumFree = Math.max(100 * MB, dbBytes * 2);

  if (free && free < minimumFree) {
    throw new Error(`Espaço livre insuficiente para backup seguro: ${formatBytes(free)} livres.`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(DIRS.backups, `app-${stamp}.db`);
  const escapedPath = backupPath.replace(/'/g, "''");

  db.exec(`VACUUM INTO '${escapedPath}'`);

  const size = fileSize(backupPath);
  if (!size) {
    try { fs.unlinkSync(backupPath); } catch {}
    throw new Error('O backup foi criado sem conteúdo e foi descartado por segurança.');
  }

  return { path: backupPath, name: path.basename(backupPath), size, createdAt: new Date().toISOString() };
}

function isStorageFullError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return err?.code === 'SQLITE_FULL'
    || msg.includes('database or disk is full')
    || msg.includes('sqlite_full');
}

function checkpointWal() {
  return db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all();
}

function optimizeVacuum() {
  const before = fileSize(storage.DB_PATH);
  db.exec('PRAGMA optimize;');
  const free = statfs(DATA_DIR).free;
  if (free < Math.max(100 * MB, before * 1.2)) {
    throw new Error(`Espaço livre insuficiente para VACUUM seguro: ${formatBytes(free)}`);
  }
  db.exec('VACUUM;');
  return { before, after: fileSize(storage.DB_PATH) };
}

module.exports = {
  MB,
  GB,
  formatBytes,
  diagnostic,
  capacity,
  capacityStatus,
  sqliteHealth,
  backupSummary,
  runtimeHealth,
  healthSnapshot,
  createBackup,
  cleanup,
  ensureSessionMaintenance,
  checkpointWal,
  optimizeVacuum,
  isStorageFullError,
  statfs,
};
