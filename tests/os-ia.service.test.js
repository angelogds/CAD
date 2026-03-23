const test = require('node:test');
const assert = require('node:assert/strict');

const osIAService = require('../modules/os/os-ia.service');

test('OS IA usa chave legada e modelo padrão quando variáveis específicas não estão definidas', async () => {
  const previousEnv = {
    AI_ENABLED: process.env.AI_ENABLED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_APIKEY: process.env.OPENAI_APIKEY,
    OPENAI_KEY: process.env.OPENAI_KEY,
    OPENAI_MODEL_OS_AUTOMATICA: process.env.OPENAI_MODEL_OS_AUTOMATICA,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_DEFAULT_MODEL: process.env.OPENAI_DEFAULT_MODEL,
  };

  const originalFetch = global.fetch;
  let authHeader = null;
  let modelSent = null;

  try {
    process.env.AI_ENABLED = 'true';
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_APIKEY;
    process.env.OPENAI_KEY = 'sk-legacy-os-key';
    delete process.env.OPENAI_MODEL_OS_AUTOMATICA;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_DEFAULT_MODEL;

    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body || '{}');
      authHeader = options.headers?.Authorization;
      modelSent = body.model;
      return {
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify({
              diagnostico_inicial: 'd',
              causa_provavel: 'c',
              risco_operacional: 'r',
              servico_sugerido: 's',
              prioridade_sugerida: 'MEDIA',
              observacao_seguranca: 'o',
              descricao_tecnica_os: 't',
            }),
          };
        },
      };
    };

    const result = await osIAService.gerarAberturaAutomaticaDaOS({
      usuario_id: null,
      os_id: null,
      nao_conformidade_id: null,
      nao_conformidade: { severidade: 'MEDIA' },
    });

    assert.equal(authHeader, 'Bearer sk-legacy-os-key');
    assert.equal(modelSent, 'gpt-4o-mini');
    assert.equal(result.prioridade_sugerida, 'MEDIA');
  } finally {
    global.fetch = originalFetch;
    Object.entries(previousEnv).forEach(([k, v]) => {
      if (typeof v === 'undefined') delete process.env[k];
      else process.env[k] = v;
    });
  }
});
