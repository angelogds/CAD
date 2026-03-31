const { getAIConfig } = require('../ai/ai.service');

const MIME_TO_FORMAT = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};

function buildError(code, message, technical, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.technical = technical || message;
  Object.assign(err, extra);
  return err;
}

function resolveAudioTimeoutMs(overrideMs) {
  const fromEnv = Number(process.env.OPENAI_AUDIO_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 25000);
  const fromInput = Number(overrideMs || 0);
  if (Number.isFinite(fromInput) && fromInput > 0) return fromInput;
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 25000;
}

function pickAudioFormat(mimeType) {
  return MIME_TO_FORMAT[String(mimeType || '').toLowerCase()] || 'webm';
}

function pickAudioModel() {
  return String(process.env.OPENAI_MODEL_AUDIO || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini-transcribe').trim();
}

async function transcreverAudioBase({ buffer, mimeType, prompt = '', timeoutMs }) {
  const cfg = getAIConfig();
  if (!cfg.enabled) throw buildError('AI_DISABLED', 'IA desativada no ambiente.', 'AI_ENABLED=false');
  if (!cfg.hasApiKey) throw buildError('AI_KEY_MISSING', 'IA ainda não ativada. Configure OPENAI_API_KEY.', 'OPENAI_API_KEY ausente');
  if (cfg.apiKeyLooksPlaceholder) {
    throw buildError('AI_KEY_PLACEHOLDER', 'Configuração da IA inválida. Revise a chave da API.', 'OPENAI_API_KEY parece placeholder');
  }
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
    throw buildError('AUDIO_EMPTY', 'Arquivo de áudio inválido.', 'Buffer vazio');
  }

  const chosenModel = pickAudioModel();
  const controller = new AbortController();
  const finalTimeoutMs = resolveAudioTimeoutMs(timeoutMs);
  const timeout = setTimeout(() => controller.abort(), finalTimeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: chosenModel,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: 'Transcreva o áudio em português-BR, retornando apenas texto plano.' }],
          },
          {
            role: 'user',
            content: [
              ...(prompt ? [{ type: 'input_text', text: String(prompt) }] : []),
              {
                type: 'input_audio',
                input_audio: {
                  data: buffer.toString('base64'),
                  format: pickAudioFormat(mimeType),
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw buildError(
        'AI_PROVIDER_ERROR',
        'Falha ao transcrever áudio no momento.',
        `OpenAI ${response.status}: ${body.slice(0, 500)}`,
        { providerStatus: response.status, providerBodySummary: body.slice(0, 500), providerModel: chosenModel }
      );
    }

    const data = await response.json();
    const text = String(
      data?.output_text
      || data?.output?.flatMap((i) => i?.content || []).find((c) => c?.type === 'output_text')?.text
      || ''
    ).trim();

    if (!text) throw buildError('AI_EMPTY_RESPONSE', 'A IA não retornou transcrição.', 'Resposta vazia da Responses API');
    return { text, model: chosenModel };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw buildError('AI_TIMEOUT', 'Tempo limite da transcrição atingido.', `Timeout de ${finalTimeoutMs}ms`);
    }
    if (error?.code) throw error;
    throw buildError('AI_NETWORK_ERROR', 'Falha de rede na transcrição.', error?.message || 'Erro de rede desconhecido');
  } finally {
    clearTimeout(timeout);
  }
}

async function transcreverAudioOS({ buffer, mimeType, timeoutMs }) {
  return transcreverAudioBase({
    buffer,
    mimeType,
    timeoutMs,
    prompt: 'Contexto: abertura de OS. Seja fiel à fala e mantenha detalhes técnicos.',
  });
}

async function transcreverAudioFechamento({ buffer, mimeType, timeoutMs }) {
  return transcreverAudioBase({
    buffer,
    mimeType,
    timeoutMs,
    prompt: 'Contexto: fechamento de OS. Preserve ações executadas, peças, testes e resultado final.',
  });
}

module.exports = {
  transcreverAudioOS,
  transcreverAudioFechamento,
};
