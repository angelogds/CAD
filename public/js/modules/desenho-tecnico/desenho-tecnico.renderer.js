import { Bounds2D } from './core/geometry.js';

const NS = 'http://www.w3.org/2000/svg';

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
      } else if (e.type === 'polyline') {
        const points = (e.geometry.points || []).map((p) => this.viewport.worldToScreen(p.x, p.y));
        if (points.length > 1) g.insertAdjacentHTML('beforeend', `<polyline points='${points.map((p) => `${p.x},${p.y}`).join(' ')}' fill='none' stroke='${stroke}' stroke-width='2'/>`);
      } else if (e.type === 'text') {
        const p = this.viewport.worldToScreen(e.geometry.x, e.geometry.y);
        g.insertAdjacentHTML('beforeend', `<text x='${p.x}' y='${p.y}' fill='${stroke}' font-size='${(e.geometry.size || 14) * this.viewport.getViewState().zoom}' font-family='monospace'>${String(e.geometry.text || '').replace(/</g, '&lt;')}</text>`);
      } else if (e.type === 'dimension') {
        const p1 = this.viewport.worldToScreen(e.geometry.p1.x, e.geometry.p1.y);
        const p2 = this.viewport.worldToScreen(e.geometry.p2.x, e.geometry.p2.y);
        const tp = this.viewport.worldToScreen(e.geometry.textPoint.x, e.geometry.textPoint.y);
        g.insertAdjacentHTML('beforeend', `<line x1='${p1.x}' y1='${p1.y}' x2='${p2.x}' y2='${p2.y}' stroke='#a5b4fc' stroke-width='1.5'/>`);
        g.insertAdjacentHTML('beforeend', `<text x='${tp.x}' y='${tp.y}' fill='#a5b4fc' font-size='${12 * this.viewport.getViewState().zoom}' font-family='monospace'>${e.geometry.label || ''}</text>`);
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
        g.insertAdjacentHTML('beforeend', `<circle cx='${c.x}' cy='${c.y}' r='4' fill='none' stroke='#f59e0b' stroke-width='1.5'/>`);
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
