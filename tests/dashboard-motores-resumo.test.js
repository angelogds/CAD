const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.join(__dirname, '..', 'modules', 'dashboard', 'dashboard.service.js');

test('getMotoresResumoDashboard does not reference undefined periodo binding', () => {
  const source = fs.readFileSync(servicePath, 'utf8');
  const start = source.indexOf('function getMotoresResumoDashboard()');
  const end = source.indexOf('function normalizeFuncaoColaborador', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const functionBody = source.slice(start, end);
  assert.doesNotMatch(functionBody, /periodo\./);
  assert.match(functionBody, /itens_em_conserto:\s*emConserto/);
});
