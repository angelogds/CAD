// API HTTPS iniciada pelo ESP32. Montada antes da sessão (sem cookies) e autenticada por token Bearer.
// Somente recebe estados: não existe rota de comando para válvulas, vapor ou outros equipamentos.
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

const base = (req) => ({ ok: true, device_id: req.device.device_id, modo: 'SIMULACAO', comando_habilitado: false, comandos: [], server_time: new Date().toISOString() });

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

// Consulta iniciada pelo ESP32; somente sinalização e somente para o digestor autorizado.
router.post('/sinaleiro-bancada', deviceAuth, (req,res) => {
  try {
    svc.recordPing(req.device);
    return res.json({...base(req),sinaleiro_bancada:bancada.poll(req.device, req.body && req.body.digestor_id)});
  } catch (e) { return res.status(e.status||500).json({ok:false,error:e.status?e.message:'erro interno'}); }
});
module.exports = router;
