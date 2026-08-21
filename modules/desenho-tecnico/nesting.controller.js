'use strict';

const service = require('./desenho-tecnico.service');
const cadPythonService = require('./cad-python.service');

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function nestingCadPython(req, res) {
  const desenho = service.getById(req.params.id);
  if (!desenho || desenho.tipo_origem !== 'cad') {
    return res.status(404).json({ ok: false, error: 'CAD não encontrado' });
  }

  const rawParts = Array.isArray(req.body?.parts) ? req.body.parts : [];
  const parts = rawParts.slice(0, 200).map((part, index) => ({
    id: String(part?.id || `P${index + 1}`).slice(0, 120),
    name: String(part?.name || `PEÇA ${index + 1}`).slice(0, 80),
    width_mm: number(part?.width_mm ?? part?.width),
    height_mm: number(part?.height_mm ?? part?.height),
    quantity: Math.max(1, Math.min(500, Math.trunc(number(part?.quantity, 1)))),
  })).filter((part) => part.width_mm > 0 && part.height_mm > 0);

  if (!parts.length) {
    return res.status(400).json({ ok: false, error: 'Informe pelo menos uma peça com largura e altura válidas.' });
  }

  const payload = {
    sheet_width_mm: number(req.body?.sheet_width_mm),
    sheet_height_mm: number(req.body?.sheet_height_mm),
    margin_mm: Math.max(0, number(req.body?.margin_mm, 10)),
    spacing_mm: Math.max(0, number(req.body?.spacing_mm, 5)),
    allow_rotate: req.body?.allow_rotate !== false,
    max_sheets: Math.max(1, Math.min(50, Math.trunc(number(req.body?.max_sheets, 20)))),
    parts,
  };

  if (!(payload.sheet_width_mm > 0 && payload.sheet_height_mm > 0)) {
    return res.status(400).json({ ok: false, error: 'Informe as dimensões válidas da chapa.' });
  }

  const result = await cadPythonService.nesting(payload);
  if (!result.ok) {
    return res.status(result.status || 503).json({
      ok: false,
      available: result.available,
      error: result.error,
    });
  }
  return res.json({ ok: true, data: result.data?.data || result.data });
}

module.exports = { nestingCadPython };
