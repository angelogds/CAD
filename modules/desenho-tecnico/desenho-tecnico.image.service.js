const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const storage = require('../../config/storage');

const CAD_IMAGE_ROOT = path.join(storage.DATA_DIR, 'cad-images');
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDrawingId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identificador do desenho inválido.');
  return id;
}

function safeAssetId(value) {
  const assetId = String(value || '').trim();
  if (!UUID_PATTERN.test(assetId)) throw new Error('Identificador da imagem inválido.');
  return assetId;
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { extension: '.png', mimeType: 'image/png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', mimeType: 'image/jpeg' };
  }
  return null;
}

function getDrawingDir(drawingId, rootDir = CAD_IMAGE_ROOT) {
  const id = safeDrawingId(drawingId);
  return path.join(path.resolve(rootDir), String(id));
}

function ensureInside(parent, candidate) {
  const root = path.resolve(parent);
  const target = path.resolve(candidate);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Caminho de imagem inválido.');
  return target;
}

function sourceUrl(drawingId, assetId) {
  return `/desenho-tecnico/cad/${safeDrawingId(drawingId)}/images/${safeAssetId(assetId)}`;
}

function saveImage({ drawingId, buffer, originalName = '', rootDir = CAD_IMAGE_ROOT } = {}) {
  const id = safeDrawingId(drawingId);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Arquivo de imagem vazio.');
  if (buffer.length > MAX_IMAGE_BYTES) {
    const error = new Error('A imagem excede o limite de 10 MB.');
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }
  const imageType = detectImageType(buffer);
  if (!imageType) {
    const error = new Error('Formato não suportado. Use imagem JPG ou PNG.');
    error.code = 'UNSUPPORTED_IMAGE';
    throw error;
  }

  const assetId = crypto.randomUUID();
  const dir = getDrawingDir(id, rootDir);
  fs.mkdirSync(dir, { recursive: true });
  const absolutePath = ensureInside(dir, path.join(dir, `${assetId}${imageType.extension}`));
  fs.writeFileSync(absolutePath, buffer, { flag: 'wx' });

  return {
    assetId,
    drawingId: id,
    originalName: String(originalName || '').slice(0, 255),
    mimeType: imageType.mimeType,
    size: buffer.length,
    absolutePath,
    url: sourceUrl(id, assetId),
  };
}

function resolveImage(drawingId, assetId, { rootDir = CAD_IMAGE_ROOT } = {}) {
  const id = safeDrawingId(drawingId);
  const safeId = safeAssetId(assetId);
  const dir = getDrawingDir(id, rootDir);
  const candidates = [
    { extension: '.png', mimeType: 'image/png' },
    { extension: '.jpg', mimeType: 'image/jpeg' },
  ];
  for (const candidate of candidates) {
    const absolutePath = ensureInside(dir, path.join(dir, `${safeId}${candidate.extension}`));
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      return { assetId: safeId, drawingId: id, absolutePath, mimeType: candidate.mimeType };
    }
  }
  return null;
}

function extractAssetId(value, drawingId = null) {
  const source = String(value || '');
  const idPart = drawingId ? String(safeDrawingId(drawingId)) : '\\d+';
  const match = new RegExp(`/desenho-tecnico/cad/${idPart}/images/([0-9a-f-]{36})(?:$|[?#])`, 'i').exec(source);
  if (!match || !UUID_PATTERN.test(match[1])) return null;
  return match[1];
}

module.exports = {
  CAD_IMAGE_ROOT,
  MAX_IMAGE_BYTES,
  detectImageType,
  safeDrawingId,
  safeAssetId,
  sourceUrl,
  saveImage,
  resolveImage,
  extractAssetId,
};
