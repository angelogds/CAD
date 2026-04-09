const db = require('../../database/db');
const { getAIConfig } = require('../ai/ai.service');
const { transcreverAudioOS, transcreverAudioFechamento, gerarAberturaAutomaticaDaOS } = require('./ia.service');

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
  if (fileError) {
    return res.status(400).json({
      ok: false,
      transcricao: '',
      transcricao_bruta: '',
      status: 'erro_validacao',
      fonte: 'audio',
      erro: fileError,
      pode_tentar_novamente: false,
    });
  }

  try {
    const result = await transcreverAudioOS({ buffer: file.buffer, mimeType: file.mimetype });
    const texto = String(result?.text || '').trim();
    return res.json({
      ok: true,
      transcricao: texto,
      transcricao_bruta: texto,
      status: texto ? 'concluido' : 'vazio',
      fonte: 'audio',
      erro: texto ? null : 'Áudio recebido, mas a transcrição retornou vazia. Continue com preenchimento manual sem bloqueio.',
      pode_tentar_novamente: !texto,
    });
  } catch (err) {
    const erroAmigavel = friendlyTranscriptionError(err);
    console.warn('[ia.transcreverAbertura]', { code: err?.code, technical: err?.technical || err?.message });
    return res.status(200).json({
      ok: false,
      transcricao: '',
      transcricao_bruta: '',
      status: 'erro',
      fonte: 'audio',
      erro: erroAmigavel,
      pode_tentar_novamente: true,
    });
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

async function analisarAberturaOS(req, res) {
  const descricao = String(req.body?.descricao || '').trim();
  const equipamentoIdRaw = req.body?.equipamento_id;
  const equipamentoId = Number(equipamentoIdRaw || 0) || null;

  if (!descricao || descricao.length < 10) {
    return res.status(400).json({
      ok: false,
      error: 'Descreva o problema com pelo menos 10 caracteres para a análise da IA.',
    });
  }

  const equipamentoInfo = resolveEquipamentoInfo(equipamentoId);
  const payload = {
    usuario_id: req.session?.user?.id || null,
    nao_conformidade: {
      equipamento_id: equipamentoId,
      sintoma_principal: 'outro',
      severidade: 'MEDIA',
      nao_conformidade: descricao,
      observacao_curta: descricao,
    },
    contexto: {
      equipamento_info: equipamentoInfo,
    },
  };

  const aiConfig = getAIConfig();
  if (!aiConfig.enabled || !aiConfig.hasApiKey || aiConfig.apiKeyLooksPlaceholder) {
    console.log('[IA] IA desativada/configuração inválida → usando fallback manual');
    return res.json({
      ok: true,
      resultado: getFallbackAnalise(descricao),
      fonte: 'fallback_manual',
      aviso: 'IA indisponível no momento. Campos sugeridos preenchidos com fallback local; revise antes de salvar.',
    });
  }

  try {
    const resultado = await gerarAberturaAutomaticaDaOS(payload);
    return res.json({
      ok: true,
      resultado: {
        criticidade_sugerida: resultado?.criticidade_sugerida || 'MEDIA',
        diagnostico_inicial: resultado?.diagnostico_inicial || '',
        causa_mais_provavel: resultado?.causa_provavel || '',
        acoes_iniciais: resultado?.acao_preventiva || '',
        tempo_estimado_minutos: Number.isFinite(Number(resultado?.tempo_estimado)) ? Number(resultado.tempo_estimado) : 30,
      },
      fonte: 'ia',
    });
  } catch (err) {
    console.warn('[OS_CREATE][IA_WARN] Falha na IA de abertura. Seguindo com fallback manual.', {
      errorCode: err?.code || err?.message || null,
      technical: err?.technical || err?.message || String(err),
    });
    return res.status(200).json({
      ok: true,
      resultado: getFallbackAnalise(descricao),
      fonte: 'fallback_manual',
      aviso: 'Falha temporária da IA. Continue manualmente sem bloquear o salvamento da OS.',
    });
  }
}

function resolveEquipamentoInfo(equipamentoId) {
  if (!equipamentoId) return 'Não informado';
  try {
    const eq = db.prepare('SELECT nome, setor FROM equipamentos WHERE id = ?').get(equipamentoId);
    if (!eq) return 'Não informado';
    const nome = String(eq.nome || '').trim();
    const setor = String(eq.setor || '').trim();
    return `${nome || 'Equipamento sem nome'}${setor ? ` (${setor})` : ''}`;
  } catch (_error) {
    return 'Não informado';
  }
}

function getFallbackAnalise(descricao) {
  const resumo = String(descricao || '').trim();
  return {
    criticidade_sugerida: 'MEDIA',
    diagnostico_inicial: `Problema relatado: ${resumo.slice(0, 80)}${resumo.length > 80 ? '...' : ''}`,
    causa_mais_provavel: 'Necessita análise técnica no local',
    acoes_iniciais: 'Verificar equipamento, tirar fotos e registrar sintomas',
    tempo_estimado_minutos: 30,
  };
}

module.exports = {
  transcreverAbertura,
  transcreverFechamento,
  analisarAberturaOS,
};
