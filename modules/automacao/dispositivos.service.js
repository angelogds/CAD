const crypto = require('node:crypto');
const db = require('../../database/db');
const { normalizeLocalUrl } = require('./esp32-local-url');

const ONLINE_WINDOW_S = 90;
const DEVICE_ID_RE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
const FASES_TEL = ['INICIO', 'MEIO', 'FINAL', 'PARADO'];
const FASES = Object.freeze({
  INICIO: { sinaleiro: 'VERDE', piscando: false },
  MEIO: { sinaleiro: 'AMARELO', piscando: false },
  FINAL: { sinaleiro: 'VERMELHO', piscando: true },
});
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const newToken = () => 'cgd_' + crypto.randomBytes(32).toString('base64url');

function inputError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertDeviceId(deviceId) {
  const id = String(deviceId || '').trim().toUpperCase();
  if (!DEVICE_ID_RE.test(id)) throw inputError('Identificação inválida: use A-Z, 0-9 e hífen (3 a 40 caracteres).');
  return id;
}
function digestorFromId(id) {
  const match = /DIGESTOR-0?([1-4])$/.exec(id);
  return match ? Number(match[1]) : null;
}
function normalizeScope(escopo, deviceId) {
  if (escopo === undefined || escopo === null || escopo === '') {
    const inferred = digestorFromId(deviceId);
    if (inferred) return inferred; // compatibilidade com tokens do piloto
    throw inputError('Escolha o digestor 1, 2, 3, 4 ou TODOS.');
  }
  if (String(escopo).toUpperCase() === 'TODOS') return null;
  if (/^[1-4]$/.test(String(escopo))) return Number(escopo);
  throw inputError('Escopo inválido: selecione digestor 1–4 ou TODOS.');
}

// A chave pertence a um dispositivo e apenas ao escopo autorizado.
// Trocar equipamento para o mesmo ID SEMPRE gira a chave anterior.
function issueToken(deviceId, userId, escopo) {
  const id = assertDeviceId(deviceId);
  const scope = normalizeScope(escopo, id);
  const token = newToken();
  const hash = hashToken(token);
  const hint = token.slice(-4);
  const existing = db.prepare('SELECT id FROM automacao_dispositivos WHERE device_id=?').get(id);
  if (existing) {
    db.prepare("UPDATE automacao_dispositivos SET token_hash=?, token_hint=?, digestor_id=?, status='ATIVO', rotated_at=datetime('now'), revoked_at=NULL, last_seen_at=NULL, last_fase=NULL, last_payload=NULL WHERE id=?")
      .run(hash, hint, scope, existing.id);
    db.prepare('DELETE FROM automacao_dispositivo_estados WHERE device_pk=?').run(existing.id);
    try { db.prepare('DELETE FROM automacao_bancada_telemetria WHERE device_pk=?').run(existing.id); } catch (_) { /* migration 232 ainda não aplicada */ }
  } else {
    db.prepare('INSERT INTO automacao_dispositivos(device_id,digestor_id,nome,token_hash,token_hint,created_by) VALUES (?,?,?,?,?,?)')
      .run(id, scope, id, hash, hint, userId || null);
  }
  return { device_id: id, escopo: scope === null ? 'TODOS' : String(scope), token, replaced: !!existing };
}
// Configuração de navegação LAN: não executa requisições ao ESP32 no servidor.
function updateLocalUrl(deviceId, rawUrl) {
  const id = assertDeviceId(deviceId);
  const url = normalizeLocalUrl(rawUrl);
  const result = db.prepare('UPDATE automacao_dispositivos SET local_url=? WHERE device_id=?')
    .run(url, id);
  if (!result.changes) throw inputError('ESP32 não cadastrado.', 404);
  return { device_id: id, local_url: url };
}

function revoke(deviceId) {
  const result = db.prepare("UPDATE automacao_dispositivos SET status='REVOGADO', token_hash=NULL, revoked_at=datetime('now'), last_seen_at=NULL WHERE device_id=?")
    .run(assertDeviceId(deviceId));
  return result.changes > 0;
}
function authenticate(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  return db.prepare("SELECT id,device_id,digestor_id FROM automacao_dispositivos WHERE token_hash=? AND status='ATIVO'")
    .get(hashToken(token)) || null;
}
function recordPing(deviceRow) {
  db.prepare("UPDATE automacao_dispositivos SET last_seen_at=datetime('now') WHERE id=?")
    .run(deviceRow.id);
}

