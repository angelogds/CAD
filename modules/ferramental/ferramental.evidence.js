const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const storage = require('../../config/storage');

const EVIDENCE_DIR = path.join(storage.DATA_DIR, 'ferramental', 'evidencias');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function safeFileName(prefix, ext = '.png') {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}${ext}`;
}

function saveSignatureDataUrl(dataUrl, { userId, custodiaId } = {}) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Assinatura inválida. Assine novamente no campo indicado.');

  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > 1024 * 1024) {
    throw new Error('A assinatura deve ter no máximo 1 MB.');
  }

  const filename = safeFileName(`assinatura-u${Number(userId)||0}-c${Number(custodiaId)||0}`);
  const target = path.join(EVIDENCE_DIR, filename);
  fs.writeFileSync(target, buffer);
  return target;
}

function removeFile(filePath) {
  if (!filePath) return;
  try {
    const resolved = path.resolve(filePath);
    if (resolved.startsWith(path.resolve(EVIDENCE_DIR) + path.sep) && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  } catch (_error) {}
}

function resolveEvidencePath(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  const root = path.resolve(EVIDENCE_DIR) + path.sep;
  if (!resolved.startsWith(root)) return null;
  try {
    if (!fs.statSync(resolved).isFile()) return null;
  } catch (_error) {
    return null;
  }
  return resolved;
}

module.exports = {
  EVIDENCE_DIR,
  saveSignatureDataUrl,
  removeFile,
  resolveEvidencePath,
};
