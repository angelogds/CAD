'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sanitizeCadData } = require('../modules/desenho-tecnico/desenho-tecnico.cad.service');
const { pickShaft, buildModel, isStandaloneShaft, generateShaftPdf } = require('../modules/desenho-tecnico/desenho-tecnico.shaft-sheet');
const pdfService = require('../modules/desenho-tecnico/desenho-tecnico.pdf.service');

function sample() {
  // Desenho sintético para testar posicionamentos. Não define os furos reais da PS5.
  return {
    objects: [{
      id: 'eixo-teste',
      type: 'shaft',
      geometry: {
        orientation: 'horizontal',
        origin: { x: 0, y: 0 },
        segments: [
          { diameter: 127, length: 120 },
          { diameter: 104, length: 100 },
          { diameter: 96, length: 150 },
        ],
        bore: { diameter: 96, depth: 120, from: 'start' },
        crossHoles: [
          { distance: 25, diameter: 13 },
          { distance: 60, diameter: 13 },
          { distance: 95, diameter: 13 },
        ],
      },
    }],
  };
}

test('seleciona eixo isolado sem substituir exportação de outros desenhos', () => {
  assert.ok(pickShaft(sample()));
  assert.equal(pickShaft({ objects: [{ type: 'circle' }] }), null);
  const withExtra = {
    objects: [...sample().objects, { type: 'line', x: 0, y: 0, x2: 40, y2: 10 }],
  };
  assert.ok(pickShaft(withExtra), 'Eixo detectado mesmo com outras entidades');
  assert.equal(isStandaloneShaft(withExtra, pickShaft(withExtra)), false);
});

test('preserva alojamento e furação transversal ao salvar no CAD', () => {
  const saved = sanitizeCadData(sample());
  assert.deepEqual(saved.objects[0].geometry.bore, { diameter: 96, depth: 120, from: 'start' });
  assert.deepEqual(saved.objects[0].geometry.crossHoles, [
    { distance: 25, diameter: 13 }, { distance: 60, diameter: 13 }, { distance: 95, diameter: 13 },
  ]);
  const model = buildModel(saved.objects[0]);
  assert.equal(model.total, 370);
  assert.deepEqual(model.segments.map(s => s.diameter), [127, 104, 96]);
});

test('não inventa furação ou alojamento quando faltam as medidas', () => {
  const raw = sample();
  delete raw.objects[0].geometry.bore;
  delete raw.objects[0].geometry.crossHoles;
  const model = buildModel(sanitizeCadData(raw).objects[0]);
  assert.equal(model.bore, null);
  assert.deepEqual(model.crossHoles, []);
});

test('não permite furação na área de 100/150 mm nem além do alojamento', () => {
  const raw = sample();
  raw.objects[0].geometry.crossHoles.push({ distance: 150, diameter: 13 });
  assert.throws(() => buildModel(raw.objects[0]), /Furo transversal/);
  raw.objects[0].geometry.crossHoles.pop();
  raw.objects[0].geometry.bore.depth = 50;
  assert.throws(() => buildModel(raw.objects[0]), /Furo transversal/);
});

