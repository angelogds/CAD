// src/services/storageManager.js
// Storage management: auto-cleanup, SQLite backup, volume monitoring, scheduler.
'use strict';

const fs = require('fs');
const path = require('path');

// Lazy-load to avoid circular deps at module init
function getStorage() { return require('../../config/storage'); }
function getDb()      { return require('../../database/db'); }
function getLogger()  { return require('../../utils/logger'); }

const MB = 1024 * 1024;
const GB = 1024 * MB;

// ─── Configuration ────────────────────────────────────────────────────────────

function getConfig() {
  return {
    cleanupDaysThreshold: Math.max(1, Number(process.env.CLEANUP_DAYS_THRESHOLD || 30)),
    backupDir: process.env.BACKUP_DIR
      ? path.resolve(process.env.BACKUP_DIR)
      : path.join(getStorage().DATA_DIR, 'backups'),
    warnThresholdPct: Number(process.env.STORAGE_WARN_PCT || 80),
    criticalThresholdPct: Number(process.env.STORAGE_CRITICAL_PCT || 95),
    maxBackups: Math.max(1, Number(process.env.MAX_BACKUPS || 7)),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= GB)   return `${(n / GB).toFixed(2)} GB`;
  if (n >= MB)   return `${(n / MB).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function statfs(dir) {
  try {
    const s = fs.statfsSync(dir);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch (_e) {
    return { total: 0, free: 0 };
  }
}

function walk(dir, cb) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) walk(p, cb);
      else if (entry.isFile()) cb(p, fs.statSync(p));
    } catch (_e) {}
  }
}

function dirSize(dir) {
  let total = 0;
  walk(dir, (_p, st) => { total += st.size || 0; });
  return total;
}

function isMediaFile(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.heic', '.heif'].includes(ext);
}

function isOlderThanDays(st, days) {
  return Number(st?.mtimeMs || 0) < Date.now() - days * 86400000;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * cleanupOldMedia()
 * Scan IMAGE_DIR and UPLOAD_DIR for image/video files older than CLEANUP_DAYS_THRESHOLD days.
 * Returns { deleted, freedBytes, errors, dryRun }.
 */
function cleanupOldMedia({ dryRun = false } = {}) {
  const logger = getLogger();
  const storage = getStorage();
  const { cleanupDaysThreshold } = getConfig();

  const scanDirs = [
    storage.IMAGE_DIR,
    storage.UPLOAD_DIR,
    path.join(storage.DATA_DIR, 'imagens'),
  ].filter(Boolean);

  let deleted = 0;
  let freedBytes = 0;
  const errors = [];
  const candidates = [];

  for (const dir of scanDirs) {
    walk(dir, (filePath, st) => {
      if (!isMediaFile(filePath)) return;
      if (!isOlderThanDays(st, cleanupDaysThreshold)) return;
      candidates.push({ filePath, size: st.size || 0 });
    });
  }

  if (!dryRun) {
    for (const { filePath, size } of candidates) {
      try {
        fs.unlinkSync(filePath);
        deleted++;
        freedBytes += size;
      } catch (err) {
        errors.push({ path: filePath, error: err.message || String(err) });
      }
    }
    logger.info(`[storageManager] cleanupOldMedia: deleted=${deleted} freed=${formatBytes(freedBytes)} errors=${errors.length}`, {
      deleted, freedBytes, errors: errors.length, thresholdDays: cleanupDaysThreshold,
    });
  }

  return {
    dryRun,
    thresholdDays: cleanupDaysThreshold,
    candidates: candidates.length,
    deleted: dryRun ? 0 : deleted,
    freedBytes: dryRun ? candidates.reduce((s, f) => s + f.size, 0) : freedBytes,
    errors,
  };
}

/**
 * backupDatabase()
 * Copy the SQLite database file to /data/backups/ with a timestamp.
 * Prunes old backups beyond maxBackups.
 * Returns { success, backupPath, sizeBytes }.
 */
function backupDatabase() {
  const logger = getLogger();
  const storage = getStorage();
  const { backupDir, maxBackups } = getConfig();

  fs.mkdirSync(backupDir, { recursive: true });

  const dbPath = storage.DB_PATH;
  if (!fs.existsSync(dbPath)) {
    logger.warn('[storageManager] backupDatabase: DB file not found', { dbPath });
    return { success: false, error: 'DB file not found', dbPath };
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = `app-backup-${ts}.db`;
  const backupPath = path.join(backupDir, backupName);

  try {
    // Use better-sqlite3's backup API if available, otherwise fs.copyFileSync
    const db = getDb();
    if (typeof db.backup === 'function') {
      // better-sqlite3 online backup (safe while DB is open)
      db.backup(backupPath);
    } else {
      fs.copyFileSync(dbPath, backupPath);
    }

    const sizeBytes = fs.statSync(backupPath).size || 0;

    // Prune old backups
    pruneOldBackups(backupDir, maxBackups);

    logger.info('[storageManager] backupDatabase: backup created', { backupPath, sizeBytes: formatBytes(sizeBytes) });
    return { success: true, backupPath, backupName, sizeBytes };
  } catch (err) {
    logger.error('[storageManager] backupDatabase: failed', { dbPath, backupPath }, err);
    return { success: false, error: err.message || String(err), dbPath };
  }
}

/**
 * pruneOldBackups()
 * Keep only the N most recent backup files in backupDir.
 */
function pruneOldBackups(backupDir, maxBackups) {
  try {
    if (!fs.existsSync(backupDir)) return;
    const files = fs.readdirSync(backupDir)
      .filter((f) => /^app-backup-.*\.db$/.test(f))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    const toDelete = files.slice(maxBackups);
    for (const f of toDelete) {
      try { fs.unlinkSync(path.join(backupDir, f.name)); } catch (_e) {}
    }
  } catch (_e) {}
}

/**
 * listBackups()
 * Return metadata for all available backup files.
 */
function listBackups() {
  const { backupDir } = getConfig();
  try {
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
      .filter((f) => /^app-backup-.*\.db$/.test(f))
      .map((f) => {
        const fullPath = path.join(backupDir, f);
        const st = fs.statSync(fullPath);
        return { name: f, path: fullPath, sizeBytes: st.size || 0, sizeLabel: formatBytes(st.size), mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch (_e) {
    return [];
  }
}

/**
 * getStorageStats()
 * Return disk usage info for the /data volume.
 */
function getStorageStats() {
  const storage = getStorage();
  const { warnThresholdPct, criticalThresholdPct } = getConfig();
  const { total, free } = statfs(storage.DATA_DIR);
  const used = total - free;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

  return {
    dataDir: storage.DATA_DIR,
    total,
    used,
    free,
    pct,
    totalLabel: formatBytes(total),
    usedLabel: formatBytes(used),
    freeLabel: formatBytes(free),
    warning: pct >= warnThresholdPct && pct < criticalThresholdPct,
    critical: pct >= criticalThresholdPct,
    status: pct >= criticalThresholdPct ? 'critical' : pct >= warnThresholdPct ? 'warning' : 'ok',
  };
}

/**
 * getStorageBreakdown()
 * Return per-directory size breakdown.
 */
function getStorageBreakdown() {
  const storage = getStorage();
  const { backupDir } = getConfig();

  const dirs = {
    images:  storage.IMAGE_DIR,
    videos:  storage.UPLOAD_DIR,   // uploads contains mixed media
    pdfs:    storage.PDF_DIR,
    uploads: storage.UPLOAD_DIR,
    backups: backupDir,
    temp:    storage.TEMP_DIR,
    sqlite:  storage.SQLITE_DIR,
  };

  const breakdown = {};
  for (const [key, dir] of Object.entries(dirs)) {
    const bytes = dirSize(dir);
    breakdown[key] = { dir, bytes, label: formatBytes(bytes) };
  }

  // DB file sizes
  const dbPath = storage.DB_PATH;
  try {
    breakdown.db = {
      main: fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0,
      wal:  fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`).size : 0,
      shm:  fs.existsSync(`${dbPath}-shm`) ? fs.statSync(`${dbPath}-shm`).size : 0,
    };
    breakdown.db.total = breakdown.db.main + breakdown.db.wal + breakdown.db.shm;
    breakdown.db.label = formatBytes(breakdown.db.total);
  } catch (_e) {
    breakdown.db = { main: 0, wal: 0, shm: 0, total: 0, label: '0 B' };
  }

  return breakdown;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

