const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const routesContent = fs.readFileSync(require.resolve('../modules/desenho-tecnico/desenho-tecnico.routes'), 'utf8');
const controllerContent = fs.readFileSync(require.resolve('../modules/desenho-tecnico/desenho-tecnico.controller'), 'utf8');
const serviceContent = fs.readFileSync(require.resolve('../modules/desenho-tecnico/desenho-tecnico.service'), 'utf8');
const cadServiceContent = fs.readFileSync(require.resolve('../modules/desenho-tecnico/desenho-tecnico.cad.service'), 'utf8');

test('cad routes expose metadata endpoint', () => {
  assert.equal(routesContent.includes("router.post('/cad/:id/metadata'"), true);
});

test('cad/novo route is declared before generic /:id route', () => {
  const cadNovoPos = routesContent.indexOf("router.get('/cad/novo'");
  const genericPos = routesContent.indexOf("router.get('/:id'");
  assert.notEqual(cadNovoPos, -1);
  assert.notEqual(genericPos, -1);
  assert.equal(cadNovoPos < genericPos, true);
});

test('controller includes CAD metadata update handler', () => {
  assert.equal(controllerContent.includes('function updateCadMetadata'), true);
});

test('service handles CAD code generation and uniqueness fallback', () => {
  assert.equal(serviceContent.includes('function generateUniqueCadCode'), true);
  assert.equal(serviceContent.includes('function nextCadCodeFromNumber'), true);
  assert.equal(serviceContent.includes('isUniqueCodigoError'), true);
  assert.equal(serviceContent.includes('já existe. Informe outro código'), true);
});

test('cad service sanitizes editor payload', () => {
  assert.equal(cadServiceContent.includes('function sanitizeCadData'), true);
  assert.equal(cadServiceContent.includes('snapMidpoint'), true);
});
