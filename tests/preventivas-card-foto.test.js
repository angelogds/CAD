const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('dashboard preventivo carrega foto do cadastro do equipamento',()=>{
 const service=read('modules/preventivas/preventivas.service.js');
 assert.match(service,/eqCols\.includes\("foto_url"\)/);
 assert.match(service,/AS equipamento_foto_url/);
});

test('cards operacionais exibem foto com fallback seguro',()=>{
 const view=read('views/preventivas/index.ejs');
 assert.match(view,/r\.equipamento_foto_url/);
 assert.match(view,/pv-task-image/);
 assert.match(view,/SEM IMAGEM/);
 assert.match(view,/loading="lazy"/);
});

test('imagem preserva responsividade do card',()=>{
 const css=read('public/css/preventivas-index.css');
 assert.match(css,/\.pv-task-image\{/);
 assert.match(css,/object-fit:cover/);
 assert.match(css,/@media\(max-width:700px\).*\.pv-task-image/s);
});
