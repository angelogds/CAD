const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

test('assistente global fica compacto e não domina ações críticas', () => {
  const partial = read('views/partials/industrial-assistant-global.ejs');
  assert.match(partial, /z-index:35/);
  assert.match(partial, /width:52px;height:52px/);
  assert.match(partial, /width:48px;height:48px/);
  assert.match(partial, /pointer-events:none/);
  assert.match(partial, /pointer-events:auto/);
  assert.match(partial, /ai-voice-global--os/);
  assert.match(partial, /bottom:max\(82px/);
});

test('fechamento da OS permanece acima do assistente no mobile', () => {
  const css = read('public/css/os-detail.css');
  assert.match(css, /\.os-conclusion\{position:relative;z-index:50;/);
  assert.match(css, /\.os-actions\{position:fixed;z-index:50;/);
});

test('seleção de mídia para fechar OS funciona sem construtor DataTransfer', () => {
  const script = read('public/js/os-detalhe.js');
  assert.match(script, /const canRewriteFileList = typeof DataTransfer === 'function'/);
  assert.match(script, /if \(!canRewriteFileList\) \{ input\.value = ''; validateFiles\(\); return; \}/);
  assert.match(script, /validFilesCount = acceptedFiles\.length/);
  assert.match(script, /if \(!validFilesCount \|\| !input\.files\.length\)/);
  assert.match(script, /heic\|heif/);
});
