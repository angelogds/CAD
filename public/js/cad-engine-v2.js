/**
 * CAD ENGINE V2 - Motor CAD 2D Profissional
 * Inspirado no AutoCAD para desenho técnico industrial
 * Foco em desenho de eixos mecânicos
 */
(function() {
  'use strict';
  
  const NS = 'http://www.w3.org/2000/svg';
  const INITIAL = window.CAD_INITIAL || {};
  
  // ==========================================================================
  // UTILITÁRIOS
  // ==========================================================================
  
  const uid = () => `ent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const deg2rad = (d) => d * Math.PI / 180;
  const rad2deg = (r) => r * 180 / Math.PI;
  const round = (v, decimals = 2) => Number(v.toFixed(decimals));
  
  const distance = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const angle = (p1, p2) => rad2deg(Math.atan2(p2.y - p1.y, p2.x - p1.x));
  const midpoint = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
  const polarPoint = (origin, dist, angleDeg) => ({
    x: origin.x + dist * Math.cos(deg2rad(angleDeg)),
    y: origin.y + dist * Math.sin(deg2rad(angleDeg))
  });
  
  // ==========================================================================
  // CONFIGURAÇÃO INICIAL
  // ==========================================================================
  
  const CONFIG = {
    gridStep: 10,
    gridMajor: 5,
    snapTolerance: 8,
    zoomMin: 0.1,
    zoomMax: 10,
    defaultStroke: '#ffffff',
    defaultStrokeWidth: 1.5,
    selectionColor: '#ffd93d',
    previewColor: '#4ecdc4',
    centerlineColor: '#74b9ff',
    dimensionColor: '#4ecdc4',
    colors: {
      geometria_principal: '#ffffff',
      linhas_de_centro: '#74b9ff',
      cotas: '#4ecdc4',
      textos: '#ffd93d',
      furos: '#ff6b6b',
      construcao: '#94a3b8',
      observacoes: '#f59e0b'
    }
  };
  
  // ==========================================================================
  // ESTADO GLOBAL
  // ==========================================================================
  
  const state = {
    tool: 'select',
    selectedIds: [],
    drawStart: null,
    previewPoint: null,
    pointer: { x: 0, y: 0 },
    worldPointer: { x: 0, y: 0 },
    history: [],
    future: [],
    view: {
      zoom: 1,
      panX: 0,
      panY: 0,
      panning: false,
      panOrigin: null
    },
    snap: {
      enabled: true,
      grid: true,
      endpoint: true,
      midpoint: true,
      center: true,
      perpendicular: false
    },
    grid: {
      visible: true,
      step: CONFIG.gridStep
    },
    ortho: false,
    polar: false,
    polarAngles: [0, 45, 90, 135, 180, 225, 270, 315],
    polylinePoints: [],
    shaftModal: null,
    data: {
      activeLayer: 'geometria_principal',
      layers: {},
      objects: [],
      dimensions: [],
      shafts: [],
      ...(INITIAL.data || {})
    }
  };
  
  // Inicializar layers default
  if (!Object.keys(state.data.layers).length) {
    state.data.layers = {
      geometria_principal: { color: CONFIG.colors.geometria_principal, visible: true, locked: false },
      linhas_de_centro: { color: CONFIG.colors.linhas_de_centro, visible: true, locked: false },
      cotas: { color: CONFIG.colors.cotas, visible: true, locked: false },
      textos: { color: CONFIG.colors.textos, visible: true, locked: false },
      furos: { color: CONFIG.colors.furos, visible: true, locked: false },
      construcao: { color: CONFIG.colors.construcao, visible: true, locked: false },
      observacoes: { color: CONFIG.colors.observacoes, visible: true, locked: false }
    };
  }
  
  // ==========================================================================
  // ELEMENTOS DOM
  // ==========================================================================
  
  let svg, root, layerGrid, layerEntities, layerPreview, layerDimensions, layerSelection;
  let statusBar, propsPanel, layersPanel, measurePreview;
  
  function initDOM() {
    svg = document.getElementById('cadCanvas');
    if (!svg) {
      console.error('[CAD] SVG canvas não encontrado');
      return false;
    }
    
    statusBar = document.getElementById('cadStatusBar');
    propsPanel = document.getElementById('cadProperties');
    layersPanel = document.getElementById('cadLayers');
    
    // Criar estrutura de layers no SVG
    root = document.createElementNS(NS, 'g');
    root.setAttribute('id', 'cadRoot');
    
    layerGrid = document.createElementNS(NS, 'g');
    layerGrid.setAttribute('id', 'layerGrid');
    
    layerEntities = document.createElementNS(NS, 'g');
    layerEntities.setAttribute('id', 'layerEntities');
    
    layerPreview = document.createElementNS(NS, 'g');
    layerPreview.setAttribute('id', 'layerPreview');
    
    layerDimensions = document.createElementNS(NS, 'g');
    layerDimensions.setAttribute('id', 'layerDimensions');
    
    layerSelection = document.createElementNS(NS, 'g');
    layerSelection.setAttribute('id', 'layerSelection');
    
    root.append(layerGrid, layerEntities, layerPreview, layerDimensions, layerSelection);
    svg.innerHTML = '';
    svg.appendChild(root);
    
    // Criar preview de medidas
    measurePreview = document.createElement('div');
    measurePreview.className = 'cad-measure-preview';
    measurePreview.style.display = 'none';
    svg.parentElement.appendChild(measurePreview);
    
    return true;
  }
  
  // ==========================================================================
  // TRANSFORMAÇÃO DE COORDENADAS
  // ==========================================================================
  
  function screenToWorld(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left - state.view.panX) / state.view.zoom;
    const y = (clientY - rect.top - state.view.panY) / state.view.zoom;
    return { x: round(x), y: round(y) };
  }
  
  function worldToScreen(worldX, worldY) {
    const x = worldX * state.view.zoom + state.view.panX;
    const y = worldY * state.view.zoom + state.view.panY;
    return { x, y };
  }
  
  // ==========================================================================
  // SNAP
  // ==========================================================================
  
  function applySnap(point) {
    if (!state.snap.enabled) return point;
    
    let snapped = { ...point };
    let snapType = null;
    let minDist = state.snap.grid ? CONFIG.gridStep / 2 : CONFIG.snapTolerance;
    
    // Snap to grid
    if (state.snap.grid && state.grid.visible) {
      const step = state.grid.step;
      const gx = Math.round(point.x / step) * step;
      const gy = Math.round(point.y / step) * step;
      const d = distance(point, { x: gx, y: gy });
      if (d < minDist) {
        snapped = { x: gx, y: gy };
        snapType = 'grid';
        minDist = d;
      }
    }
    
    // Snap to object points
    for (const obj of state.data.objects) {
      // Endpoint snap
      if (state.snap.endpoint) {
        const endpoints = getObjectEndpoints(obj);
        for (const ep of endpoints) {
          const d = distance(point, ep);
          if (d < minDist) {
            snapped = { x: ep.x, y: ep.y };
            snapType = 'endpoint';
            minDist = d;
          }
        }
      }
      
      // Midpoint snap
      if (state.snap.midpoint && (obj.type === 'line' || obj.type === 'centerline')) {
        const mp = midpoint({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 });
        const d = distance(point, mp);
        if (d < minDist) {
          snapped = { x: mp.x, y: mp.y };
          snapType = 'midpoint';
          minDist = d;
        }
      }
      
      // Center snap
      if (state.snap.center && obj.type === 'circle') {
        const d = distance(point, { x: obj.x, y: obj.y });
        if (d < minDist) {
          snapped = { x: obj.x, y: obj.y };
          snapType = 'center';
          minDist = d;
        }
      }
    }
    
    return { ...snapped, snapType };
  }
  
  function getObjectEndpoints(obj) {
    const points = [];
    if (obj.type === 'line' || obj.type === 'centerline' || obj.type === 'arc') {
      points.push({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 });
    } else if (obj.type === 'rect') {
      points.push(
        { x: obj.x, y: obj.y },
        { x: obj.x + obj.width, y: obj.y },
        { x: obj.x + obj.width, y: obj.y + obj.height },
        { x: obj.x, y: obj.y + obj.height }
      );
    } else if (obj.type === 'circle') {
      // Quadrantes
      points.push(
        { x: obj.x + obj.radius, y: obj.y },
        { x: obj.x - obj.radius, y: obj.y },
        { x: obj.x, y: obj.y + obj.radius },
        { x: obj.x, y: obj.y - obj.radius }
      );
    } else if (obj.type === 'polyline' && Array.isArray(obj.points)) {
      obj.points.forEach(p => points.push({ x: p.x, y: p.y }));
    }
    return points;
  }
  
  // ==========================================================================
  // ORTHO MODE
  // ==========================================================================
  
  function applyOrtho(point, reference) {
    if (!state.ortho || !reference) return point;
    
    const dx = Math.abs(point.x - reference.x);
    const dy = Math.abs(point.y - reference.y);
    
    if (dx >= dy) {
      return { x: point.x, y: reference.y };
    } else {
      return { x: reference.x, y: point.y };
    }
  }
  
  // ==========================================================================
  // POLAR MODE
  // ==========================================================================
  
  function applyPolar(point, reference) {
    if (!state.polar || !reference) return point;
    
    const dist = distance(reference, point);
    const ang = angle(reference, point);
    
    // Encontrar ângulo polar mais próximo
    let closestAngle = state.polarAngles[0];
    let minDiff = Math.abs(ang - closestAngle);
    
    for (const pa of state.polarAngles) {
      const diff = Math.abs(ang - pa);
      if (diff < minDiff) {
        minDiff = diff;
        closestAngle = pa;
      }
    }
    
    if (minDiff < 10) { // Tolerância de 10 graus
      return polarPoint(reference, dist, closestAngle);
    }
    
    return point;
  }
  
  // ==========================================================================
  // OBTER PONTO PROCESSADO
  // ==========================================================================
  
  function getProcessedPoint(evt) {
    let point = screenToWorld(evt.clientX, evt.clientY);
    
    // Aplicar snap
    const snapped = applySnap(point);
    point = { x: snapped.x, y: snapped.y };
    
    // Aplicar ortho se houver ponto de referência
    if (state.drawStart) {
      if (state.ortho) {
        point = applyOrtho(point, state.drawStart);
      } else if (state.polar) {
        point = applyPolar(point, state.drawStart);
      }
    }
    
    return { ...point, snapType: snapped.snapType };
  }
  
  // ==========================================================================
  // HISTORY (UNDO/REDO)
  // ==========================================================================
  
  function pushHistory() {
    state.history.push(JSON.stringify(state.data));
    if (state.history.length > 100) state.history.shift();
    state.future = [];
  }
  
  function undo() {
    if (!state.history.length) return;
    state.future.push(JSON.stringify(state.data));
    state.data = JSON.parse(state.history.pop());
    render();
  }
  
  function redo() {
    if (!state.future.length) return;
    state.history.push(JSON.stringify(state.data));
    state.data = JSON.parse(state.future.pop());
    render();
  }
  
  // ==========================================================================
  // HIT TEST (SELEÇÃO)
  // ==========================================================================
  
  function hitTest(point, tolerance = 6) {
    for (let i = state.data.objects.length - 1; i >= 0; i--) {
      const obj = state.data.objects[i];
      
      if (obj.type === 'line' || obj.type === 'centerline') {
        const d = pointToLineDistance(point, { x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 });
        if (d <= tolerance) return obj;
      }
      
      if (obj.type === 'rect') {
        if (point.x >= obj.x - tolerance && point.x <= obj.x + obj.width + tolerance &&
            point.y >= obj.y - tolerance && point.y <= obj.y + obj.height + tolerance) {
          return obj;
        }
      }
      
      if (obj.type === 'circle') {
        const d = Math.abs(distance(point, { x: obj.x, y: obj.y }) - obj.radius);
        if (d <= tolerance) return obj;
      }
      
      if (obj.type === 'text') {
        if (Math.abs(point.x - obj.x) <= 50 && Math.abs(point.y - obj.y) <= 12) return obj;
      }
      
      if (obj.type === 'shaft') {
        // Hit test simplificado para eixo
        const bounds = getShaftBounds(obj);
        if (point.x >= bounds.minX - tolerance && point.x <= bounds.maxX + tolerance &&
            point.y >= bounds.minY - tolerance && point.y <= bounds.maxY + tolerance) {
          return obj;
        }
      }
    }
    
    // Hit test nas cotas
    for (let i = state.data.dimensions.length - 1; i >= 0; i--) {
      const dim = state.data.dimensions[i];
      const d = pointToLineDistance(point, { x: dim.x1, y: dim.y1 }, { x: dim.x2, y: dim.y2 });
      if (d <= tolerance) return { ...dim, isDimension: true };
    }
    
    return null;
  }
  
  function pointToLineDistance(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    return distance(point, { x: xx, y: yy });
  }
  
  function getShaftBounds(shaft) {
    let minX = shaft.startX;
    let maxX = shaft.startX;
    let minY = shaft.axisY;
    let maxY = shaft.axisY;
    
    let currentX = shaft.startX;
    for (const seg of shaft.segments) {
      currentX += seg.length;
      maxX = Math.max(maxX, currentX);
      minY = Math.min(minY, shaft.axisY - seg.diameter / 2);
      maxY = Math.max(maxY, shaft.axisY + seg.diameter / 2);
    }
    
    return { minX, maxX, minY, maxY };
  }
  
  // ==========================================================================
  // CRIAR OBJETOS
  // ==========================================================================
  
  function createObject(type, start, end, options = {}) {
    const base = {
      id: uid(),
      layer: state.data.activeLayer,
      strokeWidth: CONFIG.defaultStrokeWidth
    };
    
    switch (type) {
      case 'line':
        return { ...base, type: 'line', x: start.x, y: start.y, x2: end.x, y2: end.y };
      
      case 'centerline':
        return { ...base, type: 'centerline', x: start.x, y: start.y, x2: end.x, y2: end.y, layer: 'linhas_de_centro' };
      
      case 'rect':
        return {
          ...base,
          type: 'rect',
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y)
        };
      
      case 'circle':
        return { ...base, type: 'circle', x: start.x, y: start.y, radius: round(distance(start, end)) };
      
      case 'arc':
        return {
          ...base,
          type: 'arc',
          x: start.x,
          y: start.y,
          radius: round(distance(start, end)),
          startAngle: 0,
          endAngle: 90
        };
      
      case 'text':
        return {
          ...base,
          type: 'text',
          x: end.x,
          y: end.y,
          text: options.text || 'Texto',
          fontSize: options.fontSize || 14,
          layer: 'textos'
        };
      
      default:
        return null;
    }
  }
  
  // ==========================================================================
  // CRIAR COTA
  // ==========================================================================
  
  function createDimension(type, p1, p2, offset = 30) {
    const id = uid();
    const len = distance(p1, p2);
    const ang = angle(p1, p2);
    
    // Offset perpendicular
    const perpAngle = ang + 90;
    const offsetX = offset * Math.cos(deg2rad(perpAngle));
    const offsetY = offset * Math.sin(deg2rad(perpAngle));
    
    const dim = {
      id,
      type: type,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      offsetX,
      offsetY,
      value: round(len),
      text: type === 'diameter' ? `Ø${round(len)}` : `${round(len)}`,
      layer: 'cotas'
    };
    
    return dim;
  }
  
  // ==========================================================================
  // CRIAR EIXO PARAMÉTRICO
  // ==========================================================================
  
  function createShaft(segments, options = {}) {
    const shaft = {
      id: uid(),
      type: 'shaft',
      layer: 'geometria_principal',
      axisY: options.axisY || 500,
      startX: options.startX || 100,
      segments: segments.map((seg, idx) => ({
        id: `seg_${idx}`,
        length: Number(seg.length) || 50,
        diameter: Number(seg.diameter) || 40,
        label: seg.label || `Trecho ${idx + 1}`,
        features: seg.features || [] // chaveta, rosca, etc.
      })),
      material: options.material || 'Aço 1045',
      showCenterline: options.showCenterline !== false,
      showDimensions: options.showDimensions !== false
    };
    
    return shaft;
  }
  
  // ==========================================================================
  // RENDERIZAÇÃO
  // ==========================================================================
  
  function render() {
    // Aplicar transformação de view
    root.setAttribute('transform', `translate(${state.view.panX} ${state.view.panY}) scale(${state.view.zoom})`);
    
    renderGrid();
    renderEntities();
    renderPreview();
    renderDimensions();
    renderSelection();
    renderStatus();
    renderPropertiesPanel();
    renderLayersPanel();
  }
  
  // ==========================================================================
  // RENDERIZAR GRID
  // ==========================================================================
  
  function renderGrid() {
    layerGrid.innerHTML = '';
    if (!state.grid.visible) return;
    
    const step = state.grid.step;
    const majorStep = step * CONFIG.gridMajor;
    const viewBox = svg.viewBox.baseVal;
    const width = viewBox.width || 3000;
    const height = viewBox.height || 2000;
    
    // Grid menor
    for (let x = 0; x <= width; x += step) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', 0);
      line.setAttribute('x2', x);
      line.setAttribute('y2', height);
      line.setAttribute('stroke', x % majorStep === 0 ? 'rgba(100,130,170,0.25)' : 'rgba(70,100,140,0.12)');
      line.setAttribute('stroke-width', x % majorStep === 0 ? '1' : '0.5');
      layerGrid.appendChild(line);
    }
    
    for (let y = 0; y <= height; y += step) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', 0);
      line.setAttribute('y1', y);
      line.setAttribute('x2', width);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', y % majorStep === 0 ? 'rgba(100,130,170,0.25)' : 'rgba(70,100,140,0.12)');
      line.setAttribute('stroke-width', y % majorStep === 0 ? '1' : '0.5');
      layerGrid.appendChild(line);
    }
  }
  
  // ==========================================================================
  // RENDERIZAR ENTIDADES
  // ==========================================================================
  
  function renderEntities() {
    layerEntities.innerHTML = '';
    
    for (const obj of state.data.objects) {
      const layerConfig = state.data.layers[obj.layer];
      if (layerConfig && !layerConfig.visible) continue;
      
      const el = createSVGElement(obj, false);
      if (el) layerEntities.appendChild(el);
    }
  }
  
  function createSVGElement(obj, isPreview = false) {
    const color = isPreview ? CONFIG.previewColor : getObjectColor(obj);
    const strokeWidth = obj.strokeWidth || CONFIG.defaultStrokeWidth;
    
    switch (obj.type) {
      case 'line':
        return createLineSVG(obj, color, strokeWidth);
      
      case 'centerline':
        return createCenterlineSVG(obj, color, strokeWidth);
      
      case 'rect':
        return createRectSVG(obj, color, strokeWidth);
      
      case 'circle':
        return createCircleSVG(obj, color, strokeWidth);
      
      case 'arc':
        return createArcSVG(obj, color, strokeWidth);
      
      case 'text':
        return createTextSVG(obj, color);
      
      case 'polyline':
        return createPolylineSVG(obj, color, strokeWidth);
      
      case 'shaft':
        return createShaftSVG(obj, color, strokeWidth);
      
      default:
        return null;
    }
  }
  
  function getObjectColor(obj) {
    const layerConfig = state.data.layers[obj.layer];
    return (layerConfig && layerConfig.color) || CONFIG.defaultStroke;
  }
  
  function createLineSVG(obj, color, strokeWidth) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', obj.x);
    line.setAttribute('y1', obj.y);
    line.setAttribute('x2', obj.x2);
    line.setAttribute('y2', obj.y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', strokeWidth);
    line.setAttribute('stroke-linecap', 'round');
    line.dataset.id = obj.id;
    return line;
  }
  
  function createCenterlineSVG(obj, color, strokeWidth) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', obj.x);
    line.setAttribute('y1', obj.y);
    line.setAttribute('x2', obj.x2);
    line.setAttribute('y2', obj.y2);
    line.setAttribute('stroke', color || CONFIG.centerlineColor);
    line.setAttribute('stroke-width', strokeWidth * 0.7);
    line.setAttribute('stroke-dasharray', '20,5,5,5');
    line.setAttribute('stroke-linecap', 'round');
    line.dataset.id = obj.id;
    return line;
  }
  
  function createRectSVG(obj, color, strokeWidth) {
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', obj.x);
    rect.setAttribute('y', obj.y);
    rect.setAttribute('width', obj.width);
    rect.setAttribute('height', obj.height);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', strokeWidth);
    rect.dataset.id = obj.id;
    return rect;
  }
  
  function createCircleSVG(obj, color, strokeWidth) {
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', obj.x);
    circle.setAttribute('cy', obj.y);
    circle.setAttribute('r', obj.radius);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', strokeWidth);
    circle.dataset.id = obj.id;
    return circle;
  }
  
  function createArcSVG(obj, color, strokeWidth) {
    const startAngle = obj.startAngle || 0;
    const endAngle = obj.endAngle || 90;
    const radius = obj.radius;
    
    const start = polarPoint({ x: obj.x, y: obj.y }, radius, startAngle);
    const end = polarPoint({ x: obj.x, y: obj.y }, radius, endAngle);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    
    const path = document.createElementNS(NS, 'path');
    const d = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', strokeWidth);
    path.dataset.id = obj.id;
    return path;
  }
  
  function createTextSVG(obj, color) {
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', obj.x);
    text.setAttribute('y', obj.y);
    text.setAttribute('fill', color);
    text.setAttribute('font-size', obj.fontSize || 14);
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.textContent = obj.text || 'Texto';
    text.dataset.id = obj.id;
    return text;
  }
  
  function createPolylineSVG(obj, color, strokeWidth) {
    if (!obj.points || obj.points.length < 2) return null;
    
    const polyline = document.createElementNS(NS, 'polyline');
    const points = obj.points.map(p => `${p.x},${p.y}`).join(' ');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', color);
    polyline.setAttribute('stroke-width', strokeWidth);
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.dataset.id = obj.id;
    return polyline;
  }
  
  function createShaftSVG(obj, color, strokeWidth) {
    const g = document.createElementNS(NS, 'g');
    g.dataset.id = obj.id;
    
    let currentX = obj.startX;
    const axisY = obj.axisY;
    
    // Contorno superior e inferior do eixo
    const topPoints = [];
    const bottomPoints = [];
    
    for (const seg of obj.segments) {
      const halfDiam = seg.diameter / 2;
      
      // Ponto inicial do segmento
      topPoints.push({ x: currentX, y: axisY - halfDiam });
      bottomPoints.push({ x: currentX, y: axisY + halfDiam });
      
      // Ponto final do segmento
      currentX += seg.length;
      topPoints.push({ x: currentX, y: axisY - halfDiam });
      bottomPoints.push({ x: currentX, y: axisY + halfDiam });
    }
    
    // Desenhar contorno superior
    for (let i = 0; i < topPoints.length - 1; i++) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', topPoints[i].x);
      line.setAttribute('y1', topPoints[i].y);
      line.setAttribute('x2', topPoints[i + 1].x);
      line.setAttribute('y2', topPoints[i + 1].y);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', strokeWidth);
      g.appendChild(line);
    }
    
    // Desenhar contorno inferior
    for (let i = 0; i < bottomPoints.length - 1; i++) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', bottomPoints[i].x);
      line.setAttribute('y1', bottomPoints[i].y);
      line.setAttribute('x2', bottomPoints[i + 1].x);
      line.setAttribute('y2', bottomPoints[i + 1].y);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', strokeWidth);
      g.appendChild(line);
    }
    
    // Desenhar ombros (conexões verticais entre segmentos)
    currentX = obj.startX;
    for (let i = 0; i < obj.segments.length; i++) {
      const seg = obj.segments[i];
      const halfDiam = seg.diameter / 2;
      
      // Ombro inicial
      if (i === 0) {
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', currentX);
        line.setAttribute('y1', axisY - halfDiam);
        line.setAttribute('x2', currentX);
        line.setAttribute('y2', axisY + halfDiam);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', strokeWidth);
        g.appendChild(line);
      }
      
      currentX += seg.length;
      
      // Ombro entre segmentos
      if (i < obj.segments.length - 1) {
        const nextSeg = obj.segments[i + 1];
        const nextHalfDiam = nextSeg.diameter / 2;
        
        // Linha vertical conectando os dois diâmetros (superior)
        if (halfDiam !== nextHalfDiam) {
          const lineTop = document.createElementNS(NS, 'line');
          lineTop.setAttribute('x1', currentX);
          lineTop.setAttribute('y1', axisY - halfDiam);
          lineTop.setAttribute('x2', currentX);
          lineTop.setAttribute('y2', axisY - nextHalfDiam);
          lineTop.setAttribute('stroke', color);
          lineTop.setAttribute('stroke-width', strokeWidth);
          g.appendChild(lineTop);
          
          const lineBottom = document.createElementNS(NS, 'line');
          lineBottom.setAttribute('x1', currentX);
          lineBottom.setAttribute('y1', axisY + halfDiam);
          lineBottom.setAttribute('x2', currentX);
          lineBottom.setAttribute('y2', axisY + nextHalfDiam);
          lineBottom.setAttribute('stroke', color);
          lineBottom.setAttribute('stroke-width', strokeWidth);
          g.appendChild(lineBottom);
        }
      } else {
        // Ombro final
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', currentX);
        line.setAttribute('y1', axisY - halfDiam);
        line.setAttribute('x2', currentX);
        line.setAttribute('y2', axisY + halfDiam);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', strokeWidth);
        g.appendChild(line);
      }
    }
    
    // Linha de centro
    if (obj.showCenterline) {
      const totalLength = obj.segments.reduce((sum, s) => sum + s.length, 0);
      const cl = document.createElementNS(NS, 'line');
      cl.setAttribute('x1', obj.startX - 20);
      cl.setAttribute('y1', axisY);
      cl.setAttribute('x2', obj.startX + totalLength + 20);
      cl.setAttribute('y2', axisY);
      cl.setAttribute('stroke', CONFIG.centerlineColor);
      cl.setAttribute('stroke-width', 0.8);
      cl.setAttribute('stroke-dasharray', '20,5,5,5');
      g.appendChild(cl);
    }
    
    return g;
  }
  
  // ==========================================================================
  // RENDERIZAR PREVIEW
  // ==========================================================================
  
  function renderPreview() {
    layerPreview.innerHTML = '';
    
    if (!state.drawStart || !state.previewPoint) return;
    
    const tool = state.tool;
    
    if (tool === 'line' || tool === 'centerline' || tool === 'rect' || tool === 'circle' || tool === 'arc') {
      const obj = createObject(tool, state.drawStart, state.previewPoint);
      if (obj) {
        const el = createSVGElement(obj, true);
        if (el) layerPreview.appendChild(el);
      }
      
      // Preview de medida
      updateMeasurePreview(state.drawStart, state.previewPoint);
    }
    
    if (tool === 'polyline' && state.polylinePoints.length > 0) {
      // Desenhar linhas já definidas
      for (let i = 0; i < state.polylinePoints.length - 1; i++) {
        const line = createLineSVG({
          x: state.polylinePoints[i].x,
          y: state.polylinePoints[i].y,
          x2: state.polylinePoints[i + 1].x,
          y2: state.polylinePoints[i + 1].y
        }, CONFIG.previewColor, CONFIG.defaultStrokeWidth);
        layerPreview.appendChild(line);
      }
      
      // Linha atual
      if (state.previewPoint) {
        const lastPt = state.polylinePoints[state.polylinePoints.length - 1];
        const line = createLineSVG({
          x: lastPt.x,
          y: lastPt.y,
          x2: state.previewPoint.x,
          y2: state.previewPoint.y
        }, CONFIG.previewColor, CONFIG.defaultStrokeWidth);
        layerPreview.appendChild(line);
        
        updateMeasurePreview(lastPt, state.previewPoint);
      }
    }
    
    if ((tool === 'dim_linear' || tool === 'dim_diameter') && state.drawStart) {
      // Preview da cota
      const dim = createDimension(tool === 'dim_diameter' ? 'diameter' : 'linear', state.drawStart, state.previewPoint);
      renderDimensionSVG(dim, true);
    }
  }
  
  function updateMeasurePreview(p1, p2) {
    if (!measurePreview) return;
    
    const len = round(distance(p1, p2));
    const ang = round(angle(p1, p2));
    
    measurePreview.innerHTML = `
      <div class="cad-measure-line">
        <span class="cad-measure-label">Comprimento:</span>
        <span class="cad-measure-value">${len} mm</span>
      </div>
      <div class="cad-measure-line">
        <span class="cad-measure-label">Ângulo:</span>
        <span class="cad-measure-value">${ang}°</span>
      </div>
      <div class="cad-measure-line">
        <span class="cad-measure-label">ΔX:</span>
        <span class="cad-measure-value">${round(p2.x - p1.x)}</span>
        <span class="cad-measure-label">ΔY:</span>
        <span class="cad-measure-value">${round(p2.y - p1.y)}</span>
      </div>
    `;
    
    const screen = worldToScreen(p2.x, p2.y);
    measurePreview.style.display = 'block';
    measurePreview.style.left = `${screen.x + 20}px`;
    measurePreview.style.top = `${screen.y - 60}px`;
  }
  
  function hideMeasurePreview() {
    if (measurePreview) {
      measurePreview.style.display = 'none';
    }
  }
  
  // ==========================================================================
  // RENDERIZAR COTAS/DIMENSÕES
  // ==========================================================================
  
  function renderDimensions() {
    layerDimensions.innerHTML = '';
    
    for (const dim of state.data.dimensions) {
      renderDimensionSVG(dim, false);
    }
    
    // Renderizar cotas automáticas dos eixos
    for (const obj of state.data.objects) {
      if (obj.type === 'shaft' && obj.showDimensions) {
        renderShaftDimensions(obj);
      }
    }
  }
  
  function renderDimensionSVG(dim, isPreview) {
    const color = isPreview ? CONFIG.previewColor : CONFIG.dimensionColor;
    const g = document.createElementNS(NS, 'g');
    
    const offset = 30;
    const textOffset = 5;
    
    // Calcular posição das linhas de cota
    const ang = angle({ x: dim.x1, y: dim.y1 }, { x: dim.x2, y: dim.y2 });
    const perpAng = ang + 90;
    
    const offsetX = offset * Math.cos(deg2rad(perpAng));
    const offsetY = offset * Math.sin(deg2rad(perpAng));
    
    // Linhas de extensão
    const ext1 = document.createElementNS(NS, 'line');
    ext1.setAttribute('x1', dim.x1);
    ext1.setAttribute('y1', dim.y1);
    ext1.setAttribute('x2', dim.x1 + offsetX);
    ext1.setAttribute('y2', dim.y1 + offsetY);
    ext1.setAttribute('stroke', color);
    ext1.setAttribute('stroke-width', 0.8);
    g.appendChild(ext1);
    
    const ext2 = document.createElementNS(NS, 'line');
    ext2.setAttribute('x1', dim.x2);
    ext2.setAttribute('y1', dim.y2);
    ext2.setAttribute('x2', dim.x2 + offsetX);
    ext2.setAttribute('y2', dim.y2 + offsetY);
    ext2.setAttribute('stroke', color);
    ext2.setAttribute('stroke-width', 0.8);
    g.appendChild(ext2);
    
    // Linha de cota principal
    const dimLine = document.createElementNS(NS, 'line');
    dimLine.setAttribute('x1', dim.x1 + offsetX);
    dimLine.setAttribute('y1', dim.y1 + offsetY);
    dimLine.setAttribute('x2', dim.x2 + offsetX);
    dimLine.setAttribute('y2', dim.y2 + offsetY);
    dimLine.setAttribute('stroke', color);
    dimLine.setAttribute('stroke-width', 1);
    g.appendChild(dimLine);
    
    // Setas (ou ticks)
    const arrowSize = 8;
    // Seta 1
    const arrow1 = createArrow(
      { x: dim.x1 + offsetX, y: dim.y1 + offsetY },
      ang,
      arrowSize,
      color
    );
    g.appendChild(arrow1);
    
    // Seta 2
    const arrow2 = createArrow(
      { x: dim.x2 + offsetX, y: dim.y2 + offsetY },
      ang + 180,
      arrowSize,
      color
    );
    g.appendChild(arrow2);
    
    // Texto da cota
    const midX = (dim.x1 + dim.x2) / 2 + offsetX;
    const midY = (dim.y1 + dim.y2) / 2 + offsetY;
    
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', midX);
    text.setAttribute('y', midY - textOffset);
    text.setAttribute('fill', '#ffffff');
    text.setAttribute('font-size', 12);
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = dim.text || `${dim.value}`;
    g.appendChild(text);
    
    layerDimensions.appendChild(g);
  }
  
  function createArrow(point, angleDeg, size, color) {
    const path = document.createElementNS(NS, 'path');
    const tip = point;
    const left = polarPoint(tip, size, angleDeg + 150);
    const right = polarPoint(tip, size, angleDeg - 150);
    
    const d = `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
    path.setAttribute('d', d);
    path.setAttribute('fill', color);
    return path;
  }
  
  function renderShaftDimensions(shaft) {
    let currentX = shaft.startX;
    const axisY = shaft.axisY;
    
    for (const seg of shaft.segments) {
      // Cota de diâmetro
      const diamDim = {
        type: 'diameter',
        x1: currentX + seg.length / 2,
        y1: axisY - seg.diameter / 2,
        x2: currentX + seg.length / 2,
        y2: axisY + seg.diameter / 2,
        value: seg.diameter,
        text: `Ø${seg.diameter}`
      };
      
      // Renderizar cota de diâmetro vertical simplificada
      const g = document.createElementNS(NS, 'g');
      
      // Linha vertical com setas
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', diamDim.x1);
      line.setAttribute('y1', diamDim.y1);
      line.setAttribute('x2', diamDim.x2);
      line.setAttribute('y2', diamDim.y2);
      line.setAttribute('stroke', CONFIG.dimensionColor);
      line.setAttribute('stroke-width', 0.8);
      g.appendChild(line);
      
      // Texto
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', diamDim.x1 + 15);
      text.setAttribute('y', axisY + 4);
      text.setAttribute('fill', '#ffffff');
      text.setAttribute('font-size', 11);
      text.setAttribute('font-family', 'Arial, sans-serif');
      text.textContent = diamDim.text;
      g.appendChild(text);
      
      layerDimensions.appendChild(g);
      
      // Cota de comprimento
      const startX = currentX;
      currentX += seg.length;
      
      const lenDim = {
        type: 'linear',
        x1: startX,
        y1: axisY + seg.diameter / 2 + 20,
        x2: currentX,
        y2: axisY + seg.diameter / 2 + 20,
        value: seg.length,
        text: `${seg.length}`
      };
      
      const g2 = document.createElementNS(NS, 'g');
      
      // Linhas de extensão
      const ext1 = document.createElementNS(NS, 'line');
      ext1.setAttribute('x1', startX);
      ext1.setAttribute('y1', axisY + seg.diameter / 2);
      ext1.setAttribute('x2', startX);
      ext1.setAttribute('y2', lenDim.y1 + 5);
      ext1.setAttribute('stroke', CONFIG.dimensionColor);
      ext1.setAttribute('stroke-width', 0.5);
      g2.appendChild(ext1);
      
      const ext2 = document.createElementNS(NS, 'line');
      ext2.setAttribute('x1', currentX);
      ext2.setAttribute('y1', axisY + seg.diameter / 2);
      ext2.setAttribute('x2', currentX);
      ext2.setAttribute('y2', lenDim.y1 + 5);
      ext2.setAttribute('stroke', CONFIG.dimensionColor);
      ext2.setAttribute('stroke-width', 0.5);
      g2.appendChild(ext2);
      
      // Linha horizontal
      const hline = document.createElementNS(NS, 'line');
      hline.setAttribute('x1', lenDim.x1);
      hline.setAttribute('y1', lenDim.y1);
      hline.setAttribute('x2', lenDim.x2);
      hline.setAttribute('y2', lenDim.y2);
      hline.setAttribute('stroke', CONFIG.dimensionColor);
      hline.setAttribute('stroke-width', 0.8);
      g2.appendChild(hline);
      
      // Texto
      const text2 = document.createElementNS(NS, 'text');
      text2.setAttribute('x', (lenDim.x1 + lenDim.x2) / 2);
      text2.setAttribute('y', lenDim.y1 - 4);
      text2.setAttribute('fill', '#ffffff');
      text2.setAttribute('font-size', 11);
      text2.setAttribute('font-family', 'Arial, sans-serif');
      text2.setAttribute('text-anchor', 'middle');
      text2.textContent = lenDim.text;
      g2.appendChild(text2);
      
      layerDimensions.appendChild(g2);
    }
  }
  
  // ==========================================================================
  // RENDERIZAR SELEÇÃO
  // ==========================================================================
  
  function renderSelection() {
    layerSelection.innerHTML = '';
    
    for (const id of state.selectedIds) {
      const obj = state.data.objects.find(o => o.id === id);
      if (!obj) continue;
      
      const highlight = createSVGElement(obj, false);
      if (highlight) {
        highlight.setAttribute('stroke', CONFIG.selectionColor);
        highlight.setAttribute('stroke-width', (obj.strokeWidth || CONFIG.defaultStrokeWidth) + 2);
        highlight.setAttribute('opacity', '0.5');
        highlight.setAttribute('fill', 'none');
        layerSelection.appendChild(highlight);
      }
      
      // Grips de edição
      const grips = getObjectGrips(obj);
      for (const grip of grips) {
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', grip.x);
        circle.setAttribute('cy', grip.y);
        circle.setAttribute('r', 4);
        circle.setAttribute('fill', CONFIG.selectionColor);
        circle.setAttribute('stroke', '#000');
        circle.setAttribute('stroke-width', 1);
        circle.setAttribute('cursor', 'move');
        circle.dataset.grip = grip.type;
        circle.dataset.objId = obj.id;
        layerSelection.appendChild(circle);
      }
    }
  }
  
  function getObjectGrips(obj) {
    const grips = [];
    
    if (obj.type === 'line' || obj.type === 'centerline') {
      grips.push({ x: obj.x, y: obj.y, type: 'start' });
      grips.push({ x: obj.x2, y: obj.y2, type: 'end' });
      grips.push({ x: (obj.x + obj.x2) / 2, y: (obj.y + obj.y2) / 2, type: 'mid' });
    }
    
    if (obj.type === 'rect') {
      grips.push({ x: obj.x, y: obj.y, type: 'tl' });
      grips.push({ x: obj.x + obj.width, y: obj.y, type: 'tr' });
      grips.push({ x: obj.x + obj.width, y: obj.y + obj.height, type: 'br' });
      grips.push({ x: obj.x, y: obj.y + obj.height, type: 'bl' });
    }
    
    if (obj.type === 'circle') {
      grips.push({ x: obj.x, y: obj.y, type: 'center' });
      grips.push({ x: obj.x + obj.radius, y: obj.y, type: 'radius' });
    }
    
    return grips;
  }
  
  // ==========================================================================
  // RENDERIZAR STATUS BAR
  // ==========================================================================
  
  function renderStatus() {
    if (!statusBar) return;
    
    const p = state.worldPointer;
    const len = (state.drawStart && state.previewPoint) 
      ? round(distance(state.drawStart, state.previewPoint)) 
      : 0;
    const ang = (state.drawStart && state.previewPoint)
      ? round(angle(state.drawStart, state.previewPoint))
      : 0;
    
    statusBar.innerHTML = `
      <div class="cad-status-left">
        <div class="cad-status-item">
          <span class="cad-status-label">X:</span>
          <span class="cad-status-value">${round(p.x)}</span>
        </div>
        <div class="cad-status-item">
          <span class="cad-status-label">Y:</span>
          <span class="cad-status-value">${round(p.y)}</span>
        </div>
        <div class="cad-status-item">
          <span class="cad-status-label">Ferramenta:</span>
          <span class="cad-status-value">${state.tool.toUpperCase()}</span>
        </div>
        <div class="cad-status-item">
          <span class="cad-status-label">Comp:</span>
          <span class="cad-status-value">${len} mm</span>
        </div>
        <div class="cad-status-item">
          <span class="cad-status-label">Ângulo:</span>
          <span class="cad-status-value">${ang}°</span>
        </div>
      </div>
      <div class="cad-status-right">
        <button class="cad-status-toggle ${state.grid.visible ? 'active' : ''}" data-toggle="grid">GRID</button>
        <button class="cad-status-toggle ${state.snap.enabled ? 'active' : ''}" data-toggle="snap">SNAP</button>
        <button class="cad-status-toggle ${state.ortho ? 'active' : ''}" data-toggle="ortho">ORTHO</button>
        <button class="cad-status-toggle ${state.polar ? 'active' : ''}" data-toggle="polar">POLAR</button>
      </div>
    `;
    
    // Event listeners para toggles
    statusBar.querySelectorAll('.cad-status-toggle').forEach(btn => {
      btn.onclick = () => {
        const toggle = btn.dataset.toggle;
        if (toggle === 'grid') state.grid.visible = !state.grid.visible;
        if (toggle === 'snap') state.snap.enabled = !state.snap.enabled;
        if (toggle === 'ortho') { state.ortho = !state.ortho; if (state.ortho) state.polar = false; }
        if (toggle === 'polar') { state.polar = !state.polar; if (state.polar) state.ortho = false; }
        render();
      };
    });
  }
  
  // ==========================================================================
  // RENDERIZAR PAINEL DE PROPRIEDADES
  // ==========================================================================
  
  function renderPropertiesPanel() {
    if (!propsPanel) return;
    
    if (state.selectedIds.length === 0) {
      propsPanel.innerHTML = '<p style="color:#94a3b8;font-size:12px;">Selecione um objeto para editar suas propriedades.</p>';
      return;
    }
    
    const obj = state.data.objects.find(o => o.id === state.selectedIds[0]);
    if (!obj) {
      propsPanel.innerHTML = '<p style="color:#94a3b8;font-size:12px;">Objeto não encontrado.</p>';
      return;
    }
    
    let html = `<div class="cad-props-grid">
      <div class="cad-prop-row">
        <span class="cad-prop-label">Tipo</span>
        <span style="color:#e2e8f0;">${obj.type.toUpperCase()}</span>
      </div>
      <div class="cad-prop-row">
        <span class="cad-prop-label">Layer</span>
        <select class="cad-select" data-prop="layer">
          ${Object.keys(state.data.layers).map(l => 
            `<option value="${l}" ${obj.layer === l ? 'selected' : ''}>${l}</option>`
          ).join('')}
        </select>
      </div>`;
    
    if (obj.type === 'line' || obj.type === 'centerline') {
      const len = round(distance({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 }));
      const ang = round(angle({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 }));
      
      html += `
        <div class="cad-prop-row">
          <span class="cad-prop-label">X1</span>
          <input class="cad-input" type="number" data-prop="x" value="${obj.x}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Y1</span>
          <input class="cad-input" type="number" data-prop="y" value="${obj.y}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">X2</span>
          <input class="cad-input" type="number" data-prop="x2" value="${obj.x2}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Y2</span>
          <input class="cad-input" type="number" data-prop="y2" value="${obj.y2}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Comprimento</span>
          <input class="cad-input" type="number" data-prop="length" value="${len}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Ângulo</span>
          <input class="cad-input" type="number" data-prop="angle" value="${ang}" step="0.1">
        </div>`;
    }
    
    if (obj.type === 'rect') {
      html += `
        <div class="cad-prop-row">
          <span class="cad-prop-label">X</span>
          <input class="cad-input" type="number" data-prop="x" value="${obj.x}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Y</span>
          <input class="cad-input" type="number" data-prop="y" value="${obj.y}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Largura</span>
          <input class="cad-input" type="number" data-prop="width" value="${obj.width}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Altura</span>
          <input class="cad-input" type="number" data-prop="height" value="${obj.height}" step="0.1">
        </div>`;
    }
    
    if (obj.type === 'circle') {
      html += `
        <div class="cad-prop-row">
          <span class="cad-prop-label">Centro X</span>
          <input class="cad-input" type="number" data-prop="x" value="${obj.x}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Centro Y</span>
          <input class="cad-input" type="number" data-prop="y" value="${obj.y}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Raio</span>
          <input class="cad-input" type="number" data-prop="radius" value="${obj.radius}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Diâmetro</span>
          <input class="cad-input" type="number" data-prop="diameter" value="${round(obj.radius * 2)}" step="0.1">
        </div>`;
    }
    
    if (obj.type === 'text') {
      html += `
        <div class="cad-prop-row">
          <span class="cad-prop-label">X</span>
          <input class="cad-input" type="number" data-prop="x" value="${obj.x}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Y</span>
          <input class="cad-input" type="number" data-prop="y" value="${obj.y}" step="0.1">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Texto</span>
          <input class="cad-input" type="text" data-prop="text" value="${obj.text || ''}">
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Tamanho</span>
          <input class="cad-input" type="number" data-prop="fontSize" value="${obj.fontSize || 14}" step="1">
        </div>`;
    }
    
    if (obj.type === 'shaft') {
      html += `
        <div class="cad-prop-row">
          <span class="cad-prop-label">Segmentos</span>
          <span style="color:#e2e8f0;">${obj.segments.length}</span>
        </div>
        <div class="cad-prop-row">
          <span class="cad-prop-label">Material</span>
          <input class="cad-input" type="text" data-prop="material" value="${obj.material || ''}">
        </div>
        <button class="cad-btn cad-btn-lg" style="margin-top:8px;width:100%;" onclick="window.CAD.editShaft('${obj.id}')">
          Editar Segmentos
        </button>`;
    }
    
    html += '</div>';
    propsPanel.innerHTML = html;
    
    // Event listeners para inputs
    propsPanel.querySelectorAll('input, select').forEach(input => {
      input.onchange = (e) => handlePropertyChange(obj.id, e.target.dataset.prop, e.target.value);
    });
  }
  
  function handlePropertyChange(objId, prop, value) {
    const obj = state.data.objects.find(o => o.id === objId);
    if (!obj) return;
    
    pushHistory();
    
    const num = parseFloat(value);
    const isNumber = !isNaN(num);
    
    if (prop === 'length' && (obj.type === 'line' || obj.type === 'centerline')) {
      // Manter ângulo, alterar comprimento
      const currentLen = distance({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 });
      const currentAng = angle({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 });
      if (currentLen > 0 && num > 0) {
        const newEnd = polarPoint({ x: obj.x, y: obj.y }, num, currentAng);
        obj.x2 = round(newEnd.x);
        obj.y2 = round(newEnd.y);
      }
    } else if (prop === 'angle' && (obj.type === 'line' || obj.type === 'centerline')) {
      // Manter comprimento, alterar ângulo
      const currentLen = distance({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 });
      const newEnd = polarPoint({ x: obj.x, y: obj.y }, currentLen, num);
      obj.x2 = round(newEnd.x);
      obj.y2 = round(newEnd.y);
    } else if (prop === 'diameter' && obj.type === 'circle') {
      obj.radius = round(num / 2);
    } else if (['x', 'y', 'x2', 'y2', 'width', 'height', 'radius', 'fontSize'].includes(prop)) {
      obj[prop] = round(num);
    } else {
      obj[prop] = value;
    }
    
    render();
  }
  
  // ==========================================================================
  // RENDERIZAR PAINEL DE LAYERS
  // ==========================================================================
  
  function renderLayersPanel() {
    if (!layersPanel) return;
    
    const layerSelect = document.getElementById('cadLayerSelect');
    if (layerSelect) {
      layerSelect.innerHTML = Object.keys(state.data.layers).map(name => 
        `<option value="${name}" ${state.data.activeLayer === name ? 'selected' : ''}>${name}</option>`
      ).join('');
      
      layerSelect.onchange = (e) => {
        state.data.activeLayer = e.target.value;
      };
    }
    
    const layersList = document.getElementById('cadLayersList');
    if (layersList) {
      layersList.innerHTML = Object.entries(state.data.layers).map(([name, config]) => `
        <div class="cad-layer-item">
          <div class="cad-layer-color" style="background:${config.color}"></div>
          <span class="cad-layer-name">${name}</span>
          <button class="cad-layer-toggle ${config.visible ? 'active' : ''}" data-layer="${name}" data-action="visible" title="Visibilidade">
            ${config.visible ? '👁' : '⊘'}
          </button>
          <button class="cad-layer-toggle ${config.locked ? 'active' : ''}" data-layer="${name}" data-action="lock" title="Bloquear">
            ${config.locked ? '🔒' : '🔓'}
          </button>
        </div>
      `).join('');
      
      layersList.querySelectorAll('.cad-layer-toggle').forEach(btn => {
        btn.onclick = () => {
          const layerName = btn.dataset.layer;
          const action = btn.dataset.action;
          if (action === 'visible') {
            state.data.layers[layerName].visible = !state.data.layers[layerName].visible;
          } else if (action === 'lock') {
            state.data.layers[layerName].locked = !state.data.layers[layerName].locked;
          }
          render();
        };
      });
    }
  }
  
  // ==========================================================================
  // MODAL DE EIXO PARAMÉTRICO
  // ==========================================================================
  
  function showShaftModal(existingShaft = null) {
    const isEdit = !!existingShaft;
    const segments = isEdit ? [...existingShaft.segments] : [
      { length: 80, diameter: 40, label: 'Trecho 1' },
      { length: 100, diameter: 55, label: 'Trecho 2' },
      { length: 60, diameter: 35, label: 'Trecho 3' }
    ];
    
    const overlay = document.createElement('div');
    overlay.className = 'cad-modal-overlay';
    overlay.innerHTML = `
      <div class="cad-modal">
        <div class="cad-modal-header">
          <span class="cad-modal-title">${isEdit ? 'Editar' : 'Novo'} Eixo Paramétrico</span>
          <button class="cad-modal-close" id="shaftModalClose">×</button>
        </div>
        <div class="cad-modal-body">
          <div style="margin-bottom:12px;">
            <label class="cad-prop-label">Material</label>
            <input class="cad-input" type="text" id="shaftMaterial" value="${isEdit ? existingShaft.material || '' : 'Aço 1045'}" placeholder="Ex: Aço 1045">
          </div>
          
          <table class="cad-shaft-segments" id="shaftSegmentsTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Comprimento (mm)</th>
                <th>Diâmetro (mm)</th>
                <th>Observação</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="shaftSegmentsBody">
            </tbody>
          </table>
          
          <div class="cad-shaft-add" id="addSegmentBtn">
            + Adicionar Segmento
          </div>
          
          <div class="cad-shaft-preview" id="shaftPreviewContainer">
            <svg id="shaftPreviewSvg" viewBox="0 0 550 150"></svg>
          </div>
        </div>
        <div class="cad-modal-footer">
          <button class="cad-btn" id="shaftCancelBtn">Cancelar</button>
          <button class="cad-btn cad-btn-primary" id="shaftConfirmBtn">${isEdit ? 'Atualizar' : 'Criar'} Eixo</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    state.shaftModal = { overlay, segments, existingShaft };
    
    renderShaftSegmentsTable();
    renderShaftPreview();
    
    // Event listeners
    overlay.querySelector('#shaftModalClose').onclick = closeShaftModal;
    overlay.querySelector('#shaftCancelBtn').onclick = closeShaftModal;
    overlay.querySelector('#addSegmentBtn').onclick = addShaftSegment;
    overlay.querySelector('#shaftConfirmBtn').onclick = confirmShaft;
    overlay.onclick = (e) => { if (e.target === overlay) closeShaftModal(); };
  }
  
  function renderShaftSegmentsTable() {
    const tbody = document.getElementById('shaftSegmentsBody');
    if (!tbody || !state.shaftModal) return;
    
    tbody.innerHTML = state.shaftModal.segments.map((seg, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><input class="cad-input" type="number" data-idx="${idx}" data-field="length" value="${seg.length}" min="1"></td>
        <td><input class="cad-input" type="number" data-idx="${idx}" data-field="diameter" value="${seg.diameter}" min="1"></td>
        <td><input class="cad-input" type="text" data-idx="${idx}" data-field="label" value="${seg.label || ''}"></td>
        <td>
          <button class="cad-btn cad-btn-danger" style="padding:4px 8px;" data-idx="${idx}" data-action="remove">×</button>
        </td>
      </tr>
    `).join('');
    
    // Input listeners
    tbody.querySelectorAll('input').forEach(input => {
      input.onchange = (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const field = e.target.dataset.field;
        const value = field === 'label' ? e.target.value : parseFloat(e.target.value) || 0;
        state.shaftModal.segments[idx][field] = value;
        renderShaftPreview();
      };
    });
    
    // Remove buttons
    tbody.querySelectorAll('button[data-action="remove"]').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.target.dataset.idx);
        state.shaftModal.segments.splice(idx, 1);
        renderShaftSegmentsTable();
        renderShaftPreview();
      };
    });
  }
  
  function addShaftSegment() {
    if (!state.shaftModal) return;
    const lastSeg = state.shaftModal.segments[state.shaftModal.segments.length - 1];
    state.shaftModal.segments.push({
      length: lastSeg ? lastSeg.length : 50,
      diameter: lastSeg ? lastSeg.diameter : 40,
      label: `Trecho ${state.shaftModal.segments.length + 1}`
    });
    renderShaftSegmentsTable();
    renderShaftPreview();
  }
  
  function renderShaftPreview() {
    const svgEl = document.getElementById('shaftPreviewSvg');
    if (!svgEl || !state.shaftModal) return;
    
    const segments = state.shaftModal.segments;
    const totalLength = segments.reduce((sum, s) => sum + (s.length || 0), 0);
    const maxDiam = Math.max(...segments.map(s => s.diameter || 0), 1);
    
    // Escala para caber no preview
    const scale = Math.min(500 / (totalLength + 40), 100 / maxDiam);
    const offsetX = 25;
    const centerY = 75;
    
    let svgContent = '';
    let currentX = offsetX;
    
    // Linha de centro
    svgContent += `<line x1="${offsetX - 10}" y1="${centerY}" x2="${offsetX + totalLength * scale + 10}" y2="${centerY}" stroke="${CONFIG.centerlineColor}" stroke-width="0.8" stroke-dasharray="10,3,3,3"/>`;
    
    // Desenhar segmentos
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const halfD = (seg.diameter * scale) / 2;
      const len = seg.length * scale;
      
      // Contorno superior
      svgContent += `<line x1="${currentX}" y1="${centerY - halfD}" x2="${currentX + len}" y2="${centerY - halfD}" stroke="#fff" stroke-width="1.5"/>`;
      // Contorno inferior
      svgContent += `<line x1="${currentX}" y1="${centerY + halfD}" x2="${currentX + len}" y2="${centerY + halfD}" stroke="#fff" stroke-width="1.5"/>`;
      
      // Ombros
      if (i === 0) {
        svgContent += `<line x1="${currentX}" y1="${centerY - halfD}" x2="${currentX}" y2="${centerY + halfD}" stroke="#fff" stroke-width="1.5"/>`;
      }
      
      currentX += len;
      
      if (i < segments.length - 1) {
        const nextHalfD = (segments[i + 1].diameter * scale) / 2;
        if (halfD !== nextHalfD) {
          svgContent += `<line x1="${currentX}" y1="${centerY - halfD}" x2="${currentX}" y2="${centerY - nextHalfD}" stroke="#fff" stroke-width="1.5"/>`;
          svgContent += `<line x1="${currentX}" y1="${centerY + halfD}" x2="${currentX}" y2="${centerY + nextHalfD}" stroke="#fff" stroke-width="1.5"/>`;
        }
      } else {
        svgContent += `<line x1="${currentX}" y1="${centerY - halfD}" x2="${currentX}" y2="${centerY + halfD}" stroke="#fff" stroke-width="1.5"/>`;
      }
    }
    
    svgEl.innerHTML = svgContent;
  }
  
  function confirmShaft() {
    if (!state.shaftModal) return;
    
    const material = document.getElementById('shaftMaterial')?.value || 'Aço 1045';
    const segments = state.shaftModal.segments.filter(s => s.length > 0 && s.diameter > 0);
    
    if (segments.length === 0) {
      alert('Adicione pelo menos um segmento válido.');
      return;
    }
    
    pushHistory();
    
    if (state.shaftModal.existingShaft) {
      // Atualizar eixo existente
      const idx = state.data.objects.findIndex(o => o.id === state.shaftModal.existingShaft.id);
      if (idx !== -1) {
        state.data.objects[idx].segments = segments;
        state.data.objects[idx].material = material;
      }
    } else {
      // Criar novo eixo
      const shaft = createShaft(segments, {
        axisY: 500,
        startX: 200,
        material,
        showCenterline: true,
        showDimensions: true
      });
      state.data.objects.push(shaft);
      state.selectedIds = [shaft.id];
    }
    
    closeShaftModal();
    render();
  }
  
  function closeShaftModal() {
    if (state.shaftModal && state.shaftModal.overlay) {
      state.shaftModal.overlay.remove();
    }
    state.shaftModal = null;
  }
  
  function editShaft(shaftId) {
    const shaft = state.data.objects.find(o => o.id === shaftId && o.type === 'shaft');
    if (shaft) {
      showShaftModal(shaft);
    }
  }
  
  // ==========================================================================
  // FERRAMENTAS
  // ==========================================================================
  
  function setTool(toolName) {
    // Finalizar ferramenta anterior
    if (state.tool === 'polyline' && state.polylinePoints.length > 1) {
      finishPolyline();
    }
    
    state.tool = toolName;
    state.drawStart = null;
    state.previewPoint = null;
    state.polylinePoints = [];
    hideMeasurePreview();
    
    // Atualizar UI
    document.querySelectorAll('.cad-tool-btn, .cad-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    
    // Cursor
    svg.style.cursor = toolName === 'select' ? 'default' : 'crosshair';
    
    render();
  }
  
  function finishPolyline() {
    if (state.polylinePoints.length < 2) return;
    
    pushHistory();
    const obj = {
      id: uid(),
      type: 'polyline',
      layer: state.data.activeLayer,
      points: [...state.polylinePoints],
      strokeWidth: CONFIG.defaultStrokeWidth
    };
    state.data.objects.push(obj);
    state.polylinePoints = [];
    render();
  }
  
  function deleteSelected() {
    if (state.selectedIds.length === 0) return;
    
    pushHistory();
    state.data.objects = state.data.objects.filter(o => !state.selectedIds.includes(o.id));
    state.data.dimensions = state.data.dimensions.filter(d => !state.selectedIds.includes(d.id));
    state.selectedIds = [];
    render();
  }
  
  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  
  function onMouseDown(evt) {
    if (evt.button === 1 || evt.button === 2 || evt.shiftKey) {
      // Pan
      state.view.panning = true;
      state.view.panOrigin = {
        x: evt.clientX,
        y: evt.clientY,
        panX: state.view.panX,
        panY: state.view.panY
      };
      svg.style.cursor = 'grabbing';
      return;
    }
    
    const point = getProcessedPoint(evt);
    state.worldPointer = point;
    
    // Seleção
    if (state.tool === 'select') {
      const hit = hitTest(point);
      if (hit) {
        if (evt.ctrlKey) {
          // Toggle selection
          const idx = state.selectedIds.indexOf(hit.id);
          if (idx >= 0) {
            state.selectedIds.splice(idx, 1);
          } else {
            state.selectedIds.push(hit.id);
          }
        } else {
          state.selectedIds = [hit.id];
        }
      } else {
        state.selectedIds = [];
      }
      render();
      return;
    }
    
    // Apagar
    if (state.tool === 'erase') {
      const hit = hitTest(point);
      if (hit) {
        pushHistory();
        state.data.objects = state.data.objects.filter(o => o.id !== hit.id);
        state.data.dimensions = state.data.dimensions.filter(d => d.id !== hit.id);
        render();
      }
      return;
    }
    
    // Eixo
    if (state.tool === 'shaft') {
      showShaftModal();
      return;
    }
    
    // Texto
    if (state.tool === 'text') {
      const text = prompt('Digite o texto:', 'Texto técnico');
      if (text) {
        pushHistory();
        const obj = createObject('text', point, point, { text });
        state.data.objects.push(obj);
        render();
      }
      return;
    }
    
    // Desenho com dois pontos
    if (['line', 'centerline', 'rect', 'circle', 'arc', 'dim_linear', 'dim_diameter'].includes(state.tool)) {
      if (!state.drawStart) {
        state.drawStart = point;
        state.previewPoint = point;
      } else {
        pushHistory();
        
        if (state.tool === 'dim_linear' || state.tool === 'dim_diameter') {
          const dim = createDimension(
            state.tool === 'dim_diameter' ? 'diameter' : 'linear',
            state.drawStart,
            point
          );
          state.data.dimensions.push(dim);
        } else {
          const obj = createObject(state.tool, state.drawStart, point);
          if (obj) {
            state.data.objects.push(obj);
            state.selectedIds = [obj.id];
          }
        }
        
        state.drawStart = null;
        state.previewPoint = null;
        hideMeasurePreview();
        render();
      }
      return;
    }
    
    // Polilinha
    if (state.tool === 'polyline') {
      if (state.polylinePoints.length === 0) {
        state.polylinePoints.push(point);
      } else {
        state.polylinePoints.push(point);
      }
      render();
      return;
    }
  }
  
  function onMouseMove(evt) {
    // Pan
    if (state.view.panning && state.view.panOrigin) {
      state.view.panX = state.view.panOrigin.panX + (evt.clientX - state.view.panOrigin.x);
      state.view.panY = state.view.panOrigin.panY + (evt.clientY - state.view.panOrigin.y);
      render();
      return;
    }
    
    const point = getProcessedPoint(evt);
    state.worldPointer = point;
    state.pointer = { x: evt.clientX, y: evt.clientY };
    
    if (state.drawStart) {
      state.previewPoint = point;
    }
    
    if (state.tool === 'polyline' && state.polylinePoints.length > 0) {
      state.previewPoint = point;
    }
    
    renderPreview();
    renderStatus();
  }
  
  function onMouseUp(evt) {
    if (state.view.panning) {
      state.view.panning = false;
      state.view.panOrigin = null;
      svg.style.cursor = state.tool === 'select' ? 'default' : 'crosshair';
    }
  }
  
  function onWheel(evt) {
    evt.preventDefault();
    
    const rect = svg.getBoundingClientRect();
    const mouseX = evt.clientX - rect.left;
    const mouseY = evt.clientY - rect.top;
    
    const factor = evt.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = clamp(state.view.zoom * factor, CONFIG.zoomMin, CONFIG.zoomMax);
    
    // Zoom centrado no mouse
    const zoomRatio = newZoom / state.view.zoom;
    state.view.panX = mouseX - (mouseX - state.view.panX) * zoomRatio;
    state.view.panY = mouseY - (mouseY - state.view.panY) * zoomRatio;
    state.view.zoom = newZoom;
    
    render();
  }
  
  function onKeyDown(evt) {
    // Escape - cancelar operação atual
    if (evt.key === 'Escape') {
      if (state.tool === 'polyline' && state.polylinePoints.length > 1) {
        finishPolyline();
      }
      state.drawStart = null;
      state.previewPoint = null;
      state.polylinePoints = [];
      hideMeasurePreview();
      render();
      return;
    }
    
    // Enter - finalizar polilinha
    if (evt.key === 'Enter' && state.tool === 'polyline') {
      finishPolyline();
      render();
      return;
    }
    
    // Delete - apagar selecionados
    if (evt.key === 'Delete') {
      deleteSelected();
      return;
    }
    
    // Ctrl+Z - Undo
    if (evt.ctrlKey && evt.key === 'z') {
      evt.preventDefault();
      undo();
      return;
    }
    
    // Ctrl+Y - Redo
    if (evt.ctrlKey && evt.key === 'y') {
      evt.preventDefault();
      redo();
      return;
    }
    
    // Atalhos de ferramentas
    const shortcuts = {
      'v': 'select',
      'l': 'line',
      'r': 'rect',
      'c': 'circle',
      't': 'text',
      'p': 'polyline',
      'e': 'erase',
      'd': 'dim_linear',
      'x': 'shaft'
    };
    
    if (!evt.ctrlKey && !evt.altKey && shortcuts[evt.key]) {
      setTool(shortcuts[evt.key]);
    }
    
    // F8 - Ortho toggle
    if (evt.key === 'F8') {
      evt.preventDefault();
      state.ortho = !state.ortho;
      if (state.ortho) state.polar = false;
      render();
    }
    
    // F9 - Snap toggle
    if (evt.key === 'F9') {
      evt.preventDefault();
      state.snap.enabled = !state.snap.enabled;
      render();
    }
    
    // F7 - Grid toggle
    if (evt.key === 'F7') {
      evt.preventDefault();
      state.grid.visible = !state.grid.visible;
      render();
    }
  }
  
  function onContextMenu(evt) {
    evt.preventDefault();
    // Pode implementar menu de contexto aqui
  }
  
  // ==========================================================================
  // SALVAR E CARREGAR
  // ==========================================================================
  
  async function save() {
    const payload = {
      ...state.data,
      activeTool: state.tool
    };
    
    try {
      const res = await fetch(`/desenho-tecnico/cad/${INITIAL.desenhoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const json = await res.json();
      if (json.ok) {
        alert('Desenho CAD salvo com sucesso!');
      } else {
        alert('Erro ao salvar: ' + (json.error || 'Erro desconhecido'));
      }
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    }
  }
  
  async function saveMetadata() {
    const payload = {
      codigo: document.getElementById('cadMetaCodigo')?.value,
      titulo: document.getElementById('cadMetaTitulo')?.value,
      material: document.getElementById('cadMetaMaterial')?.value,
      equipamento_id: document.getElementById('cadMetaEquipamento')?.value,
      observacoes: document.getElementById('cadMetaObservacoes')?.value
    };
    
    try {
      const res = await fetch(`/desenho-tecnico/cad/${INITIAL.desenhoId}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const json = await res.json();
      if (json.ok) {
        alert('Metadados salvos com sucesso!');
      } else {
        alert('Erro ao salvar metadados: ' + (json.error || 'Erro desconhecido'));
      }
    } catch (err) {
      alert('Erro ao salvar metadados: ' + err.message);
    }
  }
  
  // ==========================================================================
  // ZOOM EXTENTS
  // ==========================================================================
  
  function zoomExtents() {
    if (state.data.objects.length === 0) {
      state.view.zoom = 1;
      state.view.panX = 0;
      state.view.panY = 0;
      render();
      return;
    }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const obj of state.data.objects) {
      const bounds = getObjectBounds(obj);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
    
    const padding = 50;
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;
    
    const rect = svg.getBoundingClientRect();
    const zoomX = rect.width / contentWidth;
    const zoomY = rect.height / contentHeight;
    
    state.view.zoom = Math.min(zoomX, zoomY, 2);
    state.view.panX = (rect.width - contentWidth * state.view.zoom) / 2 - (minX - padding) * state.view.zoom;
    state.view.panY = (rect.height - contentHeight * state.view.zoom) / 2 - (minY - padding) * state.view.zoom;
    
    render();
  }
  
  function getObjectBounds(obj) {
    let minX, minY, maxX, maxY;
    
    switch (obj.type) {
      case 'line':
      case 'centerline':
        minX = Math.min(obj.x, obj.x2);
        maxX = Math.max(obj.x, obj.x2);
        minY = Math.min(obj.y, obj.y2);
        maxY = Math.max(obj.y, obj.y2);
        break;
      case 'rect':
        minX = obj.x;
        maxX = obj.x + obj.width;
        minY = obj.y;
        maxY = obj.y + obj.height;
        break;
      case 'circle':
        minX = obj.x - obj.radius;
        maxX = obj.x + obj.radius;
        minY = obj.y - obj.radius;
        maxY = obj.y + obj.radius;
        break;
      case 'shaft':
        return getShaftBounds(obj);
      default:
        minX = obj.x || 0;
        maxX = obj.x || 0;
        minY = obj.y || 0;
        maxY = obj.y || 0;
    }
    
    return { minX, minY, maxX, maxY };
  }
  
  // ==========================================================================
  // INICIALIZAÇÃO
  // ==========================================================================
  
  function init() {
    if (!initDOM()) return;
    
    // Event listeners
    svg.addEventListener('mousedown', onMouseDown);
    svg.addEventListener('mousemove', onMouseMove);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    
    // Tool buttons
    document.querySelectorAll('.cad-tool-btn, .cad-btn[data-tool]').forEach(btn => {
      if (btn.dataset.tool) {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
      }
    });
    
    // Toolbar buttons
    document.getElementById('cadSaveBtn')?.addEventListener('click', save);
    document.getElementById('cadMetaSaveBtn')?.addEventListener('click', saveMetadata);
    document.getElementById('cadUndoBtn')?.addEventListener('click', undo);
    document.getElementById('cadRedoBtn')?.addEventListener('click', redo);
    document.getElementById('cadZoomExtentsBtn')?.addEventListener('click', zoomExtents);
    document.getElementById('cadDeleteBtn')?.addEventListener('click', deleteSelected);
    
    // Grid/Snap toggles
    document.getElementById('cadGridToggle')?.addEventListener('click', () => {
      state.grid.visible = !state.grid.visible;
      render();
    });
    document.getElementById('cadSnapToggle')?.addEventListener('click', () => {
      state.snap.enabled = !state.snap.enabled;
      render();
    });
    document.getElementById('cadOrthoToggle')?.addEventListener('click', () => {
      state.ortho = !state.ortho;
      if (state.ortho) state.polar = false;
      render();
    });
    
    // Set initial tool
    setTool(state.data.activeTool || 'select');
    
    // Initial render
    render();
    
    console.log('[CAD] Engine V2 inicializado');
  }
  
  // Expor API global
  window.CAD = {
    state,
    setTool,
    save,
    undo,
    redo,
    zoomExtents,
    deleteSelected,
    showShaftModal,
    editShaft,
    render
  };
  
  // Inicializar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
