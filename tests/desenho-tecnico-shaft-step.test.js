'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pickShaft, buildModel } = require('../modules/desenho-tecnico/desenho-tecnico.shaft-sheet');
const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('STEP usa dimensões paramétricas do eixo explicitamente cadastrado', () => {
  const cad = sanitizeCadData({ objects:[{type:'shaft',geometry:{
    origin:{x:0,y:0},orientation:'horizontal',
    segments:[{length:120,diameter:127},{length:100,diameter:104},{length:150,diameter:96}],
    bore:{diameter:96,depth:120},
    crossHoles:[{distance:25,diameter:13},{distance:60,diameter:13},{distance:95,diameter:13}],
  }}] });
  const shaft = pickShaft(cad);
  assert.ok(shaft);
  assert.notEqual(shaft.source, 'inferred-2d');
  const model = buildModel(shaft);
  assert.equal(model.total,370);
  assert.equal(model.crossHoles.length,3);
  assert.equal(model.bore.diameter,96);
});

test('STEP rejeita geometria só inferida de retângulos, sem inventar furação',()=>{
  const cad=sanitizeCadData({objects:[
    {type:'rect',x:0,y:-12.5,width:40,height:25},
    {type:'rect',x:40,y:-20,width:60,height:40},
    {type:'rect',x:100,y:-12.5,width:40,height:25},
  ]});
  assert.equal(pickShaft(cad).source,'inferred-2d');
  assert.match(read('modules/desenho-tecnico/desenho-tecnico.controller.js'), /shaft\.source === 'inferred-2d'/);
});

test('rotas STEP autenticadas e com upload para motor Python interno',()=>{
  assert.match(read('modules/desenho-tecnico/desenho-tecnico.routes.js'), /router\.get\('\/cad\/:id\/step', requireLogin, requireRole\(MANAGE_ACCESS\)/);
  assert.match(read('modules/desenho-tecnico/cad-python.service.js'), /async function exportStep/);
  assert.match(read('modules/desenho-tecnico/desenho-tecnico.controller.js'), /application\/step/);
});

test('ambos editores salvam antes de exportar e uso de STEP não depende de CDN',()=>{
  const legacy=read('public/js/modules/desenho-tecnico/desenho-tecnico.controller.js');
  const mlight=read('public/js/cad-mlight-runtime.js');
  const viewer=read('public/js/cad-step-download.mjs');
  assert.match(legacy, /'export-step': async \(\) => \{\s*clearTimeout\(this\.autoSaveTimer\);\s*await this\.saveDrawing\(\)/);
  assert.match(mlight, /mlightStepExportBtn/);
  assert.match(mlight, /if \(!\(await save\(\)\)\) return/);
  assert.match(viewer, /async function downloadStep/);
  assert.doesNotMatch(viewer, /https?:\/\//);
});
