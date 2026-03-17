import { Bounds2D } from './core/geometry.js';

const NS = 'http://www.w3.org/2000/svg';

const SNAP_SHORT_LABELS = {
  endpoint: 'END',
  midpoint: 'MID',
  'arc-midpoint': 'MID',
  intersection: 'INT',
  center: 'CTR',
  nearest: 'NEAR',
  grid: 'GRID',
};

function formatMm(value, decimals = 2) {
  return `${Number(value || 0).toFixed(decimals)} mm`;
}

function drawMeasureLabel(g, x, y, text) {
  const safe = String(text || '').replace(/</g, '&lt;');
  g.insertAdjacentHTML('beforeend', `<text x='${x.toFixed(2)}' y='${y.toFixed(2)}' class='cad-entity-measure'>${safe}</text>`);
}

function arcPath(viewport, geometry = {}) {
  const { cx = 0, cy = 0, radius = 0, startAngle = 0, endAngle = 0, ccw = true } = geometry;
  const p1w = { x: cx + Math.cos(startAngle) * radius, y: cy + Math.sin(startAngle) * radius };
  const p2w = { x: cx + Math.cos(endAngle) * radius, y: cy + Math.sin(endAngle) * radius };
  const p1 = viewport.worldToScreen(p1w.x, p1w.y);
  const p2 = viewport.worldToScreen(p2w.x, p2w.y);
  let delta = endAngle - startAngle;
  while (delta < 0) delta += Math.PI * 2;
  while (delta > Math.PI * 2) delta -= Math.PI * 2;
  const sweep = ccw ? 1 : 0;
  const large = delta > Math.PI ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${Math.abs(radius * viewport.getViewState().zoom)} ${Math.abs(radius * viewport.getViewState().zoom)} 0 ${large} ${sweep} ${p2.x} ${p2.y}`;
}

export class DesenhoTecnicoRenderer {
  constructor(svg, state, viewport, selection) {
    this.svg = svg;
    this.state = state;
    this.viewport = viewport;
    this.selection = selection;
    this.layers = {};
    ['grid', 'entities', 'preview', 'overlay'].forEach((name) => {
      const g = document.createElementNS(NS, 'g');
      this.layers[name] = g;
      this.svg.appendChild(g);
    });
  }

  render() {
    this.renderGrid();
    this.renderEntities();
    this.renderPreview();
    this.renderGrips();
  }


  getLayerCfg(entity) {
    const layerName = entity?.metadata?.layer || this.state.activeLayer;
    return { name: layerName, ...(this.state.layers?.[layerName] || {}) };
  }

  renderGrid() {
    const g = this.layers.grid;
    g.innerHTML = '';
    if (!this.state.gridConfig.visible) return;

    const v = this.viewport.getViewState();
    const baseStep = Math.max(1, this.state.gridConfig.step || 20);
    const targetPx = 36;
    const zoom = Math.max(0.0001, v.zoom);
    const scaled = baseStep * zoom;
    const power = Math.pow(2, Math.round(Math.log2(targetPx / Math.max(1, scaled))));
    const minorStep = Math.max(baseStep / 16, baseStep * power);
    const majorEvery = 5;
    const majorStep = minorStep * majorEvery;

    const min = this.viewport.screenToWorld(0, 0);
    const max = this.viewport.screenToWorld(v.width, v.height);
    const startX = Math.floor(min.x / minorStep) * minorStep;
    const endX = Math.ceil(max.x / minorStep) * minorStep;
    const startY = Math.floor(min.y / minorStep) * minorStep;
    const endY = Math.ceil(max.y / minorStep) * minorStep;

    for (let x = startX; x <= endX + minorStep * 0.5; x += minorStep) {
      const p1 = this.viewport.worldToScreen(x, startY);
      const p2 = this.viewport.worldToScreen(x, endY);
      const isMajor = Math.abs(Math.round(x / majorStep) - x / majorStep) < 1e-6;
      g.insertAdjacentHTML('beforeend', `<line x1='${p1.x.toFixed(2)}' y1='${p1.y.toFixed(2)}' x2='${p2.x.toFixed(2)}' y2='${p2.y.toFixed(2)}' stroke='${isMajor ? '#c5ced8' : '#e7edf3'}' stroke-width='1'/>`);
    }

    for (let y = startY; y <= endY + minorStep * 0.5; y += minorStep) {
      const p1 = this.viewport.worldToScreen(startX, y);
      const p2 = this.viewport.worldToScreen(endX, y);
      const isMajor = Math.abs(Math.round(y / majorStep) - y / majorStep) < 1e-6;
      g.insertAdjacentHTML('beforeend', `<line x1='${p1.x.toFixed(2)}' y1='${p1.y.toFixed(2)}' x2='${p2.x.toFixed(2)}' y2='${p2.y.toFixed(2)}' stroke='${isMajor ? '#c5ced8' : '#e7edf3'}' stroke-width='1'/>`);
    }
  }

  renderShaft(g, e, stroke) {
    const { origin = { x: 0, y: 0 }, orientation = 'horizontal', segments = [] } = e.geometry;
    let x = origin.x;
    let y = origin.y;
    segments.forEach((s, idx) => {
      const len = Number(s.length || 0);
      const r = Number(s.diameter || 0) / 2;
      const sp = this.viewport.worldToScreen(x - (orientation === 'vertical' ? r : 0), y - (orientation === 'horizontal' ? r : 0));
      const width = Math.abs((orientation === 'horizontal' ? len : s.diameter) * this.viewport.getViewState().zoom);
      const height = Math.abs((orientation === 'horizontal' ? s.diameter : len) * this.viewport.getViewState().zoom);
      g.insertAdjacentHTML('beforeend', `<rect x='${sp.x}' y='${sp.y}' width='${width}' height='${height}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      if (orientation === 'horizontal') x += len; else y += len;
      const c1 = this.viewport.worldToScreen(orientation === 'horizontal' ? x - len : x, orientation === 'horizontal' ? origin.y : y - len);
      const c2 = this.viewport.worldToScreen(orientation === 'horizontal' ? x : origin.x, orientation === 'horizontal' ? origin.y : y);
      g.insertAdjacentHTML('beforeend', `<line x1='${c1.x}' y1='${c1.y}' x2='${c2.x}' y2='${c2.y}' stroke='#0f766e' stroke-width='1.2' stroke-dasharray='8 4 2 4'/>`);
      if (idx < segments.length - 1) {
        const step = this.viewport.worldToScreen(x, y);
        g.insertAdjacentHTML('beforeend', `<line x1='${step.x}' y1='${step.y - 8}' x2='${step.x}' y2='${step.y + 8}' stroke='${stroke}' stroke-width='1'/>`);
      }
    });
  }

  renderEntities() {
    const g = this.layers.entities;
    g.innerHTML = '';
    this.state.entities.forEach((e) => {
      if (!e.visible) return;
      const layerCfg = this.getLayerCfg(e);
      if (layerCfg.visible === false) return;
      const selected = this.selection.includes(e.id);
      const hover = this.selection.hoverId === e.id;
      const baseStroke = e.style.stroke || layerCfg.color || '#1f2937';
      const stroke = selected ? '#0ea5e9' : hover ? '#f59e0b' : baseStroke;
      if (e.type === 'line' || e.type === 'centerline') {
        const a = this.viewport.worldToScreen(e.geometry.x1, e.geometry.y1);
        const b = this.viewport.worldToScreen(e.geometry.x2, e.geometry.y2);
        g.insertAdjacentHTML('beforeend', `<line x1='${a.x}' y1='${a.y}' x2='${b.x}' y2='${b.y}' stroke='${stroke}' stroke-width='2' ${e.type === 'centerline' ? "stroke-dasharray='10 4 2 4'" : ''}/>`);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const label = formatMm(Math.hypot((e.geometry.x2 || 0) - (e.geometry.x1 || 0), (e.geometry.y2 || 0) - (e.geometry.y1 || 0)));
        drawMeasureLabel(g, midX + nx * 14, midY + ny * 14, label);
      } else if (e.type === 'rect') {
        const x = e.geometry.width < 0 ? e.geometry.x + e.geometry.width : e.geometry.x;
        const y = e.geometry.height < 0 ? e.geometry.y + e.geometry.height : e.geometry.y;
        const p = this.viewport.worldToScreen(x, y);
        g.insertAdjacentHTML('beforeend', `<rect x='${p.x}' y='${p.y}' width='${Math.abs(e.geometry.width * this.viewport.getViewState().zoom)}' height='${Math.abs(e.geometry.height * this.viewport.getViewState().zoom)}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      } else if (e.type === 'circle') {
        const c = this.viewport.worldToScreen(e.geometry.cx, e.geometry.cy);
        const radiusScreen = Math.abs(e.geometry.radius * this.viewport.getViewState().zoom);
        g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='${radiusScreen}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
        drawMeasureLabel(g, c.x + radiusScreen + 12, c.y - 8, `Ø ${formatMm((e.geometry.radius || 0) * 2)}`);
      } else if (e.type === 'arc') {
        g.insertAdjacentHTML('beforeend', `<path d='${arcPath(this.viewport, e.geometry)}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      } else if (e.type === 'shaft') {
        this.renderShaft(g, e, stroke);
      } else if (e.type === 'polyline') {
        const points = (e.geometry.points || []).map((p) => this.viewport.worldToScreen(p.x, p.y));
        if (points.length > 1) g.insertAdjacentHTML('beforeend', `<polyline points='${points.map((p) => `${p.x},${p.y}`).join(' ')}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      } else if (e.type === 'text') {
        const p = this.viewport.worldToScreen(e.geometry.x, e.geometry.y);
        g.insertAdjacentHTML('beforeend', `<text x='${p.x}' y='${p.y}' fill='${stroke}' font-size='${Math.max(10, e.geometry.size || 14)}' font-family='monospace'>${String(e.geometry.text || '').replace(/</g, '&lt;')}</text>`);
      } else if (e.type === 'dimension') {
        if (e.geometry.mode === 'angular') {
          const v = this.viewport.worldToScreen(e.geometry.vertex.x, e.geometry.vertex.y);
          g.insertAdjacentHTML('beforeend', `<path d='${arcPath(this.viewport, { cx: e.geometry.vertex.x, cy: e.geometry.vertex.y, radius: e.geometry.radius, startAngle: e.geometry.startAngle, endAngle: e.geometry.endAngle, ccw: true })}' fill='none' stroke='#1d4ed8' stroke-width='1.5'/>`);
          const mid = (e.geometry.startAngle + e.geometry.endAngle) / 2;
          const tp = this.viewport.worldToScreen(e.geometry.vertex.x + Math.cos(mid) * (e.geometry.radius + 10), e.geometry.vertex.y + Math.sin(mid) * (e.geometry.radius + 10));
          g.insertAdjacentHTML('beforeend', `<text x='${tp.x}' y='${tp.y}' fill='#1d4ed8' font-size='12' font-family='monospace'>${e.geometry.label || ''}</text>`);
          g.insertAdjacentHTML('beforeend', `<circle cx='${v.x}' cy='${v.y}' r='2' fill='#1d4ed8'/>`);
        } else {
          const p1 = this.viewport.worldToScreen(e.geometry.p1.x, e.geometry.p1.y);
          const p2 = this.viewport.worldToScreen(e.geometry.p2.x, e.geometry.p2.y);
          const tp = this.viewport.worldToScreen(e.geometry.textPoint.x, e.geometry.textPoint.y);
          g.insertAdjacentHTML('beforeend', `<line x1='${p1.x}' y1='${p1.y}' x2='${p2.x}' y2='${p2.y}' stroke='#1d4ed8' stroke-width='1.5'/>`);
          g.insertAdjacentHTML('beforeend', `<text x='${tp.x}' y='${tp.y}' fill='#1d4ed8' font-size='12' font-family='monospace'>${e.geometry.label || ''}</text>`);
        }
      }
    });
  }

  renderPreview() {
    const g = this.layers.preview;
    g.innerHTML = '';
    this.state.preview.forEach((p) => {
      if (p.type === 'line') {
        const a = this.viewport.worldToScreen(p.from.x, p.from.y);
        const b = this.viewport.worldToScreen(p.to.x, p.to.y);
        g.insertAdjacentHTML('beforeend', `<line x1='${a.x}' y1='${a.y}' x2='${b.x}' y2='${b.y}' stroke='#22d3ee' stroke-dasharray='6 4' stroke-width='1.5'/>`);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        drawMeasureLabel(g, midX + 8, midY - 8, formatMm(Math.hypot((p.to.x || 0) - (p.from.x || 0), (p.to.y || 0) - (p.from.y || 0))));
      }
      if (p.type === 'polyline') {
        const points = p.points.map((pp) => this.viewport.worldToScreen(pp.x, pp.y));
        g.insertAdjacentHTML('beforeend', `<polyline points='${points.map((pp) => `${pp.x},${pp.y}`).join(' ')}' fill='none' stroke='#22d3ee' stroke-dasharray='6 4' stroke-width='1.5'/>`);
      }
      if (p.type === 'arc') {
        g.insertAdjacentHTML('beforeend', `<path d='${arcPath(this.viewport, p.geometry)}' fill='none' stroke='#22d3ee' stroke-dasharray='6 4' stroke-width='1.5'/>`);
      }
      if (p.type === 'shaft') {
        this.renderShaft(g, { geometry: p.geometry }, '#22d3ee');
      }
      if (p.type === 'rect') {
        const a = this.viewport.worldToScreen(p.from.x, p.from.y);
        const b = this.viewport.worldToScreen(p.to.x, p.to.y);
        g.insertAdjacentHTML('beforeend', `<rect x='${Math.min(a.x, b.x)}' y='${Math.min(a.y, b.y)}' width='${Math.abs(a.x - b.x)}' height='${Math.abs(a.y - b.y)}' fill='rgba(56,189,248,0.1)' stroke='#22d3ee' stroke-dasharray='6 4'/>`);
      }
      if (p.type === 'circle') {
        const c = this.viewport.worldToScreen(p.center.x, p.center.y);
        const radiusScreen = Math.abs(p.radius * this.viewport.getViewState().zoom);
        g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='${radiusScreen}' fill='none' stroke='#22d3ee' stroke-dasharray='6 4'/>`);
        drawMeasureLabel(g, c.x + radiusScreen + 12, c.y - 8, `R ${formatMm(p.radius || 0)} | Ø ${formatMm((p.radius || 0) * 2)}`);
      }
      if (p.type === 'selection-box') {
        const a = this.viewport.worldToScreen(p.from.x, p.from.y);
        const b = this.viewport.worldToScreen(p.to.x, p.to.y);
        g.insertAdjacentHTML('beforeend', `<rect x='${Math.min(a.x, b.x)}' y='${Math.min(a.y, b.y)}' width='${Math.abs(a.x - b.x)}' height='${Math.abs(a.y - b.y)}' fill='rgba(56,189,248,0.1)' stroke='#38bdf8' stroke-dasharray='4 3'/>`);
      }
      if (p.type === 'snap') {
        const c = this.viewport.worldToScreen(p.point.x, p.point.y);
        const code = SNAP_SHORT_LABELS[p.kind] || String(p.kind || '').toUpperCase();
        g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='5' fill='rgba(16,185,129,0.18)' stroke='#059669' stroke-width='1.5'/>`);
        g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='2.2' fill='#10b981' stroke='#ffffff' stroke-width='0.8'/>`);
        g.insertAdjacentHTML('beforeend', `<line x1='${c.x - 7}' y1='${c.y}' x2='${c.x + 7}' y2='${c.y}' stroke='#059669' stroke-width='1'/>`);
        g.insertAdjacentHTML('beforeend', `<line x1='${c.x}' y1='${c.y - 7}' x2='${c.x}' y2='${c.y + 7}' stroke='#059669' stroke-width='1'/>`);
        g.insertAdjacentHTML('beforeend', `<rect x='${c.x + 10}' y='${c.y - 18}' width='34' height='14' rx='3' fill='rgba(15,23,42,0.86)' stroke='#1f2937' stroke-width='0.8'/>`);
        g.insertAdjacentHTML('beforeend', `<text x='${c.x + 27}' y='${c.y - 8}' text-anchor='middle' fill='#d1fae5' font-size='9' font-weight='700' font-family='Consolas, Monaco, monospace'>${code}</text>`);
      }
      if (p.type === 'ghost-entity' && p.entity) {
        const e = p.entity;
        const stroke = '#22d3ee';
        if (e.type === 'line' || e.type === 'centerline') {
          const a = this.viewport.worldToScreen(e.geometry.x1, e.geometry.y1);
          const b = this.viewport.worldToScreen(e.geometry.x2, e.geometry.y2);
          g.insertAdjacentHTML('beforeend', `<line x1='${a.x}' y1='${a.y}' x2='${b.x}' y2='${b.y}' stroke='${stroke}' stroke-dasharray='6 4' stroke-width='1.5'/>`);
        } else if (e.type === 'circle') {
          const c = this.viewport.worldToScreen(e.geometry.cx, e.geometry.cy);
          g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='${Math.abs(e.geometry.radius * this.viewport.getViewState().zoom)}' fill='none' stroke='${stroke}' stroke-dasharray='6 4'/>`);
        } else if (e.type === 'rect') {
          const p0 = this.viewport.worldToScreen(e.geometry.x, e.geometry.y);
          g.insertAdjacentHTML('beforeend', `<rect x='${p0.x}' y='${p0.y}' width='${Math.abs(e.geometry.width * this.viewport.getViewState().zoom)}' height='${Math.abs(e.geometry.height * this.viewport.getViewState().zoom)}' fill='none' stroke='${stroke}' stroke-dasharray='6 4'/>`);
        } else if (e.type === 'polyline') {
          const points = (e.geometry.points || []).map((pp) => this.viewport.worldToScreen(pp.x, pp.y));
          if (points.length > 1) g.insertAdjacentHTML('beforeend', `<polyline points='${points.map((pp) => `${pp.x},${pp.y}`).join(' ')}' fill='none' stroke='${stroke}' stroke-dasharray='6 4'/>`);
        }
      }
    });
  }

  renderGrips() {
    const g = this.layers.overlay;
    g.innerHTML = '';
    const selected = this.state.grips || [];
    selected.forEach((grip) => {
      const p = this.viewport.worldToScreen(grip.x, grip.y);
      g.insertAdjacentHTML('beforeend', `<rect x='${p.x - 4}' y='${p.y - 4}' width='8' height='8' rx='1.5' fill='#0b1220' stroke='#38bdf8' stroke-width='1.2'/>`);
      g.insertAdjacentHTML('beforeend', `<rect x='${p.x - 7}' y='${p.y - 7}' width='14' height='14' fill='transparent'/>`);
    });
  }

  getGlobalBounds() {
    const b = new Bounds2D();
    this.state.entities.forEach((e) => b.expandByBounds(e.getBounds()));
    return b;
  }
}
