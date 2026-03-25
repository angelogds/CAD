const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const aiService = require('../modules/ai.service');

function withTempCwd(fn) {
  const previous = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-ai-config-'));
  try {
    process.chdir(tempDir);
    return fn(tempDir);
  } finally {
    process.chdir(previous);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('getAIConfig resolves legacy env keys (OPENAI_APIKEY)', () => {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_APIKEY: process.env.OPENAI_APIKEY,
    OPENAI_KEY: process.env.OPENAI_KEY,
    AI_ENABLED: process.env.AI_ENABLED,
  };

  try {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_APIKEY = 'sk-legacykey123';
    delete process.env.OPENAI_KEY;
    process.env.AI_ENABLED = 'true';

    const cfg = aiService.getAIConfig();
    assert.equal(cfg.isConfigured, true);
    assert.equal(cfg.apiKey, 'sk-legacykey123');
    assert.equal(cfg.source, 'env:OPENAI_APIKEY');
  } finally {
    Object.entries(previous).forEach(([k, v]) => {
      if (typeof v === 'undefined') delete process.env[k];
      else process.env[k] = v;
    });
  }
});

test('getAIConfig accepts malformed one-line .env fallback', () => {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_APIKEY: process.env.OPENAI_APIKEY,
    OPENAI_KEY: process.env.OPENAI_KEY,
    AI_ENABLED: process.env.AI_ENABLED,
  };

  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_APIKEY;
    delete process.env.OPENAI_KEY;
    process.env.AI_ENABLED = 'true';

    withTempCwd((tempDir) => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'sk-envline-123', 'utf8');
      const cfg = aiService.getAIConfig();
      assert.equal(cfg.isConfigured, true);
      assert.equal(cfg.apiKey, 'sk-envline-123');
      assert.equal(cfg.source, 'dotenv:one-line');
      assert.equal(cfg.compatibilityFallback, true);
    });
  } finally {
    Object.entries(previous).forEach(([k, v]) => {
      if (typeof v === 'undefined') delete process.env[k];
      else process.env[k] = v;
    });
  }
});
