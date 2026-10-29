const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('editor não carrega camada antiga conflitante',()=>{
  const view=read('views/desenho-tecnico/cad-editor-v2.ejs');
  assert.match(view,/cad-autocad\.css/);
  assert.match(view,/cad-system-shell\.css/);
  assert.doesNotMatch(view,/cad-workspace-definitive\.css/);
});

test('canvas ocupa integralmente a coluna central',()=>{
  const css=read('public/css/cad-solidworks-workbench.css');
  assert.match(css,/\.cad-technical-shell \.cad-canvas-container\{[^}]*height:100%/);
  assert.match(css,/\.cad-technical-shell #cadCanvas\{[^}]*position:absolute;inset:0;[^}]*height:100%/);
  assert.match(css,/grid-template-columns:var\(--cad-left-width\) minmax\(0,1fr\) var\(--cad-right-width\)/);
});
