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
  assert.match(css,/cad-left-collapsed \.cad-workspace[\s\S]*grid-template-columns: 0 minmax\(0, 1fr\) 292px/);
  assert.match(css,/cad-right-collapsed \.cad-workspace[\s\S]*grid-template-columns: 218px minmax\(0, 1fr\) 0/);
  assert.match(css,/cad-left-collapsed\.cad-right-collapsed \.cad-workspace[\s\S]*grid-template-columns: 0 minmax\(0, 1fr\) 0/);
});

test('PropertyManager permanece no tema cinza técnico',()=>{
  const css=read('public/css/cad-solidworks-workbench.css');
  assert.match(css,/\.cad-technical-shell \.cad-panel-content[\s\S]*background: var\(--cad-panel\) !important/);
  assert.match(css,/background: #1f262c !important/);
});
