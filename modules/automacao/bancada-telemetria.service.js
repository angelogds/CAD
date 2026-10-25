// Telemetria da bancada (sinaleiros). Distingue: fase solicitada (CAD), recebida e aplicada (firmware),
// confirmacao de saida (somente se o firmware informar) e ultimo contato. Nao comanda processo industrial.
const db = require('../../database/db');
const bancada = require('./sinaleiro-bancada.service');
const { classifyTemperature, legacySignal, FAIXAS, CORES } = require('./temperatura-sinaleiro');

const FASES_TEL = ['INICIO', 'MEIO', 'FINAL', 'PARADO'];
const SENSOR_STATUS = ['SEM_SENSOR', 'SEM_SINAL', 'VALIDO', 'FALHA'];
const ORIGENS = ['SIMULACAO', 'REAL'];
const ORIGEM_BANCADA = 'SIMULACAO';
const ONLINE_S = 15;
const ATRASADO_S = 90;
const PT100_HABILITADO = true;

function bad(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }
function enumOrNull(v, list, label) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  if (!list.includes(s)) throw bad(label + ' inválido(a).');
  return s;
}
const intOrNull = (v) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

// entregue_desde_ms marca a 1a entrega da versao/fase atual; relatorios anteriores a ela nao a confirmam.
function recordPoll(deviceRow, digestorId, faseEntregue, versao) {
  const v = Number.isInteger(versao) ? versao : null;
  db.prepare(`INSERT INTO automacao_bancada_telemetria (device_pk,digestor_id,last_poll_at,fase_entregue,versao_entregue,entregue_desde_ms) VALUES (?,?,datetime('now'),?,?,?)
    ON CONFLICT(device_pk,digestor_id) DO UPDATE SET last_poll_at=excluded.last_poll_at,
      entregue_desde_ms=CASE WHEN automacao_bancada_telemetria.versao_entregue IS excluded.versao_entregue AND automacao_bancada_telemetria.fase_entregue IS excluded.fase_entregue AND automacao_bancada_telemetria.entregue_desde_ms IS NOT NULL THEN automacao_bancada_telemetria.entregue_desde_ms ELSE excluded.entregue_desde_ms END,
      fase_entregue=excluded.fase_entregue, versao_entregue=excluded.versao_entregue`)
    .run(deviceRow.id, digestorId, faseEntregue, v, Date.now());
}

// REAL exige um pacote completo. Nunca usa a temperatura para comandar GPIOs pelo CAD.
function normalizeReading(b) {
  const origem = enumOrNull(b.origem, ORIGENS, 'origem') || ORIGEM_BANCADA;
  const sensorIn = enumOrNull(b.sensor_status, SENSOR_STATUS, 'sensor_status');
  const sensor_status = origem === 'REAL' ? sensorIn : (sensorIn === 'FALHA' ? 'FALHA' : 'SEM_SENSOR');
  const unavailable = { temperatura_c: null, timestamp_medicao: null, faixa_temperatura: 'SENSOR_INDISPONIVEL', cor_sinaleiro: 'DESLIGADO', pronto_descarga: false };
  if (origem === 'REAL') {
    if (b.sensor_tipo !== 'PT100' || !sensor_status) throw bad('Operação REAL exige sensor_tipo PT100 e sensor_status.');
    if (sensor_status !== 'VALIDO') {
      if (b.temperatura_c != null || b.timestamp_medicao != null || b.pronto_descarga !== false || b.cor_sinaleiro !== 'DESLIGADO' || b.faixa_temperatura !== 'SENSOR_INDISPONIVEL') throw bad('Sensor indisponível exige temperatura/timestamp nulos, sinaleiro desligado e pronto_descarga false.');
      return { origem, sensor_tipo: 'PT100', sensor_status, ...unavailable };
    }
    const expected = classifyTemperature(b.temperatura_c);
    if (!expected) throw bad('temperatura_c deve ser um número finito entre 0 e 850 °C.');
    const ms = typeof b.timestamp_medicao === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(b.timestamp_medicao) ? Date.parse(b.timestamp_medicao) : NaN;
    if (!Number.isFinite(ms) || ms > Date.now() + 30000 || ms < Date.now() - ONLINE_S * 1000) throw bad('timestamp_medicao deve ser uma leitura UTC atual (até 15 s).');
    const faixa = enumOrNull(b.faixa_temperatura, FAIXAS, 'faixa_temperatura');
    const cor = enumOrNull(b.cor_sinaleiro, CORES, 'cor_sinaleiro');
    if (faixa !== expected.faixa_temperatura || cor !== expected.cor_sinaleiro || typeof b.pronto_descarga !== 'boolean' || b.pronto_descarga !== expected.pronto_descarga) throw bad('Faixa, cor e indicador de pronto inconsistentes com a leitura informada.');
    // Persiste os campos reportados pelo ESP32; a decisão física continua local.
    return { origem, sensor_tipo: 'PT100', sensor_status, temperatura_c: b.temperatura_c, timestamp_medicao: new Date(ms).toISOString(), faixa_temperatura: faixa, cor_sinaleiro: cor, pronto_descarga: b.pronto_descarga };
  }
  // Compatibilidade: temperatura sem origem explícita continua sem valor de processo.
  const t = b.origem === 'SIMULACAO' && b.temperatura_c != null ? b.temperatura_c : null;
  if (t != null && !classifyTemperature(t)) throw bad('Temperatura simulada inválida.');
  const signal = t == null ? legacySignal(b.fase_aplicada || b.fase || 'PARADO') : classifyTemperature(t);
  return { origem, sensor_tipo: null, sensor_status, ...unavailable, ...signal, temperatura_c: t };
}

