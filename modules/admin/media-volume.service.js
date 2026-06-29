const fs = require('fs');
const path = require('path');
const storage = require('../../config/storage');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
const DB_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3', '.wal', '.shm']);
const REMOVED_MESSAGE = 'Anexo removido para economia de espaço.';

function uniqueDirs(dirs) {
  return Array.from(new Set(dirs.filter(Boolean).map((d) => path.resolve(d))));
}

function getAttachmentDirs() {
  return uniqueDirs([
    storage.UPLOAD_DIR,
    path.join(storage.DATA_DIR, 'public', 'uploads'),
    path.join(process.cwd(), 'public', 'uploads'),
    '/data/uploads',
    '/data/public/uploads',
    '/app/public/uploads',
    path.join(storage.IMAGE_DIR),
  ]);
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function classify(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (DB_EXTENSIONS.has(ext)) return 'database';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'other';
}

function walk(dir, cb) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) walk(p, cb);
      else if (entry.isFile()) cb(p, fs.statSync(p));
    } catch (err) {
      cb(p, null, err);
    }
  }
}

function isOlderThan(st, days) {
  const n = Number(days || 0);
  if (!n || n < 0) return true;
  return Number(st?.mtimeMs || 0) < Date.now() - n * 86400000;
}

function scanAttachments({ olderThanDays = 0, dirs = getAttachmentDirs(), topLimit = 15 } = {}) {
  const stats = { dirs, files: [], totalBytes: 0, imageCount: 0, videoCount: 0, imageBytes: 0, videoBytes: 0, errors: [] };
  for (const dir of dirs) {
    walk(dir, (p, st, err) => {
      if (err) return stats.errors.push({ path: p, error: err.message || String(err) });
      const kind = classify(p);
      if (!['image', 'video'].includes(kind)) return;
      if (!isOlderThan(st, olderThanDays)) return;
      const item = { path: p, size: st.size || 0, kind, mtime: st.mtime };
      stats.files.push(item);
      stats.totalBytes += item.size;
      if (kind === 'image') { stats.imageCount += 1; stats.imageBytes += item.size; }
      if (kind === 'video') { stats.videoCount += 1; stats.videoBytes += item.size; }
    });
  }
  stats.topFiles = stats.files.slice().sort((a, b) => b.size - a.size).slice(0, topLimit);
  return stats;
}

function cleanupAttachments({ dryRun = true, confirm = false, olderThanDays = 0, user = 'script' } = {}) {
  if (!dryRun && !confirm) throw new Error('Execução real exige confirm=true.');
  const stats = scanAttachments({ olderThanDays });
  let deleted = 0, freedBytes = 0;
  const errors = [];
  if (!dryRun) {
    for (const file of stats.files) {
      if (classify(file.path) === 'database') continue;
      try { fs.unlinkSync(file.path); deleted += 1; freedBytes += file.size || 0; }
      catch (err) { errors.push({ path: file.path, error: err.message || String(err) }); }
    }
    writeCleanupLog({ user, deleted, freedBytes, olderThanDays, totalCandidates: stats.files.length, errors });
  }
  return { dryRun, olderThanDays, candidates: stats.files.length, deleted: dryRun ? 0 : deleted, freedBytes: dryRun ? stats.totalBytes : freedBytes, stats, errors };
}

function writeCleanupLog(entry) {
  const logsDir = path.join(storage.DATA_DIR, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(path.join(logsDir, 'limpeza-anexos.log'), line);
}

function publicPathToFilePath(publicPath) {
  const p = String(publicPath || '').trim();
  if (!p) return null;
  if (p.startsWith('/uploads/')) return path.join(storage.UPLOAD_DIR, p.replace(/^\/uploads\/?/, ''));
  if (p.startsWith('/imagens/')) return path.join(storage.IMAGE_DIR, p.replace(/^\/imagens\/?/, ''));
  if (p.startsWith('/pdfs/')) return path.join(storage.PDF_DIR, p.replace(/^\/pdfs\/?/, ''));
  if (p.startsWith('/')) return path.join(process.cwd(), 'public', p.replace(/^\//, ''));
  return path.join(storage.UPLOAD_DIR, p.replace(/^uploads\/?/, ''));
}

function attachmentExists(publicPath) {
  const fp = publicPathToFilePath(publicPath);
  try { return !!fp && fs.existsSync(fp); } catch { return false; }
}

module.exports = { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, DB_EXTENSIONS, REMOVED_MESSAGE, getAttachmentDirs, scanAttachments, cleanupAttachments, formatBytes, classify, attachmentExists, publicPathToFilePath, writeCleanupLog };
