#!/usr/bin/env node
require('dotenv').config();

const { getAIConfig } = require('../modules/ai/ai.service');

async function run() {
  const cfg = getAIConfig();
  const model = String(
    process.env.OPENAI_MODEL_ACADEMIA
    || process.env.OPENAI_MODEL_TEXT
    || 'gpt-4o-mini'
  ).trim() || 'gpt-4o-mini';

  console.log('[openai-test] Config:', {
    aiEnabled: cfg.enabled,
    hasApiKey: cfg.hasApiKey,
    apiKeyLooksPlaceholder: cfg.apiKeyLooksPlaceholder,
    apiKeySource: cfg.apiKeySource,
    model,
    timeoutMs: cfg.timeoutMs,
  });

  if (!cfg.enabled) {
    console.error('[openai-test] AI_ENABLED=false');
    process.exitCode = 1;
    return;
  }
  if (!cfg.hasApiKey) {
    console.error('[openai-test] OPENAI_API_KEY ausente');
    process.exitCode = 1;
    return;
  }
  if (cfg.apiKeyLooksPlaceholder) {
    console.error('[openai-test] OPENAI_API_KEY parece placeholder/inválida');
    process.exitCode = 1;
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_output_tokens: 20,
        input: 'Responda apenas OK',
      }),
    });

    const bodyText = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch (_e) {
      parsed = null;
    }

    if (!response.ok) {
      console.error('[openai-test] Falha na OpenAI:', {
        status: response.status,
        body: bodyText.slice(0, 500),
      });
      process.exitCode = 1;
      return;
    }

    console.log('[openai-test] Sucesso:', {
      status: response.status,
      output_text: parsed?.output_text || '',
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.error(`[openai-test] Timeout após ${cfg.timeoutMs}ms`);
    } else {
      console.error('[openai-test] Erro de runtime:', err?.message || err);
    }
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

run();
