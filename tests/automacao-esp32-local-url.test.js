'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLocalUrl } = require('../modules/automacao/esp32-local-url');

test('aceita IP privado e .local, normalizando URL', () => {
  assert.equal(normalizeLocalUrl('http://192.168.1.77'), 'http://192.168.1.77/');
  assert.equal(normalizeLocalUrl('http://10.1.2.3:8080'), 'http://10.1.2.3:8080/');
  assert.equal(normalizeLocalUrl('http://esp32-digestor-01.local'), 'http://esp32-digestor-01.local/');
  assert.equal(normalizeLocalUrl(''), null);
});
test('rejeita domínios públicos, credenciais e esquemas perigosos', () => {
  ['https://192.168.1.77', 'http://example.com', 'http://8.8.8.8',
   'http://127.0.0.1', 'http://192.168.1.2/path', 'http://user:pass@192.168.1.3',
   'javascript:alert(1)', 'http://192.168.1.3/?token=abc', 'http://192.168.1.3/#x']
   .forEach((url) => assert.throws(() => normalizeLocalUrl(url), url));
});
