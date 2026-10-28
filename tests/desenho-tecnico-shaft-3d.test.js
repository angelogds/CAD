'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const service = require('../modules/desenho-tecnico/desenho-tecnico.service');
const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');

function shaft(segments, bore = null, crossHoles = []) {
  return sanitizeCadData({
    objects: [{type:'shaft', id:'shaft-1', geometry:{
      origin:{x:0,y:0}, orientation:'horizontal', segments,bore,crossHoles,
    }}],
  });
}

test('3D paramétrico gera especificação de revolução com dimensões reais do eixo', () => {
  const cad = shaft([
    {length:120,diameter:127},
    {length:100,diameter:104},
    {length:150,diameter:96},
  ]);
  assert.equal(service.isCad3dCompatible(cad),true);
  const preview = service.build3dFromCad(cad);
  assert.equal(preview.mode,'parametric-shaft');
  assert.equal(preview.axis,'X');
  assert.equal(preview.length,370);
  assert.equal(preview.maxDiameter,127);
  assert.deepEqual(preview.segments.map(s=>s.length),[120,100,150]);
  assert.equal(preview.bore,null);
  assert.deepEqual(preview.crossHoles,[]);
  assert.equal(preview.previewOnly,false);
});

test('3D alojamento cego usa profundidade real e avisa que furos transversais não estão subtraídos',()=>{
  const cad=shaft([
    {length:120,diameter:127},
    {length:100,diameter:104},
    {length:150,diameter:96},
  ],{diameter:96,depth:120},[
    {distance:25,diameter:13},{distance:60,diameter:13},{distance:95,diameter:13},
  ]);
  const preview=service.build3dFromCad(cad);
  assert.deepEqual(preview.bore,{diameter:96,depth:120,from:'start'});
  assert.equal(preview.crossHoles.length,3);
  assert.equal(preview.previewOnly,true);
  assert.match(preview.warnings.join(' '),/furos transversais/);
});

test('eixo representado por retângulos não vira três paralelepípedos',()=>{
  const cad=sanitizeCadData({
    objects:[
      {type:'rect',x:200,y:87.5,width:40,height:25},
      {type:'rect',x:240,y:80,width:60,height:40},
      {type:'rect',x:300,y:87.5,width:40,height:25},
      {type:'circle',x:100,y:100,radius:40},
    ],
  });
  const preview=service.build3dFromCad(cad);
  assert.equal(preview.mode,'parametric-shaft');
  assert.equal(preview.length,140);
  assert.equal(preview.previewOnly,true);
  assert.match(preview.warnings.join(' '),/Perfil inferido/);
});

test('desenhos sem eixo conservam compatibilidade com extrusão antiga',()=>{
  const preview=service.build3dFromCad({objects:[{type:'rect',x:0,y:0,width:30,height:20}]});
  assert.equal(preview.mode,'simple-extrusion');
  assert.equal(preview.items.length,1);
});

test('prévia 3D está presente nos dois editores sem depender de CDN',()=>{
  const file=relative=>fs.readFileSync(path.join(__dirname,'..',relative),'utf8');
  const view=file('views/desenho-tecnico/cad-editor-v2.ejs');
  const legacy=file('public/js/modules/desenho-tecnico/desenho-tecnico.controller.js');
  const mlight=file('public/js/cad-mlight-runtime.js');
  const viewer=file('public/js/cad-shaft-3d.mjs');
  const controller=file('modules/desenho-tecnico/desenho-tecnico.controller.js');
  assert.match(view,/view-3d-shaft/);
  assert.match(legacy,/openShaft3D/);
  assert.match(mlight,/mlightShaft3dBtn/);
  assert.match(mlight,/payload\.shaftSheet = cadData\.shaftSheet/);
  assert.match(viewer,/new THREE\.LatheGeometry/);
  assert.match(viewer,/new OrbitControls/);
  assert.match(viewer,/não subtrai furações transversais/i);
  assert.match(controller,/cadService\.sanitizeCadData\(supplied\)/);
  assert.doesNotMatch(viewer,/https?:\/\/(cdn|unpkg|jsdelivr)/);
});


test('módulo de visualização Three.js usa sintaxe ESM válida',()=>{
  const {spawnSync}=require('node:child_process');
  const script=path.join(__dirname,'../public/js/cad-shaft-3d.mjs');
  const r=spawnSync(process.execPath,['--check',script],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr||r.stdout);
});
