const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const views = [
  'views/pcm/index.ejs', 'views/pcm/dashboard-gerencial.ejs',
  'views/pcm/planejamento.ejs', 'views/pcm/programacao-semanal.ejs',
  'views/pcm/lubrificacao.ejs', 'views/pcm/engenharia.ejs',
  'views/pcm/falhas.ejs', 'views/pcm/pecas-criticas.ejs',
  'views/pcm/relatorios-avancados.ejs',
];
const keptTargets = [
  '/pcm', '/pcm/dashboard-gerencial', '/pcm/planejamento',
  '/pcm/programacao-semanal', '/pcm/lubrificacao', '/pcm/engenharia',
  '/pcm/falhas', '/pcm/pecas-criticas', '/pcm/relatorios-avancados',
];
const removedViews = ['backlog.ejs','criticidade.ejs','rotas-inspecao.ejs','dashboard-config.ejs'];

test('navegação do PCM contém somente os nove destinos consolidados', () => {
  const nav = fs.readFileSync('views/pcm/partials/internal-nav.ejs', 'utf8');
  keptTargets.forEach((target) => assert.ok(nav.includes(`href="${target}"`), `destino ausente: ${target}`));
  assert.ok(!nav.includes('/pcm/backlog'));
  assert.ok(!nav.includes('/pcm/criticidade'));
  assert.ok(!nav.includes('/pcm/rotas-inspecao'));
});

test('todas as telas mantidas usam o padrão visual e navegação interna', () => {
  views.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes("include('partials/internal-styles')"), `${file} sem estilos internos`);
    assert.ok(content.includes("include('partials/internal-nav'"), `${file} sem navegação interna`);
  });
});

test('interfaces redundantes foram removidas e URLs antigas redirecionam', () => {
  removedViews.forEach((name) => assert.equal(fs.existsSync(`views/pcm/${name}`), false, `${name} ainda existe`));
  const routes = fs.readFileSync('modules/pcm/pcm.routes.js', 'utf8');
  assert.match(routes, /router\.get\("\/backlog"[\s\S]*\/pcm\/programacao-semanal/);
  assert.match(routes, /router\.get\("\/rotas-inspecao"[\s\S]*\/inspecao/);
  assert.match(routes, /router\.get\("\/criticidade"[\s\S]*\/pcm\/engenharia/);
});

test('telas mantidas não exibem marcações de trabalho incompleto', () => {
  views.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /TODO:|em breve|ranking de equipamentos \(placeholder\)/i, file);
    assert.doesNotMatch(content, /href=["']#["']/, file);
  });
});
