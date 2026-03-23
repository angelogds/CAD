const test = require('node:test');
const assert = require('node:assert/strict');

const iaService = require('../modules/academia/academia-ia.service');

test('Professor IA usa modelo padrão quando OPENAI_MODEL_ACADEMIA não está definido', async () => {
  const previousEnv = {
    AI_ENABLED: process.env.AI_ENABLED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_APIKEY: process.env.OPENAI_APIKEY,
    OPENAI_KEY: process.env.OPENAI_KEY,
    OPENAI_MODEL_ACADEMIA: process.env.OPENAI_MODEL_ACADEMIA,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_DEFAULT_MODEL: process.env.OPENAI_DEFAULT_MODEL,
  };

  const originalFetch = global.fetch;
  let payloadSent = null;

  try {
    process.env.AI_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'sk-test-key-123';
    delete process.env.OPENAI_APIKEY;
    delete process.env.OPENAI_KEY;
    delete process.env.OPENAI_MODEL_ACADEMIA;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_DEFAULT_MODEL;

    global.fetch = async (_url, options) => {
      payloadSent = JSON.parse(options.body || '{}');
      return {
        ok: true,
        async json() {
          return { output_text: 'Resposta de teste' };
        },
      };
    };

    const result = await iaService.responderProfessorIA({
      usuarioId: null,
      cursoId: null,
      action: 'perguntar',
      pergunta: 'Teste do professor IA',
    });

    assert.equal(result.ok, true);
    assert.equal(payloadSent.model, 'gpt-4o-mini');
  } finally {
    global.fetch = originalFetch;
    Object.entries(previousEnv).forEach(([k, v]) => {
      if (typeof v === 'undefined') delete process.env[k];
      else process.env[k] = v;
    });
  }
});
