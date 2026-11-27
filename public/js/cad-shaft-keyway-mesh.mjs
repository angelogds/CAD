const STEPS = 96;
const EMPTY = { regions: [], inverted: false };

function circle(radius, halfWidth) {
  const angles = Array.from({ length: STEPS }, (_, index) => index * 2 * Math.PI / STEPS);
  if (halfWidth < radius) {
    const lip = Math.acos(halfWidth / radius);
    for (const angle of [lip, Math.PI - lip]) {
      if (!angles.some(sample => Math.abs(sample - angle) < 1e-10)) angles.push(angle);
    }
    angles.sort((a, b) => a - b);
  }
  return angles.map(angle => [radius * Math.cos(angle), radius * Math.sin(angle)]);
}

function area(ring) {
  return ring.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = ring[(index + 1) % ring.length];
    return sum + x * nextZ - z * nextX;
  }, 0) / 2;
}

function contains(ring, [x, z]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i], [c, d] = ring[j];
    if ((b > z) !== (d > z) && x < a + (c - a) * (z - b) / (d - b)) inside = !inside;
  }
  return inside;
}

function sectionChanges(segments, bore, keyway) {
  let start = 0;
  return segments.flatMap(({ length, diameter }) => {
    const end = start + length;
    const cuts = [...new Set([start, end, keyway.length, bore?.depth])]
      .filter(value => value >= start && value <= end).sort((a, b) => a - b);
    start = end;
    return cuts.slice(1).map((right, index) => ({
      start: cuts[index], end: right, radius: diameter / 2,
      grooved: cuts[index] < keyway.length,
      boreRadius: bore && cuts[index] < bore.depth ? bore.diameter / 2 : 0,
    }));
  });
}

// Each interval sweeps its cross-section along the axis. At a shoulder only
// the difference between the adjacent sections is exposed to the viewer.
export function shaftKeywayTriangles(model, { polybool, Vector2, triangulateShape }) {
  const { segments, bore, keyway } = model;
  const triangles = [];
  const vertex = ([x, z], axial) => [x, axial, z];
  const ringPolygon = regions => ({ regions, inverted: false });
  function cap(polygon, axial, forward) {
    const regions = polygon.regions
      .map(ring => ({ ring, area: Math.abs(area(ring)) }))
      .filter(region => region.area > 0)
      .sort((a, b) => b.area - a.area);
    for (const [i, region] of regions.entries()) {
      region.parent = regions.slice(0, i).findLast(other => contains(other.ring, region.ring[0]));
    }
    for (const { ring, parent } of regions) {
      if (parent) continue; // Cross-sections have at most one level of holes.
      const holes = regions.filter(region => region.parent?.ring === ring).map(region => region.ring);
      const toVectors = points => points.map(([x, z]) => new Vector2(x, z));
      const vertices = [ring, ...holes].flat().map(point => vertex(point, axial));
      for (const indices of triangulateShape(toVectors(ring), holes.map(toVectors))) {
        const [a, b, c] = indices.map(index => vertices[index]);
        triangles.push(forward ? [a, c, b] : [a, b, c]);
      }
    }
  }

  let previous = EMPTY;
  const intervals = sectionChanges(segments, bore, keyway);
  for (const { start, end, radius, grooved, boreRadius } of intervals) {
    let outer = ringPolygon([circle(radius, keyway.width / 2)]);
    if (grooved) {
      const half = keyway.width / 2;
      const floor = radius - keyway.depth;
      outer = polybool.difference(outer, ringPolygon([[
        [-half, floor], [half, floor], [half, radius * 2], [-half, radius * 2],
      ]]));
    }
    const rings = outer.regions.map(ring => area(ring) > 0 ? ring : [...ring].reverse());
    if (boreRadius) rings.push(circle(boreRadius).reverse());
    for (const ring of rings) {
      ring.forEach((a, index) => {
        const b = ring[(index + 1) % ring.length];
        const a0 = vertex(a, start), a1 = vertex(a, end);
        const b0 = vertex(b, start), b1 = vertex(b, end);
        triangles.push([a0, a1, b1], [a0, b1, b0]);
      });
    }
    const section = ringPolygon(rings);
    cap(polybool.difference(section, previous), start, false);
    cap(polybool.difference(previous, section), start, true);
    previous = section;
  }
  cap(previous, intervals.at(-1).end, true);
  return triangles;
}
