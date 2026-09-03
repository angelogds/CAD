'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('layout carrega o padrão visual da Escala em todas as rotas do módulo', () => {
  const layout = read('views/layout.ejs');
  const routes = read('modules/escala/escala.routes.js');

  assert.match(layout, /activeMenu\s*!==\s*'undefined'\s*&&\s*activeMenu\s*===\s*'escala'/);
  assert.match(layout, /\/css\/escala-dashboard\.css\?v=20260903b/);
  assert.match(routes, /res\.locals\.activeMenu\s*=\s*["']escala["']/);
});

test('views operacionais da Escala usam a linguagem visual compartilhada', () => {
  const arquivos = [
    'views/escala/index.ejs',
    'views/escala/semana.ejs',
    'views/escala/completa.ejs',
    'views/escala/ausencias.ejs',
    'views/escala/banco-horas.ejs',
    'views/escala/hora-extra-nova.ejs',
    'views/escala/hora-extra-pendentes.ejs',
    'views/escala/folgas-programadas.ejs',
    'views/escala/relatorios.ejs',
    'views/escala/editar.ejs',
    'views/escala/nova.ejs',
    'views/escala/folgas-sabado.ejs',
    'views/escala/rodizio.ejs',
  ];

  for (const file of arquivos) {
    const source = read(file);
    assert.match(source, /class="escala-page"/, `${file} deve usar escala-page`);
    assert.match(source, /class="escala-head"/, `${file} deve usar escala-head`);
    assert.match(source, /class="escala-tabs"/, `${file} deve usar navegação padronizada`);
  }

  assert.match(read('views/escala/semana.ejs'), /Equipe programada/);
  assert.match(read('views/escala/completa.ejs'), /Gestão do rodízio/);
  assert.match(read('views/escala/folgas-programadas.ejs'), /Programar ocorrência/);
  assert.match(read('views/escala/relatorios.ejs'), /Central de geração de PDFs/);
  assert.match(read('views/escala/editar.ejs'), /Salvar como ajuste manual/);
  assert.match(read('views/escala/folgas-sabado.ejs'), /Cobertura sábado/);
  assert.match(read('views/escala/rodizio.ejs'), /Salvar e aplicar na escala/);
});

test('hora extra mantém o mecânico preso ao próprio perfil e exige justificativa sem OS', () => {
  const view = read('views/escala/hora-extra-nova.ejs');
  const controller = read('modules/escala/escala.controller.js');

  assert.match(view, /canManageEscala\s*&&\s*listaColaboradores\.length\s*>\s*1/);
  assert.match(view, /Perfil fixo/);
  assert.match(view, /name="colaborador_id"\s+value="<%= colaborador\.id %>"/);
  assert.match(view, /id="horaExtraOs"/);
  assert.match(view, /id="horaExtraDescricao"/);
  assert.match(view, /descricao\.required\s*=\s*semOs/);
  assert.match(view, /Sem OS — justificar abaixo/);

  assert.match(controller, /buscarColaboradorDoUsuario\(user\.id\)/);
  assert.match(controller, /colaboradores\.filter\(\(c\)\s*=>\s*Number\(c\.id\)\s*===\s*Number\(vinculado\.id\)\)/);
});

test('fluxos existentes continuam preservados nas views modernizadas', () => {
  const extra = read('views/escala/hora-extra-nova.ejs');
  const folgas = read('views/escala/folgas-programadas.ejs');
  const relatorios = read('views/escala/relatorios.ejs');
  const editar = read('views/escala/editar.ejs');
  const nova = read('views/escala/nova.ejs');
  const sabado = read('views/escala/folgas-sabado.ejs');
  const rodizio = read('views/escala/rodizio.ejs');

  assert.match(extra, /action="\/escala\/hora-extra\/iniciar"/);
  assert.match(extra, /action="\/escala\/hora-extra\/<%= emAndamento\.id %>\/finalizar"/);
  assert.match(extra, /name="foto_inicio"/);
  assert.match(extra, /name="foto_fim"/);
  assert.match(extra, /name="latitude_inicio"/);
  assert.match(extra, /name="latitude_fim"/);

  assert.match(folgas, /action="\/escala\/folgas\/programar"/);
  assert.match(folgas, /name="tipo_lancamento"/);
  assert.match(folgas, /name="anexo"/);

  assert.match(relatorios, /action="\/escala\/relatorios\/pdf"/);
  assert.match(relatorios, /name="tipo"/);
  assert.match(relatorios, /name="colaborador_id"/);
  assert.match(relatorios, /name="os_id"/);

  assert.match(editar, /action="\/escala\/editar\/<%= semana\.id %>"/);
  assert.match(editar, /name="noturnos"/);
  assert.match(editar, /name="diurnos"/);
  assert.match(nova, /action="\/escala"\s+method="POST"/);
  assert.match(nova, /name="turno"/);
  assert.match(nova, /name="nome"/);

  assert.match(sabado, /action="\/escala\/folgas-sabado\/<%= r\.semana_id %>"/);
  assert.match(sabado, /name="colaborador_folga_id"/);
  assert.match(sabado, /name="parceiro_diogo_id"/);
  assert.match(sabado, /name="alterar_sequencia"/);

  assert.match(rodizio, /action="\/escala\/rodizio\/preview"/);
  assert.match(rodizio, /formaction="\/escala\/rodizio\/salvar"/);
  assert.match(rodizio, /formaction="\/escala\/rodizio\/salvar-aplicar"/);
  assert.match(rodizio, /name="sobrescreverTudo"/);
});