function recordContact(deviceRow, body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (b.device_id != null && assertDeviceId(b.device_id) !== deviceRow.device_id) {
    throw inputError('O token pertence a outro ESP32.', 403);
  }
  const fase = b.fase == null && b.origem === 'REAL' ? 'PARADO' : b.fase == null ? null : String(b.fase).trim().toUpperCase();
  if (!fase || !FASES_TEL.includes(fase)) {
    throw inputError('Informe a fase INICIO, MEIO, FINAL ou PARADO.');
  }

  let digestorId = deviceRow.digestor_id;
  if (digestorId === null) {
    if (!/^[1-4]$/.test(String(b.digestor_id || ''))) {
      throw inputError('Um token geral deve informar digestor_id entre 1 e 4.');
    }
    digestorId = Number(b.digestor_id);
  } else if (b.digestor_id !== undefined && Number(b.digestor_id) !== digestorId) {
    throw inputError('Este token não está autorizado para o digestor informado.', 403);
  }
  const num = (v) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const telemetriaService = require('./bancada-telemetria.service');
  const persist = db.transaction(() => {
    const telemetria = telemetriaService.recordReport(deviceRow, digestorId, b);
    const payload = {
      digestor_id: digestorId, fase, origem: telemetria.origem,
      temperatura_c: telemetria.temperatura_c, faixa_temperatura: telemetria.faixa_temperatura,
      cor_sinaleiro: telemetria.cor_sinaleiro, pronto_descarga: telemetria.pronto_descarga,
      sensor_tipo: telemetria.sensor_tipo, sensor_status: telemetria.sensor_status,
      timestamp_medicao: telemetria.timestamp_medicao,
      firmware: telemetria.firmware, uptime_s: num(b.uptime_s),
    };
    const serialized = JSON.stringify(payload);
    db.prepare("UPDATE automacao_dispositivos SET last_seen_at=datetime('now'),last_fase=?,last_payload=? WHERE id=?")
      .run(fase, serialized, deviceRow.id);
    // A tabela legada só aceita três fases. REAL permanece na telemetria completa (232/235).
    if (fase !== 'PARADO' && telemetria.origem !== 'REAL') db.prepare("INSERT INTO automacao_dispositivo_estados (device_pk,digestor_id,last_fase,last_payload,last_seen_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(device_pk,digestor_id) DO UPDATE SET last_fase=excluded.last_fase,last_payload=excluded.last_payload,last_seen_at=excluded.last_seen_at")
      .run(deviceRow.id, digestorId, fase, serialized);
    return { digestor_id: digestorId, fase, sinaleiro: lamp(telemetria.cor_sinaleiro), origem: telemetria.origem, modo: telemetria.origem };
  });
  return persist();
}
function lamp(cor) {
  if (!cor || cor === 'DESLIGADO') return null;
  return { sinaleiro: cor === 'VERMELHO_PISCANDO' ? 'VERMELHO' : cor, piscando: cor === 'VERMELHO_PISCANDO' };
}
function listDevices() {
  const records = db.prepare("SELECT *, CAST(strftime('%s','now') - strftime('%s',last_seen_at) AS INTEGER) AS idade_s FROM automacao_dispositivos ORDER BY device_id").all();
  const estados = db.prepare("SELECT device_pk,digestor_id,last_fase,last_seen_at FROM automacao_dispositivo_estados ORDER BY digestor_id").all();
  const supervision = require('./bancada-telemetria.service').status().digestores;
  return records.map((r) => {
    let payload = {};
    try { payload = JSON.parse(r.last_payload || '{}'); } catch (_) {}
    const real = payload.origem === 'REAL';
    const current = supervision.find(d => d.device_id === r.device_id && d.digestor_id === payload.digestor_id);
    const age = r.idade_s == null ? null : Number(r.idade_s);
    return {
      device_id: r.device_id,
      local_url: r.local_url || null,
      digestor_id: r.digestor_id,
      escopo: r.digestor_id == null ? 'TODOS' : String(r.digestor_id),
      status: r.status,
      token_final: r.token_hint ? '…' + r.token_hint : null,
      online: r.status === 'ATIVO' && age != null && age <= ONLINE_WINDOW_S,
      ultimo_contato: r.last_seen_at ? r.last_seen_at + 'Z' : null,
      segundos_desde_contato: age,
      fase: r.last_fase,
      sinaleiro: real ? lamp(current && current.cor_sinaleiro) : (FASES[r.last_fase] || null),
      modo: real ? 'REAL' : 'SIMULACAO',
      origem: real ? 'REAL' : 'SIMULACAO',
      temperatura_c: current ? current.temperatura_c : null,
      cor_sinaleiro: current ? current.cor_sinaleiro : null,
      faixa_temperatura: current ? current.faixa_temperatura : null,
      pronto_descarga: current ? current.pronto_descarga : false,
      sensor_status: current ? current.sensor_status : 'SEM_SENSOR',
      timestamp_medicao: current ? current.timestamp_medicao : null,
      comando_habilitado: false,
      criado_em: r.created_at,
      token_substituido_em: r.rotated_at,
      revogado_em: r.revoked_at,
      estados: estados.filter(s => !real && s.device_pk === r.id).map(s => ({
        digestor_id: s.digestor_id,
        fase: s.last_fase,
        sinaleiro: FASES[s.last_fase] || null,
        ultimo_contato: s.last_seen_at ? s.last_seen_at + 'Z' : null,
      })),
    };
  });
}
module.exports = { issueToken, updateLocalUrl, revoke, authenticate, recordPing, recordContact, listDevices, hashToken, FASES, ONLINE_WINDOW_S };
