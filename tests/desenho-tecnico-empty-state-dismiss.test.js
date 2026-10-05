const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('tela inicial possui ação explícita para liberar o canvas',()=>{
  const view=read('views/desenho-tecnico/cad-editor-v2.ejs');
  assert.match(view,/id="cadEmptyState"/);
  assert.match(view,/data-action="dismiss-empty-state"/);
  assert.match(view,/class="cad-empty-dismiss"/);
});

test('qualquer ferramenta fecha a introdução antes do desenho',()=>{
  const controller=read('public/js/modules/desenho-tecnico/desenho-tecnico.controller.js');
  assert.match(controller,/this\.emptyStateDismissed = false/);
  assert.match(controller,/if \(action\.startsWith\('tool-'\)\)[\s\S]*this\.dismissEmptyState\(\)/);
  assert.match(controller,/emptyState\.hidden = this\.state\.entities\.length > 0 \|\| this\.emptyStateDismissed/);
});

test('hidden da introdução prevalece sobre qualquer estilo visual',()=>{
  const css=read('public/css/cad-system-shell.css');
  assert.match(css,/\.cad-fullscreen \.cad-empty-state\[hidden\]\{[\s\S]*display:none !important/);
});
