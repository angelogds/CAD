const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('editor possui controles independentes para os dois painéis',()=>{
  const view=read('views/desenho-tecnico/cad-editor-v2.ejs');
  const controller=read('public/js/modules/desenho-tecnico/desenho-tecnico.controller.js');
  assert.match(view,/id="cadLeftToggle"[\s\S]*data-action="toggle-left-panel"/);
  assert.match(view,/id="cadRightToggle"[\s\S]*data-action="toggle-right-panel"/);
  assert.match(controller,/'toggle-left-panel'/);
  assert.match(controller,/cad-left-collapsed/);
  assert.match(controller,/cad-right-collapsed/);
});

test('workspace amplia com esquerda, direita ou ambas recolhidas',()=>{
  const css=read('public/css/cad-solidworks-workbench.css');
  assert.match(css,/cad-left-collapsed \.cad-workspace\{--cad-left-width:0px/);
  assert.match(css,/cad-right-collapsed \.cad-workspace\{--cad-right-width:0px/);
  assert.match(css,/grid-template-columns:var\(--cad-left-width\) minmax\(0,1fr\) var\(--cad-right-width\)/);
});

test('paleta de propriedades usa os tokens do tema sem camada de cor concorrente',()=>{
  const css=read('public/css/cad-solidworks-workbench.css');
  assert.match(css,/\.cad-panel-content\{[^}]*background:var\(--cad-surface\)/);
  assert.doesNotMatch(css,/background:[^;}]+!important/);
});