test('gera PDF A3 usando as medidas salvas do eixo e sem serviço externo', async () => {
  const cad = sanitizeCadData(sample());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-shaft-'));
  try {
    const info = await generateShaftPdf({
      codigo: 'EIXO-TESTE', revisao: 0, titulo: 'Eixo escalonado',
      equipamento_nome: 'EQUIPAMENTO DE TESTE',
      criado_por_nome: 'Desenhista de teste',
    }, cad, pickShaft(cad), { pdfDir: tmp });
    assert.equal(path.dirname(info.fullPath), tmp);
    const buffer = fs.readFileSync(info.fullPath);
    assert.equal(buffer.subarray(0, 4).toString('utf8'), '%PDF');
    assert.ok(buffer.byteLength > 1000);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('MLightCAD: gera prancha apenas quando retângulos DXF conferem com parâmetros', () => {
  const spec = {
    origin: { x: 10, y: 50 }, orientation: 'horizontal',
    segments: [
      { diameter: 127, length: 120 },
      { diameter: 104, length: 100 },
      { diameter: 96, length: 150 },
    ],
    bore: { diameter: 96, depth: 120, from: 'start' },
    crossHoles: [{ distance: 30, diameter: 13 }, { distance: 60, diameter: 13 }, { distance: 90, diameter: 13 }],
  };
  const rectangles = [];
  let x = spec.origin.x;
  for (const { length, diameter } of spec.segments) {
    rectangles.push({
      type: 'polyline', visible: true, closed: true,
      points: [
        { x, y: 50-diameter/2 }, { x: x+length, y: 50-diameter/2 },
        { x: x+length, y: 50+diameter/2 }, { x, y: 50+diameter/2 },
      ],
    });
    x += length;
  }
  const sheet = sanitizeCadData({ objects: rectangles, shaftSheet: spec });
  assert.ok(pickShaft(sheet), 'O desenho paramétrico correspondente deve ser reconhecido');
  assert.equal(buildModel(pickShaft(sheet)).total, 370);
  const changed = structuredClone(sheet);
  changed.objects[1].points[1].x += 5;
  assert.equal(pickShaft(changed), null, 'Mudança de geometria impede prancha desatualizada');
  const withExtra = structuredClone(sheet);
  withExtra.objects.push({ type: 'circle', x: 100, y: 50, radius: 10 });
  assert.ok(pickShaft(withExtra), 'Eixo e flange podem coexistir');
  assert.equal(isStandaloneShaft(withExtra, pickShaft(withExtra)), false, 'Não descartar flange na exportação');
});

test('CAD0008: reconhece eixo 40/60/40 entre flange de 8 furos e gera segundo A3', async () => {
  const original = {
    objects: [
      { type: 'circle', x: 100, y: 100, radius: 60 },
      ...Array.from({length:8},(_,i)=>({
        type:'circle',x:100+42*Math.cos(i*Math.PI/4),y:100+42*Math.sin(i*Math.PI/4),radius:6
      })),
      {type:'circle',x:100,y:100,radius:20},
      {type:'rect',x:240,y:87.5,width:40,height:25},
      {type:'rect',x:280,y:80,width:60,height:40},
      {type:'rect',x:340,y:87.5,width:40,height:25},
      {type:'line',x:235,y:100,x2:387,y2:100},
    ],
  };
  const cad=sanitizeCadData(original);
  const shaft=pickShaft(cad);
  assert.ok(shaft, 'Detecta 3 retângulos alinhados mesmo que exista flange na mesma folha');
  assert.equal(shaft.source,'inferred-2d');
  assert.equal(isStandaloneShaft(cad,shaft),false);
  const model=buildModel(shaft);
  assert.equal(model.total,140);
  assert.deepEqual(model.segments.map(v=>v.diameter),[25,40,25]);
  assert.deepEqual(model.segments.map(v=>v.length),[40,60,40]);
  assert.equal(model.bore,null, 'Não inventar alojamento');
  assert.deepEqual(model.crossHoles,[], 'Não inventar furação transversal');
  const info=await pdfService.generateTechnicalPdf({
    codigo:'CAD0008-TESTE',revisao:0,titulo:'EIXO DO TACHO DA PRENSA',
    equipamento_nome:'PRENSA P50 JULIAN',tipo_origem:'cad',
  },null,{cadData:cad});
  try {
    const bytes=fs.readFileSync(info.fullPath);
    const raw=bytes.toString('latin1');
    assert.equal((raw.match(/\/Type \/Page\b/g)||[]).length,2,'1ª folha conjunto e 2ª folha de eixo');
    assert.equal((raw.match(/\/MediaBox \[0 0 1190/g)||[]).length>=1,true);
  } finally {
    fs.unlinkSync(info.fullPath);
  }
});

test('CAD0008: não infere eixo com apenas dois retângulos ou perfis fora de eixo', () => {
  assert.equal(pickShaft({objects:[
    {type:'rect',x:0,y:0,width:40,height:25},
    {type:'rect',x:40,y:-7.5,width:60,height:40},
  ]}),null);
  assert.equal(pickShaft({objects:[
    {type:'rect',x:0,y:0,width:40,height:25},
    {type:'rect',x:40,y:0,width:60,height:40},
    {type:'rect',x:100,y:0,width:40,height:25},
  ]}),null);
});
