const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('editor não carrega camada antiga conflitante',()=>{
  const view=read('views/desenho-tecnico/cad-editor-v2.ejs');
  assert.match(view,/cad-autocad\.css/);
  assert.match(view,/cad-system-shell\.css/);
  assert.doesNotMatch(view,/cad-workspace-definitive\.css/);
});

test('canvas ocupa integralmente a coluna central',()=>{
  const css=read('public/css/cad-system-shell.css');
  assert.match(css,/\.cad-fullscreen \.cad-canvas-container\{[\s\S]*height:100%/);
  assert.match(css,/\.cad-fullscreen #cadCanvas\{[\s\S]*position:absolute;[\s\S]*inset:0;[\s\S]*height:100%/);
  assert.match(css,/grid-template-columns:74px minmax\(0,1fr\) minmax\(290px,320px\)/);
});
