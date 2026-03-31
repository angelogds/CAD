const { getAIConfig, askJSONSchemaStrict } = require('../ai/ai.service');
const iaRepository = require('./ia.repository');
const { buildTeamSuggestion } = require('./ia.schema');
const {
  PROMPT_ABERTURA,
  PROMPT_FECHAMENTO,
  PROMPT_ACOES_INTELIGENTES,
  PROMPT_ANALISE_FOTOS_FECHAMENTO,
} = require('./ia.prompt');

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

function safeString(value) {
  const text = String(value || '').trim();
  return text || '';
}

function safeList(value, limit = 8) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : [];
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

async function gerarAberturaAutomaticaDaOS(payload = {}) {
  const entrada = payload?.nao_conformidade || {};
  const resposta = await askJSONSchemaStrict({
    systemPrompt: PROMPT_ABERTURA,
    model: process.env.OPENAI_MODEL_ABERTURA_OS || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
    schemaName: 'os_abertura_auto',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'criticidade_sugerida',
        'diagnostico_inicial',
        'causa_provavel',
        'risco_operacional',
        'risco_seguranca',
        'acao_corretiva',
        'acao_preventiva',
        'servico_sugerido',
        'prioridade_sugerida',
        'sugestao_equipe',
        'descricao_tecnica_os',
        'justificativa_interna',
      ],
      properties: {
        criticidade_sugerida: { type: 'string', enum: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] },
        diagnostico_inicial: { type: 'string' },
        causa_provavel: { type: 'string' },
        risco_operacional: { type: 'string' },
        risco_seguranca: { type: 'string' },
        acao_corretiva: { type: 'string' },
        acao_preventiva: { type: 'string' },
        servico_sugerido: { type: 'string' },
        prioridade_sugerida: { type: 'string', enum: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] },
        sugestao_equipe: {
          type: 'object',
          additionalProperties: false,
          required: ['quantidade_recomendada', 'perfil_minimo', 'racional'],
          properties: {
            quantidade_recomendada: { type: 'integer', minimum: 1, maximum: 6 },
            perfil_minimo: { type: 'string' },
            racional: { type: 'string' },
          },
        },
        descricao_tecnica_os: { type: 'string' },
        justificativa_interna: { type: 'string' },
      },
    },
    userPayload: payload,
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 450),
    temperature: 0.1,
  });

  const criticidade = safeString(resposta?.criticidade_sugerida || entrada?.severidade || 'MEDIA').toUpperCase();
  return {
    ...resposta,
    criticidade_sugerida: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].includes(criticidade) ? criticidade : 'MEDIA',
    prioridade_sugerida: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].includes(safeString(resposta?.prioridade_sugerida).toUpperCase())
      ? safeString(resposta.prioridade_sugerida).toUpperCase()
      : criticidade,
    sugestao_equipe: buildTeamSuggestion(criticidade, resposta?.sugestao_equipe),
  };
}

async function gerarFechamentoAutomaticoOS(payload = {}) {
  const result = await askJSONSchemaStrict({
    systemPrompt: PROMPT_FECHAMENTO,
    model: process.env.OPENAI_MODEL_FECHAMENTO_OS || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
    schemaName: 'os_fechamento_auto',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'descricao_servico_executado',
        'acao_corretiva_realizada',
        'recomendacao_para_evitar_reincidencia',
        'observacao_final_tecnica',
      ],
      properties: {
        descricao_servico_executado: { type: 'string' },
        acao_corretiva_realizada: { type: 'string' },
        recomendacao_para_evitar_reincidencia: { type: 'string' },
        observacao_final_tecnica: { type: 'string' },
      },
    },
    userPayload: payload,
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 450),
    temperature: 0.1,
  });
  return result;
}

async function analisarFotosFechamento({ fotos = [], audioTranscricao = null, contexto = {} }) {
  if (!Array.isArray(fotos) || !fotos.length) {
    return {
      observacao_ia: 'Sem imagens de fechamento para análise visual.',
      confianca: 0,
      evidencias_visuais: [],
    };
  }

  const result = await askJSONSchemaStrict({
    systemPrompt: PROMPT_ANALISE_FOTOS_FECHAMENTO,
    model: process.env.OPENAI_MODEL_FECHAMENTO_OS || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
    schemaName: 'os_foto_analise',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['observacao_ia', 'confianca', 'evidencias_visuais'],
      properties: {
        observacao_ia: { type: 'string' },
        confianca: { type: 'integer', minimum: 0, maximum: 100 },
        evidencias_visuais: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      },
    },
    userPayload: {
      regra: 'Use linguagem cautelosa. Não afirmar certeza absoluta. Áudio tem prioridade semântica.',
      audio_transcricao: safeString(audioTranscricao) || null,
      fotos,
      contexto,
    },
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 250),
    temperature: 0.1,
  });

  return {
    observacao_ia: safeString(result?.observacao_ia),
    confianca: Number.isFinite(Number(result?.confianca)) ? Number(result.confianca) : 0,
    evidencias_visuais: safeList(result?.evidencias_visuais),
  };
}

async function gerarAcoesInteligentes({ contexto = {}, historico = [] }) {
  const result = await askJSONSchemaStrict({
    systemPrompt: PROMPT_ACOES_INTELIGENTES,
    model: process.env.OPENAI_MODEL_FECHAMENTO_OS || process.env.OPENAI_MODEL_TEXT || 'gpt-4o-mini',
    schemaName: 'os_acoes_inteligentes',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['acoes_imediatas', 'acoes_preventivas', 'pecas_sugeridas', 'justificativa'],
      properties: {
        acoes_imediatas: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        acoes_preventivas: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        pecas_sugeridas: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        justificativa: { type: 'string' },
      },
    },
    userPayload: { contexto, historico },
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 350),
    temperature: 0.2,
  });

  return {
    acoes_imediatas: safeList(result?.acoes_imediatas),
    acoes_preventivas: safeList(result?.acoes_preventivas),
    pecas_sugeridas: safeList(result?.pecas_sugeridas),
    justificativa: safeString(result?.justificativa),
  };
}

function buscarHistoricoSemelhante(payload = {}) {
  return iaRepository.buscarHistoricoSemelhante(payload);
}

function registrarLogIA(payload = {}) {
  return iaRepository.registrarLogIA(payload);
}

async function gerarResumoTecnicoFechamento({ textoDigitado, transcricaoAudio, fotosMetadados, contexto }) {
  const fechamento = await gerarFechamentoAutomaticoOS({
    os_inicial: contexto || {},
    fechamento: {
      fonte_descricao: transcricaoAudio ? 'audio' : (Array.isArray(fotosMetadados) && fotosMetadados.length ? 'foto' : 'texto'),
      texto_digitado: safeString(textoDigitado) || null,
      transcricao_audio: safeString(transcricaoAudio) || null,
      fotos_metadados: Array.isArray(fotosMetadados) ? fotosMetadados : [],
    },
  });

  return safeString(
    fechamento?.descricao_servico_executado
    || fechamento?.observacao_final_tecnica
    || transcricaoAudio
    || textoDigitado
  );
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
  gerarAberturaAutomaticaDaOS,
  gerarFechamentoAutomaticoOS,
  registrarLogIA,
  transcreverAudioOS,
  transcreverAudioFechamento,
  gerarResumoTecnicoFechamento,
  analisarFotosFechamento,
  buscarHistoricoSemelhante,
  gerarAcoesInteligentes,
};
