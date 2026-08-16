const test = require('node:test');
const assert = require('node:assert/strict');
const { requireTrustedAIWrite } = require('../modules/ai/ai.security.middleware');

function makeReq(headers = {}, protocol = 'https') {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    headers: normalized,
    protocol,
    get(name) { return this.headers[String(name || '').toLowerCase()]; },
  };
}

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function run(req) {
  const res = makeRes();
  let nextCalled = false;
  requireTrustedAIWrite(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('aceita POST same-origin atrás do proxy Railway', () => {
  const result = run(makeReq({
    'x-forwarded-host': 'manutencao.campodogado.app.br',
    'x-forwarded-proto': 'https',
    origin: 'https://manutencao.campodogado.app.br',
    'sec-fetch-site': 'same-origin',
  }));
  assert.equal(result.nextCalled, true);
  assert.equal(result.res.statusCode, 200);
});

test('rejeita explicitamente browser cross-site', () => {
  const result = run(makeReq({
    host: 'manutencao.campodogado.app.br',
    origin: 'https://manutencao.campodogado.app.br',
    'sec-fetch-site': 'cross-site',
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.payload?.code, 'AI_ORIGIN_DENIED');
});

test('rejeita Origin diferente do backend', () => {
  const result = run(makeReq({
    host: 'manutencao.campodogado.app.br',
    origin: 'https://exemplo-malicioso.test',
    'sec-fetch-site': 'same-site',
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
});

test('rejeita Referer divergente quando Origin não está presente', () => {
  const result = run(makeReq({
    host: 'manutencao.campodogado.app.br',
    referer: 'https://exemplo-malicioso.test/pagina',
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
});

test('aceita cliente legado/nativo sem metadata de navegador e deixa sessão/RBAC decidirem depois', () => {
  const result = run(makeReq({ host: 'manutencao.campodogado.app.br' }));
  assert.equal(result.nextCalled, true);
  assert.equal(result.res.statusCode, 200);
});

test('rejeita Origin null em requisição que declara Origin', () => {
  const result = run(makeReq({
    host: 'manutencao.campodogado.app.br',
    origin: 'null',
  }));
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
});
