export function lineIntersection(a1, a2, b1, b2) {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-9) return null;
  const x = ((a1.x * a2.y - a1.y * a2.x) * (b1.x - b2.x) - (a1.x - a2.x) * (b1.x * b2.y - b1.y * b2.x)) / d;
  const y = ((a1.x * a2.y - a1.y * a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x * b2.y - b1.y * b2.x)) / d;
  return { x, y };
}

export function cloneEntityForMirror(entity, a, b) {
  const mirrorPoint = (p) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    const proj = { x: a.x + t * dx, y: a.y + t * dy };
    return { x: (2 * proj.x) - p.x, y: (2 * proj.y) - p.y };
  };
  const copy = entity.clone();
  if (copy.type === 'line' || copy.type === 'centerline') {
    const p1 = mirrorPoint({ x: copy.geometry.x1, y: copy.geometry.y1 });
    const p2 = mirrorPoint({ x: copy.geometry.x2, y: copy.geometry.y2 });
    copy.geometry.x1 = p1.x; copy.geometry.y1 = p1.y; copy.geometry.x2 = p2.x; copy.geometry.y2 = p2.y;
  } else if (copy.type === 'polyline') {
    copy.geometry.points = (copy.geometry.points || []).map(mirrorPoint);
  } else if (copy.type === 'rect') {
    const corners = [
      mirrorPoint({ x: copy.geometry.x, y: copy.geometry.y }),
      mirrorPoint({ x: copy.geometry.x + copy.geometry.width, y: copy.geometry.y }),
      mirrorPoint({ x: copy.geometry.x + copy.geometry.width, y: copy.geometry.y + copy.geometry.height }),
      mirrorPoint({ x: copy.geometry.x, y: copy.geometry.y + copy.geometry.height }),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    copy.geometry.x = Math.min(...xs);
    copy.geometry.y = Math.min(...ys);
    copy.geometry.width = Math.max(...xs) - copy.geometry.x;
    copy.geometry.height = Math.max(...ys) - copy.geometry.y;
  } else if (copy.type === 'circle') {
    const c = mirrorPoint({ x: copy.geometry.cx, y: copy.geometry.cy });
    copy.geometry.cx = c.x; copy.geometry.cy = c.y;
  } else if (copy.type === 'text') {
    const p = mirrorPoint({ x: copy.geometry.x, y: copy.geometry.y });
    copy.geometry.x = p.x; copy.geometry.y = p.y;
  }
  copy.id = crypto.randomUUID();
  return copy;
}
