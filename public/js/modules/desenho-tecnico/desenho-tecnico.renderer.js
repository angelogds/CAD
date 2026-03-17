import { Bounds2D } from './core/geometry.js';

const NS = 'http://www.w3.org/2000/svg';

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

  renderGrid() {
    const g = this.layers.grid;
    g.innerHTML = '';
    if (!this.state.gridConfig.visible) return;
    const step = this.state.gridConfig.step;
    const v = this.viewport.getViewState();
    const min = this.viewport.screenToWorld(0, 0);
    const max = this.viewport.screenToWorld(v.width, v.height);
    const startX = Math.floor(min.x / step) * step;
    const endX = Math.ceil(max.x / step) * step;
    const startY = Math.floor(min.y / step) * step;
    const endY = Math.ceil(max.y / step) * step;
    for (let x = startX; x <= endX; x += step) {
      const p1 = this.viewport.worldToScreen(x, startY);
      const p2 = this.viewport.worldToScreen(x, endY);
      g.insertAdjacentHTML('beforeend', `<line x1='${p1.x}' y1='${p1.y}' x2='${p2.x}' y2='${p2.y}' stroke='#1e293b' stroke-width='1'/>`);
    }
    for (let y = startY; y <= endY; y += step) {
      const p1 = this.viewport.worldToScreen(startX, y);
      const p2 = this.viewport.worldToScreen(endX, y);
      g.insertAdjacentHTML('beforeend', `<line x1='${p1.x}' y1='${p1.y}' x2='${p2.x}' y2='${p2.y}' stroke='#1e293b' stroke-width='1'/>`);
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
      g.insertAdjacentHTML('beforeend', `<line x1='${c1.x}' y1='${c1.y}' x2='${c2.x}' y2='${c2.y}' stroke='#93c5fd' stroke-width='1.2' stroke-dasharray='8 4 2 4'/>`);
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
      const selected = this.selection.includes(e.id);
      const hover = this.selection.hoverId === e.id;
      const stroke = selected ? '#38bdf8' : hover ? '#fbbf24' : (e.style.stroke || '#e2e8f0');
      if (e.type === 'line' || e.type === 'centerline') {
        const a = this.viewport.worldToScreen(e.geometry.x1, e.geometry.y1);
        const b = this.viewport.worldToScreen(e.geometry.x2, e.geometry.y2);
        g.insertAdjacentHTML('beforeend', `<line x1='${a.x}' y1='${a.y}' x2='${b.x}' y2='${b.y}' stroke='${stroke}' stroke-width='2' ${e.type === 'centerline' ? "stroke-dasharray='10 4 2 4'" : ''}/>`);
      } else if (e.type === 'rect') {
        const x = e.geometry.width < 0 ? e.geometry.x + e.geometry.width : e.geometry.x;
        const y = e.geometry.height < 0 ? e.geometry.y + e.geometry.height : e.geometry.y;
        const p = this.viewport.worldToScreen(x, y);
        g.insertAdjacentHTML('beforeend', `<rect x='${p.x}' y='${p.y}' width='${Math.abs(e.geometry.width * this.viewport.getViewState().zoom)}' height='${Math.abs(e.geometry.height * this.viewport.getViewState().zoom)}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      } else if (e.type === 'circle') {
        const c = this.viewport.worldToScreen(e.geometry.cx, e.geometry.cy);
        g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='${Math.abs(e.geometry.radius * this.viewport.getViewState().zoom)}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      } else if (e.type === 'arc') {
        g.insertAdjacentHTML('beforeend', `<path d='${arcPath(this.viewport, e.geometry)}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      } else if (e.type === 'shaft') {
        this.renderShaft(g, e, stroke);
      } else if (e.type === 'polyline') {
        const points = (e.geometry.points || []).map((p) => this.viewport.worldToScreen(p.x, p.y));
        if (points.length > 1) g.insertAdjacentHTML('beforeend', `<polyline points='${points.map((p) => `${p.x},${p.y}`).join(' ')}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      } else if (e.type === 'text') {
        const p = this.viewport.worldToScreen(e.geometry.x, e.geometry.y);
        g.insertAdjacentHTML('beforeend', `<text x='${p.x}' y='${p.y}' fill='${stroke}' font-size='${Math.max(8, (e.geometry.size || 14) * this.viewport.getViewState().zoom)}' font-family='monospace'>${String(e.geometry.text || '').replace(/</g, '&lt;')}</text>`);
      } else if (e.type === 'dimension') {
        if (e.geometry.mode === 'angular') {
          const v = this.viewport.worldToScreen(e.geometry.vertex.x, e.geometry.vertex.y);
          g.insertAdjacentHTML('beforeend', `<path d='${arcPath(this.viewport, { cx: e.geometry.vertex.x, cy: e.geometry.vertex.y, radius: e.geometry.radius, startAngle: e.geometry.startAngle, endAngle: e.geometry.endAngle, ccw: true })}' fill='none' stroke='#a5b4fc' stroke-width='1.5'/>`);
          const mid = (e.geometry.startAngle + e.geometry.endAngle) / 2;
          const tp = this.viewport.worldToScreen(e.geometry.vertex.x + Math.cos(mid) * (e.geometry.radius + 10), e.geometry.vertex.y + Math.sin(mid) * (e.geometry.radius + 10));
          g.insertAdjacentHTML('beforeend', `<text x='${tp.x}' y='${tp.y}' fill='#a5b4fc' font-size='${Math.max(10, 12 * this.viewport.getViewState().zoom)}' font-family='monospace'>${e.geometry.label || ''}</text>`);
          g.insertAdjacentHTML('beforeend', `<circle cx='${v.x}' cy='${v.y}' r='2' fill='#a5b4fc'/>`);
        } else {
          const p1 = this.viewport.worldToScreen(e.geometry.p1.x, e.geometry.p1.y);
          const p2 = this.viewport.worldToScreen(e.geometry.p2.x, e.geometry.p2.y);
          const tp = this.viewport.worldToScreen(e.geometry.textPoint.x, e.geometry.textPoint.y);
          g.insertAdjacentHTML('beforeend', `<line x1='${p1.x}' y1='${p1.y}' x2='${p2.x}' y2='${p2.y}' stroke='#a5b4fc' stroke-width='1.5'/>`);
          g.insertAdjacentHTML('beforeend', `<text x='${tp.x}' y='${tp.y}' fill='#a5b4fc' font-size='${Math.max(10, 12 * this.viewport.getViewState().zoom)}' font-family='monospace'>${e.geometry.label || ''}</text>`);
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
        g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='${Math.abs(p.radius * this.viewport.getViewState().zoom)}' fill='none' stroke='#22d3ee' stroke-dasharray='6 4'/>`);
      }
      if (p.type === 'selection-box') {
        const a = this.viewport.worldToScreen(p.from.x, p.from.y);
        const b = this.viewport.worldToScreen(p.to.x, p.to.y);
        g.insertAdjacentHTML('beforeend', `<rect x='${Math.min(a.x, b.x)}' y='${Math.min(a.y, b.y)}' width='${Math.abs(a.x - b.x)}' height='${Math.abs(a.y - b.y)}' fill='rgba(56,189,248,0.1)' stroke='#38bdf8' stroke-dasharray='4 3'/>`);
      }
      if (p.type === 'snap') {
        const c = this.viewport.worldToScreen(p.point.x, p.point.y);
        g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='6' fill='none' stroke='#f59e0b' stroke-width='2'/>`);
        g.insertAdjacentHTML('beforeend', `<line x1='${c.x - 10}' y1='${c.y}' x2='${c.x + 10}' y2='${c.y}' stroke='#f59e0b' stroke-width='1'/>`);
        g.insertAdjacentHTML('beforeend', `<line x1='${c.x}' y1='${c.y - 10}' x2='${c.x}' y2='${c.y + 10}' stroke='#f59e0b' stroke-width='1'/>`);
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
    (this.state.grips || []).forEach((grip) => {
      const p = this.viewport.worldToScreen(grip.x, grip.y);
      g.insertAdjacentHTML('beforeend', `<rect x='${p.x - 4}' y='${p.y - 4}' width='8' height='8' fill='#0f172a' stroke='#22d3ee' stroke-width='1.2'/>`);
    });
  }

  getGlobalBounds() {
    const b = new Bounds2D();
    this.state.entities.forEach((e) => b.expandByBounds(e.getBounds()));
    return b;
  }
}
