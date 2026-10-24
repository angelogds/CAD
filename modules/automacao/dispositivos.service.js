const crypto = require('node:crypto');
const db = require('../../database/db');

const ONLINE_WINDOW_S = 90;
const DEVICE_ID_RE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
// Fase do cozimento -> sinaleiro. Apenas sinalização; nenhum comando de equipamento.
const FASES = Object.freeze({
  INICIO: { sinaleiro: 'VERMELHO', piscando: false },
  MEIO: { sinaleiro: 'AMARELO', piscando: false },
  FINAL: { sinaleiro: 'VERDE', piscando: true },
});

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const newToken = () => `cgd_${crypto.randomBytes(32).toString('base64url')}`;

function assertDeviceId(deviceId) {
  const id = String(deviceId || '').trim().toUpperCase();
  if (!DEVICE_ID_RE.test(id)) throw new Error('device_id inválido (use A-Z, 0-9 e hífen, 3 a 40 caracteres).');
  return id;
}

function digestorFromId(deviceId) {
  const m = /DIGESTOR-0?([1-4])$/.exec(deviceId);
  return m ? Number(m[1]) : null;
}

// Gera (ou substitui) o token. O valor em claro é devolvido uma única vez e nunca é gravado.
function issueToken(deviceId, userId) {
  const id = assertDeviceId(deviceId);
  const token = newToken();
  const hint = token.slice(-4);
  const hash = hashToken(token);
  const existing = db.prepare('SELECT id FROM automacao_dispositivos WHERE device_id=?').get(id);
  if (existing) {
    db.prepare(`UPDATE automacao_dispositivos SET token_hash=?, token_hint=?, status='ATIVO', rotated_at=datetime('now'), revoked_at=NULL WHERE id=?`).run(hash, hint, existing.id);
  } else {
    db.prepare('INSERT INTO automacao_dispositivos(device_id,digestor_id,nome,token_hash,token_hint,created_by) VALUES (?,?,?,?,?,?)')
      .run(id, digestorFromId(id), id, hash, hint, userId || null);
  }
  return { device_id: id, token, replaced: !!existing };
}

function revoke(deviceId) {
  const r = db.prepare(`UPDATE automacao_dispositivos SET status='REVOGADO', token_hash=NULL, revoked_at=datetime('now') WHERE device_id=?`).run(assertDeviceId(deviceId));
  return r.changes > 0;
}

function authenticate(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const row = db.prepare(`SELECT id, device_id, digestor_id FROM automacao_dispositivos WHERE token_hash=? AND status='ATIVO'`).get(hashToken(token));
  return row || null;
}

function recordContact(deviceRow, body) {
  const b = body && typeof body === 'object' ? body : {};
  const fase = b.fase == null ? null : String(b.fase).toUpperCase();
  if (fase && !FASES[fase]) {
    const err = new Error('fase inválida (INICIO, MEIO ou FINAL).');
    err.status = 400;
    throw err;
  }
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  const payload = {
    fase,
    temperatura_c: num(b.temperatura_c),
    firmware: b.firmware == null ? null : String(b.firmware).slice(0, 40),
    uptime_s: num(b.uptime_s),
  };
  db.prepare(`UPDATE automacao_dispositivos SET last_seen_at=datetime('now'), last_fase=COALESCE(?,last_fase), last_payload=? WHERE id=?`)
    .run(fase, JSON.stringify(payload), deviceRow.id);
  return { fase: fase || null, sinaleiro: fase ? FASES[fase] : null };
}

function describeRow(r) {
  const age = r.idade_s == null ? null : Number(r.idade_s);
  let payload = null;
  try { payload = r.last_payload ? JSON.parse(r.last_payload) : null; } catch { payload = null; }
  return {
    device_id: r.device_id,
    digestor_id: r.digestor_id,
    status: r.status,
    token_final: r.token_hint ? `…${r.token_hint}` : null,
    online: r.status === 'ATIVO' && age != null && age <= ONLINE_WINDOW_S,
    ultimo_contato: r.last_seen_at ? `${r.last_seen_at}Z` : null,
    segundos_desde_contato: age,
    fase: r.last_fase,
    sinaleiro: r.last_fase && FASES[r.last_fase] ? FASES[r.last_fase] : null,
    ultimo_estado: payload,
    modo: 'SIMULACAO',
    comando_habilitado: false,
    criado_em: r.created_at,
    token_substituido_em: r.rotated_at,
    revogado_em: r.revoked_at,
  };
}

function listDevices() {
  return db.prepare(`SELECT *, CAST(strftime('%s','now') - strftime('%s', last_seen_at) AS INTEGER) AS idade_s FROM automacao_dispositivos ORDER BY device_id`).all().map(describeRow);
}

module.exports = { issueToken, revoke, authenticate, recordContact, listDevices, hashToken, FASES, ONLINE_WINDOW_S };
