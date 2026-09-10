const path = require('node:path');
const db = require('../../database/db');
const storage = require('../../config/storage');

const PRIVATE_DOCUMENT_DIR = path.join(storage.DATA_DIR, 'rh', 'documentos');
const PRIVATE_PREFIX = 'rh-private://';

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
  catch (_error) { return false; }
}

function deletedClause() {
  if (!tableExists('documentos_colaborador')) return '';
  try {
    const columns = db.prepare('PRAGMA table_info(documentos_colaborador)').all().map((c) => c.name);
    return columns.includes('deleted_at') ? "AND COALESCE(deleted_at,'')=''" : '';
  } catch (_error) { return ''; }
}

function privateMarker(filename) {
  return `${PRIVATE_PREFIX}${path.basename(String(filename || ''))}`;
}

function isPrivateMarker(value) {
  return String(value || '').startsWith(PRIVATE_PREFIX);
}

function safeLegacyUrl(value) {
  const raw = String(value || '').trim();
  return /^https?:\/\//i.test(raw) || raw.startsWith('/') ? raw : null;
}

function listForCollaborator(colaboradorId, { self = false } = {}) {
  if (!tableExists('documentos_colaborador')) return [];
  const rows = db.prepare(`
    SELECT * FROM documentos_colaborador
    WHERE colaborador_id=? ${deletedClause()}
    ORDER BY id DESC
    LIMIT 300
  `).all(Number(colaboradorId));

  return rows.map((row) => {
    let arquivo_seguro = safeLegacyUrl(row.arquivo_url);
    if (isPrivateMarker(row.arquivo_url)) {
      arquivo_seguro = self
        ? `/meu-portal/rh/documentos/${Number(row.id)}/arquivo`
        : `/colaboradores/${Number(colaboradorId)}/rh-documentos/${Number(row.id)}/arquivo`;
    }
    return { ...row, arquivo_seguro };
  });
}

function getPrivateDocumentForDownload(documentId, colaboradorId) {
  if (!tableExists('documentos_colaborador')) return null;
  const row = db.prepare(`
    SELECT * FROM documentos_colaborador
    WHERE id=? AND colaborador_id=? ${deletedClause()}
    LIMIT 1
  `).get(Number(documentId), Number(colaboradorId));
  if (!row || !isPrivateMarker(row.arquivo_url)) return null;

  const fileName = path.basename(String(row.arquivo_url).slice(PRIVATE_PREFIX.length));
  if (!fileName) return null;
  const base = path.resolve(PRIVATE_DOCUMENT_DIR);
  const filePath = path.resolve(PRIVATE_DOCUMENT_DIR, fileName);
  if (!filePath.startsWith(`${base}${path.sep}`)) return null;
  return { ...row, filePath };
}

module.exports = {
  PRIVATE_DOCUMENT_DIR,
  PRIVATE_PREFIX,
  privateMarker,
  listForCollaborator,
  getPrivateDocumentForDownload,
};