function recordReport(deviceRow, digestorId, b) {
  const fase_recebida = enumOrNull(b.fase_recebida, FASES_TEL, 'fase_recebida');
  const fase_aplicada = enumOrNull(b.fase_aplicada, FASES_TEL, 'fase_aplicada');
  const reading = normalizeReading(b);
  if (reading.origem === 'REAL' && reading.sensor_status === 'VALIDO') {
    const previous = db.prepare('SELECT origem,sensor_status,timestamp_medicao,reported_ms,temperatura_c,cor_sinaleiro FROM automacao_bancada_telemetria WHERE device_pk=? AND digestor_id=?').get(deviceRow.id, digestorId);
    if (previous && previous.origem === 'REAL') {
      const previousMs = previous.timestamp_medicao ? Date.parse(previous.timestamp_medicao) : Number(previous.reported_ms);
      const incomingMs = Date.parse(reading.timestamp_medicao);
      if (Number.isFinite(previousMs) && (incomingMs < previousMs || (incomingMs === previousMs && previous.sensor_status === 'VALIDO' && (previous.temperatura_c !== reading.temperatura_c || previous.cor_sinaleiro !== reading.cor_sinaleiro)))) throw bad('Leitura anterior à última medição ou conflitante com o mesmo timestamp.');
    }
  }
  const versao_reportada = intOrNull(b.versao_fase);
  let saida = null;
  if (b.saida_confirmada !== undefined && b.saida_confirmada !== null) {
    if (typeof b.saida_confirmada !== 'boolean') throw bad('saida_confirmada deve ser true ou false.');
    if (!fase_aplicada && reading.origem !== 'REAL') throw bad('saida_confirmada exige fase_aplicada.');
    saida = b.saida_confirmada ? 1 : 0;
  }
  const row = { ...reading, fase_recebida, fase_aplicada, saida,
    firmware: b.firmware == null ? null : String(b.firmware).slice(0, 40),
    uptime_s: intOrNull(b.uptime_s), wifi_rssi: intOrNull(b.wifi_rssi), versao_reportada };
  const columns = ['fase_recebida','fase_aplicada','saida_confirmada','origem','firmware','uptime_s','wifi_rssi','sensor_tipo','sensor_status','temperatura_c','timestamp_medicao','versao_reportada','reported_ms','faixa_temperatura','cor_sinaleiro','pronto_descarga'];
  const values = [fase_recebida, fase_aplicada, saida, row.origem, row.firmware, row.uptime_s, row.wifi_rssi, row.sensor_tipo, row.sensor_status, row.temperatura_c, row.timestamp_medicao, versao_reportada, Date.now(), row.faixa_temperatura, row.cor_sinaleiro, row.pronto_descarga ? 1 : 0];
  db.prepare(`INSERT INTO automacao_bancada_telemetria (device_pk,digestor_id,reported_at,${columns.join(',')}) VALUES (?,?,datetime('now'),${columns.map(()=>'?').join(',')})
    ON CONFLICT(device_pk,digestor_id) DO UPDATE SET reported_at=excluded.reported_at,${columns.map(c=>`${c}=excluded.${c}`).join(',')}`)
    .run(deviceRow.id, digestorId, ...values);
  return row;
}

