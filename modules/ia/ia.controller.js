const { transcreverAudioOS, transcreverAudioFechamento } = require('./ia.service');

const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
]);

const MAX_AUDIO_BYTES = Number(process.env.OPENAI_AUDIO_MAX_BYTES || 12 * 1024 * 1024);

function validateAudioFile(file) {
  if (!file) return 'Envie um arquivo de áudio.';
  const mimeType = String(file.mimetype || '').toLowerCase();
  const normalizedMime = mimeType.split(';')[0].trim();
  if (!ALLOWED_MIME.has(normalizedMime)) return 'Formato de áudio inválido. Use webm, ogg, mp3, m4a ou wav.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'Arquivo de áudio inválido.';
  if (file.size > MAX_AUDIO_BYTES) return `Áudio excede o limite de ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))}MB.`;
  return null;
}

function friendlyTranscriptionError(err) {
  const code = String(err?.code || 'AI_ERROR');
  if (code === 'AI_TIMEOUT') return 'A transcrição demorou além do esperado. Continue com preenchimento manual sem bloqueio.';
  if (code === 'AI_DISABLED' || code === 'AI_KEY_MISSING' || code === 'AI_KEY_PLACEHOLDER') {
    return 'Transcrição por áudio indisponível no momento (configuração da IA). Continue com preenchimento manual sem bloqueio.';
  }
  return 'Não foi possível transcrever agora (falha temporária). Continue com preenchimento manual sem bloqueio.';
}

async function transcreverAbertura(req, res) {
  const file = req.file;
  const fileError = validateAudioFile(file);
  if (fileError) return res.status(400).json({ transcricao_bruta: '', status: 'erro_validacao', fonte: 'audio', erro: fileError });

  try {
    const result = await transcreverAudioOS({ buffer: file.buffer, mimeType: file.mimetype });
    return res.json({ transcricao_bruta: result.text, status: 'concluido', fonte: 'audio' });
  } catch (err) {
    const erroAmigavel = friendlyTranscriptionError(err);
    console.warn('[ia.transcreverAbertura]', { code: err?.code, technical: err?.technical || err?.message });
    return res.status(200).json({ transcricao_bruta: '', status: 'erro', fonte: 'audio', erro: erroAmigavel });
  }
}

async function transcreverFechamento(req, res) {
  const file = req.file;
  const fileError = validateAudioFile(file);
  if (fileError) return res.status(400).json({ transcricao_bruta: '', status: 'erro_validacao', fonte: 'audio', erro: fileError });

  try {
    const result = await transcreverAudioFechamento({ buffer: file.buffer, mimeType: file.mimetype });
    return res.json({ transcricao_bruta: result.text, status: 'concluido', fonte: 'audio' });
  } catch (err) {
    const erroAmigavel = friendlyTranscriptionError(err);
    console.warn('[ia.transcreverFechamento]', { code: err?.code, technical: err?.technical || err?.message });
    return res.status(200).json({ transcricao_bruta: '', status: 'erro', fonte: 'audio', erro: erroAmigavel });
  }
}

module.exports = {
  transcreverAbertura,
  transcreverFechamento,
};
