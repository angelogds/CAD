const fs=require('fs');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('entrypoint inicia o editor diretamente e valida bind dos eventos',()=>{
  const entry=read('public/js/cad-engine-v2.js');
  assert.match(entry,/import \{ startCadEditor \}/);
  assert.match(entry,/const cad = startCadEditor\(\)/);
  assert.match(entry,/cad\.isUiBound/);
  assert.doesNotMatch(entry,/await import\('\.\/cad-legacy-engine\.js'\)/);
});

test('motor estável não depende mais de DOMContentLoaded para registrar botões',()=>{
  const legacy=read('public/js/cad-legacy-engine.js');
  assert.match(legacy,/export function startCadEditor\(\)/);
  assert.doesNotMatch(legacy,/window\.addEventListener\('DOMContentLoaded'/);
  assert.match(legacy,/window\.CAD_APP/);
  assert.match(legacy,/dataset\.cadInteractive = 'true'/);
});

test('template força versão nova do bootstrap para evitar cache antigo',()=>{
  const view=read('views/desenho-tecnico/cad-editor-v2.ejs');
  assert.match(view,/cad-engine-v2\.js\?v=20261006-trim-v5/);
});