// Somente comunicacao (contato recente). Nao diz nada sobre aplicacao da fase.
function connection(ageS) {
  if (ageS == null) return 'SEM_DISPOSITIVO';
  if (ageS > ATRASADO_S) return 'OFFLINE';
  if (ageS > ONLINE_S) return 'ATRASADO';
  return 'ONLINE';
}

// O relatorio de /estado so vale para o comando ATUAL se for correlacionavel a ele:
//  - comando ativo: versao_fase ecoada == versao publicada (VERSAO); firmware antigo (sem versao_fase):
//    relatorio posterior a 1a entrega dessa versao ao ESP32 (TEMPORAL);
//  - PARADO/expirado: relatorio posterior a publicacao do PARADO ou ao vencimento do comando (TEMPORAL).
// Relatorio dentro da janela de 15 s mas anterior ao comando NAO confirma nada.
function relatorioAtual(t, s, ativo) {
  if (!t || t.reported_ms == null || t.report_age_s == null || Number(t.report_age_s) > ONLINE_S) return null;
  if (ativo) {
    if (t.versao_reportada != null) return Number(t.versao_reportada) === Number(s.versao) ? 'VERSAO' : null;
    return t.versao_entregue != null && Number(t.versao_entregue) === Number(s.versao) && t.entregue_desde_ms != null && Number(t.reported_ms) >= Number(t.entregue_desde_ms) ? 'TEMPORAL' : null;
  }
  const ref = s ? (s.fase === 'PARADO' ? Number(s.published_at_ms) || 0 : Number(s.valid_until_ms)) : 0;
  return Number(t.reported_ms) >= ref ? 'TEMPORAL' : null;
}

function confirmacao(alvo, t, corr, comunicacao) {
  const pend = { correlacao: null, recebida_status: 'PENDENTE', aplicacao_status: 'PENDENTE', saida_status: 'NAO_INFORMADA' };
  if (!corr || comunicacao !== 'ONLINE') return pend;
  const cmp = (v) => (v == null ? 'NAO_INFORMADA' : v === alvo ? 'CONFIRMADA' : 'DIVERGENTE');
  const aplicacao_status = cmp(t.fase_aplicada);
  let saida_status = 'NAO_INFORMADA';
  if (aplicacao_status === 'CONFIRMADA' && t.saida_confirmada != null) saida_status = t.saida_confirmada ? 'CONFIRMADA' : 'NAO_CONFIRMADA';
  return { correlacao: corr, recebida_status: cmp(t.fase_recebida), aplicacao_status, saida_status };
}

