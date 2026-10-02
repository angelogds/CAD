const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('editor carrega a camada visual do sistema após a base CAD',()=>{
  const view=read('views/desenho-tecnico/cad-editor-v2.ejs');
  const base=view.indexOf('/css/cad-workspace-definitive.css');
  const shell=view.indexOf('/css/cad-system-shell.css');
  assert.ok(base>=0 && shell>base);
});

test('tema do CAD reutiliza identidade verde e preserva canvas técnico',()=>{
  const css=read('public/css/cad-system-shell.css');
  assert.match(css,/--cad-system-green:var\(--action-700,#15803d\)/);
  assert.match(css,/\.cad-fullscreen \.cad-panel-right/);
  assert.match(css,/\.cad-fullscreen #cadCanvas/);
  assert.match(css,/background:#0a0f14/);
  assert.match(css,/\.cad-fullscreen \.cad-btn-primary/);
});
