const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const viewFiles = [
  'views/os/index.ejs',
  'views/equipamentos/form.ejs',
  'views/equipamentos/index.ejs',
  'views/demandas/index.ejs',
  'views/demandas/new.ejs',
  'views/demandas/view.ejs',
  'views/fornecedores/form.ejs',
  'views/fornecedores/index.ejs',
  'views/fornecedores/profile.ejs',
  'views/pcm/index.ejs',
  'views/pcm/dashboard-gerencial.ejs',
  'views/pcm/engenharia.ejs',
  'views/pcm/falhas.ejs',
  'views/pcm/lubrificacao.ejs',
  'views/pcm/pecas-criticas.ejs',
  'views/pcm/planejamento.ejs',
  'views/pcm/programacao-semanal.ejs',
  'views/pcm/relatorios-avancados.ejs'
];

test('botões dos módulos migrados usam a base compartilhada', () => {
  for (const file of viewFiles) {
    const view = fs.readFileSync(file, 'utf8');
    const localButtons = [...view.matchAll(/class="([^"]*(?:os-btn|eq-btn|demand-btn|supplier-btn|pcm-op-btn|pcm-button)[^"]*)"/g)];
    for (const match of localButtons) {
      assert.match(match[1], /(?:^|\s)ui-btn(?:\s|$)/, `${file}: ${match[1]}`);
    }
  }
});

test('variantes principais preservam a semântica visual compartilhada', () => {
  const cases = [
    ['views/os/index.ejs', /os-btn primary[^"]*ui-btn--primary/],
    ['views/equipamentos/index.ejs', /eq-btn primary[^"]*ui-btn--primary/],
    ['views/demandas/index.ejs', /demand-btn demand-btn-primary[^"]*ui-btn--primary/],
    ['views/fornecedores/index.ejs', /supplier-btn supplier-btn-primary[^"]*ui-btn--primary/],
    ['views/pcm/index.ejs', /pcm-op-btn pcm-op-btn-primary[^"]*ui-btn--primary/]
  ];
  for (const [file, pattern] of cases) assert.match(fs.readFileSync(file, 'utf8'), pattern, file);
});

test('folhas locais não redefinem a raiz visual das famílias migradas', () => {
  const cssFiles = [
    ['public/css/os-index.css', '.os-btn'],
    ['public/css/equipamentos.css', '.eq-btn'],
    ['public/css/demandas.css', '.demand-btn'],
    ['public/css/fornecedores.css', '.supplier-btn'],
    ['public/css/pcm-operational.css', '.pcm-op-btn']
  ];
  for (const [file, selector] of cssFiles) {
    const css = fs.readFileSync(file, 'utf8');
    const selectors = [...css.matchAll(/(?:^|})\\s*([^{}]+)\\{/g)]
      .flatMap((match) => match[1].split(',').map((item) => item.trim()));
    assert.equal(selectors.includes(selector), false, `${file}: ${selector}`);
  }
});
