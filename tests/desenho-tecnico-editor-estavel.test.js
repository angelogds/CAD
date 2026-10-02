const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('entrypoint do CAD usa somente o motor 2D estável no caminho crítico',()=>{
  const entry=read('public/js/cad-engine-v2.js');
  assert.match(entry,/cad-legacy-engine\.js/);
  assert.doesNotMatch(entry,/cad-mlight-runtime\.js/);
  assert.doesNotMatch(entry,/cad-round3-runtime\.js/);
  assert.doesNotMatch(entry,/cad-round4-runtime\.js/);
  assert.doesNotMatch(entry,/position:fixed;inset:0;display:grid;place-items:center;background:#151b20/);
});

test('editor estável preserva canvas, salvar, cotas, flange e eixo',()=>{
  const view=read('views/desenho-tecnico/cad-editor-v2.ejs');
  const controller=read('public/js/modules/desenho-tecnico/desenho-tecnico.controller.js');
  const legacy=read('public/js/cad-legacy-engine.js');
  assert.match(view,/id="cadCanvas"/);
  assert.match(view,/id="cadSaveBtn"/);
  assert.match(view,/data-action="tool-flange"/);
  assert.match(view,/data-action="tool-shaft"/);
  assert.match(view,/data-action="tool-dim-linear"/);
  assert.match(controller,/async saveDrawing\(\)/);
  assert.match(controller,/\/desenho-tecnico\/cad\/\$\{id\}/);
  assert.match(legacy,/bootstrapDesenhoTecnico/);
  assert.match(legacy,/stable-2d/);
});
