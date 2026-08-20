const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = process.cwd();
const geomPath = path.join(root, 'public/js/modules/desenho-tecnico/core/final.geometry.mjs');

async function geom() { return import(`${pathToFileURL(geomPath).href}?v=${Date.now()}`); }

function near(a, b, eps = 1e-6) { assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`); }

test('elipse mantém raios principais e spline passa pelos extremos', async () => {
  const g = await geom();
  const pts = g.ellipsePoints({ x: 10, y: 20 }, 40, 15, 0, 96);
  assert.equal(pts.length, 96);
  near(Math.max(...pts.map((p) => p.x)), 50);
  near(Math.min(...pts.map((p) => p.x)), -30);
  const spline = g.splinePoints([{ x: 0, y: 0 }, { x: 10, y: 15 }, { x: 20, y: 0 }]);
  near(spline[0].x, 0); near(spline[0].y, 0);
  near(spline.at(-1).x, 20); near(spline.at(-1).y, 0);
});

test('hachura diagonal é recortada dentro do contorno', async () => {
  const g = await geom();
  const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
  const lines = g.hatchSegmentsForPolygon(polygon, 45, 10);
  assert.ok(lines.length >= 5);
  lines.forEach((line) => {
    const mid = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
    assert.equal(g.pointInPolygon(mid, polygon), true);
  });
});

test('scale preserva círculo e matriz retangular/polar gera quantidades corretas', async () => {
  const g = await geom();
  const circle = { type: 'circle', geometry: { cx: 10, cy: 0, radius: 5 } };
  const scaled = g.scaleEntityGeometry(circle, { x: 0, y: 0 }, 2);
  near(scaled.cx, 20); near(scaled.radius, 10);
  assert.equal(g.rectangularArrayOffsets(3, 4, 20, 30).length, 11);
  assert.equal(g.polarArrayAngles(8, 360).length, 7);
});

test('break remove trecho intermediário e join reconstrói cadeia', async () => {
  const g = await geom();
  const parts = g.breakLineGeometry({ x1: 0, y1: 0, x2: 100, y2: 0 }, { x: 30, y: 4 }, { x: 70, y: -3 });
  assert.equal(parts.length, 2);
  near(parts[0].x2, 30); near(parts[1].x1, 70);
  const joined = g.joinLineSegments([
    { x1: 10, y1: 0, x2: 20, y2: 0 },
    { x1: 0, y1: 0, x2: 10, y2: 0 },
    { x1: 20, y1: 0, x2: 30, y2: 0 },
  ]);
  assert.equal(joined.points.length, 4);
  near(joined.points[0].x, 0); near(joined.points.at(-1).x, 30);
});

test('integração final expõe layout e comandos CAD 2D', () => {
  const entry = fs.readFileSync(path.join(root, 'public/js/cad-final-2d.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/css/cad-solidworks-workbench.css'), 'utf8');
  ['tool-ellipse', 'tool-spline', 'tool-hatch', 'tool-scale', 'tool-stretch', 'tool-break', 'tool-join', 'tool-explode', 'tool-array-rect', 'tool-array-polar'].forEach((needle) => assert.match(entry, new RegExp(needle)));
  assert.match(entry, /EllipseTool/);
  assert.match(entry, /HatchTool/);
  assert.match(css, /cad-solidworks-shell/);
  assert.match(css, /CommandManager/);
});
