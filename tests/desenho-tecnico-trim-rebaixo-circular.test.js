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
  const keptMid=pointAt(result.targetArc,result.targetArc.ccw!==false);
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
