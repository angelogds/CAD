const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('telas principais não exibem nomenclaturas antigas de equipe', () => {
  const files = [
    'views/escala/index.ejs',
    'views/escala/completa.ejs',
    'views/dashboard/tv.ejs',
    'views/tv/index.ejs',
    'views/preventivas/show.ejs',
    'views/preventivas/eleger-mecanico.ejs',
  ];
  const forbidden = [/apoio operacional/i, /auxiliar/i, /ajudante/i];
  for (const file of files) {
    const source = read(file);
    for (const re of forbidden) assert.equal(re.test(source), false, `${file} contém ${re}`);
  }
});

test('seed anual 2026 roda rodízio noturno com os seis mecânicos industriais e sem coluna de apoio', () => {
  const source = read('database/seeds/database/seed_escala_2026.js');
  for (const nome of ['Diogo', 'Salviano', 'Rodolfo', 'Emanuel', 'Luis', 'Júnior']) {
    assert.match(source, new RegExp(`noturno: "${nome}"`));
  }
  assert.equal(/apoio\s*:/.test(source), false);
  assert.match(source, /MECANICOS_INDUSTRIAIS/);
});

test('TV e dashboard unificam ranking como mecânicos industriais', () => {
  const tv = read('modules/tv/tv.service.js');
  const dashboard = read('modules/dashboard/dashboard.service.js');
  assert.equal(/APOIO_OPERACIONAL|Apoio Operacional|Auxiliar/.test(tv), false);
  assert.match(dashboard, /Ranking dos Mecânicos Industriais/);
  assert.equal(/Ranking do Apoio Operacional|Mecânicos e Apoio Operacional/.test(dashboard), false);
});

test('preventivas comunicam equipe padrão como mecânicos industriais', () => {
  const controller = read('modules/preventivas/preventivas.controller.js');
  const service = read('modules/preventivas/preventivas.service.js');
  assert.match(controller, /Equipe padrão: Júnior e Luís — Mecânicos Industriais/);
  assert.match(service, /Júnior e Luís — Mecânicos Industriais/);
});
