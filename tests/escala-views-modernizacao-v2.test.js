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

test('views principais da Escala usam a linguagem visual compartilhada', () => {
  const semana = read('views/escala/semana.ejs');
  const completa = read('views/escala/completa.ejs');
  const folgas = read('views/escala/folgas-programadas.ejs');
  const relatorios = read('views/escala/relatorios.ejs');

  for (const source of [semana, completa, folgas, relatorios]) {
    assert.match(source, /class="escala-page"/);
    assert.match(source, /class="escala-head"/);
    assert.match(source, /class="escala-tabs"/);
    assert.match(source, /class="escala-section/);
  }

  assert.match(semana, /Equipe programada/);
  assert.match(completa, /Gestão do rodízio/);
  assert.match(folgas, /Programar ocorrência/);
  assert.match(relatorios, /Central de geração de PDFs/);
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
});
