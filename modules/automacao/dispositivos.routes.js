// API HTTPS iniciada pelo ESP32. Montada antes da sessão (sem cookies) e autenticada por token Bearer.
// Telemetria e poll de simulação; teste físico de canais exige autorização local no ESP32.
// Não oferece armamento remoto, comandos de comporta, admissão de vapor ou descarga de material.
const express = require('express');
const svc = require('./dispositivos.service');
const bancada = require('./sinaleiro-bancada.service');

const router = express.Router();
const failures = new Map(); // ip -> { n, reset }
const MAX_FAILS = 10;
const WINDOW_MS = 5 * 60 * 1000;

function blocked(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() > f.reset) { failures.delete(ip); return false; }
  return f.n >= MAX_FAILS;
}
function fail(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() > f.reset) failures.set(ip, { n: 1, reset: Date.now() + WINDOW_MS });
  else f.n += 1;
}

function deviceAuth(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  if (blocked(req.ip)) return res.status(429).json({ ok: false, error: 'muitas tentativas' });
  const m = /^Bearer (\S+)$/.exec(req.get('authorization') || '');
  const device = m ? svc.authenticate(m[1]) : null;
  if (!device) { fail(req.ip); return res.status(401).json({ ok: false, error: 'não autorizado' }); }
  req.device = device;
  return next();
}

const base = (req) => ({ ok: true, device_id: req.device.device_id, modo: 'SUPERVISAO', comando_habilitado: false, comandos: [], server_time: new Date().toISOString() });

router.post('/ping', deviceAuth, (req, res) => {
  svc.recordPing(req.device);
  res.json(base(req));
});

router.post('/estado', deviceAuth, (req, res) => {
  try {
    const r = svc.recordContact(req.device, req.body);
    res.json({ ...base(req), ...r });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'erro interno' });
  }
});

// Consulta iniciada pelo ESP32; pacote virtual de teste apenas para o digestor autorizado.
router.post('/sinaleiro-bancada', deviceAuth, (req,res) => {
  try {
    const id = bancada.digestorAutorizado(req.device, req.body && req.body.digestor_id);
    // R4: telemetria opcional na mesma viagem HTTPS do poll. Clientes antigos continuam válidos.
    const hasReport = Object.prototype.hasOwnProperty.call(req.body || {}, 'estado');
    if (hasReport) {
      const estado = req.body.estado;
      if (!estado || typeof estado !== 'object' || Array.isArray(estado))
        return res.status(400).json({ok:false,error:'Estado deve ser um objeto.'});
      if (Number(estado.digestor_id) !== id)
        return res.status(403).json({ok:false,error:'Estado e consulta devem pertencer ao mesmo digestor.'});
      svc.recordContact(req.device, estado);
    } else svc.recordPing(req.device);
    return res.json({...base(req),modo:'SIMULACAO',estado_recebido:hasReport,
      sinaleiro_bancada:bancada.poll(req.device,id)});
  } catch (e) { return res.status(e.status||500).json({ok:false,error:e.status?e.message:'erro interno'}); }
});
module.exports = router;
