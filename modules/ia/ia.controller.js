const service = require("./ia.service");

async function transcreverAudioOS(req, res) {
  const result = await service.transcreverAudioOS(req.body || {});
  return res.json({ ok: true, data: result });
}

async function transcreverAudioFechamento(req, res) {
  const result = await service.transcreverAudioFechamento(req.body || {});
  return res.json({ ok: true, data: result });
}

async function gerarResumoTecnicoFechamento(req, res) {
  const result = await service.gerarResumoTecnicoFechamento(req.body || {});
  return res.json({ ok: true, data: result });
}

async function analisarFotosFechamento(req, res) {
  const result = await service.analisarFotosFechamento(req.body || {});
  return res.json({ ok: true, data: result });
}

function buscarHistoricoSemelhante(req, res) {
  const payload = {
    ...req.body,
    ...req.query,
  };
  const result = service.buscarHistoricoSemelhante(payload);
  return res.json({ ok: true, data: result });
}

async function gerarAcoesInteligentes(req, res) {
  const result = await service.gerarAcoesInteligentes(req.body || {});
  return res.json({ ok: true, data: result });
}

module.exports = {
  transcreverAudioOS,
  transcreverAudioFechamento,
  gerarResumoTecnicoFechamento,
  analisarFotosFechamento,
  buscarHistoricoSemelhante,
  gerarAcoesInteligentes,
};
