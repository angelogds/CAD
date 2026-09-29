const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ejs=require('ejs');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('painel de criticidade usa padrão visual do dashboard operacional',()=>{
  const view=read('views/dashboard/criticidade.ejs');
  assert.doesNotThrow(()=>ejs.compile(view,{filename:path.join(root,'views/dashboard/criticidade.ejs')}));
  assert.match(view,/operational-dashboard/);
  assert.match(view,/metric-grid criticality-kpi-grid/);
  assert.match(view,/op-card criticality-filter-card/);
  assert.match(view,/criticality-ranking-list/);
  assert.match(view,/responsive-table/);
});

test('painel preserva filtros e rotas operacionais existentes',()=>{
  const view=read('views/dashboard/criticidade.ejs');
  ['periodo','inicio','fim','setor','equipamento_id','criticidade','tipo','status','ativo'].forEach(name=>assert.match(view,new RegExp('name="'+name+'"')));
  assert.match(view,/action="\/dashboard\/criticidade"/);
  assert.match(view,/\/dashboard\/criticidade\/equipamentos\//);
  assert.match(view,/\/os\?status=ABERTA/);
});

test('painel mantém dados reais e não injeta valores fictícios',()=>{
  const view=read('views/dashboard/criticidade.ejs');
  assert.match(view,/data\.ranking/);
  assert.match(view,/data\.osResumo/);
  assert.match(view,/data\.intervencoes/);
  assert.doesNotMatch(view,/Math\.random/);
  assert.doesNotMatch(view,/fake|mock/i);
});
