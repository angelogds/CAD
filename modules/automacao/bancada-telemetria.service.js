// Telemetria da bancada (sinaleiros). Distingue: fase solicitada (CAD), recebida e aplicada (firmware),
// confirmacao de saida (somente se o firmware informar) e ultimo contato. Nao comanda processo industrial.
const db = require('../../database/db');
const bancada = require('./sinaleiro-bancada.service');

const FASES_TEL = ['INICIO', 'MEIO', 'FINAL', 'PARADO'];
const SENSOR_STATUS = ['SEM_SENSOR', 'SEM_SINAL', 'VALIDO', 'FALHA'];
const ORIGENS = ['SIMULACAO', 'REAL'];
const ONLINE_S = 15;     // contato recente (consulta a cada ~2-5 s)
const ATRASADO_S = 90;   // acima disso: offline (igual a ONLINE_WINDOW_S de dispositivos.service)
// PT100 permanece desativado: leituras de temperatura NAO sao armazenadas.
const PT100_HABILITADO = false;

function bad(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }
function enumOrNull(v, list, label) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  if (!list.includes(s)) throw bad(label + ' inválido(a).');
  return s;
}
const intOrNull = (v) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

function recordPoll(deviceRow, digestorId, faseEntregue) {
  db.prepare("INSERT INTO automacao_bancada_telemetria (device_pk,digestor_id,last_poll_at,fase_entregue) VALUES (?,?,datetime('now'),?) ON CONFLICT(device_pk,digestor_id) DO UPDATE SET last_poll_at=excluded.last_poll_at, fase_entregue=excluded.fase_entregue")
    .run(deviceRow.id, digestorId, faseEntregue);
}

// Campos opcionais e retrocompativeis de /estado. Retorna o que foi gravado.
function recordReport(deviceRow, digestorId, b) {
  const fase_recebida = enumOrNull(b.fase_recebida, FASES_TEL, 'fase_recebida');
  const fase_aplicada = enumOrNull(b.fase_aplicada, FASES_TEL, 'fase_aplicada');
  const origem = enumOrNull(b.origem, ORIGENS, 'origem') || 'SIMULACAO';
  let saida = null;
  if (b.saida_confirmada !== undefined && b.saida_confirmada !== null) {
    if (typeof b.saida_confirmada !== 'boolean') throw bad('saida_confirmada deve ser true ou false.');
    if (!fase_aplicada) throw bad('saida_confirmada exige fase_aplicada.');
    saida = b.saida_confirmada ? 1 : 0;
  }
  // PT100 desativado: valida o formato, mas nunca persiste temperatura nem aceita status VALIDO.
  const sensor_status_in = enumOrNull(b.sensor_status, SENSOR_STATUS, 'sensor_status');
  const sensor_status = PT100_HABILITADO ? (sensor_status_in || 'SEM_SENSOR') : (sensor_status_in === 'FALHA' ? 'FALHA' : 'SEM_SENSOR');
  const row = {
    fase_recebida, fase_aplicada, saida, origem, sensor_status,
    sensor_tipo: PT100_HABILITADO && b.sensor_tipo === 'PT100' ? 'PT100' : null,
    firmware: b.firmware == null ? null : String(b.firmware).slice(0, 40),
    uptime_s: intOrNull(b.uptime_s), wifi_rssi: intOrNull(b.wifi_rssi),
  };
  db.prepare(`INSERT INTO automacao_bancada_telemetria (device_pk,digestor_id,reported_at,fase_recebida,fase_aplicada,saida_confirmada,origem,firmware,uptime_s,wifi_rssi,sensor_tipo,sensor_status,temperatura_c,timestamp_medicao)
    VALUES (?,?,datetime('now'),?,?,?,?,?,?,?,?,?,NULL,NULL)
    ON CONFLICT(device_pk,digestor_id) DO UPDATE SET reported_at=excluded.reported_at, fase_recebida=excluded.fase_recebida, fase_aplicada=excluded.fase_aplicada,
      saida_confirmada=excluded.saida_confirmada, origem=excluded.origem, firmware=excluded.firmware, uptime_s=excluded.uptime_s, wifi_rssi=excluded.wifi_rssi,
      sensor_tipo=excluded.sensor_tipo, sensor_status=excluded.sensor_status, temperatura_c=NULL, timestamp_medicao=NULL`)
    .run(deviceRow.id, digestorId, row.fase_recebida, row.fase_aplicada, row.saida, row.origem, row.firmware, row.uptime_s, row.wifi_rssi, row.sensor_tipo, row.sensor_status);
  return row;
}

