const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('workspace da Academia cobre as telas principais com navegação única', () => {
  const views = [
    'index.ejs','cursos.ejs','curso-detalhe.ejs','trilhas.ejs','trilha-detalhe.ejs',
    'minhas-aulas.ejs','avaliacoes.ejs','certificados.ejs','certificados-externos.ejs',
    'biblioteca.ejs','documentos-internos.ejs','professor-ia.ejs','ranking.ejs',
  ];

  for (const view of views) {
    const source = read(`views/academia/${view}`);
    assert.match(source, /academia\.css\?v=20260919-p4/);
    assert.match(source, /academy-workspace/);
    assert.match(source, /include\(incluir\('_menu'\)\)/);
  }
});

test('menu da Academia preserva todos os destinos e estado ativo', () => {
  const menu = read('views/academia/_menu.ejs');
  for (const route of [
    '/academia','/academia/trilhas','/academia/cursos','/academia/minhas-aulas',
    '/academia/avaliacoes','/academia/certificados','/academia/certificados-externos',
    '/academia/documentos-internos','/academia/ranking','/academia/biblioteca','/academia/professor-ia',
  ]) {
    assert.ok(menu.includes(`href="${route}"`));
  }
  assert.match(menu, /aria-current="page"/);
});

test('catálogo preserva filtros, criação e fluxos de iniciar/continuar curso', () => {
  const cursos = read('views/academia/cursos.ejs');
  const routes = read('modules/academia/academia.routes.js');

  assert.match(cursos, /name="busca"/);
  assert.match(cursos, /name="trilha_id"/);
  assert.match(cursos, /name="nivel"/);
  assert.match(cursos, /action="\/academia\/iniciar\/<%= c\.id %>"/);
  assert.match(cursos, /action="\/academia\/continuar\/<%= c\.id %>"/);
  assert.match(cursos, /action="\/academia\/cursos\/criar"/);
  assert.match(cursos, /academia_manage/);

  assert.match(routes, /router\.post\('\/cursos\/criar',[\s\S]*ACCESS\.academia_manage/);
});

test('detalhe do curso preserva estudo, avaliações, e-books e etapa externa', () => {
  const detail = read('views/academia/curso-detalhe.ejs');

  assert.match(detail, /action="\/academia\/curso\/<%= curso\.id %>\/bloco\/<%= curso\.blocoAtual\.id %>\/concluir"/);
  assert.match(detail, /action="\/academia\/curso\/<%= curso\.id %>\/bloco\/<%= curso\.blocoAtual\.id %>\/avaliar"/);
  assert.match(detail, /name="resposta_<%= p\.id %>"/);
  assert.match(detail, /action="\/academia\/avaliacoes\/<%= curso\.id %>\/final"/);
  assert.match(detail, /name="nota"/);
  assert.match(detail, /name="percentual"/);
  assert.match(detail, /id="ebooks"/);
  assert.match(detail, /id="etapa-externa"/);
});

test('certificados externos preservam validação e ação de reprovação explícita', () => {
  const view = read('views/academia/certificados-externos.ejs');
  const routes = read('modules/academia/academia.routes.js');

  assert.match(view, /action="\/academia\/etapas-externas\/<%= etapa\.id %>\/validar"/);
  assert.match(view, /name="status_validacao" value="VALIDADO"/);
  assert.match(view, /name="status_validacao" value="REPROVADO"/);
  assert.match(view, /ui-btn--danger-soft/);
  assert.match(routes, /router\.post\('\/etapas-externas\/:id\/validar',[\s\S]*ACCESS\.academia_manage/);
});

test('Professor IA mantém IDs e endpoint consumidos pelo JavaScript', () => {
  const view = read('views/academia/professor-ia.ejs');
  const js = read('public/js/academia.js');

  for (const id of ['iaChatLog','iaCursoId','iaModo','iaPergunta','iaWarning']) {
    assert.match(view, new RegExp(`id="${id}"`));
  }
  assert.match(view, /data-ia-action="perguntar"/);
  assert.match(js, /fetch\('\/academia\/professor-ia\/perguntar'/);
});

test('RBAC da Academia permanece separado entre visualização e administração', () => {
  const routes = read('modules/academia/academia.routes.js');

  assert.match(routes, /requireRole\(ACCESS\.academia_view\)/);
  assert.match(routes, /requireRole\(ACCESS\.academia_manage\)/);
  assert.match(routes, /router\.get\('\/cursos',[\s\S]*ACCESS\.academia_view/);
  assert.match(routes, /router\.post\('\/cursos\/criar',[\s\S]*ACCESS\.academia_manage/);
  assert.match(routes, /router\.post\('\/etapas-externas\/:id\/validar',[\s\S]*ACCESS\.academia_manage/);
});

test('CSS do workspace é responsivo e usa layout dedicado', () => {
  const css = read('public/css/academia.css');

  assert.match(css, /\.academy-workspace/);
  assert.match(css, /\.academia-menu/);
  assert.match(css, /\.academy-course-grid/);
  assert.match(css, /\.academy-chat-wrap/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:440px\)/);
});
