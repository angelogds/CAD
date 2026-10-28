'use strict';

/**
 * Prancha padrao Campo do Gado para um unico eixo parametrico.
 * As vistas usam exclusivamente as medidas persistidas no CAD; nao inferem furações.
 * 2D e secao sao geometricamente geradas. A isometrica e uma representacao esquematica.
 */
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function same(a, b) {
  return Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) <= 0.02;
}

function getRectangle(obj) {
  if (!obj || obj.visible === false) return null;
  if (obj.type === 'rect') {
    const g = obj.geometry || obj;
    const x = Number(g.x), y = Number(g.y), w = Number(g.width), h = Number(g.height);
    if (![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    return { minX:x, maxX:x+w, minY:y, maxY:y+h, centerY:y+h/2, width:w, height:h };
  }
  if (obj.type !== 'polyline' || !obj.closed || !Array.isArray(obj.points) || obj.points.length !== 4) return null;
  const p = obj.points.map(v => ({x:Number(v.x),y:Number(v.y)}));
  if (p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y))) return null;
  const minX=Math.min(...p.map(v=>v.x)), maxX=Math.max(...p.map(v=>v.x));
  const minY=Math.min(...p.map(v=>v.y)), maxY=Math.max(...p.map(v=>v.y));
  if (!(maxX>minX && maxY>minY)) return null;
  // So reconhecer polilinhas que sejam retangulos ortogonais exatos.
  const corners=new Set(p.map(v=>`${same(v.x,minX)?0:same(v.x,maxX)?1:'x'}-${same(v.y,minY)?0:same(v.y,maxY)?1:'x'}`));
  if (corners.size!==4 || [...corners].some(k=>k.includes('x'))) return null;
  return {minX,maxX,minY,maxY,centerY:(minY+maxY)/2,width:maxX-minX,height:maxY-minY};
}

function modelForRectangles(rects) {
  return {
    type:'shaft',
    source:'inferred-2d',
    geometry: {
      origin:{x:rects[0].minX,y:rects[0].centerY},
      orientation:'horizontal',
      segments: rects.map(r=>({length:r.width,diameter:r.height})),
      bore:null,crossHoles:[],
    }
  };
}

function inferredShaft(objects) {
  const rectangles=objects.map(getRectangle).filter(Boolean).sort((a,b)=>a.minX-b.minX);
  // Tres ou mais trechos consecutivos, simetricos no mesmo eixo Y.
  // Nunca inferir furos internos a partir de geometria externa.
  if (rectangles.length < 3) return null;
  const chains=[];
  for (let i=0;i<rectangles.length;i++) {
    const seq=[rectangles[i]];
    let right=rectangles[i].maxX;
    for (let j=i+1;j<rectangles.length;j++) {
      const candidate=rectangles[j];
      if (!same(candidate.minX,right) || !same(candidate.centerY,seq[0].centerY)) continue;
      seq.push(candidate);right=candidate.maxX;
    }
    if (seq.length>=3) chains.push(seq);
  }
  chains.sort((a,b)=>b.length-a.length);
  if (!chains.length) return null;
  // Em caso de possivel empate, nao selecionar eixo arbitrario.
  if (chains.length>1 && chains[0].length===chains[1].length &&
    !same(chains[0][0].minX,chains[1][0].minX)) return null;
  return modelForRectangles(chains[0]);
}

function matchesMlightShaft(objects, spec) {
  const segments=spec?.segments||[];
  const origin=spec?.origin||{};
  if (!segments.length || segments.length>12 ||
      ![origin.x,origin.y].every(v=>Number.isFinite(Number(v)))) return false;
  const rects=objects.map(getRectangle).filter(Boolean);
  let x=Number(origin.x);
  for(const seg of segments) {
    const len=positive(seg.length),dia=positive(seg.diameter);
    if(!len||!dia) return false;
    const idx=rects.findIndex(r=>same(r.minX,x)&&same(r.maxX,x+len)&&
      same(r.minY,Number(origin.y)-dia/2)&&same(r.maxY,Number(origin.y)+dia/2));
    if(idx<0) return false;
    rects.splice(idx,1);x+=len;
  }
  return true;
}

