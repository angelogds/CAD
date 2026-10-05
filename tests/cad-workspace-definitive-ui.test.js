const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('editor carrega apenas a base CAD e a identidade visual atual', () => {
  const view = read('views/desenho-tecnico/cad-editor-v2.ejs');
  assert.match(view, /cad-autocad\.css/);
  assert.match(view, /cad-system-shell\.css/);
  assert.doesNotMatch(view, /cad-workspace-definitive\.css/);
  assert.match(view, /cad-engine-v2\.js/);
  assert.match(view, /id="cadCanvas"/);
  assert.match(view, /id="cadCommandInput"/);
  assert.match(view, /id="cadSaveBtn"/);
});

test('camada atual preserva workspace, inspetor e responsividade', () => {
  const css = read('public/css/cad-system-shell.css');
  assert.match(css, /\.cad-fullscreen \.cad-ribbon/);
  assert.match(css, /\.cad-fullscreen \.cad-canvas-container/);
  assert.match(css, /\.cad-fullscreen \.cad-panel-right/);
  assert.match(css, /\.cad-fullscreen \.cad-statusbar/);
  assert.match(css, /@media \(max-width:960px\)/);
});
