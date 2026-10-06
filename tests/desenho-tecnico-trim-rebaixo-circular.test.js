const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { pathToFileURL }=require('node:url');

const root=process.cwd();
const geometryUrl=pathToFileURL(path.join(root,'public/js/modules/desenho-tecnico/core/modify.geometry.mjs')).href;

function pointAt(geometry, ccw){
  let sweep=ccw
    ? ((geometry.endAngle-geometry.startAngle)%(Math.PI*2)+(Math.PI*2))%(Math.PI*2)
    : ((geometry.startAngle-geometry.endAngle)%(Math.PI*2)+(Math.PI*2))%(Math.PI*2);
  const angle=geometry.startAngle+(ccw?1:-1)*(sweep/2);
  return {x:geometry.cx+Math.cos(angle)*geometry.radius,y:geometry.cy+Math.sin(angle)*geometry.radius};
}

test('APARAR circular cria rebaixo interno e remove o trecho externo escolhido',async()=>{
  const {solveCircularRecess}=await import(geometryUrl);
  const target={cx:0,cy:0,radius:100};
  const cutter={cx:80,cy:0,radius:40};
  const result=solveCircularRecess(target,cutter,{x:100,y:0});
  assert.equal(result.ok,true);
  assert.equal(result.intersections.length,2);
  const recessMid=pointAt(result.recessArc,result.recessArc.ccw!==false);
  assert.ok(Math.hypot(recessMid.x,recessMid.y)<100,'o arco do rebaixo deve ficar para dentro do contorno principal');
  assert.equal(result.targetArcs.length,1);
  const keptMid=pointAt(result.targetArcs[0],result.targetArcs[0].ccw!==false);
  assert.ok(keptMid.x<95,'o arco externo clicado deve ser removido do contorno principal');
});

test('APARAR circular rejeita círculos sem duas interseções',async()=>{
  const {solveCircularRecess}=await import(geometryUrl);
  const result=solveCircularRecess(
    {cx:0,cy:0,radius:100},
    {cx:250,cy:0,radius:20},
    {x:100,y:0}
  );
  assert.equal(result.ok,false);
  assert.match(result.error,/cruzar|interse/i);
});

test('ferramenta Aparar usa fluxo de três cliques e incorpora o arco ao contorno',()=>{
  const src=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/tools/trim.tool.js'),'utf8');
  assert.match(src,/APARAR 2\/3/);
  assert.match(src,/APARAR 3\/3/);
  assert.match(src,/solveCircularRecess/);
  assert.match(src,/style: \{ \.\.\.\(target\.style \|\| \{\}\) \}/);
  assert.match(src,/layer: target\.metadata\?\.layer/);
  assert.match(src,/new ArcEntity/);
});


test('APARAR permite um segundo rebaixo depois que o contorno principal virou arco',async()=>{
  const {solveCircularRecess}=await import(geometryUrl);
  const first=solveCircularRecess(
    {cx:0,cy:0,radius:100},
    {cx:80,cy:0,radius:40},
    {x:100,y:0}
  );
  assert.equal(first.ok,true);
  assert.equal(first.targetArcs.length,1);

  const second=solveCircularRecess(
    first.targetArcs[0],
    {cx:0,cy:80,radius:40},
    {x:0,y:100}
  );
  assert.equal(second.ok,true);
  assert.equal(second.targetArcs.length,2,'um rebaixo intermediário em arco deve preservar os dois lados restantes');
  second.targetArcs.forEach((arc)=>{
    assert.ok(Number.isFinite(arc.startAngle));
    assert.ok(Number.isFinite(arc.endAngle));
  });
});

test('ferramenta Aparar aceita arco existente como contorno para novos rebaixos',()=>{
  const src=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/tools/trim.tool.js'),'utf8');
  assert.match(src,/!isCircular\(target\)/);
  assert.match(src,/solved\.targetArcs\.map/);
  assert.match(src,/\.\.\.targetArcs/);
});


test('APARAR aceita clique direto no trecho azul dentro do círculo auxiliar',()=>{
  const src=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/tools/trim.tool.js'),'utf8');
  assert.match(src,/findDirectCircularRecess/);
  assert.match(src,/clique diretamente no trecho azul/);
  assert.match(src,/distanceToCenter > cutterRadius \+ tolerance/);
  assert.match(src,/this\.smartPair = \[direct\.target, direct\.cutter\]/);
  assert.match(src,/this\.commitCircularRecess\(evt\)/);
});

test('cadeia do editor força versão nova do módulo Aparar',()=>{
  const version='20261006-trim-v5';
  const view=fs.readFileSync(path.join(root,'views/desenho-tecnico/cad-editor-v2.ejs'),'utf8');
  const engine=fs.readFileSync(path.join(root,'public/js/cad-engine-v2.js'),'utf8');
  const legacy=fs.readFileSync(path.join(root,'public/js/cad-legacy-engine.js'),'utf8');
  const service=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/desenho-tecnico.service.js'),'utf8');
  const controller=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/desenho-tecnico.controller.js'),'utf8');
  const trim=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/tools/trim.tool.js'),'utf8');
  assert.match(view,new RegExp('cad-engine-v2\\.js\\?v='+version));
  assert.match(engine,new RegExp('cad-legacy-engine\\.js\\?v='+version));
  assert.match(legacy,new RegExp('desenho-tecnico\\.service\\.js\\?v='+version));
  assert.match(service,new RegExp('desenho-tecnico\\.controller\\.js\\?v='+version));
  assert.match(controller,new RegExp('trim\\.tool\\.js\\?v='+version));
  assert.match(trim,new RegExp('modify\\.geometry\\.mjs\\?v='+version));
});


test('APARAR permite selecionar círculo auxiliar e depois o contorno externo',()=>{
  const src=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/tools/trim.tool.js'),'utf8');
  assert.match(src,/APARAR 2\/2: círculo auxiliar selecionado/);
  assert.match(src,/hasLargerTarget/);
  assert.match(src,/this\.smartPair = \[target, this\.boundary\]/);
  assert.match(src,/o círculo auxiliar precisa cruzar o contorno em dois pontos/);
});