function pickShaft(cadData = {}) {
  const objects=Array.isArray(cadData.objects)?cadData.objects:[];
  const shafts=objects.filter(o=>o&&o.type==='shaft'&&o.visible!==false);
  if(shafts.length===1) {
    const geo=shafts[0].geometry||shafts[0];
    if(Array.isArray(geo.segments)&&geo.segments.length&&
      geo.segments.every(seg=>positive(seg.length)&&positive(seg.diameter))) {
      return shafts[0];
    }
  }
  if (shafts.length>1) return null;
  const spec=cadData.shaftSheet;
  if(spec&&Array.isArray(spec.segments)&&matchesMlightShaft(objects,spec)) {
    return {type:'shaft',source:'mlightcad',geometry:spec};
  }
  return inferredShaft(objects);
}

function isStandaloneShaft(cadData = {}, shaft = null) {
  if (!shaft || shaft.source === 'inferred-2d') return false;
  const objs = Array.isArray(cadData.objects) ? cadData.objects : [];
  if(shaft.source==='mlightcad') {
    const g=shaft.geometry, x0=Number(g.origin.x), cy=Number(g.origin.y);
    const total=g.segments.reduce((a,s)=>a+Number(s.length),0);
    const first=g.segments[0],last=g.segments[g.segments.length-1];
    const c=seg=>Math.min(1.5,seg.length*.045,seg.diameter*.025);
    const breaks=[];
    for(const side of [-1,1]) {
      breaks.push([{x:x0,y:cy+side*(first.diameter/2-c(first))},
                   {x:x0+c(first),y:cy+side*first.diameter/2}]);
      breaks.push([{x:x0+total-c(last),y:cy+side*last.diameter/2},
                   {x:x0+total,y:cy+side*(last.diameter/2-c(last))}]);
    }
    const matching=(a,b)=>same(a.x,b.x)&&same(a.y,b.y);
    const validLine=o=>{
      const p={x:o.x,y:o.y},q={x:o.x2,y:o.y2};
      if(matching(p,{x:x0,y:cy})&&matching(q,{x:x0+total,y:cy}))return true;
      return breaks.some(([u,v])=>(matching(p,u)&&matching(q,v))||
        (matching(p,v)&&matching(q,u)));
    };
    return objs.filter(o=>o.visible!==false).every(o=>
      ['polyline','dimension','text','line','centerline'].includes(o.type) &&
      (!['line','centerline'].includes(o.type)||validLine(o))) &&
      objs.filter(o=>getRectangle(o)).length===g.segments.length;
  }
  return objs.every(o=>o.visible===false || ['shaft','dimension','centerline','text'].includes(o.type));
}

function buildModel(shaft) {
  const geo = shaft.geometry || shaft;
  const segments = geo.segments.map((s) => ({
    length: positive(s.length), diameter: positive(s.diameter),
  }));
  if (!segments.length || segments.some((s) => !s.length || !s.diameter)) {
    throw new Error('Eixo sem trechos validos.');
  }
  const total = segments.reduce((sum, s) => sum + s.length, 0);
  const boreInput = geo.bore && typeof geo.bore === 'object' ? geo.bore : {};
  const boreDia = positive(boreInput.diameter);
  const boreDepth = positive(boreInput.depth);
  if (Boolean(boreDia) !== Boolean(boreDepth)) {
    throw new Error('Informe o diametro e a profundidade do alojamento juntos.');
  }
  if (boreDia && (boreDia >= segments[0].diameter || boreDepth > segments[0].length)) {
    throw new Error('Alojamento deve caber inteiramente no primeiro trecho do eixo.');
  }
  const bore = boreDia ? { diameter: boreDia, depth: boreDepth, from: 'start' } : null;
  const holesInput = Array.isArray(geo.crossHoles) ? geo.crossHoles : [];
  const crossHoles = holesInput.map((hole, index) => {
    const position = positive(hole.distance);
    const diameter = positive(hole.diameter);
    if (!position || !diameter || position >= segments[0].length ||
        position - diameter / 2 <= 0 ||
        position + diameter / 2 >= segments[0].length ||
        (bore && position + diameter / 2 > bore.depth)) {
      throw new Error(`Furo transversal ${index + 1}: reveja posicao, diametro e alojamento.`);
    }
    return { distance: position, diameter };
  }).sort((a, b) => a.distance - b.distance);
  return { segments, total, bore, crossHoles, maxDiameter: Math.max(...segments.map(s => s.diameter)) };
}

