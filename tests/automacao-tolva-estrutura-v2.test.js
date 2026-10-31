const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('tolva em pórtico elevado acima das três prensas com perfis apenas conceituais', () => {
  const scene = read('public/js/automacao-prensas-scene.mjs');
  assert.match(scene, /const tolva=group\('TOLVA',\[0,5\.85,-1\.3\]\)/);
  assert.match(scene, /const support=group\('ESTRUTURA_TOLVA'\)/);
  assert.match(scene, /const xs=\[-6\.90,-2\.52,2\.52,6\.90\]/);
  assert.match(scene, /for\(const z of zs\)/);
  assert.match(scene, /const presses=\[\{id:'FAST',x:-5\.2\},\{id:'P50',x:0\},\{id:'P46',x:5\.2\}\]/);
  assert.match(scene, /box\(support,\[\.22,4\.22,\.22\]/);
  assert.match(scene, /NÃO usar para cálculo/);
});

test('dimensões de referência e componentes da tolva aparecem no desenho técnico', () => {
  const svg = read('public/desenhos/tolva-prensas-estrutura-v2.svg');
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>\s*$/);
  for (const term of ['6891 mm', '6529 mm', '1615 mm', '1325,7 mm',
    'FAST', 'P50', 'P46', 'ROSCA 1', 'ROSCA 2', 'MOTORIZAÇÃO',
    'GUILHOTINAS', 'PENDENTE', 'ESTRUTURA METÁLICA']) {
    // Texto do arquivo, independente do estilo e da codificação de fontes.
    assert.match(svg.toUpperCase(), new RegExp(term.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(svg, /\bGPIO\b|\bfetch\s*\(/i);
});

test('circuito técnico mostra tolva de carcaça retangular e pórtico independente', () => {
  const schematic=read('views/automacao/partials/prensas-circuito.ejs');
  assert.match(schematic,/id="pr-estrutura-tolva"/);
  assert.match(schematic,/data-prensa-select="TOLVA"/);
  assert.match(schematic,/Estrutura metálica elevada/);
  assert.match(schematic,/Altura \/ perfis a levantar/);
  for (const id of ['pr-tolva-lids', 'pr-tolva-screw-rear', 'pr-tolva-screw-front', 'pr-tolva-drives']) {
    assert.match(schematic, new RegExp('id="' + id + '"'));
  }
  assert.match(schematic, /\[290,462,634,806\]\.forEach/);
  assert.match(schematic, /Corte oblíquo · sem escala/);
  // As setas não crescem com a espessura dos caminhos nem cobrem as guilhotinas.
  for (const id of ['pr-arrow', 'pr-oil-arrow', 'pr-screw-arrow']) {
    assert.match(schematic, new RegExp('<marker id="' + id + '" markerUnits="userSpaceOnUse"'));
  }
  for (const term of ['FAST','P50','P46'])assert.match(schematic,new RegExp(term));
});

test('prensas usa esquema integrado e remove a imagem de referência da tolva', () => {
  const page=read('views/automacao/prensas.ejs');
  const routes=read('modules/automacao/automacao.routes.js');
  assert.doesNotMatch(page,/pr-tolva-detail|tolva-prensas-estrutura-v2\.svg/);
  assert.match(page,/include\('partials\/prensas-circuito'\)/);
  assert.match(page,/if \(prModoSimulacao\)/);
  assert.match(routes,/router\.get\('\/prensas\/simulador',\s*requireLogin,\s*requireRole\(\[ROLE\.ADMIN\]\)/);
  assert.doesNotMatch(page, /acionar CLP|liga.{0,8}solenoide fisicamente/i);
});
