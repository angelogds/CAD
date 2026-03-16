(function () {
  const initial = window.CAD_INITIAL || {};
  const svg = document.getElementById('cadCanvas');
  if (!svg) return;

  const NS = 'http://www.w3.org/2000/svg';
  const statusBar = document.getElementById('cadStatusBar');
  const layerSelect = document.getElementById('cadLayerSelect');
  const layersBox = document.getElementById('cadLayers');
  const propsBox = document.getElementById('cadProperties');

  const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  const dist = (a, b) => Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
  const angle = (a, b) => (Math.atan2((b.y || 0) - (a.y || 0), (b.x || 0) - (a.x || 0)) * 180) / Math.PI;
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const state = {
    tool: (initial.data && initial.data.activeTool) || 'select',
    selectedId: null,
    drawStart: null,
    previewPoint: null,
    pointer: { x: 0, y: 0 },
    history: [],
    future: [],
    view: { zoom: 1, panX: 0, panY: 0, panning: false, panOrigin: null },
    data: {
      gridStep: 20,
      showGrid: true,
      snapEnabled: true,
      snapEndpoint: true,
      snapMidpoint: true,
      snapCenter: true,
      orthoEnabled: false,
      activeLayer: 'geometria_principal',
      layers: {},
      objects: [],
      dimensions: [],
      ...(initial.data || {}),
    },
  };

  if (!Object.keys(state.data.layers || {}).length) {
    state.data.layers = {
      geometria_principal: { color: '#e2e8f0', visible: true, locked: false },
      linhas_de_centro: { color: '#38bdf8', visible: true, locked: false },
      cotas: { color: '#4ade80', visible: true, locked: false },
      textos: { color: '#a78bfa', visible: true, locked: false },
      furos: { color: '#f87171', visible: true, locked: false },
      construcao: { color: '#64748b', visible: true, locked: false },
      observacoes: { color: '#f59e0b', visible: true, locked: false },
    };
  }

  const root = document.createElementNS(NS, 'g');
  const layerGrid = document.createElementNS(NS, 'g');
  const layerEntities = document.createElementNS(NS, 'g');
  const layerPreview = document.createElementNS(NS, 'g');
  const layerDims = document.createElementNS(NS, 'g');
  const layerSelection = document.createElementNS(NS, 'g');
  root.append(layerGrid, layerEntities, layerPreview, layerDims, layerSelection);
  svg.innerHTML = '';
  svg.appendChild(root);

  function setTool(tool) {
    state.tool = tool;
    state.drawStart = null;
    state.previewPoint = null;
    document.querySelectorAll('.cad-tool').forEach((btn) => btn.classList.toggle('btn-green', btn.dataset.tool === tool));
    render();
  }

  function pushHistory() {
    state.history.push(JSON.stringify(state.data));
    if (state.history.length > 100) state.history.shift();
    state.future = [];
  }

  function getPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const inv = svg.getScreenCTM().inverse();
    const local = pt.matrixTransform(inv);
    let x = (local.x - state.view.panX) / state.view.zoom;
    let y = (local.y - state.view.panY) / state.view.zoom;

    if (state.data.snapEnabled) {
      const step = Number(state.data.gridStep || 20);
      x = Math.round(x / step) * step;
      y = Math.round(y / step) * step;
    }

    const snapped = snapPoint({ x, y });
    x = snapped.x;
    y = snapped.y;

    if (state.data.orthoEnabled && state.drawStart && ['line', 'centerline', 'dim_linear'].includes(state.tool)) {
      const dx = Math.abs(x - state.drawStart.x);
      const dy = Math.abs(y - state.drawStart.y);
      if (dx >= dy) y = state.drawStart.y;
      else x = state.drawStart.x;
    }

    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  }

  function snapPoint(raw) {
    if (!state.data.snapEnabled) return raw;
    const candidates = [];
    for (const obj of state.data.objects) {
      if (state.data.snapEndpoint && obj.x != null && obj.y != null) candidates.push({ x: obj.x, y: obj.y });
      if (state.data.snapEndpoint && obj.x2 != null && obj.y2 != null) candidates.push({ x: obj.x2, y: obj.y2 });
      if (state.data.snapMidpoint && obj.x2 != null && obj.y2 != null) candidates.push(midpoint({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 }));
      if (state.data.snapCenter && obj.type === 'circle') candidates.push({ x: obj.x, y: obj.y });
    }
    let best = raw;
    let bestD = 12;
    for (const c of candidates) {
      const d = dist(raw, c);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  function hitTest(point) {
    for (let i = state.data.objects.length - 1; i >= 0; i -= 1) {
      const obj = state.data.objects[i];
      if (obj.type === 'line' || obj.type === 'centerline') {
        if (point.x >= Math.min(obj.x, obj.x2) - 6 && point.x <= Math.max(obj.x, obj.x2) + 6 && point.y >= Math.min(obj.y, obj.y2) - 6 && point.y <= Math.max(obj.y, obj.y2) + 6) return obj;
      }
      if (obj.type === 'rect' && point.x >= obj.x && point.x <= obj.x + obj.width && point.y >= obj.y && point.y <= obj.y + obj.height) return obj;
      if (obj.type === 'circle' && dist(point, { x: obj.x, y: obj.y }) <= obj.radius + 8) return obj;
      if (obj.type === 'text' && Math.abs(point.x - obj.x) <= 40 && Math.abs(point.y - obj.y) <= 16) return obj;
    }
    return null;
  }

  function createByDrag(start, end) {
    const base = { id: uid(), layer: state.data.activeLayer };
    if (state.tool === 'line' || state.tool === 'centerline') return { ...base, type: state.tool, x: start.x, y: start.y, x2: end.x, y2: end.y };
    if (state.tool === 'rect') return { ...base, type: 'rect', x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y), rotation: 0 };
    if (state.tool === 'circle') return { ...base, type: 'circle', x: start.x, y: start.y, radius: Number(dist(start, end).toFixed(2)) };
    if (state.tool === 'arc') return { ...base, type: 'arc', x: start.x, y: start.y, x2: end.x, y2: end.y, angle: Number(angle(start, end).toFixed(2)) };
    if (state.tool === 'dim_linear') return null;
    if (state.tool === 'text') return { ...base, type: 'text', x: end.x, y: end.y, text: 'Texto técnico', size: 14 };
    return null;
  }

  function renderGrid() {
    layerGrid.innerHTML = '';
    if (!state.data.showGrid) return;
    const step = Number(state.data.gridStep || 20);
    for (let x = 0; x <= 2200; x += step) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', x); line.setAttribute('y1', 0); line.setAttribute('x2', x); line.setAttribute('y2', 1400);
      line.setAttribute('stroke', x % (step * 5) === 0 ? '#23314f' : '#18233d');
      line.setAttribute('stroke-width', '1');
      layerGrid.appendChild(line);
    }
    for (let y = 0; y <= 1400; y += step) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', 0); line.setAttribute('y1', y); line.setAttribute('x2', 2200); line.setAttribute('y2', y);
      line.setAttribute('stroke', y % (step * 5) === 0 ? '#23314f' : '#18233d');
      line.setAttribute('stroke-width', '1');
      layerGrid.appendChild(line);
    }
  }

  function drawObject(group, obj, isPreview) {
    const color = (state.data.layers[obj.layer] && state.data.layers[obj.layer].color) || '#e2e8f0';
    const stroke = isPreview ? '#facc15' : color;
    if (obj.type === 'line' || obj.type === 'centerline' || obj.type === 'arc') {
      const el = document.createElementNS(NS, 'line');
      el.setAttribute('x1', obj.x); el.setAttribute('y1', obj.y); el.setAttribute('x2', obj.x2); el.setAttribute('y2', obj.y2);
      el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', obj.type === 'centerline' ? 1 : 2);
      if (obj.type === 'centerline') el.setAttribute('stroke-dasharray', '10,6');
      group.appendChild(el);
      return;
    }
    if (obj.type === 'rect') {
      const el = document.createElementNS(NS, 'rect');
      el.setAttribute('x', obj.x); el.setAttribute('y', obj.y); el.setAttribute('width', obj.width); el.setAttribute('height', obj.height);
      el.setAttribute('fill', 'transparent'); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', '2');
      group.appendChild(el); return;
    }
    if (obj.type === 'circle') {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', obj.x); el.setAttribute('cy', obj.y); el.setAttribute('r', obj.radius);
      el.setAttribute('fill', 'transparent'); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', '2');
      group.appendChild(el); return;
    }
    if (obj.type === 'text') {
      const el = document.createElementNS(NS, 'text');
      el.setAttribute('x', obj.x); el.setAttribute('y', obj.y); el.setAttribute('fill', stroke); el.setAttribute('font-size', obj.size || 14);
      el.textContent = obj.text || 'Texto';
      group.appendChild(el);
    }
  }

  function renderDimensions() {
    layerDims.innerHTML = '';
    for (const d of state.data.dimensions || []) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', d.x1); line.setAttribute('y1', d.y1); line.setAttribute('x2', d.x2); line.setAttribute('y2', d.y2);
      line.setAttribute('stroke', '#4ade80'); line.setAttribute('stroke-width', '1.5');
      layerDims.appendChild(line);
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', (d.x1 + d.x2) / 2 + 6); text.setAttribute('y', (d.y1 + d.y2) / 2 - 6);
      text.setAttribute('fill', '#86efac'); text.setAttribute('font-size', '12');
      text.textContent = d.value;
      layerDims.appendChild(text);
    }
  }

  function renderEntities() {
    layerEntities.innerHTML = '';
    for (const obj of state.data.objects) {
      if (state.data.layers[obj.layer] && state.data.layers[obj.layer].visible === false) continue;
      drawObject(layerEntities, obj, false);
    }
  }

  function renderPreview() {
    layerPreview.innerHTML = '';
    if (!state.drawStart || !state.previewPoint) return;
    const obj = createByDrag(state.drawStart, state.previewPoint);
    if (obj) drawObject(layerPreview, obj, true);
  }

  function renderSelection() {
    layerSelection.innerHTML = '';
    const sel = state.data.objects.find((o) => o.id === state.selectedId);
    if (!sel) return;
    if (sel.type === 'line' || sel.type === 'centerline') {
      const mark = document.createElementNS(NS, 'line');
      mark.setAttribute('x1', sel.x); mark.setAttribute('y1', sel.y); mark.setAttribute('x2', sel.x2); mark.setAttribute('y2', sel.y2);
      mark.setAttribute('stroke', '#facc15'); mark.setAttribute('stroke-width', '5'); mark.setAttribute('opacity', '0.25');
      layerSelection.appendChild(mark);
    }
  }

  function renderLayersPanel() {
    const names = Object.keys(state.data.layers || {});
    layerSelect.innerHTML = names.map((name) => `<option value="${name}" ${state.data.activeLayer === name ? 'selected' : ''}>${name}</option>`).join('');
    layersBox.innerHTML = names.map((name) => {
      const cfg = state.data.layers[name];
      return `<div class="cad-layer-row"><span>${name}</span><label><input type="checkbox" data-layer-visible="${name}" ${cfg.visible !== false ? 'checked' : ''}>visível</label><label><input type="checkbox" data-layer-locked="${name}" ${cfg.locked ? 'checked' : ''}>lock</label></div>`;
    }).join('');
  }

  function renderProps() {
    const o = state.data.objects.find((item) => item.id === state.selectedId);
    if (!o) { propsBox.innerHTML = 'Selecione um objeto para editar propriedades.'; return; }
    const len = (o.x2 != null && o.y2 != null) ? dist({ x: o.x, y: o.y }, { x: o.x2, y: o.y2 }).toFixed(2) : '';
    const ang = (o.x2 != null && o.y2 != null) ? angle({ x: o.x, y: o.y }, { x: o.x2, y: o.y2 }).toFixed(2) : '';
    propsBox.innerHTML = `<div class="cad-prop-grid">
      <div><b>tipo:</b> ${o.type}</div>
      ${o.x != null ? `<label>x1 <input class="input" data-prop="x" value="${o.x}"></label>` : ''}
      ${o.y != null ? `<label>y1 <input class="input" data-prop="y" value="${o.y}"></label>` : ''}
      ${o.x2 != null ? `<label>x2 <input class="input" data-prop="x2" value="${o.x2}"></label>` : ''}
      ${o.y2 != null ? `<label>y2 <input class="input" data-prop="y2" value="${o.y2}"></label>` : ''}
      ${o.x2 != null ? `<label>comprimento <input class="input" data-prop="length" value="${len}"></label>` : ''}
      ${o.x2 != null ? `<label>ângulo <input class="input" data-prop="angle" value="${ang}"></label>` : ''}
      ${o.width != null ? `<label>largura <input class="input" data-prop="width" value="${o.width}"></label>` : ''}
      ${o.height != null ? `<label>altura <input class="input" data-prop="height" value="${o.height}"></label>` : ''}
      ${o.radius != null ? `<label>raio <input class="input" data-prop="radius" value="${o.radius}"></label>` : ''}
      ${o.text != null ? `<label>conteúdo <input class="input" data-prop="text" value="${o.text}"></label>` : ''}
      <label>camada <input class="input" data-prop="layer" value="${o.layer || ''}"></label>
    </div>`;
  }

  function renderStatus() {
    const p = state.pointer;
    const previewLength = (state.drawStart && state.previewPoint) ? dist(state.drawStart, state.previewPoint).toFixed(2) : '0';
    const previewAngle = (state.drawStart && state.previewPoint) ? angle(state.drawStart, state.previewPoint).toFixed(2) : '0';
    statusBar.textContent = `Cursor: X ${p.x} / Y ${p.y} • Ferramenta: ${state.tool} • Comprimento: ${previewLength} • Ângulo: ${previewAngle}° • Grid: ${state.data.showGrid ? 'ON' : 'OFF'} • Snap: ${state.data.snapEnabled ? 'ON' : 'OFF'} • Ortho: ${state.data.orthoEnabled ? 'ON' : 'OFF'}`;
  }

  function render() {
    root.setAttribute('transform', `translate(${state.view.panX} ${state.view.panY}) scale(${state.view.zoom})`);
    renderGrid();
    renderEntities();
    renderPreview();
    renderDimensions();
    renderSelection();
    renderLayersPanel();
    renderProps();
    renderStatus();
  }

  svg.addEventListener('mousedown', (evt) => {
    if (evt.button === 1 || evt.button === 2 || evt.shiftKey) {
      state.view.panning = true;
      state.view.panOrigin = { x: evt.clientX, y: evt.clientY, panX: state.view.panX, panY: state.view.panY };
      return;
    }

    const p = getPoint(evt);
    state.pointer = p;

    if (state.tool === 'select') {
      const hit = hitTest(p);
      state.selectedId = hit ? hit.id : null;
      render();
      return;
    }

    if (state.tool === 'erase') {
      const hit = hitTest(p);
      if (hit) {
        pushHistory();
        state.data.objects = state.data.objects.filter((o) => o.id !== hit.id);
        state.selectedId = null;
      }
      render();
      return;
    }

    if (!state.drawStart) {
      state.drawStart = p;
      state.previewPoint = p;
    } else {
      pushHistory();
      if (state.tool === 'dim_linear') {
        state.data.dimensions.push({ id: uid(), type: 'linear', x1: state.drawStart.x, y1: state.drawStart.y, x2: p.x, y2: p.y, value: `${dist(state.drawStart, p).toFixed(2)} mm` });
      } else {
        const obj = createByDrag(state.drawStart, p);
        if (obj) {
          state.data.objects.push(obj);
          state.selectedId = obj.id;
        }
      }
      state.drawStart = null;
      state.previewPoint = null;
    }
    render();
  });

  svg.addEventListener('mousemove', (evt) => {
    if (state.view.panning && state.view.panOrigin) {
      state.view.panX = state.view.panOrigin.panX + (evt.clientX - state.view.panOrigin.x);
      state.view.panY = state.view.panOrigin.panY + (evt.clientY - state.view.panOrigin.y);
      render();
      return;
    }

    state.pointer = getPoint(evt);
    if (state.drawStart) state.previewPoint = state.pointer;
    renderStatus();
    renderPreview();
  });

  window.addEventListener('mouseup', () => {
    state.view.panning = false;
    state.view.panOrigin = null;
  });

  svg.addEventListener('wheel', (evt) => {
    evt.preventDefault();
    const factor = evt.deltaY < 0 ? 1.1 : 0.9;
    state.view.zoom = Math.max(0.4, Math.min(4, state.view.zoom * factor));
    render();
  }, { passive: false });

  document.querySelectorAll('.cad-tool').forEach((btn) => btn.addEventListener('click', () => setTool(btn.dataset.tool)));
  layerSelect.addEventListener('change', () => { state.data.activeLayer = layerSelect.value; });
  layersBox.addEventListener('change', (evt) => {
    const vis = evt.target.getAttribute('data-layer-visible');
    const lock = evt.target.getAttribute('data-layer-locked');
    if (vis) state.data.layers[vis].visible = evt.target.checked;
    if (lock) state.data.layers[lock].locked = evt.target.checked;
    render();
  });

  propsBox.addEventListener('change', (evt) => {
    const prop = evt.target.getAttribute('data-prop');
    if (!prop) return;
    const obj = state.data.objects.find((o) => o.id === state.selectedId);
    if (!obj) return;
    pushHistory();
    const raw = evt.target.value;
    const num = Number(raw);

    if (prop === 'length' && obj.x2 != null) {
      const current = dist({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 });
      const target = Number(raw);
      if (Number.isFinite(target) && target > 0 && current > 0) {
        const ratio = target / current;
        obj.x2 = Number((obj.x + (obj.x2 - obj.x) * ratio).toFixed(2));
        obj.y2 = Number((obj.y + (obj.y2 - obj.y) * ratio).toFixed(2));
      }
    } else if (prop === 'angle' && obj.x2 != null && Number.isFinite(num)) {
      const current = dist({ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 });
      const rad = (num * Math.PI) / 180;
      obj.x2 = Number((obj.x + Math.cos(rad) * current).toFixed(2));
      obj.y2 = Number((obj.y + Math.sin(rad) * current).toFixed(2));
    } else {
      obj[prop] = Number.isFinite(num) && !['text', 'layer'].includes(prop) ? num : raw;
    }
    render();
  });

  document.getElementById('cadUndoBtn')?.addEventListener('click', () => {
    if (!state.history.length) return;
    state.future.push(JSON.stringify(state.data));
    state.data = JSON.parse(state.history.pop());
    render();
  });

  document.getElementById('cadRedoBtn')?.addEventListener('click', () => {
    if (!state.future.length) return;
    state.history.push(JSON.stringify(state.data));
    state.data = JSON.parse(state.future.pop());
    render();
  });

  document.getElementById('cadGridToggle')?.addEventListener('click', (evt) => {
    state.data.showGrid = !state.data.showGrid;
    evt.target.textContent = `Grade ${state.data.showGrid ? 'ON' : 'OFF'}`;
    render();
  });
  document.getElementById('cadSnapToggle')?.addEventListener('click', (evt) => {
    state.data.snapEnabled = !state.data.snapEnabled;
    evt.target.textContent = `Snap ${state.data.snapEnabled ? 'ON' : 'OFF'}`;
    render();
  });
  document.getElementById('cadOrthoToggle')?.addEventListener('click', (evt) => {
    state.data.orthoEnabled = !state.data.orthoEnabled;
    evt.target.textContent = `Ortho ${state.data.orthoEnabled ? 'ON' : 'OFF'}`;
    render();
  });

  document.getElementById('cadSaveBtn')?.addEventListener('click', async () => {
    const payload = { ...state.data, activeTool: state.tool };
    const res = await fetch(`/desenho-tecnico/cad/${initial.desenhoId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const json = await res.json();
    alert(json.ok ? 'CAD salvo com sucesso.' : `Erro ao salvar: ${json.error}`);
  });

  document.getElementById('cadMetaSaveBtn')?.addEventListener('click', async () => {
    const payload = {
      codigo: document.getElementById('cadMetaCodigo')?.value,
      titulo: document.getElementById('cadMetaTitulo')?.value,
      material: document.getElementById('cadMetaMaterial')?.value,
      equipamento_id: document.getElementById('cadMetaEquipamento')?.value,
      observacoes: document.getElementById('cadMetaObservacoes')?.value,
    };
    const res = await fetch(`/desenho-tecnico/cad/${initial.desenhoId}/metadata`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const json = await res.json();
    alert(json.ok ? 'Metadados salvos.' : `Erro ao salvar metadados: ${json.error}`);
  });

  setTool(state.tool);
  render();
})();