function line(doc, x1, y1, x2, y2, width = .8, color = '#1f2937') {
  doc.lineWidth(width).strokeColor(color).moveTo(x1, y1).lineTo(x2, y2).stroke();
}

function text(doc, value, x, y, size = 9, opts = {}) {
  doc.fillColor('#111827').font(opts.bold ? BOLD : FONT).fontSize(size);
  doc.text(String(value), x, y, { lineBreak: false, ...opts });
}

function number(v) {
  return Number(v.toFixed(2)).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function arrow(doc, x, y, direction) {
  const d = direction > 0 ? 1 : -1;
  doc.fillColor('#111827').moveTo(x, y).lineTo(x + d * 6, y - 2.4).lineTo(x + d * 6, y + 2.4).closePath().fill();
}

function dimHorizontal(doc, x1, x2, lineY, witnessY, label) {
  line(doc, x1, witnessY, x1, lineY - 5, .5);
  line(doc, x2, witnessY, x2, lineY - 5, .5);
  line(doc, x1, lineY, x2, lineY, .65);
  arrow(doc, x1, lineY, 1);
  arrow(doc, x2, lineY, -1);
  text(doc, label, (x1 + x2) / 2 - 33, lineY - 21, 11, { width: 66, align: 'center' });
}

function dimVertical(doc, y1, y2, xLine, xWitness, label) {
  line(doc, xWitness, y1, xLine - 6, y1, .5);
  line(doc, xWitness, y2, xLine - 6, y2, .5);
  line(doc, xLine, y1, xLine, y2, .65);
  doc.save().translate(xLine - 15, (y1 + y2) / 2).rotate(-90);
  text(doc, label, -35, 0, 10, { width: 70, align: 'center' });
  doc.restore();
}

function dashed(doc, x1, y1, x2, y2, pattern = [7, 4]) {
  doc.save().strokeColor('#475569').lineWidth(.65).dash(pattern[0], { space: pattern[1] })
    .moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
}

function drawLateral(doc, model, x, y, scale) {
  const { segments, bore, crossHoles } = model;
  let acc = 0;
  const edge = seg => Math.min(1.5, seg.length * .045, seg.diameter * .025) * scale;
  segments.forEach((seg, idx) => {
    const sx=x+acc*scale, right=sx+seg.length*scale;
    const top=y-seg.diameter*scale/2,bottom=y+seg.diameter*scale/2;
    const chL=idx===0?edge(seg):0, chR=idx===segments.length-1?edge(seg):0;
    line(doc,sx+chL,top,right-chR,top,1.1);
    line(doc,sx+chL,bottom,right-chR,bottom,1.1);
    line(doc,sx,top+chL,sx,bottom-chL,.9);
    line(doc,right,top+chR,right,bottom-chR,.9);
    if(chL) {
      line(doc,sx,top+chL,sx+chL,top,1.1);
      line(doc,sx,bottom-chL,sx+chL,bottom,1.1);
    }
    if(chR) {
      line(doc,right-chR,top,right,top+chR,1.1);
      line(doc,right-chR,bottom,right,bottom-chR,1.1);
    }
    acc+=seg.length;
  });
  const first=segments[0];
  dashed(doc, x - 10, y, x + model.total * scale + 12, y, [12, 4]);
  if (bore) {
    const end = x + bore.depth * scale;
    dashed(doc, x, y - bore.diameter * scale / 2, end, y - bore.diameter * scale / 2);
    dashed(doc, x, y + bore.diameter * scale / 2, end, y + bore.diameter * scale / 2);
    dashed(doc, end, y - bore.diameter * scale / 2, end, y + bore.diameter * scale / 2);
  }
  crossHoles.forEach((hole) => {
    const cx = x + hole.distance * scale;
    doc.circle(cx, y, hole.diameter * scale / 2).lineWidth(1).strokeColor('#111827').stroke();
    dashed(doc, cx, y - 18, cx, y + 18, [3, 3]);
  });

  const dimY = y - model.maxDiameter * scale / 2 - 35;
  dimHorizontal(doc, x, x + model.total * scale, dimY - 33, dimY + 32, number(model.total));
  let position = x;
  for (const seg of segments) {
    dimHorizontal(doc, position, position + seg.length * scale, dimY, dimY + 32, number(seg.length));
    position += seg.length * scale;
  }
  dimVertical(doc, y - first.diameter * scale / 2, y + first.diameter * scale / 2,
    x - 34, x - 3, 'Ø' + number(first.diameter));
  position = x + first.length * scale;
  segments.slice(1).forEach((seg) => {
    const mid = position + (seg.length * scale) / 2 + 3;
    text(doc, 'Ø' + number(seg.diameter), mid, y - seg.diameter * scale / 2 - 23, 10);
    position += seg.length * scale;
  });
}

function hatchRect(doc, x, y, w, h) {
  if (w <= 0 || h <= 0) return;
  doc.save().rect(x, y, w, h).clip();
  for (let xx = x - h; xx < x + w + h; xx += 10) {
    line(doc, xx, y + h, xx + h, y, .4, '#6b7280');
  }
  doc.restore();
}

function outlineWithHoles(doc, x, y, width, holes, scale) {
  let cursor = x;
  for (const hole of holes) {
    const left = x + (hole.distance - hole.diameter / 2) * scale;
    const right = x + (hole.distance + hole.diameter / 2) * scale;
    if (left > cursor) line(doc, cursor, y, left, y, 1.1);
    cursor = Math.max(cursor, right);
  }
  if (cursor < x + width) line(doc, cursor, y, x + width, y, 1.1);
}

function drawSection(doc, model, x, y, scale) {
  const { segments, bore, crossHoles } = model;
  let start = x;
  segments.forEach((seg, idx) => {
    const width = seg.length * scale;
    const top = y - seg.diameter * scale / 2;
    const bottom = y + seg.diameter * scale / 2;
    if (idx === 0 && bore) {
      const bt = y - bore.diameter * scale / 2;
      const bb = y + bore.diameter * scale / 2;
      hatchRect(doc, start, top, width, bt - top);
      hatchRect(doc, start, bb, width, bottom - bb);
      // Seção longitudinal corta paredes: cada perfuracao transversal interrompe o metal.
      crossHoles.forEach((hole) => {
        const hx = x + (hole.distance - hole.diameter / 2) * scale;
        const hw = hole.diameter * scale;
        doc.fillColor('white').rect(hx, top, hw, bt - top).fill();
        doc.fillColor('white').rect(hx, bb, hw, bottom - bb).fill();
        line(doc, hx, top, hx, bt, .8); line(doc, hx + hw, top, hx + hw, bt, .8);
        line(doc, hx, bb, hx, bottom, .8); line(doc, hx + hw, bb, hx + hw, bottom, .8);
      });
      line(doc, start, bt, start + width, bt, 1);
      line(doc, start, bb, start + width, bb, 1);
      line(doc, start + bore.depth * scale, bt, start + bore.depth * scale, bb, .9);
    } else {
      hatchRect(doc, start, top, width, seg.diameter * scale);
      if (idx === 0) crossHoles.forEach((hole) => {
        const hx = x + (hole.distance - hole.diameter / 2) * scale;
        const hw = hole.diameter * scale;
        doc.fillColor('white').rect(hx, top, hw, bottom - top).fill();
        line(doc, hx, top, hx, bottom, .8);
        line(doc, hx + hw, top, hx + hw, bottom, .8);
      });
    }
    if (idx === 0 && crossHoles.length) {
      outlineWithHoles(doc, start, top, width, crossHoles, scale);
      outlineWithHoles(doc, start, bottom, width, crossHoles, scale);
    } else {
      line(doc, start, top, start + width, top, 1.1);
      line(doc, start, bottom, start + width, bottom, 1.1);
    }
    if (idx === 0 && bore) {
      line(doc, start, top, start, y - bore.diameter * scale / 2, .8);
      line(doc, start, y + bore.diameter * scale / 2, start, bottom, .8);
    } else {
      line(doc, start, top, start, bottom, .8);
    }
    line(doc, start + width, top, start + width, bottom, 1.05);
    start += width;
  });
  // O corte acompanha as mesmas quebras de aresta da vista de perfil.
  const first=segments[0],last=segments[segments.length-1];
  const bevel=seg=>Math.min(1.5,seg.length*.045,seg.diameter*.025)*scale;
  const cutCorner=(outerX,outerY,innerX,innerY)=>{
    doc.save().fillColor('white').moveTo(outerX,outerY)
      .lineTo(innerX,outerY).lineTo(outerX,innerY).closePath().fill().restore();
    line(doc,innerX,outerY,outerX,innerY,1);
  };
  const c1=bevel(first),c2=bevel(last),endX=x+model.total*scale;
  cutCorner(x,y-first.diameter*scale/2,x+c1,y-first.diameter*scale/2+c1);
  cutCorner(x,y+first.diameter*scale/2,x+c1,y+first.diameter*scale/2-c1);
  cutCorner(endX,y-last.diameter*scale/2,endX-c2,y-last.diameter*scale/2+c2);
  cutCorner(endX,y+last.diameter*scale/2,endX-c2,y+last.diameter*scale/2-c2);
  dashed(doc, x - 9, y, x + model.total * scale + 14, y, [12, 4]);
  if (bore) {
    text(doc, 'ALOJAMENTO: Ø' + number(bore.diameter) + ' × ' + number(bore.depth), x + 8, y + model.maxDiameter * scale / 2 + 8, 9, { bold: true });
  }
}

/**
 * Renderiza cilindros de revolucao com anéis, sombreamento metalico e chanfro
 * ilustrativo. Toda projeção deriva das medidas, não de cubos desenhados à mão.
 * Este é um render vetorial de uma geometria 3D, não um sólido STEP.
 */
function drawIsometric(doc, model, ox, oy) {
  const unit = Math.min(1.58, 250 / model.total, 125 / model.maxDiameter);
  const ax = { x: 0.87, y: -0.44 };
  const per = { x: 0.45, y: 0.89 };
  const project = (x, radius, theta) => ({
    x: ox + unit * (x * ax.x + radius * (per.x * Math.cos(theta) + ax.x * 0.36 * Math.sin(theta))),
    y: oy + unit * (x * ax.y + radius * (per.y * Math.cos(theta) + ax.y * 0.36 * Math.sin(theta))),
  });
  const ellipse = (x, radius, fill, stroke = '#425269') => {
    doc.save().fillColor(fill).strokeColor(stroke).lineWidth(0.8);
    for (let i = 0; i <= 64; i++) {
      const pt = project(x, radius, i * Math.PI / 32);
      if (i === 0) doc.moveTo(pt.x, pt.y); else doc.lineTo(pt.x, pt.y);
    }
    doc.closePath().fillAndStroke().restore();
  };
  const surface = (x1, x2, r1, r2) => {
    const bands = 36;
    for (let i = 0; i < bands; i++) {
      const theta1 = -Math.PI + i * Math.PI / bands;
      const theta2 = -Math.PI + (i + 1) * Math.PI / bands;
      const p1 = project(x1, r1, theta1), p2 = project(x2, r2, theta1);
      const p3 = project(x2, r2, theta2), p4 = project(x1, r1, theta2);
      const t = (i + 0.5) / bands;
      const highlight = Math.exp(-Math.pow((t - 0.56) / 0.17, 2));
      const shade = 107 + Math.round(61 * Math.sin(t * Math.PI) + 55 * highlight);
      const rgb = [Math.min(239, shade + 11), Math.min(245, shade + 17), Math.min(252, shade + 28)];
      const hex = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
      doc.save().fillColor(hex).moveTo(p1.x,p1.y).lineTo(p2.x,p2.y)
        .lineTo(p3.x,p3.y).lineTo(p4.x,p4.y).closePath().fill().restore();
    }
  };
  const outlineRing = (x, radius) => {
    doc.save().lineWidth(1.15).strokeColor('#526072');
    for (let i = 0; i <= 60; i++) {
      const pt=project(x,radius,i*Math.PI/30);
      if(i===0)doc.moveTo(pt.x,pt.y);else doc.lineTo(pt.x,pt.y);
    }
    doc.closePath().stroke().restore();
  };
  // Pintar da ultima seção para a primeira respeita os degraus de torneamento.
  let cumulative = 0;
  const starts = model.segments.map(seg => {
    const at = cumulative; cumulative += seg.length; return at;
  });
  for(let index=model.segments.length-1;index>=0;index--) {
    const seg=model.segments[index], x0=starts[index], x1=x0+seg.length;
    const radius=seg.diameter/2;
    ellipse(x1,radius,'#9aa5b6','#5c677a');
    const edgeBreak = index===0 ? Math.min(1.5,seg.length*.04,seg.diameter*.025) : 0;
    surface(x0+edgeBreak,x1,radius,radius);
    if(edgeBreak) {
      surface(x0,x0+edgeBreak,radius-edgeBreak,radius);
      outlineRing(x0+edgeBreak,radius);
    }
    const faceRadius=radius-edgeBreak;
    ellipse(x0,faceRadius,'#d8e0e9','#465264');
    if(index===0 && model.bore) {
      // Abertura frontal real (geometria armazenada), sem presumir furos.
      const inner=model.bore.diameter/2;
      ellipse(x0,inner,'#263443','#283c4e');
      ellipse(x0+Math.min(model.bore.depth*.12,9),inner*.95,'#4d6174','#57677a');
      ellipse(x0,inner,'#2d3d50','#34495b');
      outlineRing(x0,inner);
    }
    outlineRing(x0,faceRadius);
  }
  for(const hole of model.crossHoles) {
    const seg=model.segments[0],outer=seg.diameter/2;
    const c=project(hole.distance,outer,-Math.PI/2);
    const r=Math.max(2.2,hole.diameter*unit*.48);
    doc.save().fillColor('#263746').lineWidth(.8).strokeColor('#172534')
      .ellipse(c.x,c.y,r*.77,r*.62).fillAndStroke().restore();
    doc.save().lineWidth(.8).strokeColor('#dde7f0')
      .ellipse(c.x-0.6,c.y-0.6,r*.69,r*.54).stroke().restore();
  }
}
function frame(doc, desenho, model, cadData) {
  const W = doc.page.width, H = doc.page.height;
  const logo = path.join(__dirname, '..', '..', 'public', 'IMG', 'logopdf_campo_do_gado.png.png');
  const ink='#1b2937';
  doc.save().strokeColor(ink).lineWidth(1.15).rect(18,18,W-36,H-36).stroke().restore();
  doc.save().strokeColor('#7f8b99').lineWidth(.65).rect(23,23,W-46,H-46).stroke().restore();
  line(doc,23,92,W-23,92,.85);
  // Cabeçalho isolado em três regiões; código jamais sobrepõe título.
  line(doc,255,23,255,92,.65);
  line(doc,910,23,910,92,.65);
  text(doc,'CAMPO DO GADO',37,36,16,{bold:true,width:205});
  text(doc,'MANUTENÇÃO INDUSTRIAL',37,61,9,{width:200});
  text(doc,String(desenho.titulo||'EIXO ESCALONADO').toUpperCase().slice(0,58),
    270,43,15,{bold:true,width:625,align:'center'});
  text(doc,'PRANCHA MECÂNICA — PADRÃO CAMPO DO GADO',
    285,69,8,{width:605,align:'center'});
  text(doc,'CÓDIGO DO DESENHO',925,32,8,{width:220,align:'center'});
  text(doc,String(desenho.codigo||'S/C'),924,50,17,{bold:true,width:225,align:'center'});
  // Legendas nunca ficam em cima das cotas ou do carimbo.
  text(doc,'CORTE A',425,365,12,{bold:true,width:210,align:'center'});
  text(doc,'CORTE A-A',270,649,12,{bold:true,width:230,align:'center'});
  text(doc,'VISTA ISOMÉTRICA',860,649,12,{bold:true,width:250,align:'center'});
  line(doc,23,693,W-23,693,1);
  line(doc,603,693,603,H-23,.65);
  line(doc,816,693,816,H-23,.65);
  text(doc,'INFORMAÇÕES DA PEÇA',36,702,9,{bold:true});
  text(doc,'COMPRIMENTO TOTAL: '+number(model.total)+' mm',36,726,10,{bold:true,width:550});
  text(doc,'TRECHOS: '+model.segments.map(seg=>'Ø'+number(seg.diameter)+' × '+number(seg.length)).join('  /  ').slice(0,81),
    36,744,8,{width:548});
  text(doc,model.bore
    ? 'ALOJAMENTO: Ø'+number(model.bore.diameter)+' × '+number(model.bore.depth)+' (1ª face)'
    : 'ALOJAMENTO: NÃO CADASTRADO',36,763,8,{width:548});
  text(doc,model.crossHoles.length
    ? 'FUROS TRANSVERSAIS: '+model.crossHoles.map(h=>'Ø'+number(h.diameter)+' a '+number(h.distance)+' mm').join(' | ').slice(0,62)
    : 'FUROS TRANSVERSAIS: NÃO CADASTRADOS',36,778,8,{width:548});
  text(doc,'ARESTAS/CHANFROS ILUSTRATIVOS: CONFIRMAR MEDIDA PARA USINAGEM.',
    36,800,7,{width:548});
  try {
    if(fs.existsSync(logo))doc.image(logo,625,705,{fit:[166,105],align:'center',valign:'center'});
    else text(doc,'CAMPO DO GADO',631,741,15,{bold:true});
  }catch(_e){text(doc,'CAMPO DO GADO',631,741,15,{bold:true});}
  const machine=String(desenho.equipamento_nome||cadData.equipamento_nome||'NÃO INFORMADO');
  const drafter=String(cadData.desenhista||desenho.criado_por_nome||'NÃO INFORMADO');
  text(doc,'EQUIPAMENTO',829,702,8,{bold:true});
  text(doc,machine.slice(0,41),829,716,9,{width:330});
  text(doc,'DESENHISTA',829,736,8,{bold:true});
  text(doc,drafter.slice(0,45),829,749,9,{width:330});
  line(doc,820,769,W-25,769,.4);
  text(doc,'REV. '+String(desenho.revisao??0)+'   |   '+new Date().toLocaleDateString('pt-BR')+'   |   mm',
    829,775,9,{width:322});
  text(doc,'FOLHA A3  |  REPRESENTAÇÃO SEM ESCALA',829,797,7,{width:330});
}
function renderShaftSheetPage(doc, desenho, cadData, shaft) {
  const model=buildModel(shaft);
  const scaleA=Math.min(3.5,760/model.total,168/model.maxDiameter);
  const scaleSection=Math.min(3,620/model.total,160/model.maxDiameter);
  drawLateral(doc,model,116,250,scaleA);
  drawSection(doc,model,103,535,scaleSection);
  drawIsometric(doc,model,855,556);
  frame(doc,desenho,model,cadData);
  if(shaft.source==='inferred-2d') {
    doc.save();
    doc.fillColor('#9a3412').font(BOLD).fontSize(9)
      .text('PERFIL INFERIDO DO 2D - CONFERIR FURAÇÃO/ALOJAMENTO',35,672,
        {width:565,lineBreak:false});
    doc.restore();
  }
}

function generateShaftPdf(desenho, cadData, shaft, { pdfDir }) {
  buildModel(shaft);
  const filename = `${String(desenho.codigo || 'eixo').replace(/[^a-zA-Z0-9_-]+/g, '-')}-eixo-rev${desenho.revisao || 0}-${Date.now()}.pdf`;
  const fullPath = path.join(pdfDir, filename);
  const relPath = `/pdfs/desenho-tecnico/${filename}`;
  const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 0, autoFirstPage: true });
  const out = fs.createWriteStream(fullPath);
  doc.pipe(out);
  renderShaftSheetPage(doc, desenho, cadData, shaft);
  doc.end();
  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve({ fullPath, relPath, filename }));
    out.on('error', reject);
  });
}

module.exports = { pickShaft, buildModel, isStandaloneShaft, renderShaftSheetPage, generateShaftPdf };