// Estado para o ADMIN: um item por digestor 1-4, independentes.
function status() {
  const now = Date.now();
  const sol = db.prepare('SELECT digestor_id,fase,valid_until_ms,versao,published_at_ms FROM automacao_sinaleiros_bancada').all();
  const tels = db.prepare(`SELECT t.*, d.device_id, d.last_seen_at AS dev_seen,
      CAST(strftime('%s','now') - strftime('%s',d.last_seen_at) AS INTEGER) AS dev_age_s,
      CAST(strftime('%s','now') - strftime('%s',t.last_poll_at) AS INTEGER) AS poll_age_s,
      CAST(strftime('%s','now') - strftime('%s',t.reported_at) AS INTEGER) AS report_age_s
    FROM automacao_bancada_telemetria t JOIN automacao_dispositivos d ON d.id=t.device_pk WHERE d.status='ATIVO'`).all();
  const scoped = db.prepare("SELECT device_id,digestor_id,CAST(strftime('%s','now') - strftime('%s',last_seen_at) AS INTEGER) AS age_s FROM automacao_dispositivos WHERE status='ATIVO' AND digestor_id IS NOT NULL").all();
  const out = [];
  for (let id = 1; id <= 4; id++) {
    const s = sol.find((x) => x.digestor_id === id);
    const restante = s ? Math.max(0, Number(s.valid_until_ms) - now) : 0;
    const ativo = !!s && restante > 0 && s.fase !== 'PARADO';
    const comando_expirado = !!s && s.fase !== 'PARADO' && restante === 0;
    const fase_solicitada = ativo ? s.fase : 'PARADO';
    const t = tels.filter((x) => x.digestor_id === id).sort((a, b) => (Number(b.reported_ms) || 0) - (Number(a.reported_ms) || 0) || Math.min(a.poll_age_s ?? 1e9, a.report_age_s ?? 1e9) - Math.min(b.poll_age_s ?? 1e9, b.report_age_s ?? 1e9))[0] || null;
    const ages = [];
    if (t) { if (t.poll_age_s != null) ages.push(Number(t.poll_age_s)); if (t.report_age_s != null) ages.push(Number(t.report_age_s)); if (t.dev_age_s != null) ages.push(Number(t.dev_age_s)); }
    const sc = scoped.find((x) => x.digestor_id === id && (!t || x.device_id === t.device_id));
    if (sc && sc.age_s != null) ages.push(Number(sc.age_s));
    const age = ages.length ? Math.min(...ages) : null;
    const comunicacao = connection(age);
    const corr = relatorioAtual(t, s, ativo);
    const conf = confirmacao(fase_solicitada, t, corr, comunicacao);
    const origem = t ? t.origem : ORIGEM_BANCADA;
    const telemetria_atual = !!t && t.report_age_s != null && Number(t.report_age_s) <= ONLINE_S;
    const timestampMs = t && t.timestamp_medicao ? Date.parse(t.timestamp_medicao) : NaN;
    const medicao_atual = origem === 'REAL' && telemetria_atual && t.sensor_status === 'VALIDO' && Number.isFinite(timestampMs) && now - timestampMs <= ONLINE_S * 1000 && timestampMs <= now + 30000;
    const estado_atual = origem === 'REAL' ? medicao_atual : telemetria_atual;

    out.push({
      digestor_id: id,
      device_id: t ? t.device_id : (sc ? sc.device_id : null),
      fase_solicitada, validade_ms: restante,
      fase_entregue: t ? t.fase_entregue : null,
      versao_fase: s ? Number(s.versao) : null,
      comando_expirado,
      // Somente relatorio correlacionado ao comando atual; relatorio antigo nao e exibido como confirmacao.
      fase_recebida: corr && comunicacao === 'ONLINE' ? t.fase_recebida : null,
      fase_aplicada: corr && comunicacao === 'ONLINE' ? t.fase_aplicada : null,
      saida_confirmada: conf.saida_status === 'CONFIRMADA' ? true : (conf.saida_status === 'NAO_CONFIRMADA' ? false : null),
      comunicacao, ...conf,
      origem, modo: origem, telemetria_atual, medicao_atual,
      medicao_idade_s: Number.isFinite(timestampMs) ? Math.max(0, (now - timestampMs) / 1000) : null,
      ultimo_contato_s: age,
      ultima_confirmacao_s: t && t.report_age_s != null ? Number(t.report_age_s) : null,
      conexao: comunicacao,
      firmware: t ? t.firmware : null,
      sensor_status: t ? t.sensor_status : 'SEM_SENSOR',
      sensor_tipo: t ? t.sensor_tipo : null,
      pt100_habilitado: origem === 'REAL',
      temperatura_c: estado_atual && t ? t.temperatura_c : null,
      timestamp_medicao: t ? t.timestamp_medicao : null,
      faixa_temperatura: estado_atual && t ? t.faixa_temperatura : (origem === 'REAL' && telemetria_atual && t.sensor_status !== 'VALIDO' ? 'SENSOR_INDISPONIVEL' : null),
      cor_sinaleiro: estado_atual && t ? t.cor_sinaleiro : (origem === 'REAL' && telemetria_atual && t.sensor_status !== 'VALIDO' ? 'DESLIGADO' : null),
      pronto_descarga: !!(estado_atual && t && t.pronto_descarga),
    });
  }
  return { ok: true, server_time: new Date(now).toISOString(), modo: out.some(d => d.origem === 'REAL') ? 'SUPERVISAO' : 'SIMULACAO', comando_industrial_habilitado: false, digestores: out, duracao_ms: bancada.DURACAO_MS };
}
module.exports = { recordPoll, recordReport, status, PT100_HABILITADO, normalizeReading };