const _intervals = [];

/**
 * startAutoCleanup()
 * Schedule daily cleanup and backup tasks.
 * Returns array of interval IDs (for graceful shutdown).
 */
function startAutoCleanup() {
  const logger = getLogger();

  // Run cleanup once at startup (non-blocking)
  setImmediate(() => {
    try {
      const result = cleanupOldMedia({ dryRun: false });
      if (result.deleted > 0) {
        logger.info('[storageManager] Startup cleanup completed', { deleted: result.deleted, freed: formatBytes(result.freedBytes) });
      }
    } catch (err) {
      logger.warn('[storageManager] Startup cleanup failed', {}, err);
    }
  });

  // Daily cleanup — every 24 hours
  const cleanupInterval = setInterval(() => {
    try {
      cleanupOldMedia({ dryRun: false });
    } catch (err) {
      logger.warn('[storageManager] Scheduled cleanup failed', {}, err);
    }
  }, 24 * 60 * 60 * 1000);
  cleanupInterval.unref?.();
  _intervals.push(cleanupInterval);

  // Daily backup — every 24 hours (offset by 1 hour to avoid collision)
  const backupInterval = setInterval(() => {
    try {
      backupDatabase();
    } catch (err) {
      logger.warn('[storageManager] Scheduled backup failed', {}, err);
    }
  }, 24 * 60 * 60 * 1000);
  backupInterval.unref?.();
  _intervals.push(backupInterval);

  // Volume monitoring — every 30 minutes
  const monitorInterval = setInterval(() => {
    try {
      const stats = getStorageStats();
      if (stats.critical) {
        logger.error('[storageManager] CRITICAL: volume usage above threshold', {
          pct: stats.pct, free: stats.freeLabel, dataDir: stats.dataDir,
        });
      } else if (stats.warning) {
        logger.warn('[storageManager] WARNING: volume usage above 80%', {
          pct: stats.pct, free: stats.freeLabel, dataDir: stats.dataDir,
        });
      }
    } catch (err) {
      logger.warn('[storageManager] Volume monitor failed', {}, err);
    }
  }, 30 * 60 * 1000);
  monitorInterval.unref?.();
  _intervals.push(monitorInterval);

  logger.info('[storageManager] Auto-cleanup/backup scheduler started', {
    cleanupDays: getConfig().cleanupDaysThreshold,
    backupDir: getConfig().backupDir,
    maxBackups: getConfig().maxBackups,
  });

  return _intervals;
}

/**
 * stopAutoCleanup()
 * Clear all scheduled intervals (for graceful shutdown).
 */
function stopAutoCleanup() {
  for (const id of _intervals) clearInterval(id);
  _intervals.length = 0;
}

module.exports = {
  cleanupOldMedia,
  backupDatabase,
  listBackups,
  getStorageStats,
  getStorageBreakdown,
  startAutoCleanup,
  stopAutoCleanup,
  formatBytes,
  MB,
  GB,
};
