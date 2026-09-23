const fs = require('fs');
const path = require('path');
const db = require('../../database/db');
const storage = require('../../config/storage');

const TV_UPLOAD_DIR = path.join(storage.UPLOAD_DIR, 'tv');
fs.mkdirSync(TV_UPLOAD_DIR, { recursive: true });

const DEFAULT_CONFIG = {
  id: 1,
  mascote_os_ativo: 1,
  mascote_os_path: '/media/mascote/mascote-tv-01.mp4',
  midias_intervalo_ativas: 0,
};

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function ensureRow() {
  if (!tableExists('tv_configuracoes')) return DEFAULT_CONFIG;
  db.prepare(`
    INSERT OR IGNORE INTO tv_configuracoes (
      id, mascote_os_ativo, mascote_os_path, midias_intervalo_ativas
    ) VALUES (1, 1, '/media/mascote/mascote-tv-01.mp4', 0)
  `).run();
  return getConfig();
}

function getConfig() {
  if (!tableExists('tv_configuracoes')) return { ...DEFAULT_CONFIG };
  return db.prepare('SELECT * FROM tv_configuracoes WHERE id=1').get() || { ...DEFAULT_CONFIG };
}

function getPublicConfig() {
  const config = ensureRow();
  const midias = tableExists('tv_midias')
    ? db.prepare(`
        SELECT id, nome, tipo, caminho, posicao_depois_tela, duracao_segundos, ordem
        FROM tv_midias
        WHERE ativo=1
        ORDER BY posicao_depois_tela, ordem, id
      `).all()
    : [];

  return {
    mascotAlert: {
      enabled: Boolean(config.mascote_os_ativo),
      src: config.mascote_os_path || null,
    },
    interstitialsEnabled: Boolean(config.midias_intervalo_ativas),
    interstitials: midias.map((item) => ({
      id: item.id,
      name: item.nome,
      type: item.tipo,
      src: item.caminho,
      afterScreen: Number(item.posicao_depois_tela || 0),
      durationMs: Math.max(3000, Number(item.duracao_segundos || 8) * 1000),
      order: Number(item.ordem || 0),
    })),
  };
}

function listMidias() {
  if (!tableExists('tv_midias')) return [];
  return db.prepare(`
    SELECT *
    FROM tv_midias
    ORDER BY posicao_depois_tela, ordem, id
  `).all();
}

function updateMainConfig({ mascoteOsAtivo, midiasIntervaloAtivas, userId }) {
  ensureRow();
  db.prepare(`
    UPDATE tv_configuracoes
    SET mascote_os_ativo=?,
        midias_intervalo_ativas=?,
        atualizado_por=?,
        atualizado_em=CURRENT_TIMESTAMP
    WHERE id=1
  `).run(
    mascoteOsAtivo ? 1 : 0,
    midiasIntervaloAtivas ? 1 : 0,
    userId || null
  );
  return getConfig();
}

function setMascotPath(filePath, userId) {
  ensureRow();
  db.prepare(`
    UPDATE tv_configuracoes
    SET mascote_os_path=?,
        mascote_os_ativo=1,
        atualizado_por=?,
        atualizado_em=CURRENT_TIMESTAMP
    WHERE id=1
  `).run(filePath, userId || null);
  return getConfig();
}

function addMedia({ nome, tipo, caminho, posicaoDepoisTela, duracaoSegundos, ordem, userId }) {
  if (!tableExists('tv_midias')) throw new Error('Estrutura de mídia do Modo TV ainda não está disponível.');
  const result = db.prepare(`
    INSERT INTO tv_midias (
      nome, tipo, caminho, posicao_depois_tela, duracao_segundos, ordem, ativo, criado_por
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    String(nome || 'Mídia do Modo TV').trim(),
    tipo,
    caminho,
    Math.min(7, Math.max(0, Number(posicaoDepoisTela || 0))),
    Math.min(60, Math.max(3, Number(duracaoSegundos || 8))),
    Number(ordem || 0),
    userId || null
  );
  return result.lastInsertRowid;
}

function toggleMedia(id, ativo) {
  if (!tableExists('tv_midias')) return false;
  const result = db.prepare(`
    UPDATE tv_midias SET ativo=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?
  `).run(ativo ? 1 : 0, Number(id));
  return result.changes > 0;
}

function removeMedia(id) {
  if (!tableExists('tv_midias')) return null;
  const row = db.prepare('SELECT * FROM tv_midias WHERE id=?').get(Number(id));
  if (!row) return null;
  db.prepare('DELETE FROM tv_midias WHERE id=?').run(Number(id));

  const absolute = publicPathToAbsolute(row.caminho);
  if (absolute && absolute.startsWith(TV_UPLOAD_DIR + path.sep)) {
    try { if (fs.existsSync(absolute)) fs.unlinkSync(absolute); } catch (_error) {}
  }
  return row;
}

function publicPathToAbsolute(publicPath) {
  const value = String(publicPath || '');
  if (!value.startsWith('/uploads/tv/')) return null;
  return path.join(TV_UPLOAD_DIR, path.basename(value));
}

function uploadedFileToPublicPath(file) {
  if (!file?.path) return null;
  return storage.toPublicPath(file.path);
}

module.exports = {
  TV_UPLOAD_DIR,
  ensureRow,
  getConfig,
  getPublicConfig,
  listMidias,
  updateMainConfig,
  setMascotPath,
  addMedia,
  toggleMedia,
  removeMedia,
  uploadedFileToPublicPath,
};
