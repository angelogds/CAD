import { Bounds2D } from './core/geometry.js';

const NS = 'http://www.w3.org/2000/svg';
export class DesenhoTecnicoRenderer {
  constructor(svg, state, viewport, selection) {
    this.svg = svg; this.state = state; this.viewport = viewport; this.selection = selection;
    this.layers = {};
    ['grid','entities','preview','overlay'].forEach((name) => { const g = document.createElementNS(NS, 'g'); this.layers[name]=g; this.svg.appendChild(g); });
  }
  render() { this.renderGrid(); this.renderEntities(); this.renderPreview(); }
  renderGrid() {
    const g = this.layers.grid; g.innerHTML = ''; if (!this.state.gridConfig.visible) return;
    const step = this.state.gridConfig.step; const v = this.viewport.getViewState();
    const min = this.viewport.screenToWorld(0,0); const max = this.viewport.screenToWorld(v.width,v.height);
    const startX = Math.floor(min.x/step)*step; const endX = Math.ceil(max.x/step)*step;
    const startY = Math.floor(min.y/step)*step; const endY = Math.ceil(max.y/step)*step;
    for(let x=startX;x<=endX;x+=step){ const p1=this.viewport.worldToScreen(x,startY); const p2=this.viewport.worldToScreen(x,endY); g.insertAdjacentHTML('beforeend',`<line x1='${p1.x}' y1='${p1.y}' x2='${p2.x}' y2='${p2.y}' stroke='#1e293b' stroke-width='1'/>`); }
    for(let y=startY;y<=endY;y+=step){ const p1=this.viewport.worldToScreen(startX,y); const p2=this.viewport.worldToScreen(endX,y); g.insertAdjacentHTML('beforeend',`<line x1='${p1.x}' y1='${p1.y}' x2='${p2.x}' y2='${p2.y}' stroke='#1e293b' stroke-width='1'/>`); }
  }
  renderEntities() {
    const g = this.layers.entities; g.innerHTML = '';
    this.state.entities.forEach((e) => {
      if (!e.visible) return;
      const selected = this.selection.includes(e.id); const hover = this.selection.hoverId === e.id;
      if (e.type === 'line') {
        const a = this.viewport.worldToScreen(e.geometry.x1, e.geometry.y1); const b = this.viewport.worldToScreen(e.geometry.x2, e.geometry.y2);
        const stroke = selected ? '#38bdf8' : hover ? '#fbbf24' : (e.style.stroke || '#e2e8f0');
        g.insertAdjacentHTML('beforeend', `<line data-entity-id='${e.id}' x1='${a.x}' y1='${a.y}' x2='${b.x}' y2='${b.y}' stroke='${stroke}' stroke-width='2'/>`);
      }
    });
  }
  renderPreview() {
    const g = this.layers.preview; g.innerHTML = '';
    this.state.preview.forEach((p) => {
      if (p.type === 'line') {
        const a = this.viewport.worldToScreen(p.from.x,p.from.y); const b = this.viewport.worldToScreen(p.to.x,p.to.y);
        g.insertAdjacentHTML('beforeend', `<line x1='${a.x}' y1='${a.y}' x2='${b.x}' y2='${b.y}' stroke='#22d3ee' stroke-dasharray='6 4' stroke-width='1.5'/>`);
      }
      if (p.type === 'selection-box') {
        const a = this.viewport.worldToScreen(p.from.x,p.from.y); const b = this.viewport.worldToScreen(p.to.x,p.to.y);
        g.insertAdjacentHTML('beforeend', `<rect x='${Math.min(a.x,b.x)}' y='${Math.min(a.y,b.y)}' width='${Math.abs(a.x-b.x)}' height='${Math.abs(a.y-b.y)}' fill='rgba(56,189,248,0.1)' stroke='#38bdf8' stroke-dasharray='4 3'/>`);
      }
    });
  }
  getGlobalBounds() { const b = new Bounds2D(); this.state.entities.forEach((e) => b.expandByBounds(e.getBounds())); return b; }
}
