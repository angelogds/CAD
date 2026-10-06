const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { pathToFileURL }=require('node:url');

const root=process.cwd();
const geometryUrl=pathToFileURL(path.join(root,'public/js/modules/desenho-tecnico/core/modify.geometry.mjs')).href;

function midpoint(geometry){
  const two=Math.PI*2;
  const sweep=geometry.ccw!==false
    ? ((geometry.endAngle-geometry.startAngle)%two+two)%two
    : ((geometry.startAngle-geometry.endAngle)%two+two)%two;
  const angle=geometry.startAngle+(geometry.ccw!==false?1:-1)*(sweep/2);
  return {
    x:geometry.cx+Math.cos(angle)*geometry.radius,
    y:geometry.cy+Math.sin(angle)*geometry.radius,
  };
}

const cutA={x:92.5,y:Math.sqrt(10000-(92.5*92.5))};
const cutB={x:92.5,y:-Math.sqrt(10000-(92.5*92.5))};

test('APARAR usa o terceiro clique para escolher exatamente o trecho do círculo externo que some',async()=>{
  const {solveCircularTrimSegment}=await import(geometryUrl);
  const result=solveCircularTrimSegment(
    {cx:0,cy:0,radius:100},
    cutA,
    cutB,
    {x:100,y:0},
  );

  assert.equal(result.ok,true);
  assert.equal(result.keptArcs.length,1);
  const removedMid=midpoint(result.removedArc);
  const keptMid=midpoint(result.keptArcs[0]);

  assert.ok(removedMid.x>95,'o trecho do lado do terceiro clique deve ser o removido');
  assert.ok(keptMid.x<0,'o lado oposto do círculo deve permanecer');
});

test('APARAR não apaga o círculo inteiro quando o terceiro clique é no círculo do rebaixo',async()=>{
  const {solveCircularTrimSegment}=await import(geometryUrl);
  const result=solveCircularTrimSegment(
    {cx:80,cy:0,radius:40},
    cutA,
    cutB,
    {x:120,y:0},
  );

  assert.equal(result.ok,true);
  assert.equal(result.keptArcs.length,1,'o círculo deve virar arco, não desaparecer por inteiro');
  const removedMid=midpoint(result.removedArc);
  const keptMid=midpoint(result.keptArcs[0]);

  assert.ok(removedMid.x>110,'somente o lado clicado do círculo do rebaixo deve sumir');
  assert.ok(keptMid.x<80,'o arco oposto do rebaixo deve permanecer');
});

test('APARAR permite inverter a escolha no terceiro clique sem inverter os dois limites',async()=>{
  const {solveCircularTrimSegment}=await import(geometryUrl);
  const result=solveCircularTrimSegment(
    {cx:0,cy:0,radius:100},
    cutA,
    cutB,
    {x:-100,y:0},
  );

  assert.equal(result.ok,true);
  const removedMid=midpoint(result.removedArc);
  const keptMid=midpoint(result.keptArcs[0]);

  assert.ok(removedMid.x<0,'o trecho do lado esquerdo deve ser removido quando ele recebe o terceiro clique');
  assert.ok(keptMid.x>95,'o pequeno trecho do lado direito deve permanecer');
});

test('ferramenta Aparar segue estritamente o fluxo 1/3, 2/3 e 3/3',()=>{
  const src=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/tools/trim.tool.js'),'utf8');
  assert.match(src,/APARAR 1\/3/);
  assert.match(src,/APARAR 2\/3/);
  assert.match(src,/APARAR 3\/3/);
  assert.match(src,/commitCircularTrim/);
  assert.match(src,/solveCircularTrimSegment/);
  assert.match(src,/terceiro clique escolhe somente o pedaço que será apagado/);
});

test('APARAR circular remove somente a entidade clicada e preserva a outra geometria do par',()=>{
  const src=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/tools/trim.tool.js'),'utf8');
  assert.match(src,/filter\(\(entity\) => String\(entity\.id\) !== String\(target\.id\)\)/);
  assert.doesNotMatch(src,/removeIds = new Set\(\[String\(target\.id\), String\(cutter\.id\)\]\)/);
  assert.match(src,/this\.ctx\.state\.entities\.push\(\.\.\.keptArcs\)/);
});

test('pré-visualização mostra o que vai ficar antes do terceiro clique',()=>{
  const src=fs.readFileSync(path.join(root,'public/js/modules/desenho-tecnico/tools/trim.tool.js'),'utf8');
  assert.match(src,/solved\.keptArcs\.map/);
  assert.match(src,/ghost-entity/);
});

test('cadeia do editor força versão nova do Aparar de três cliques',()=>{
  const version='20261006-trim-v7';
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
