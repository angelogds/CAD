const repository = require('./desenho-tecnico.repository');
const imageService = require('./desenho-tecnico.image.service');

function findCad(id) {
  const desenho = repository.getById(id);
  return desenho && desenho.tipo_origem === 'cad' ? desenho : null;
}

function upload(req, res) {
  const desenho = findCad(req.params.id);
  if (!desenho) return res.status(404).json({ ok: false, error: 'CAD não encontrado.' });
  if (!req.file?.buffer?.length) return res.status(400).json({ ok: false, error: 'Selecione uma imagem JPG ou PNG.' });

  try {
    const stored = imageService.saveImage({
      drawingId: desenho.id,
      buffer: req.file.buffer,
      originalName: req.file.originalname,
    });
    return res.status(201).json({
      ok: true,
      image: {
        assetId: stored.assetId,
        url: stored.url,
        mimeType: stored.mimeType,
        originalName: stored.originalName,
        size: stored.size,
      },
    });
  } catch (error) {
    const status = error.code === 'IMAGE_TOO_LARGE' ? 413 : error.code === 'UNSUPPORTED_IMAGE' ? 415 : 400;
    return res.status(status).json({ ok: false, error: error.message || 'Não foi possível salvar a imagem.' });
  }
}

function serve(req, res) {
  const desenho = findCad(req.params.id);
  if (!desenho) return res.status(404).end();

  try {
    const stored = imageService.resolveImage(desenho.id, req.params.assetId);
    if (!stored) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(stored.mimeType);
    return res.sendFile(stored.absolutePath);
  } catch (_error) {
    return res.status(404).end();
  }
}

module.exports = { upload, serve };