function connection(ageS, solicitada, tel) {
  if (ageS == null) return 'SEM_DISPOSITIVO';
  if (ageS > ATRASADO_S) return 'OFFLINE';
  if (ageS > ONLINE_S) return 'ATRASADO';
  const alvo = solicitada || 'PARADO';
  const reportAge = tel && tel.report_age_s != null ? Number(tel.report_age_s) : null;
  const confirmado = reportAge != null && reportAge <= ONLINE_S && (tel.fase_aplicada === alvo || (tel.fase_aplicada == null && tel.fase_recebida === alvo));
  if (alvo !== 'PARADO' && !confirmado) return 'SEM_CONFIRMACAO';
  return 'ONLINE';
}

// Estado para o ADMIN: um item por digestor 1-4, independentes.
function status() {
  const now = Date.now();
  const sol = db.prepare('SELECT digestor_id,fase,valid_until_ms FROM automacao_sinaleiros_bancada').all();
  const tels = db.prepare(`SELECT t.*, d.device_id, d.last_seen_at AS dev_seen,
      CAST(strftime('%s','now') - strftime('%s',t.last_poll_at) AS INTEGER) AS poll_age_s,
      CAST(strftime('%s','now') - strftime('%s',t.reported_at) AS INTEGER) AS report_age_s
    FROM automacao_bancada_telemetria t JOIN automacao_dispositivos d ON d.id=t.device_pk WHERE d.status='ATIVO'`).all();
  const scoped = db.prepare("SELECT device_id,digestor_id,CAST(strftime('%s','now') - strftime('%s',last_seen_at) AS INTEGER) AS age_s FROM automacao_dispositivos WHERE status='ATIVO' AND digestor_id IS NOT NULL").all();
  const out = [];
  for (let id = 1; id <= 4; id++) {
    const s = sol.find((x) => x.digestor_id === id);
    const restante = s ? Math.max(0, Number(s.valid_until_ms) - now) : 0;
    const fase_solicitada = s && restante > 0 ? s.fase : 'PARADO';
    const t = tels.filter((x) => x.digestor_id === id).sort((a, b) => Math.min(a.poll_age_s ?? 1e9, a.report_age_s ?? 1e9) - Math.min(b.poll_age_s ?? 1e9, b.report_age_s ?? 1e9))[0] || null;
    const ages = [];
    if (t) { if (t.poll_age_s != null) ages.push(Number(t.poll_age_s)); if (t.report_age_s != null) ages.push(Number(t.report_age_s)); }
    const sc = scoped.find((x) => x.digestor_id === id);
    if (sc && sc.age_s != null) ages.push(Number(sc.age_s));
    const age = ages.length ? Math.min(...ages) : null;
    out.push({
      digestor_id: id,
      device_id: t ? t.device_id : (sc ? sc.device_id : null),
      fase_solicitada, validade_ms: restante,
      fase_entregue: t ? t.fase_entregue : null,
      fase_recebida: t ? t.fase_recebida : null,
      fase_aplicada: t ? t.fase_aplicada : null,
      saida_confirmada: t && t.saida_confirmada != null ? !!t.saida_confirmada : null,
      origem: t ? t.origem : 'SIMULACAO',
      ultimo_contato_s: age,
      ultima_confirmacao_s: t && t.report_age_s != null ? Number(t.report_age_s) : null,
      conexao: connection(age, fase_solicitada, t),
      firmware: t ? t.firmware : null,
      sensor_status: t ? t.sensor_status : 'SEM_SENSOR',
      pt100_habilitado: PT100_HABILITADO,
      temperatura_c: null,
    });
  }
  return { ok: true, modo: 'SIMULACAO', comando_industrial_habilitado: false, digestores: out, duracao_ms: bancada.DURACAO_MS };
}
module.exports = { recordPoll, recordReport, status, PT100_HABILITADO };
