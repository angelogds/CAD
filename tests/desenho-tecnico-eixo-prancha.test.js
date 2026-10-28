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

test('Eixo criado por medidas preserva somente os trechos, sem furos obrigatórios', () => {
  const fast = fs.readFileSync(path.join(__dirname,'../frontend/mlightcad-auto-dimension.entry.js'),'utf8');
  const shaftPart=fast.slice(fast.indexOf('async function createShaft('),fast.indexOf('export function createMlightAutoDimensionTools'));
  assert.ok(!shaftPart.includes("prompt('Alojamento interno"),'Não solicitar alojamento no fluxo rápido');
  assert.ok(!shaftPart.includes("prompt('Posições dos furos"),'Não solicitar posições de furos no fluxo rápido');
  assert.match(shaftPart,/startC/,'Desenhar quebras de aresta nos extremos');
});

test('Modelo paramétrico MLightCAD com chanfros gráficos permanece elegível para prancha única', () => {
  const first={length:40,diameter:25},middle={length:60,diameter:40},last={length:40,diameter:25};
  const spec={origin:{x:240,y:100},orientation:'horizontal',segments:[first,middle,last],bore:null,crossHoles:[]};
  let x=240;
  const objects=spec.segments.map(v=>{
    const o={type:'polyline',closed:true,points:[
      {x,y:100-v.diameter/2},{x:x+v.length,y:100-v.diameter/2},
      {x:x+v.length,y:100+v.diameter/2},{x,y:100+v.diameter/2},
    ]};x+=v.length;return o;
  });
  objects.push({type:'line',x:240,y:100,x2:380,y2:100});
  const ch=Math.min(1.5,first.length*.045,first.diameter*.025);
  for(const side of [-1,1]) {
    objects.push({type:'line',x:240,y:100+side*(first.diameter/2-ch),
      x2:240+ch,y2:100+side*first.diameter/2});
    objects.push({type:'line',x:380-ch,y:100+side*last.diameter/2,
      x2:380,y2:100+side*(last.diameter/2-ch)});
  }
  const cad=sanitizeCadData({objects,shaftSheet:spec});
  const shaft=pickShaft(cad);
  assert.ok(shaft);
  assert.equal(isStandaloneShaft(cad,shaft),true);
  assert.deepEqual(buildModel(shaft).crossHoles,[]);
});

test('Gerador de prancha identifica nomes corretos sem apresentar isométrica como STEP',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../modules/desenho-tecnico/desenho-tecnico.shaft-sheet.js'),'utf8');
  assert.match(src,/CORTE A-A/);
  assert.match(src,/CORTE A/);
  assert.match(src,/VISTA ISOMÉTRICA/);
  assert.match(src,/Quebra de aresta|Quebras de aresta|CHANFROS ILUSTRATIVOS/);
  assert.match(src,/function drawIsometric/);
});

test('CAD0009: modelo de três degraus gera prancha sem tampas nos ombros internos', async () => {
  const cad = sanitizeCadData({ objects: [{
    id: 'eixo-cad0009', type: 'shaft',
    geometry: {
      origin: {x:0,y:0}, orientation: 'horizontal',
      segments: [
        {diameter:25,length:40},
        {diameter:40,length:60},
        {diameter:25,length:40},
      ],
      bore: null, crossHoles: [],
    },
  }] });
  const model = buildModel(pickShaft(cad));
  assert.equal(model.total,140);
  assert.deepEqual(model.segments.map(s=>s.diameter),[25,40,25]);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cg-cad0009-'));
  try{
    const result=await generateShaftPdf({
      codigo:'CAD0009',revisao:0,titulo:'EIXO ESCALONADO',
      equipamento_nome:'NÃO INFORMADO',
    },cad,pickShaft(cad),{pdfDir:tmp});
    const bytes=fs.readFileSync(result.fullPath);
    assert.equal(bytes.subarray(0,4).toString('ascii'),'%PDF');
    assert.ok(bytes.byteLength>3000);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('isométrica da prancha usa anéis de ombro e não desenha discos completos para cada trecho', () => {
  const src=fs.readFileSync(path.join(__dirname,
    '../modules/desenho-tecnico/desenho-tecnico.shaft-sheet.js'),'utf8');
  const iso=src.slice(src.indexOf('function drawIsometric('),src.indexOf('function frame('));
  assert.match(iso,/const shoulder = \(x, rOuter, rInner\)/);
  assert.match(iso,/if\(r>frontRadius\)shoulder\(x0,r,frontRadius\)/);
  assert.doesNotMatch(iso,/ellipse\(x1,radius/);
  assert.match(src,/drawLateral\(doc,model,116,275,scaleA\)/);
  assert.match(src,/Cotas com lideres/);
});
