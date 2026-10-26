import { Group, Vector3 } from '../vendor/three-0.172.0/three.module.min.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

// Rótulos permanecem em pixels de tela: aproximar/afastar não reduz a tipografia.
export function layoutLabels(items, width, height) {
  const occupied = [];
  const result = [];
  for (const item of [...items].sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
    const w = Math.min(item.width, Math.max(40, width - 16));
    const h = item.height;
    let best = null;
    for (const dy of [0, -32, 32, -64, 64, -96, 96]) {
      for (const dx of [0, -100, 100, -200, 200]) {
        const box = { x: clamp(item.x - w / 2 + dx, 8, Math.max(8, width - w - 8)),
          y: clamp(item.y - h - 12 + dy, Math.min(44, Math.max(8, height - h - 8)), Math.max(8, height - h - 8)), width: w, height: h };
        const area = occupied.reduce((sum, other) => sum + overlap({ ...box, x: box.x - 3, y: box.y - 3, width: w + 6, height: h + 6 }, other), 0);
        const cost = area * 10000 + Math.abs(dx) + Math.abs(dy) * 1.2;
        if (!best || cost < best.cost) best = { ...box, cost, area };
      }
    }
    const hidden = !best || (best.area > 0 && (item.priority || 0) < 2);
    if (!hidden) occupied.push(best);
    result.push({ ...item, ...best, hidden });
  }
  return result;
}

export function createSceneLabels({ host, onSelect }) {
  const document = host.ownerDocument;
  const layer = document.createElement('div');
  layer.className = 'auto-scene-labels';
  host.appendChild(layer);
  const entries = [];
  const position = new Vector3();
  function makeLabel(text) {
    const anchor = new Group();
    const leader = document.createElement('span');
    leader.className = 'auto-scene-label-leader';
    leader.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'auto-scene-label';
    button.textContent = text;
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (anchor.userData.selectKey) onSelect?.(anchor.userData.selectKey);
    });
    layer.append(leader, button);
    entries.push({ anchor, button, leader, text });
    return anchor;
  }
  function update(camera, width, height) {
    camera.updateMatrixWorld();
    const projected = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      entry.anchor.getWorldPosition(position).project(camera);
      const outside = ![position.x, position.y, position.z].every(Number.isFinite) || position.z < -1 || position.z > 1
        || position.x < -1.15 || position.x > 1.15 || position.y < -1.15 || position.y > 1.15;
      entry.button.hidden = outside;
      entry.leader.hidden = outside;
      if (outside) continue;
      const key = entry.anchor.userData.selectKey || '';
      const primary = /^(tank|FAST|GRATE|digestor\d|feedAuger|percolator|tacho|tachoFAST|tachoGRATE|feed|pump|out1|out2|storage\d)$/.test(key);
      const labelWidth = clamp(entry.text.length * 6.8 + 22, 75, width < 500 ? 142 : 180);
      const labelHeight = Math.max(27, Math.ceil(entry.text.length * 6.8 / (labelWidth - 18)) * 14 + 12);
      projected.push({ id: index, x: (position.x + 1) * width / 2, y: (1 - position.y) * height / 2,
        width: labelWidth, height: labelHeight, priority: primary ? 2 : 1 });
    }
    for (const placement of layoutLabels(projected, width, height)) {
      const entry = entries[placement.id];
      entry.button.hidden = placement.hidden;
      entry.leader.hidden = placement.hidden;
      if (placement.hidden) continue;
      Object.assign(entry.button.style, { left: placement.x + 'px', top: placement.y + 'px', width: placement.width + 'px' });
      const origin = projected.find(item => item.id === placement.id);
      const endX = placement.x + placement.width / 2;
      const endY = placement.y + placement.height;
      const distance = Math.hypot(endX - origin.x, endY - origin.y);
      Object.assign(entry.leader.style, { left: origin.x + 'px', top: origin.y + 'px', width: distance + 'px',
        transform: 'rotate(' + Math.atan2(endY - origin.y, endX - origin.x) + 'rad)' });
    }
  }
  function select(key) { entries.forEach(entry => entry.button.setAttribute('aria-pressed', String(entry.anchor.userData.selectKey === key))); }
  return { makeLabel, update, select, dispose: () => layer.remove(), entries };
}
