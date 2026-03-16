const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const views = [
  'views/pcm/index.ejs',
  'views/pcm/planejamento.ejs',
  'views/pcm/falhas.ejs',
  'views/pcm/engenharia.ejs',
  'views/pcm/criticidade.ejs',
  'views/pcm/lubrificacao.ejs',
  'views/pcm/pecas-criticas.ejs',
  'views/pcm/programacao-semanal.ejs',
  'views/pcm/backlog.ejs',
  'views/pcm/rotas-inspecao.ejs',
  'views/pcm/relatorios-avancados.ejs',
];

const expectedNavTargets = [
  '/pcm', '/pcm/planejamento', '/pcm/falhas', '/pcm/engenharia', '/pcm/criticidade',
  '/pcm/lubrificacao', '/pcm/pecas-criticas', '/pcm/programacao-semanal', '/pcm/backlog',
  '/pcm/rotas-inspecao', '/pcm/relatorios-avancados'
];

test('PCM internal nav has all expected routes', () => {
  const nav = fs.readFileSync('views/pcm/partials/internal-nav.ejs', 'utf8');
  for (const target of expectedNavTargets) {
    assert.ok(nav.includes(`href="${target}"`), `missing nav target: ${target}`);
  }
});

test('All PCM pages include internal nav and responsive helpers', () => {
  for (const file of views) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes("include('partials/internal-styles')"), `${file} missing internal styles include`);
    assert.ok(content.includes("include('partials/internal-nav'"), `${file} missing internal nav include`);
  }
});

test('Primary action buttons exist in key pages', () => {
  const home = fs.readFileSync('views/pcm/index.ejs', 'utf8');
  assert.ok(home.includes('Abrir tela de Planejamento'));
  assert.ok(home.includes('Abrir Backlog'));
  assert.ok(home.includes('Atualizar indicadores'));

  const planejamento = fs.readFileSync('views/pcm/planejamento.ejs', 'utf8');
  assert.ok(planejamento.includes('Nova atividade / nova preventiva'));
  assert.ok(planejamento.includes('Filtrar'));

  const backlog = fs.readFileSync('views/pcm/backlog.ejs', 'utf8');
  assert.ok(backlog.includes('Programar'));
});
