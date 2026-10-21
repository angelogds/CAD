const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const origin = 'https://manutencao.example';
const source = fs.readFileSync(path.join(__dirname, '../public/service-worker.js'), 'utf8');

function loadWorker(cachedPaths = []) {
  const handlers = {};
  const calls = { matches: [], fetches: [], deletedRequests: [], deletedCaches: [], preCached: [] };
  const cachedResponse = { body: 'cached', ok: true };
  const networkResponse = { body: 'network', ok: true, clone() { return this; } };
  const cache = {
    async keys() { return cachedPaths.map((url) => ({ url: new URL(url, origin).href })); },
    async delete(request) { calls.deletedRequests.push(request.url); return true; },
    async put() {},
    async addAll(urls) { calls.preCached.push(...urls); },
  };
  const self = {
    location: { origin },
    addEventListener(name, handler) { handlers[name] = handler; },
    async skipWaiting() { calls.skippedWaiting = true; },
    clients: { async claim() { calls.claimed = true; } },
  };
  vm.runInNewContext(source, {
    self,
    URL,
    caches: {
      async keys() { return ['campo-do-gado-v2-mobile', 'old-cache']; },
      async delete(name) { calls.deletedCaches.push(name); return true; },
      async open() { return cache; },
      async match(request) { calls.matches.push(request.url); return cachedResponse; },
    },
    async fetch(request) { calls.fetches.push(request.url); return networkResponse; },
  });
  return { handlers, calls, cachedResponse };
}

function request(worker, pathname, method = 'GET') {
  let response;
  worker.handlers.fetch({
    request: { method, url: new URL(pathname, origin).href },
    respondWith(value) { response = value; },
  });
  return response;
}

test('Escala sempre passa para a rede, incluindo raiz e formulário com parâmetros', () => {
  const worker = loadWorker();
  for (const pathname of ['/escala', '/escala/', '/escala/hora-extra/nova?colaborador_id=2']) {
    assert.equal(request(worker, pathname), undefined, pathname);
  }
  assert.deepEqual(worker.calls.matches, []);
  assert.deepEqual(worker.calls.fetches, []);
});

test('CSS e caminhos fora da fronteira /escala preservam cache com atualização pela rede', async () => {
  const worker = loadWorker();
  for (const pathname of ['/css/app.css?v=20260919-1', '/escalacao/exemplo']) {
    assert.equal(await request(worker, pathname), worker.cachedResponse);
  }
  assert.equal(worker.calls.matches.length, 2);
  assert.equal(worker.calls.fetches.length, 2);
});

test('push, autenticação, mobile e envio de formulário mantêm bypass existente', () => {
  const worker = loadWorker();
  for (const pathname of ['/push/status', '/auth/login', '/mobile/status']) {
    assert.equal(request(worker, pathname), undefined);
  }
  assert.equal(request(worker, '/escala/hora-extra/iniciar', 'POST'), undefined);
  assert.deepEqual(worker.calls.matches, []);
  assert.deepEqual(worker.calls.fetches, []);
});

test('ativação remove HTML antigo da Escala preservando demais entradas do cache atual', async () => {
  const worker = loadWorker([
    '/escala',
    '/escala/hora-extra/nova?colaborador_id=2',
    '/css/app.css?v=20260919-1',
    '/dashboard',
    '/escalacao/exemplo',
  ]);
  let activation;
  worker.handlers.activate({ waitUntil(value) { activation = value; } });
  await activation;

  assert.deepEqual(worker.calls.deletedRequests, [
    `${origin}/escala`,
    `${origin}/escala/hora-extra/nova?colaborador_id=2`,
  ]);
  assert.deepEqual(worker.calls.deletedCaches, ['old-cache']);
  assert.equal(worker.calls.claimed, true);
});

test('instalação mantém assets offline existentes e permite ativação imediata', async () => {
  const worker = loadWorker();
  let installation;
  worker.handlers.install({ waitUntil(value) { installation = value; } });
  await installation;

  assert.equal(worker.calls.skippedWaiting, true);
  assert.ok(worker.calls.preCached.includes('/css/app.css?v=20260919-1'));
  assert.ok(worker.calls.preCached.includes('/dashboard'));
  for (const asset of worker.calls.preCached) {
    const pathname = new URL(asset, origin).pathname;
    if (pathname === '/' || pathname === '/dashboard') continue;
    assert.ok(fs.existsSync(path.join(__dirname, '../public', pathname)), `Asset de instalação ausente: ${pathname}`);
  }
});
