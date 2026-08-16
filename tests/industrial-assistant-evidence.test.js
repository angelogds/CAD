const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('fontes são derivadas das tools pelo backend e devolvidas separadamente da resposta', () => {
  const service = read('modules/ai/industrial-assistant.text.service.js');
  const controller = read('modules/ai/industrial-assistant.controller.js');

  assert.match(service, /function buildEvidence\(executedTools = \[\]\)/);
  assert.match(service, /tool\?\.ok !== true \|\| !tool\?\.source/);
  assert.match(service, /sources: buildEvidence\(tools\)/);
  assert.match(service, /return \{ text: answer, tools: executedTools, sources,/);
  assert.match(controller, /sources: result\.sources \|\| \[\]/);
});

test('interfaces exibem fontes do sistema sem innerHTML', () => {
  const chat = read('public/js/ai-chat.js');
  const global = read('public/js/ai-global.js');
  const workspace = read('public/js/ai-workspace.js');

  [chat, global, workspace].forEach((source) => {
    assert.match(source, /Fontes do sistema:/);
    assert.doesNotMatch(source, /innerHTML/);
  });
});
